import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { cityLabel, citySlug, pickOneRestaurantPerPath } from "../src/lib/seo/cityIdentity.mjs";
import { reconcileSeoInventory } from "./harden-seo-inventory-consistency.mjs";
import { optimizeSeoCrawl } from "./harden-seo-crawl.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const CANONICAL_ORIGIN = "https://www.thetok.ch";
const BATCH_SIZE = 500;
const MAX_ROWS = Math.max(500, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const MIN_CITY_RESTAURANTS = Math.max(1, Number(process.env.SEO_MIN_LOCAL_RESTAURANTS || 3) || 3);

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
      // Public environment files are optional outside production/CI.
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function restaurantPath(restaurant) {
  const city = citySlug(restaurant?.city || "geneve");
  const restaurantSlug = slugify(restaurant?.slug || "");
  if (city && restaurantSlug) return `/restaurants/${city}/r/${restaurantSlug}`;
  return restaurant?.id ? `/restaurant/${restaurant.id}` : null;
}

function hasUsefulOpeningHours(value) {
  if (!value) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]") return false;
    try {
      return hasUsefulOpeningHours(JSON.parse(trimmed));
    } catch {
      return true;
    }
  }
  if (Array.isArray(value)) return value.some(Boolean);
  if (typeof value !== "object") return false;
  return Object.entries(value).some(([key, entry]) => key !== "service_settings" && Boolean(entry));
}

function hasCoreIdentity(restaurant) {
  return Boolean(
    String(restaurant?.name || "").trim()
      && String(restaurant?.city || "").trim()
      && String(restaurant?.address || "").trim()
      && String(restaurant?.slug || "").trim(),
  );
}

function isPublicIdentityVerified(restaurant) {
  return restaurant?.is_active === true
    && restaurant?.is_demo === false
    && String(restaurant?.status || "").toLowerCase() === "active"
    && (restaurant?.is_directory_listing === false || restaurant?.directory_public_name_verified === true);
}

export function isIndexableRestaurant(restaurant) {
  if (!hasCoreIdentity(restaurant) || !isPublicIdentityVerified(restaurant)) return false;

  const imageUrl = String(restaurant?.image_url || "").trim();
  const hasVerifiedImage = Boolean(imageUrl)
    && (restaurant?.is_directory_listing === false || restaurant?.directory_image_verified === true);
  const hasService = restaurant?.supports_reservation === true || restaurant?.delivery_available === true;

  return hasVerifiedImage || hasUsefulOpeningHours(restaurant?.opening_hours) || hasService;
}

