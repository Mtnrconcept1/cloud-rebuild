import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { citySlug } from "../src/lib/seo/cityIdentity.mjs";
import { applyPublicNameOverridesToHtml, decodeDirectoryText } from "./harden-seo-public-names.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const BATCH_SIZE = 500;
const MAX_ROWS = Math.max(500, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const WEB_SOURCES = new Set(["og_site_name", "application_name", "jsonld_restaurant"]);
const LEGAL_SUFFIX_RE = /(?:[\s,.-]+)(?:s\.?\s*a\.?|s[àa]rl|sagl|gmbh|ag|ltd|llc|inc\.?|snc)\s*$/i;
const VENUE_TOKENS = new Set([
  "auberge", "bar", "bistro", "bistrot", "brasserie", "cafe", "café", "cantine",
  "cellier", "club", "food", "grill", "maison", "pizzeria", "pub", "restaurant",
  "resto", "sushi", "taco", "tacos", "table", "terrasse", "trattoria",
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
      // Optional locally; production CI injects the public variables.
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

function stripLegalSuffix(value) {
  return decodeDirectoryText(value)
    .replace(LEGAL_SUFFIX_RE, "")
    .replace(/[\s,.-]+$/g, "")
    .trim();
}

function looksLikePerson(value) {
  const candidate = decodeDirectoryText(value);
  if (!candidate || /[0-9&/@]/.test(candidate) || /\s[-–—]\s/.test(candidate)) return false;
  const tokens = comparable(candidate).split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (["le", "la", "les", "l", "au", "aux", "chez"].includes(tokens[0])) return false;
  if (tokens.some((token) => VENUE_TOKENS.has(token))) return false;
  return candidate
    .split(/[\s-]+/)
    .filter(Boolean)
    .every((word) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’]+$/.test(word));
}

export function isObjectiveWebNameArtifact(value) {
  const candidate = decodeDirectoryText(value);
  const normalized = comparable(candidate);
  if (!candidate) return false;
  if (/^monsite(?:\s+\d+)?$/i.test(normalized)) return true;
  if (normalized === "titre de votre site") return true;
  if (/\bweb\s*$/i.test(candidate)) return true;
  if (/^site\s+web\b/i.test(candidate)) return true;
  if (/\bsite\s+officiel\b/i.test(candidate) || /\bofficial\s+site\b/i.test(candidate)) return true;
  if (/^www\.[^\s]+$/i.test(candidate)) return true;
  if (/^[^\s]+\.(?:ch|com|fr|net|org|io)$/i.test(candidate)) return true;
  return false;
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

export function buildWebArtifactNameOverrides(rows) {
  const overrides = new Map();
  for (const row of rows || []) {
    if (!row?.is_directory_listing || !WEB_SOURCES.has(String(row.directory_public_name_source || ""))) continue;
    const route = restaurantRoute(row);
    if (!route) continue;

    const raw = String(row.name || "").trim();
    const decoded = decodeDirectoryText(raw);
    if (raw && decoded && raw !== decoded && /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(raw)) {
      overrides.set(route, { oldName: raw, newName: decoded });
      continue;
    }

    if (!isObjectiveWebNameArtifact(decoded)) continue;
    const fallback = stripLegalSuffix(row.legal_name);
    if (!fallback || fallback.length < 2 || looksLikePerson(fallback)) continue;
    if (comparable(decoded) === comparable(fallback)) continue;
    overrides.set(route, { oldName: raw || decoded, newName: fallback });
  }
  return overrides;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

export function applyWebArtifactOverridesToSitemap(xml, overrides) {
  return String(xml || "").replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1];
    const route = normalizeRoute(loc);
    const override = route ? overrides.get(route) : null;
    if (!override) return block;
    let next = block;
    const oldCandidates = new Set([
      String(override.oldName || ""),
      decodeDirectoryText(override.oldName),
      escapeXml(override.oldName),
      escapeXml(decodeDirectoryText(override.oldName)),
    ]);
    for (const oldValue of oldCandidates) {
      if (oldValue) next = next.split(oldValue).join(escapeXml(override.newName));
    }
    return next;
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
    console.warn("SEO web names: variables Supabase absentes, durcissement ignoré.");
    return [];
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,legal_name,slug,city,is_directory_listing,directory_public_name_source")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO web names: lecture Supabase impossible (${error?.message || "réponse invalide"}), durcissement ignoré.`);
      return [];
    }
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}

export async function hardenSeoWebArtifactNames() {
  const rows = await collectRows();
  if (rows.length === 0) return { rows: 0, overrides: 0, files: 0 };
  const overrides = buildWebArtifactNameOverrides(rows);
  if (overrides.size === 0) {
    console.log(`SEO web names ready: ${rows.length} row(s), aucun artefact objectif à corriger.`);
    return { rows: rows.length, overrides: 0, files: 0 };
  }

  const files = await collectIndexFiles(DIST_DIR);
  let changedFiles = 0;
  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route) continue;
    const html = await readFile(filePath, "utf8");
    const next = applyPublicNameOverridesToHtml(html, route, overrides);
    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      changedFiles += 1;
    }
  }

  try {
    const sitemapPath = path.join(DIST_DIR, "sitemap-restaurants.xml");
    const sitemap = await readFile(sitemapPath, "utf8");
    const next = applyWebArtifactOverridesToSitemap(sitemap, overrides);
    if (next !== sitemap) await writeFile(sitemapPath, next, "utf8");
  } catch {
    // No dist sitemap in some partial/local flows.
  }

  console.log(`SEO web names ready: ${rows.length} row(s), ${overrides.size} override(s), ${changedFiles} HTML file(s) updated.`);
  return { rows: rows.length, overrides: overrides.size, files: changedFiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenSeoWebArtifactNames().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
