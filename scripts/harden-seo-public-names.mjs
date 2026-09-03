import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { citySlug } from "../src/lib/seo/cityIdentity.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const RESTAURANT_BATCH_SIZE = 500;
const MAX_RESTAURANTS = Math.max(500, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const WEB_DERIVED_NAME_SOURCES = new Set(["og_site_name", "application_name", "jsonld_restaurant"]);
const GENERIC_WEB_NAMES = new Set([
  "accueil",
  "home",
  "monsite",
  "mon site",
  "my site",
  "site",
  "site web",
  "website",
  "web",
]);
const VENUE_TOKENS = new Set([
  "auberge",
  "bar",
  "bistro",
  "bistrot",
  "brasserie",
  "cafe",
  "café",
  "cantine",
  "cellier",
  "club",
  "food",
  "grill",
  "maison",
  "pizzeria",
  "pub",
  "restaurant",
  "resto",
  "table",
  "terrasse",
  "terrasses",
  "trattoria",
]);
const LEGAL_ENTITY_RE = /(?:^|[\s,.-])(?:s\.?\s*a\.?|s[àa]rl|sagl|gmbh|ag|ltd|llc|inc\.?|snc|association|fondation|holding|investissements?|services?)\s*$/i;

function loadPublicEnvFiles() {
  const candidates = [".env.production.local", ".env.production", ".env.local", ".env"];
  for (const fileName of candidates) {
    try {
      const filePath = path.resolve(ROOT, fileName);
      const content = requireRead(filePath);
      for (const line of content.split(/\r?\n/)) {
        const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // Production CI normally provides VITE_* variables directly.
    }
  }
}

function requireRead(filePath) {
  // Kept synchronous only for tiny env files; avoids making env loading asynchronous at module startup.
  return globalThis.process.getBuiltinModule("fs").readFileSync(filePath, "utf8");
}

export function decodeDirectoryText(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&agrave;/gi, "à")
    .replace(/&acirc;/gi, "â")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&icirc;/gi, "î")
    .replace(/&ucirc;/gi, "û")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\s+/g, " ")
    .trim();
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

function compactComparable(value) {
  return comparable(value).replace(/\s+/g, "");
}

function meaningfulTokens(value) {
  return comparable(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !VENUE_TOKENS.has(token));
}

function isCorporateLegalName(value) {
  const candidate = decodeDirectoryText(value);
  return !candidate || LEGAL_ENTITY_RE.test(candidate);
}

function looksLikePersonName(value) {
  const candidate = decodeDirectoryText(value);
  if (!candidate || /[&0-9/@]/.test(candidate)) return false;
  const normalized = comparable(candidate);
  if (!normalized) return false;
  const tokens = normalized.split(" ");
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (["le", "la", "les", "l", "au", "aux", "chez"].includes(tokens[0])) return false;
  if (tokens.some((token) => VENUE_TOKENS.has(token))) return false;
  const words = candidate.split(/[\s-]+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’]+$/.test(word));
}

function looksLikeWebArtifact(value) {
  const candidate = decodeDirectoryText(value);
  const normalized = comparable(candidate);
  if (!candidate || GENERIC_WEB_NAMES.has(normalized)) return true;
  if (/\bweb\s*$/i.test(candidate)) return true;
  if (/^par\s+[A-ZÀ-ÖØ-Ý]/.test(candidate)) return true;
  if (/^[^\s]+\.(?:ch|com|fr|net|org|io)$/i.test(candidate)) return true;
  if (/^(?:site|website|homepage)\b/i.test(candidate)) return true;
  return false;
}

function slugSupportsLegalName(row) {
  const slug = compactComparable(String(row?.slug || "").replace(/-/g, " "));
  const legal = compactComparable(row?.legal_name);
  if (!slug || legal.length < 4) return false;
  return slug.includes(legal) || legal.includes(slug);
}

function namesShareMeaningfulToken(left, right) {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = new Set(meaningfulTokens(right));
  return leftTokens.some((token) => rightTokens.has(token));
}

function isVenueLikeLegalName(value) {
  const candidate = decodeDirectoryText(value);
  if (!candidate || isCorporateLegalName(candidate) || looksLikePersonName(candidate)) return false;
  const normalized = comparable(candidate);
  const tokens = normalized.split(" ");
  return ["le", "la", "les", "l", "au", "aux", "chez"].includes(tokens[0])
    || tokens.some((token) => VENUE_TOKENS.has(token));
}