function readMeta(html, name) {
  const pattern = new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*>`, "i");
  const tag = html.match(pattern)?.[0] || "";
  return tag.match(/content=["']([^"']*)["']/i)?.[1] || "";
}

function isNoindex(html) {
  return /(?:^|,)\s*noindex\s*(?:,|$)/i.test(readMeta(html, "robots"));
}

function upsertRobots(html, content) {
  const tag = `<meta name="robots" content="${escapeHtml(content)}">`;
  const pattern = /<meta\s+[^>]*name=["']robots["'][^>]*>/i;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function parseJsonLdTag(html) {
  const match = html.match(/<script\s+id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return { raw: match[0], value: JSON.parse(match[1]) };
  } catch {
    return null;
  }
}

function validDate(value) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function sanitizeRestaurantJsonLdValue(value, restaurant) {
  if (Array.isArray(value)) return value.map((entry) => sanitizeRestaurantJsonLdValue(entry, restaurant));
  if (!value || typeof value !== "object") return value;

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = sanitizeRestaurantJsonLdValue(child, restaurant);
  }

  if (next["@type"] === "Restaurant") {
    if (restaurant?.is_directory_listing === true) delete next.telephone;
    if (restaurant?.supports_reservation === true) next.acceptsReservations = true;
    else delete next.acceptsReservations;

    const reviewCount = Number(next.aggregateRating?.reviewCount || 0);
    const ratingValue = Number(next.aggregateRating?.ratingValue || 0);
    if (!(reviewCount > 0 && ratingValue > 0)) delete next.aggregateRating;
  }

  if (next["@type"] === "WebPage") {
    const updatedAt = validDate(restaurant?.updated_at);
    if (updatedAt) next.dateModified = updatedAt.toISOString();
    else delete next.dateModified;
  }

  return next;
}

function sanitizeRestaurantJsonLd(html, restaurant) {
  const parsed = parseJsonLdTag(html);
  if (!parsed) return html;
  const sanitized = sanitizeRestaurantJsonLdValue(parsed.value, restaurant);
  const tag = `<script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(sanitized).replace(/</g, "\\u003c")}</script>`;
  return html.replace(parsed.raw, tag);
}

function sanitizeDirectoryPhoneCopy(html, restaurant) {
  if (restaurant?.is_directory_listing !== true) return html;
  return html
    .replace(/\s*<li><strong>Téléphone public\s*:<\/strong>[\s\S]*?<\/li>/gi, "")
    .replace(/\.\s*Le numéro public renseigné est [\s\S]*?\.\s*Cette fiche informative/gi, ". Cette fiche informative");
}

function dedupeLongParagraphs(html) {
  const seen = new Set();
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attributes, body) => {
    const text = String(body)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (text.length < 90) return match;
    if (seen.has(text)) return "";
    seen.add(text);
    return `<p${attributes}>${body}</p>`;
  });
}

function formatUpdatedDate(value) {
  const date = validDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("fr-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(date);
}

function rewriteRealUpdatedDate(html, restaurant) {
  const label = formatUpdatedDate(restaurant?.updated_at);
  if (!label) return html;
  return html.replace(/Dernière mise à jour le\s+[^<]+/gi, `Dernière mise à jour le ${escapeHtml(label)}`);
}

export function rewriteZeroRatingCopy(html) {
  return String(html || "")
    .replace(/>\s*0(?:\.0+)?\/10\s*</g, ">Pas encore d’avis<")
    .replace(/>\s*0\s+avis(?:\s+publiés?)?\s*</gi, ">Aucun avis publié<")
    .replace(/sur 10\s*·\s*0\s+avis/gi, "Aucun avis publié");
}

export function rewriteCustomerSeoCopy(html) {
  return String(html || "")
    .replace(
      /TOK publie uniquement les pages locales qui disposent d'un inventaire suffisamment riche\.\s*\d+ communes sont actuellement éligibles à l'indexation\./gi,
      "Découvrez des adresses locales vérifiées à Genève et dans les communes couvertes par TOK.",
    )
    .replace(
      /\d+ fiches restaurant indexables sont reliées aux pages de ville, de cuisine et de recherche afin d'aider Google comme les utilisateurs à découvrir les bonnes adresses\./gi,
      "Parcourez les restaurants par commune et par cuisine, puis réservez ou commandez lorsque le service est proposé sur TOK.",
    )
    .replace(
      /Le catalogue TOK relie \d+ fiches indexables à \d+ pages de communes disposant d'un inventaire public suffisant\./gi,
      "Explorez les adresses locales vérifiées par commune, cuisine et besoin.",
    )
    .replace(
      /Les pages sans inventaire suffisant restent volontairement hors de l'index Google\./gi,
      "Les résultats privilégient les établissements disposant d'informations utiles et à jour.",
    );
}

function replaceElementById(html, tagName, id) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/${tagName}>`, "i");
  return html.replace(pattern, "");
}

function insertBeforeClosingSection(html, sectionId, content) {
  const idIndex = html.indexOf(`id="${sectionId}"`);
  if (idIndex < 0) return html.replace(/<\/body>/i, `${content}\n</body>`);
  const start = html.lastIndexOf("<section", idIndex);
  if (start < 0) return html.replace(/<\/body>/i, `${content}\n</body>`);

  const token = /<section\b[^>]*>|<\/section>/gi;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    if (/^<section\b/i.test(match[0])) depth += 1;
    else depth -= 1;
    if (depth === 0) return `${html.slice(0, match.index)}${content}${html.slice(match.index)}`;
  }
  return html.replace(/<\/body>/i, `${content}\n</body>`);
}

function cityNavigation(rows) {
  const sorted = [...rows].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "fr-CH"));
  const cityName = cityLabel(sorted[0]?.city) || "cette commune";
  const links = sorted.map((restaurant) => {
    const route = restaurantPath(restaurant);
    return `<li><a href="${escapeHtml(route)}">${escapeHtml(restaurant.name)}</a></li>`;
  }).join("");
  return `<nav id="tok-indexable-restaurant-links" aria-label="Restaurants disponibles à ${escapeHtml(cityName)}" style="margin-top:32px">
    <h2>Adresses disponibles à ${escapeHtml(cityName)} (${sorted.length})</h2>
    <ul style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 20px;padding-left:20px">${links}</ul>
  </nav>`;
}

function updateCityItemList(html, rows) {
  const parsed = parseJsonLdTag(html);
  if (!parsed) return html;
  const sorted = [...rows].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "fr-CH"));
  const entries = sorted.map((restaurant, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: String(restaurant.name || "Restaurant"),
    url: `${CANONICAL_ORIGIN}${restaurantPath(restaurant)}`,
  }));

  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const next = {};
    for (const [key, child] of Object.entries(value)) next[key] = visit(child);
    if (next["@type"] === "ItemList") {
      next.numberOfItems = entries.length;
      next.itemListElement = entries;
    }
    return next;
  };

  const tag = `<script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(visit(parsed.value)).replace(/</g, "\\u003c")}</script>`;
  return html.replace(parsed.raw, tag);
}

function upsertCityNavigation(html, rows) {
  const withoutPrevious = replaceElementById(html, "nav", "tok-indexable-restaurant-links");
  return insertBeforeClosingSection(withoutPrevious, "tok-prerendered-content", cityNavigation(rows));
}

