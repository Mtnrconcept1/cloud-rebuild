import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { citySlug } from "../src/lib/seo/cityIdentity.mjs";
import { applyPublicNameOverridesToHtml, decodeDirectoryText } from "./harden-seo-public-names.mjs";
import {
  demoteNearDuplicateHtml,
  normalizeNearDuplicateName,
  removeNearDuplicatesFromSitemap,
} from "./harden-seo-near-duplicates.mjs";
import { reconcileSeoInventory } from "./harden-seo-inventory-consistency.mjs";
import { optimizeSeoCrawl } from "./harden-seo-crawl.mjs";
import { hardenSeoIndexableInventory } from "./harden-seo-indexable-inventory.mjs";
import { hardenPerformanceDelivery } from "./harden-performance-delivery.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const BATCH_SIZE = 500;
const MAX_ROWS = Math.max(500, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const DOMAIN_NAME_RE = /^[^\s]+\.(?:ch|com|fr|net|org|io)$/iu;
const LEADING_ARTICLE_RE = /^(?:le|la|les|l)\s+/;

function loadPublicEnvFiles() {
  for (const fileName of [".env.production.local", ".env.production", ".env.local", ".env"]) {
    try {
      const content = readFileSync(path.resolve(ROOT, fileName), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // Optional locally; production CI injects public VITE_* variables.
    }
  }
}

function comparable(value) {
  return decodeDirectoryText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return comparable(value).replace(/\s+/g, "");
}

function restaurantRoute(row) {
  const city = citySlug(row?.city || "geneve");
  const slug = String(row?.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return city && slug ? `/restaurants/${city}/r/${slug}` : null;
}

function domainStem(value) {
  const candidate = decodeDirectoryText(value).trim();
  if (!DOMAIN_NAME_RE.test(candidate)) return "";
  return candidate.replace(/\.(?:ch|com|fr|net|org|io)$/iu, "");
}

export function buildDomainIdentityOverrides(rows) {
  const overrides = new Map();
  for (const row of rows || []) {
    if (!row?.is_directory_listing) continue;
    const route = restaurantRoute(row);
    const current = decodeDirectoryText(row?.name);
    const legal = decodeDirectoryText(row?.legal_name);
    const stem = domainStem(current);
    if (!route || !stem || !legal) continue;
    if (compact(stem) !== compact(legal)) continue;
    if (compact(current) === compact(legal)) continue;
    overrides.set(route, { oldName: String(row.name || current), newName: legal });
  }
  return overrides;
}

export function normalizeFinalDuplicateName(value, city) {
  return normalizeNearDuplicateName(value, city)
    .replace(LEADING_ARTICLE_RE, "")
    .trim();
}

function canonicalScore(entry) {
  const nameKey = normalizeFinalDuplicateName(entry.name, entry.row?.city);
  const slugKey = normalizeFinalDuplicateName(String(entry.row?.slug || "").replace(/-/g, " "), entry.row?.city);
  if (!nameKey || !slugKey) return 0;
  if (nameKey === slugKey) return 1000;
  const nameCompact = nameKey.replace(/\s+/g, "");
  const slugCompact = slugKey.replace(/\s+/g, "");
  if (nameCompact === slugCompact) return 950;
  if (slugCompact.includes(nameCompact) || nameCompact.includes(slugCompact)) return 800;
  const nameTokens = new Set(nameKey.split(" "));
  const slugTokens = new Set(slugKey.split(" "));
  const overlap = [...nameTokens].filter((token) => slugTokens.has(token)).length;
  const union = new Set([...nameTokens, ...slugTokens]).size;
  return union ? Math.round((overlap / union) * 500) : 0;
}

function compareCanonical(left, right) {
  const score = canonicalScore(right) - canonicalScore(left);
  if (score !== 0) return score;
  const leftSlug = String(left.row?.slug || left.route);
  const rightSlug = String(right.row?.slug || right.route);
  if (leftSlug.length !== rightSlug.length) return leftSlug.length - rightSlug.length;
  return leftSlug.localeCompare(rightSlug);
}

export function buildArticleDuplicatePlan(rows, overrides = buildDomainIdentityOverrides(rows)) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row?.is_directory_listing) continue;
    const route = restaurantRoute(row);
    const city = citySlug(row?.city || "");
    const address = comparable(row?.address);
    const effectiveName = overrides.get(route)?.newName || decodeDirectoryText(row?.name);
    const nameKey = normalizeFinalDuplicateName(effectiveName, row?.city);
    if (!route || !city || !address || nameKey.replace(/\s+/g, "").length < 4) continue;
    const key = `${city}|${address}|${nameKey}`;
    const group = groups.get(key) || [];
    group.push({ row, route, name: effectiveName });
    groups.set(key, group);
  }

  const loserToWinner = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(compareCanonical);
    const winner = sorted[0];
    for (const loser of sorted.slice(1)) {
      loserToWinner.set(loser.route, {
        winnerRoute: winner.route,
        winnerName: winner.name,
        loserName: loser.name,
      });
    }
  }
  return { loserToWinner, groupCount: [...groups.values()].filter((group) => group.length > 1).length };
}

