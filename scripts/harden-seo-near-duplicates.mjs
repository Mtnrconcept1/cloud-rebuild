import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { citySlug } from "../src/lib/seo/cityIdentity.mjs";
import {
  buildUmbrellaNameSet,
  chooseEffectiveDirectoryName,
  decodeDirectoryText,
} from "./harden-seo-public-names.mjs";
import { buildWebArtifactNameOverrides } from "./harden-seo-web-artifact-names.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const BATCH_SIZE = 500;
const MAX_ROWS = Math.max(500, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const GENERIC_NAME_TOKENS = new Set([
  "bar",
  "brasserie",
  "cafe",
  "café",
  "pizzeria",
  "restaurant",
  "restaurants",
  "ristorante",
  "trattoria",
]);
const CITY_ALIASES = new Map([
  ["geneve", ["geneve", "geneva", "genf"]],
  ["carouge", ["carouge"]],
  ["vernier", ["vernier"]],
  ["meyrin", ["meyrin"]],
]);

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

function normalizedAddress(value) {
  return comparable(value);
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

function effectivePublicNames(rows) {
  const umbrellaNames = buildUmbrellaNameSet(rows);
  const webOverrides = buildWebArtifactNameOverrides(rows);
  const names = new Map();
  for (const row of rows || []) {
    const route = restaurantRoute(row);
    if (!route) continue;
    const webOverride = webOverrides.get(route);
    names.set(route, webOverride?.newName || chooseEffectiveDirectoryName(row, umbrellaNames) || decodeDirectoryText(row.name));
  }
  return names;
}

export function normalizeNearDuplicateName(value, city) {
  const tokens = comparable(value).split(" ").filter(Boolean);
  const cityKey = citySlug(city || "");
  const cityTokens = new Set([
    ...comparable(city).split(" ").filter(Boolean),
    ...(CITY_ALIASES.get(cityKey) || []),
  ]);
  return tokens
    .filter((token) => !GENERIC_NAME_TOKENS.has(token) && !cityTokens.has(token))
    .join(" ")
    .trim();
}

function normalizedSlugForName(row) {
  return normalizeNearDuplicateName(String(row?.slug || "").replace(/-/g, " "), row?.city);
}

function canonicalCandidateScore(entry) {
  const nameKey = normalizeNearDuplicateName(entry.name, entry.row?.city);
  const slugKey = normalizedSlugForName(entry.row);
  if (!nameKey || !slugKey) return 0;
  if (slugKey === nameKey) return 1000;

  const nameCompact = nameKey.replace(/\s+/g, "");
  const slugCompact = slugKey.replace(/\s+/g, "");
  if (slugCompact.startsWith(nameCompact) || nameCompact.startsWith(slugCompact)) return 800;
  if (slugCompact.includes(nameCompact) || nameCompact.includes(slugCompact)) return 700;

  const nameTokens = new Set(nameKey.split(" ").filter(Boolean));
  const slugTokens = new Set(slugKey.split(" ").filter(Boolean));
  const overlap = [...nameTokens].filter((token) => slugTokens.has(token)).length;
  const union = new Set([...nameTokens, ...slugTokens]).size;
  return union > 0 ? Math.round((overlap / union) * 500) : 0;
}

function compareCanonicalCandidates(left, right) {
  const scoreDiff = canonicalCandidateScore(right) - canonicalCandidateScore(left);
  if (scoreDiff !== 0) return scoreDiff;
  const leftSlug = String(left.row?.slug || left.row?.id || left.route);
  const rightSlug = String(right.row?.slug || right.row?.id || right.route);
  const lengthDiff = leftSlug.length - rightSlug.length;
  if (lengthDiff !== 0) return lengthDiff;
  return leftSlug.localeCompare(rightSlug);
}

export function buildNearDuplicatePlan(rows) {
  const names = effectivePublicNames(rows);
  const groups = new Map();

  for (const row of rows || []) {
    const route = restaurantRoute(row);
    const addressKey = normalizedAddress(row?.address);
    const name = names.get(route) || decodeDirectoryText(row?.name);
    const nameKey = normalizeNearDuplicateName(name, row?.city);
    const cityKey = citySlug(row?.city || "");
    if (!route || !cityKey || !addressKey || nameKey.replace(/\s+/g, "").length < 4) continue;
    const key = `${cityKey}|${addressKey}|${nameKey}`;
    const group = groups.get(key) || [];
    group.push({ row, route, name });
    groups.set(key, group);
  }

  const loserToWinner = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(compareCanonicalCandidates);
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

function upsertTag(html, matcher, tag) {
  if (matcher.test(html)) return html.replace(matcher, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

export function demoteNearDuplicateHtml(html, currentRoute, plan) {
  const duplicate = plan.loserToWinner.get(currentRoute);
  if (!duplicate) return html;
  const canonical = `https://www.thetok.ch${duplicate.winnerRoute}`;
  let next = upsertTag(
    html,
    /<meta\s+name=["']robots["'][^>]*>/i,
    '<meta name="robots" content="noindex,follow,noarchive" />',
  );
  next = upsertTag(
    next,
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${canonical}" />`,
  );
  next = upsertTag(
    next,
    /<meta\s+property=["']og:url["'][^>]*>/i,
    `<meta property="og:url" content="${canonical}" />`,
  );
  next = next.replace(/\s*<script\s+id=["']tok-page-json-ld["'][\s\S]*?<\/script>/i, "");
  return next;
}

function normalizeRoute(value) {
  try {
    const url = new URL(String(value || ""), "https://www.thetok.ch");
    if (url.origin !== "https://www.thetok.ch") return null;
    return `/${url.pathname.replace(/^\/+|\/+$/g, "")}` || "/";
  } catch {
    return null;
  }
}

export function removeNearDuplicatesFromSitemap(xml, plan) {
  return String(xml || "").replace(/\s*<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1];
    const route = normalizeRoute(loc);
    return route && plan.loserToWinner.has(route) ? "" : block;
  });
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
    console.warn("SEO near duplicates: variables Supabase absentes, durcissement ignoré.");
    return [];
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,legal_name,slug,city,address,is_directory_listing,directory_public_name_source,directory_public_name_source_url")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO near duplicates: lecture Supabase impossible (${error?.message || "réponse invalide"}), durcissement ignoré.`);
      return [];
    }
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}

export async function hardenSeoNearDuplicates() {
  const rows = await collectRows();
  if (rows.length === 0) return { rows: 0, duplicates: 0, files: 0 };
  const plan = buildNearDuplicatePlan(rows);
  if (plan.loserToWinner.size === 0) {
    console.log(`SEO near duplicates ready: ${rows.length} row(s), aucun doublon descriptif supplémentaire.`);
    return { rows: rows.length, duplicates: 0, files: 0 };
  }

  const files = await collectIndexFiles(DIST_DIR);
  let changedFiles = 0;
  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route || !plan.loserToWinner.has(route)) continue;
    const html = await readFile(filePath, "utf8");
    const next = demoteNearDuplicateHtml(html, route, plan);
    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      changedFiles += 1;
    }
  }

  try {
    const sitemapPath = path.join(DIST_DIR, "sitemap-restaurants.xml");
    const sitemap = await readFile(sitemapPath, "utf8");
    const next = removeNearDuplicatesFromSitemap(sitemap, plan);
    if (next !== sitemap) await writeFile(sitemapPath, next, "utf8");
  } catch {
    // Some partial/local flows do not generate the dist sitemap.
  }

  console.log(
    `SEO near duplicates ready: ${rows.length} row(s), ${plan.loserToWinner.size} loser route(s), ${changedFiles} HTML file(s) demoted.`,
  );
  return { rows: rows.length, duplicates: plan.loserToWinner.size, files: changedFiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenSeoNearDuplicates().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