async function collectRows() {
  loadPublicEnvFiles();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("SEO indexable inventory: variables Supabase absentes, passe finale ignorée.");
    return [];
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += BATCH_SIZE) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,slug,city,address,phone,image_url,opening_hours,supports_reservation,delivery_available,review_count,rating,updated_at,status,is_active,is_demo,is_directory_listing,directory_public_name_verified,directory_image_verified")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO indexable inventory: lecture Supabase impossible (${error?.message || "réponse invalide"}), passe finale ignorée.`);
      return [];
    }
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function removeNonIndexableRestaurantUrls(allowedPaths) {
  const sitemapPath = path.join(DIST_DIR, "sitemap-restaurants.xml");
  const xml = await readOptional(sitemapPath);
  if (!xml) return 0;
  let removed = 0;
  const next = xml.replace(/\s*<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi, (block, rawUrl) => {
    try {
      const url = new URL(rawUrl);
      const route = url.pathname.replace(/\/$/, "") || "/";
      const isRestaurantDetail = /^\/restaurants\/[^/]+\/r\/[^/]+$/.test(route) || /^\/restaurant\/[^/]+$/.test(route);
      if (isRestaurantDetail && !allowedPaths.has(route)) {
        removed += 1;
        return "";
      }
    } catch {
      return block;
    }
    return block;
  });
  if (next !== xml) await writeFile(sitemapPath, next, "utf8");
  return removed;
}

async function rewriteCustomerPages() {
  let changed = 0;
  for (const relative of ["index.html", path.join("recherche", "index.html")]) {
    const filePath = path.join(DIST_DIR, relative);
    const html = await readOptional(filePath);
    if (!html) continue;
    const next = rewriteCustomerSeoCopy(html);
    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      changed += 1;
    }
  }
  return changed;
}

export async function hardenSeoIndexableInventory() {
  const collected = await collectRows();
  if (collected.length === 0) return { rows: 0, indexable: 0, noindexed: 0, sitemapRemoved: 0, cities: 0 };

  const rows = [...pickOneRestaurantPerPath(
    collected.filter((restaurant) => restaurantPath(restaurant)),
    restaurantPath,
  ).values()];

  const crawlableRows = [];
  let noindexed = 0;
  let detailFiles = 0;

  for (const restaurant of rows) {
    const route = restaurantPath(restaurant);
    const filePath = path.join(DIST_DIR, route.replace(/^\//, ""), "index.html");
    const html = await readOptional(filePath);
    if (!html) continue;

    let next = html;
    if (!isIndexableRestaurant(restaurant)) {
      next = upsertRobots(next, "noindex,follow,noarchive");
      noindexed += 1;
    }
    next = sanitizeRestaurantJsonLd(next, restaurant);
    next = sanitizeDirectoryPhoneCopy(next, restaurant);
    next = rewriteRealUpdatedDate(next, restaurant);
    next = rewriteZeroRatingCopy(next);
    next = dedupeLongParagraphs(next);

    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      detailFiles += 1;
    }
    if (isIndexableRestaurant(restaurant) && !isNoindex(next)) crawlableRows.push(restaurant);
  }

  const allowedPaths = new Set(crawlableRows.map(restaurantPath).filter(Boolean));
  const sitemapRemoved = await removeNonIndexableRestaurantUrls(allowedPaths);

  // Existing inventory/crawl hardeners understand noindex pages. Rerun them after the
  // quality gate so city/specialized counts and parent ItemLists cannot describe pages
  // that this final pass just removed from Google's index.
  await reconcileSeoInventory();
  await optimizeSeoCrawl();

  const byCity = new Map();
  for (const restaurant of crawlableRows) {
    const key = citySlug(restaurant.city);
    const group = byCity.get(key) || [];
    group.push(restaurant);
    byCity.set(key, group);
  }

  let cityFiles = 0;
  for (const [city, cityRows] of byCity) {
    if (!city || cityRows.length < MIN_CITY_RESTAURANTS) continue;
    const filePath = path.join(DIST_DIR, "restaurants", city, "index.html");
    const html = await readOptional(filePath);
    if (!html || isNoindex(html)) continue;
    let next = updateCityItemList(html, cityRows);
    next = upsertCityNavigation(next, cityRows);
    if (next !== html) {
      await writeFile(filePath, next, "utf8");
      cityFiles += 1;
    }
  }

  const customerPages = await rewriteCustomerPages();
  console.log(
    `SEO indexable inventory ready: ${rows.length} fiche(s) contrôlée(s), ${crawlableRows.length} indexable(s), ${noindexed} noindex, ${sitemapRemoved} URL(s) retirée(s) du sitemap, ${cityFiles} page(s) ville maillée(s), ${detailFiles} fiche(s) assainie(s), ${customerPages} page(s) éditoriale(s) réécrite(s).`,
  );
  return {
    rows: rows.length,
    indexable: crawlableRows.length,
    noindexed,
    sitemapRemoved,
    cities: cityFiles,
    details: detailFiles,
    customerPages,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenSeoIndexableInventory().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