export function buildUmbrellaNameSet(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!row?.is_directory_listing || !WEB_DERIVED_NAME_SOURCES.has(String(row.directory_public_name_source || ""))) continue;
    const nameKey = comparable(row.name);
    const legalKey = comparable(row.legal_name);
    if (!nameKey || !legalKey || nameKey === legalKey || isCorporateLegalName(row.legal_name) || looksLikePersonName(row.legal_name)) continue;
    const entry = groups.get(nameKey) || { rows: 0, legalNames: new Set() };
    entry.rows += 1;
    entry.legalNames.add(legalKey);
    groups.set(nameKey, entry);
  }
  return new Set(
    [...groups.entries()]
      .filter(([, entry]) => entry.rows >= 3 && entry.legalNames.size >= 3)
      .map(([name]) => name),
  );
}

export function chooseEffectiveDirectoryName(row, umbrellaNames = new Set()) {
  const current = decodeDirectoryText(row?.name);
  const legal = decodeDirectoryText(row?.legal_name);
  if (!current) return legal || "";
  if (!row?.is_directory_listing || !legal || comparable(current) === comparable(legal)) return current;
  if (isCorporateLegalName(legal) || looksLikePersonName(legal)) return current;

  const source = String(row?.directory_public_name_source || "");
  const sourceIsWebDerived = WEB_DERIVED_NAME_SOURCES.has(source);
  if (!sourceIsWebDerived) return current;

  if (looksLikeWebArtifact(current)) return legal;
  if (umbrellaNames.has(comparable(current))) return legal;

  // A JSON-LD parser can accidentally capture the proprietor/chef instead of the LocalBusiness name.
  // Require three independent signals before replacing a person-looking current name: the fallback is
  // venue-like, the URL slug supports it, and the two names share no meaningful token.
  if (
    source === "jsonld_restaurant"
    && looksLikePersonName(current)
    && isVenueLikeLegalName(legal)
    && slugSupportsLegalName(row)
    && !namesShareMeaningfulToken(current, legal)
  ) {
    return legal;
  }

  // OpenGraph titles often contain a full marketing sentence rather than the establishment name.
  if (
    (source === "og_site_name" || source === "application_name")
    && current.length >= 65
    && legal.length <= 50
    && slugSupportsLegalName(row)
  ) {
    return legal;
  }

  return current;
}

function restaurantPath(row) {
  const city = citySlug(row?.city || "geneve");
  const slug = String(row?.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return city && slug ? `/restaurants/${city}/r/${slug}` : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHref(value) {
  try {
    const url = new URL(String(value || ""), "https://www.thetok.ch");
    if (url.origin !== "https://www.thetok.ch") return null;
    return `/${url.pathname.replace(/^\/+|\/+$/g, "")}` || "/";
  } catch {
    return null;
  }
}

function extractJsonLd(html) {
  const match = html.match(/<script\s+id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return { parsed: JSON.parse(match[1]), raw: match[0] };
  } catch {
    return null;
  }
}

function routeFromStructuredNode(node) {
  if (!node || typeof node !== "object") return null;
  return normalizeHref(node.url || node["@id"] || node.item?.url || node.item?.["@id"]);
}

function rewriteJsonLdNames(value, overrides) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => rewriteJsonLdNames(item, overrides));

  const next = { ...value };
  const route = routeFromStructuredNode(next);
  const override = route ? overrides.get(route) : null;
  if (override && typeof next.name === "string") next.name = override.newName;

  for (const [key, child] of Object.entries(next)) {
    next[key] = rewriteJsonLdNames(child, overrides);
  }
  return next;
}

