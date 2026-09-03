import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { citySlug } from "../src/lib/seo/cityIdentity.mjs";
import {
  applyPublicNameOverridesToHtml,
  buildUmbrellaNameSet,
  chooseEffectiveDirectoryName,
  decodeDirectoryText,
} from "./harden-seo-public-names.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const DEFAULT_IMAGE = "https://www.thetok.ch/fond3.png";
const BATCH_SIZE = 500;
const MAX_ROWS = Math.max(500, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const LEGAL_SUFFIX_RE = /(?:[\s,.-]+)(?:s\.?\s*a\.?|s[àa]rl|sagl|gmbh|ag|ltd|llc|inc\.?|snc)\s*$/i;
const WEB_SOURCES = new Set(["og_site_name", "application_name", "jsonld_restaurant"]);
const KNOWN_UNRELATED_IMAGE_HOSTS = new Map([
  ["/restaurants/geneve/r/shogun", "moto911.com"],
  ["/restaurants/geneve/r/restaurant-le-safran", "safran.com"],
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
      // Optional locally; CI provides the public variables.
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

function hostOf(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stripLegalSuffix(value) {
  return decodeDirectoryText(value).replace(LEGAL_SUFFIX_RE, "").replace(/[\s,.-]+$/g, "").trim();
}

function isObjectiveSiteTitleArtifact(value) {
  const candidate = decodeDirectoryText(value);
  const normalized = comparable(candidate);
  return /^monsite(?:\s+\d+)?$/.test(normalized)
    || normalized === "titre de votre site"
    || /\bsite officiel\b/i.test(candidate)
    || /\bofficial site\b/i.test(candidate);
}

function buildRestaurantRoute(row) {
  const city = citySlug(row?.city || "geneve");
  const slug = String(row?.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return city && slug ? `/restaurants/${city}/r/${slug}` : null;
}

export function buildDirectoryQualityPlan(rows) {
  const umbrellaNames = buildUmbrellaNameSet(rows);
  const nameOverrides = new Map();
  const imageGroups = new Map();

  for (const row of rows || []) {
    const route = buildRestaurantRoute(row);
    if (!route) continue;

    let effectiveName = chooseEffectiveDirectoryName(row, umbrellaNames);
    if (
      WEB_SOURCES.has(String(row.directory_public_name_source || ""))
      && isObjectiveSiteTitleArtifact(row.name)
    ) {
      const fallback = stripLegalSuffix(row.legal_name);
      if (fallback.length >= 2) effectiveName = fallback;
    }
    const oldName = decodeDirectoryText(row.name);
    if (effectiveName && oldName && comparable(effectiveName) !== comparable(oldName)) {
      nameOverrides.set(route, { oldName, newName: effectiveName });
    }

    const imageUrl = String(row.image_url || "").trim();
    if (!imageUrl) continue;
    const group = imageGroups.get(imageUrl) || { routes: new Set(), sourceHosts: new Set() };
    group.routes.add(route);
    const sourceHost = hostOf(row.directory_public_name_source_url);
    if (sourceHost) group.sourceHosts.add(sourceHost);
    imageGroups.set(imageUrl, group);
  }

  const genericImageUrls = new Set(
    [...imageGroups.entries()]
      .filter(([, group]) => group.routes.size >= 3 && group.sourceHosts.size >= 3)
      .map(([imageUrl]) => imageUrl),
  );

  const unsafeImageRoutes = new Set();
  for (const row of rows || []) {
    const route = buildRestaurantRoute(row);
    if (!route) continue;
    const imageUrl = String(row.image_url || "").trim();
    if (!imageUrl) continue;
    if (genericImageUrls.has(imageUrl)) {
      unsafeImageRoutes.add(route);
      continue;
    }
    const knownWrongHost = KNOWN_UNRELATED_IMAGE_HOSTS.get(route);
    if (knownWrongHost && hostOf(imageUrl) === knownWrongHost) unsafeImageRoutes.add(route);
  }

  return { nameOverrides, unsafeImageRoutes, genericImageUrls };
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

function routeFromNode(node) {
  if (!node || typeof node !== "object") return null;
  return normalizeRoute(node.url || node["@id"] || node.item?.url || node.item?.["@id"]);
}

function rewriteStructuredImages(value, unsafeRoutes) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => rewriteStructuredImages(item, unsafeRoutes));
  const next = { ...value };
  const route = routeFromNode(next);
  if (route && unsafeRoutes.has(route) && Object.prototype.hasOwnProperty.call(next, "image")) {
    delete next.image;
  }
  for (const [key, child] of Object.entries(next)) {
    next[key] = rewriteStructuredImages(child, unsafeRoutes);
  }
  return next;
}

function rewriteJsonLd(html, unsafeRoutes) {
  return html.replace(
    /(<script\s+id=["']tok-page-json-ld["'][^>]*>)([\s\S]*?)(<\/script>)/i,
    (full, opening, raw, closing) => {
      try {
        const parsed = JSON.parse(raw);
        const rewritten = rewriteStructuredImages(parsed, unsafeRoutes);
        return `${opening}${JSON.stringify(rewritten).replace(/</g, "\\u003c")}${closing}`;
      } catch {
        return full;
      }
    },
  );
}

function replaceMetaContent(html, matcher, value) {
  if (!matcher.test(html)) return html;
  return html.replace(matcher, (tag) => {
    if (/content=["'][^"']*["']/i.test(tag)) {
      return tag.replace(/content=["'][^"']*["']/i, `content="${value}"`);
    }
    return tag.replace(/>$/, ` content="${value}">`);
  });
}

export function applyDirectoryQualityToHtml(html, currentRoute, plan) {
  let next = applyPublicNameOverridesToHtml(html, currentRoute, plan.nameOverrides);
  next = rewriteJsonLd(next, plan.unsafeImageRoutes);
  if (plan.unsafeImageRoutes.has(currentRoute)) {
    next = replaceMetaContent(next, /<meta\s+property=["']og:image["'][^>]*>/i, DEFAULT_IMAGE);
    next = replaceMetaContent(next, /<meta\s+name=["']twitter:image["'][^>]*>/i, DEFAULT_IMAGE);
  }
  return next;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function applyDirectoryQualityToSitemap(xml, plan) {
  return String(xml || "").replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1];
    const route = normalizeRoute(loc);
    if (!route) return block;
    let next = block;
    const override = plan.nameOverrides.get(route);
    if (override) {
      for (const oldValue of [override.oldName, escapeXml(override.oldName)]) {
        if (oldValue) next = next.split(oldValue).join(escapeXml(override.newName));
      }
    }
    if (plan.unsafeImageRoutes.has(route)) {
      next = next.replace(/\s*<image:image>[\s\S]*?<\/image:image>/gi, "");
    }
    return next;
  });
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

async function collectRows() {
  loadPublicEnvFiles();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("SEO directory quality: variables Supabase absentes, durcissement ignoré.");
    return [];
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,legal_name,slug,city,image_url,is_directory_listing,directory_public_name_source,directory_public_name_source_url")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO directory quality: lecture Supabase impossible (${error?.message || "réponse invalide"}), durcissement ignoré.`);
      return [];
    }
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}

export async function hardenSeoDirectoryQuality() {
  const rows = await collectRows();
  if (rows.length === 0) return { rows: 0, names: 0, images: 0, files: 0 };
  const plan = buildDirectoryQualityPlan(rows);
  const files = await collectIndexFiles(DIST_DIR);
  let changedFiles = 0;
  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route) continue;
    const html = await readFile(filePath, "utf8");
    const next = applyDirectoryQualityToHtml(html, route, plan);
    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      changedFiles += 1;
    }
  }

  const sitemapPath = path.join(DIST_DIR, "sitemap-restaurants.xml");
  try {
    const sitemap = await readFile(sitemapPath, "utf8");
    const nextSitemap = applyDirectoryQualityToSitemap(sitemap, plan);
    if (nextSitemap !== sitemap) await writeFile(sitemapPath, nextSitemap, "utf8");
  } catch {
    // The public-only command may not have a dist sitemap; production build does.
  }

  console.log(
    `SEO directory quality ready: ${rows.length} row(s), ${plan.nameOverrides.size} name override(s), `
      + `${plan.unsafeImageRoutes.size} unsafe image route(s), ${changedFiles} HTML file(s) updated.`,
  );
  return {
    rows: rows.length,
    names: plan.nameOverrides.size,
    images: plan.unsafeImageRoutes.size,
    files: changedFiles,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenSeoDirectoryQuality().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