async function collectIndexFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectIndexFiles(absolute));
    else if (entry.isFile() && entry.name === "index.html") files.push(absolute);
  }
  return files;
}

function routeFromFile(filePath) {
  const relative = path.relative(DIST_DIR, filePath).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (!relative.endsWith("/index.html")) return null;
  return `/${relative.slice(0, -"/index.html".length)}`;
}

async function collectRows() {
  loadPublicEnvFiles();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("SEO final quality: variables Supabase absentes, passe finale ignorée.");
    return [];
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,legal_name,slug,city,address,is_directory_listing")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO final quality: lecture Supabase impossible (${error?.message || "réponse invalide"}), passe finale ignorée.`);
      return [];
    }
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}

export async function hardenSeoFinalQuality() {
  const rows = await collectRows();
  if (rows.length === 0) return { rows: 0, names: 0, duplicates: 0, files: 0 };

  const overrides = buildDomainIdentityOverrides(rows);
  const duplicatePlan = buildArticleDuplicatePlan(rows, overrides);
  const files = await collectIndexFiles(DIST_DIR);
  let changedFiles = 0;

  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route) continue;
    const html = await readFile(filePath, "utf8");
    let next = applyPublicNameOverridesToHtml(html, route, overrides);
    next = demoteNearDuplicateHtml(next, route, duplicatePlan);
    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      changedFiles += 1;
    }
  }

  try {
    const sitemapPath = path.join(DIST_DIR, "sitemap-restaurants.xml");
    const sitemap = await readFile(sitemapPath, "utf8");
    const next = removeNearDuplicatesFromSitemap(sitemap, duplicatePlan);
    if (next !== sitemap) await writeFile(sitemapPath, next, "utf8");
  } catch {
    // Partial/local builds may omit the restaurant sitemap.
  }

  // A final dedupe changes the effective inventory. Recompute counts, then strip every
  // parent link/JSON-LD reference that still points at a newly noindexed detail page.
  await reconcileSeoInventory();
  await optimizeSeoCrawl();

  // The audit-quality gate must run after every legacy SEO pass so thin directory pages
  // cannot be reintroduced by a later sitemap/content rewrite. It also reruns inventory
  // reconciliation after applying its noindex decisions.
  await hardenSeoIndexableInventory();
  await hardenPerformanceDelivery();

  console.log(
    `SEO final quality ready: ${rows.length} row(s), ${overrides.size} domain-name override(s), ${duplicatePlan.loserToWinner.size} article duplicate(s), ${changedFiles} HTML file(s) updated.`,
  );
  return {
    rows: rows.length,
    names: overrides.size,
    duplicates: duplicatePlan.loserToWinner.size,
    files: changedFiles,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenSeoFinalQuality().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