function replaceJsonLd(html, parsed) {
  const payload = JSON.stringify(parsed).replace(/</g, "\\u003c");
  return html.replace(
    /(<script\s+id=["']tok-page-json-ld["'][^>]*>)[\s\S]*?(<\/script>)/i,
    `$1${payload}$2`,
  );
}

function itemListFromJsonLd(value) {
  const stack = Array.isArray(value) ? [...value] : [value];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || typeof current !== "object") continue;
    if (current["@type"] === "ItemList" && Array.isArray(current.itemListElement)) return current;
    for (const child of Object.values(current)) {
      if (Array.isArray(child)) stack.push(...child);
      else if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

function rewriteAvailableRestaurantList(html, parsedJsonLd) {
  const itemList = itemListFromJsonLd(parsedJsonLd);
  if (!itemList) return html;
  const rows = itemList.itemListElement.slice(0, 24).map((entry) => {
    const name = String(entry?.name || entry?.item?.name || "").trim();
    if (!name) return null;
    const cuisine = Array.isArray(entry?.item?.servesCuisine)
      ? entry.item.servesCuisine.join(", ")
      : String(entry?.item?.servesCuisine || "").trim();
    return `<li>${escapeHtml(cuisine ? `${name} — ${cuisine}` : name)}</li>`;
  }).filter(Boolean);
  if (rows.length === 0) return html;
  return html.replace(
    /(<h2>Restaurants disponibles<\/h2>\s*<ul>)[\s\S]*?(<\/ul>)/i,
    `$1${rows.join("")}$2`,
  );
}

function rewriteAnchors(html, overrides) {
  return html.replace(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, before, href, after, body) => {
    const route = normalizeHref(href);
    const override = route ? overrides.get(route) : null;
    if (!override) return full;
    return `<a${before}href="${escapeHtml(href)}"${after}>${escapeHtml(override.newName)}</a>`;
  });
}

function replaceDetailName(html, override) {
  if (!override) return html;
  const variants = new Set([
    override.oldName,
    decodeDirectoryText(override.oldName),
    escapeHtml(override.oldName),
    escapeHtml(decodeDirectoryText(override.oldName)),
  ]);
  let next = html;
  for (const variant of variants) {
    if (!variant) continue;
    next = next.replace(new RegExp(escapeRegExp(variant), "g"), escapeHtml(override.newName));
  }
  const encodedOld = encodeURIComponent(override.oldName).replace(/%20/g, "+");
  const encodedNew = encodeURIComponent(override.newName).replace(/%20/g, "+");
  next = next.replace(new RegExp(escapeRegExp(encodedOld), "g"), encodedNew);
  return next;
}

export function applyPublicNameOverridesToHtml(html, currentRoute, overrides) {
  let next = replaceDetailName(html, overrides.get(currentRoute));
  next = rewriteAnchors(next, overrides);
  const extracted = extractJsonLd(next);
  if (extracted) {
    const rewritten = rewriteJsonLdNames(extracted.parsed, overrides);
    next = replaceJsonLd(next, rewritten);
    next = rewriteAvailableRestaurantList(next, rewritten);
  }
  return next;
}

async function collectIndexFiles(directory) {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectIndexFiles(absolute));
    else if (entry.isFile() && entry.name === "index.html") output.push(absolute);
  }
  return output;
}

function routeFromFile(filePath) {
  const relative = path.relative(DIST_DIR, filePath).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (!relative.endsWith("/index.html")) return null;
  return `/${relative.slice(0, -"/index.html".length)}`;
}

async function collectPublicRestaurants() {
  loadPublicEnvFiles();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("SEO public names: variables Supabase absentes, durcissement ignoré.");
    return [];
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < MAX_RESTAURANTS; offset += RESTAURANT_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,legal_name,slug,city,is_directory_listing,directory_public_name_source,directory_public_name_source_url")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + RESTAURANT_BATCH_SIZE - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO public names: lecture Supabase impossible (${error?.message || "réponse invalide"}), durcissement ignoré.`);
      return [];
    }
    rows.push(...data);
    if (data.length < RESTAURANT_BATCH_SIZE) break;
  }
  return rows;
}

export async function hardenSeoPublicNames() {
  const restaurants = await collectPublicRestaurants();
  if (restaurants.length === 0) return { restaurants: 0, overrides: 0, files: 0 };

  const umbrellaNames = buildUmbrellaNameSet(restaurants);
  const overrides = new Map();
  for (const row of restaurants) {
    const route = restaurantPath(row);
    if (!route) continue;
    const newName = chooseEffectiveDirectoryName(row, umbrellaNames);
    const oldName = decodeDirectoryText(row.name);
    if (!newName || !oldName || comparable(newName) === comparable(oldName)) continue;
    overrides.set(route, { oldName, newName });
  }

  if (overrides.size === 0) {
    console.log(`SEO public names ready: ${restaurants.length} restaurant(s), aucune correction de rendu nécessaire.`);
    return { restaurants: restaurants.length, overrides: 0, files: 0 };
  }

  const files = await collectIndexFiles(DIST_DIR);
  let changedFiles = 0;
  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route) continue;
    const html = await readFile(filePath, "utf8");
    const next = applyPublicNameOverridesToHtml(html, route, overrides);
    if (next !== html) {
      changedFiles += 1;
      await writeFile(filePath, next, "utf8");
    }
  }

  console.log(
    `SEO public names ready: ${restaurants.length} restaurant(s), ${overrides.size} nom(s) corrigé(s), ${changedFiles} fichier(s) réécrit(s).`,
  );
  return { restaurants: restaurants.length, overrides: overrides.size, files: changedFiles };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  hardenSeoPublicNames().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
