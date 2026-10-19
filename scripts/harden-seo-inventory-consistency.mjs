import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  getLocalInventoryDecision,
  parseLocalInventorySnapshot,
  resolveLocalInventoryPolicy,
} from "../src/lib/seo/localInventoryPolicy.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const INVENTORY_POLICY = resolveLocalInventoryPolicy({
  minCityRestaurants: process.env.SEO_MIN_LOCAL_RESTAURANTS,
  minSpecializedRestaurants: process.env.SEO_MIN_SPECIALIZED_LOCAL_RESTAURANTS,
  maxParentCoverage: process.env.SEO_MAX_LOCAL_PARENT_COVERAGE,
});
const INVENTORY_SCRIPT = /(<script\b(?=[^>]*\bid=["']tok-local-inventory["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>)[\s\S]*?(<\/script>)/i;

function normalizeRoute(value) {
  try {
    const url = new URL(String(value || ""), "https://www.thetok.ch");
    if (url.origin !== "https://www.thetok.ch") return null;
    return `/${url.pathname.replace(/^\/+|\/+$/g, "")}` || "/";
  } catch {
    return null;
  }
}

function routeFromFile(filePath, distDir = DIST_DIR) {
  const relative = path.relative(distDir, filePath).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (!relative.endsWith("/index.html")) return null;
  return `/${relative.slice(0, -"/index.html".length)}`;
}

function cityFromRestaurantRoute(route) {
  return route?.match(/^\/restaurants\/([^/]+)\/r\/[^/]+$/)?.[1] || null;
}

function isCityRoute(route) {
  return /^\/restaurants\/[^/]+$/.test(route || "");
}

function cityFromLocalRoute(route) {
  return route?.match(/^\/restaurants\/([^/]+)(?:\/[^/]+)?$/)?.[1] || null;
}

function isNoindex(html) {
  return (html.match(/<meta\b[^>]*>/gi) || []).some((tag) => {
    if (!/\bname\s*=\s*["']robots["']/i.test(tag)) return false;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    return /(?:^|,)\s*(?:noindex|none)\s*(?:,|$)/i.test(content);
  });
}

function upsertRobots(html, value) {
  const tag = `<meta name="robots" content="${value}" />`;
  const matcher = /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/i;
  return matcher.test(html) ? html.replace(matcher, tag) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function extractJsonLd(html) {
  const match = html.match(/<script\s+id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function replaceJsonLd(html, value) {
  const payload = JSON.stringify(value).replace(/</g, "\\u003c");
  return html.replace(
    /(<script\s+id=["']tok-page-json-ld["'][^>]*>)[\s\S]*?(<\/script>)/i,
    (_match, opening, closing) => `${opening}${payload}${closing}`,
  );
}

function extractInventorySnapshot(html, route) {
  const tag = html.match(INVENTORY_SCRIPT)?.[0];
  const serialized = tag?.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
  return parseLocalInventorySnapshot(serialized, route);
}

function replaceInventorySnapshot(html, snapshot) {
  const payload = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  return html.replace(INVENTORY_SCRIPT, (_match, opening, closing) => `${opening}${payload}${closing}`);
}

function routeFromListItem(item) {
  return normalizeRoute(item?.url || item?.item?.["@id"] || item?.item?.url);
}

function findItemList(value) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRestaurantItems(itemListElement) {
  return (itemListElement || []).slice(0, 24).map((entry) => {
    const name = String(entry?.name || entry?.item?.name || "").trim();
    if (!name) return null;
    const cuisine = Array.isArray(entry?.item?.servesCuisine)
      ? entry.item.servesCuisine.join(", ")
      : String(entry?.item?.servesCuisine || "").trim();
    return `<li>${escapeHtml(cuisine ? `${name} — ${cuisine}` : name)}</li>`;
  }).filter(Boolean);
}

function inventorySentence(count) {
  if (count === 1) return "1 adresse active est répertoriée sur cette page.";
  return `${count} adresses actives sont répertoriées sur cette page.`;
}

function filterRestaurantItems(itemList, allowedRestaurantRoutes) {
  const seen = new Set();
  return itemList.itemListElement
    .filter((entry) => {
      const route = routeFromListItem(entry);
      if (!route || !allowedRestaurantRoutes.has(route) || seen.has(route)) return false;
      seen.add(route);
      return true;
    })
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

function reconcileInventoryContent(html, exactCount, parsed, itemList, filtered) {
  let next = html;
  if (itemList) {
    itemList.itemListElement = filtered;
    itemList.numberOfItems = exactCount;
    next = replaceJsonLd(next, parsed);
  }

  // An empty list must replace the old visible names too. Keeping the previous
  // HTML when the last entry disappears would advertise unavailable inventory.
  if (itemList || exactCount === 0) {
    const visibleItems = renderRestaurantItems(filtered);
    next = next.replace(
      /(<h2>Restaurants disponibles<\/h2>\s*<ul>)[\s\S]*?(<\/ul>)/i,
      (_match, opening, closing) => `${opening}${visibleItems.join("")}${closing}`,
    );
  }

  next = next.replace(
    /\d+\s+adresses?\s+actives?\s+(?:est|sont)\s+répertoriée(?:s)?\s+sur\s+cette\s+page\./gi,
    inventorySentence(exactCount),
  );
  return next;
}

function cityPolicy(snapshot, options = {}) {
  return resolveLocalInventoryPolicy({
    ...(snapshot?.policy || INVENTORY_POLICY),
    ...(options.minimum === undefined ? {} : { minCityRestaurants: options.minimum }),
  });
}

export function reconcileCityInventoryHtml(html, exactCount, allowedRestaurantRoutes, options = {}) {
  const snapshot = extractInventorySnapshot(html, options.route);
  const policy = cityPolicy(snapshot, options);
  const parsed = extractJsonLd(html);
  const itemList = parsed ? findItemList(parsed) : null;
  const filtered = itemList ? filterRestaurantItems(itemList, allowedRestaurantRoutes) : [];
  let next = reconcileInventoryContent(html, exactCount, parsed, itemList, filtered);
  const decision = getLocalInventoryDecision({ pageType: "city", inventoryCount: exactCount, policy });
  const indexable = decision.indexable && !isNoindex(html) && (!snapshot || snapshot.indexable);

  if (!indexable && !isNoindex(next)) next = upsertRobots(next, "noindex,follow,noarchive");
  if (snapshot) {
    next = replaceInventorySnapshot(next, {
      ...snapshot,
      inventoryCount: exactCount,
      parentInventoryCount: null,
      policy,
      indexable,
    });
  }
  return next;
}

function reconcileSpecializedInventory(html, route, allowedRestaurantRoutes) {
  const snapshot = extractInventorySnapshot(html, route);
  if (!snapshot || snapshot.pageType === "city") return null;
  const parsed = extractJsonLd(html);
  const itemList = parsed ? findItemList(parsed) : null;
  if (!itemList) return null;

  // Only the versioned marker proves that this is the full build ItemList.
  // Legacy pages may contain just the first 100 entries and cannot be counted.
  const filtered = filterRestaurantItems(itemList, allowedRestaurantRoutes);
  const inventoryCount = filtered.length;
  const parentInventoryCount = allowedRestaurantRoutes.size;
  const decision = getLocalInventoryDecision({ ...snapshot, inventoryCount, parentInventoryCount });
  const indexable = decision.indexable && snapshot.indexable && !isNoindex(html);
  let next = reconcileInventoryContent(html, inventoryCount, parsed, itemList, filtered);
  if (!indexable && !isNoindex(next)) next = upsertRobots(next, "noindex,follow,noarchive");
  next = replaceInventorySnapshot(next, { ...snapshot, inventoryCount, parentInventoryCount, indexable });
  return { html: next, decision };
}

export function reconcileSpecializedInventoryHtml(html, route, allowedRestaurantRoutes) {
  return reconcileSpecializedInventory(html, route, allowedRestaurantRoutes)?.html || html;
}

export function removeDemotedCitiesFromSitemap(xml, demotedRoutes) {
  return String(xml || "").replace(/\s*<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/i)?.[1];
    const route = normalizeRoute(loc);
    return route && demotedRoutes.has(route) ? "" : block;
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

export async function reconcileSeoInventory(options = {}) {
  const distDir = path.resolve(options.distDir || DIST_DIR);
  const files = await collectIndexFiles(distDir);
  const indexableRestaurantsByCity = new Map();
  const cityFiles = [];
  const specializedFiles = [];
  const noindexRoutes = new Set();

  for (const filePath of files) {
    const route = routeFromFile(filePath, distDir);
    if (!route) continue;
    const html = await readFile(filePath, "utf8");
    const noindex = isNoindex(html);
    if (noindex) noindexRoutes.add(route);
    const localCity = cityFromLocalRoute(route);
    if (isCityRoute(route)) {
      cityFiles.push({ filePath, route, city: localCity });
      continue;
    }
    if (localCity) {
      specializedFiles.push({ filePath, route, city: localCity });
      continue;
    }
    const city = cityFromRestaurantRoute(route);
    if (!city) continue;
    if (noindex) continue;
    const routes = indexableRestaurantsByCity.get(city) || new Set();
    routes.add(route);
    indexableRestaurantsByCity.set(city, routes);
  }

  const demotedCityRoutes = new Set();
  let updatedCities = 0;
  for (const cityFile of cityFiles) {
    const allowed = indexableRestaurantsByCity.get(cityFile.city) || new Set();
    const html = await readFile(cityFile.filePath, "utf8");
    const snapshot = extractInventorySnapshot(html, cityFile.route);
    const next = reconcileCityInventoryHtml(html, allowed.size, allowed, { route: cityFile.route });
    if (allowed.size < cityPolicy(snapshot).minCityRestaurants) demotedCityRoutes.add(cityFile.route);
    if (isNoindex(next)) noindexRoutes.add(cityFile.route);
    if (next !== html) {
      await writeFile(cityFile.filePath, next, "utf8");
      updatedCities += 1;
    }
  }

  let updatedSpecialized = 0;
  let demotedSpecialized = 0;
  let skippedSpecialized = 0;
  for (const localFile of specializedFiles) {
    const allowed = indexableRestaurantsByCity.get(localFile.city) || new Set();
    const html = await readFile(localFile.filePath, "utf8");
    const result = reconcileSpecializedInventory(html, localFile.route, allowed);
    if (!result) {
      skippedSpecialized += 1;
      continue;
    }
    if (!result.decision.indexable) demotedSpecialized += 1;
    if (isNoindex(result.html)) noindexRoutes.add(localFile.route);
    if (result.html !== html) {
      await writeFile(localFile.filePath, result.html, "utf8");
      updatedSpecialized += 1;
    }
  }

  try {
    const sitemapPath = path.join(distDir, "sitemap-restaurants.xml");
    const sitemap = await readFile(sitemapPath, "utf8");
    const next = removeDemotedCitiesFromSitemap(sitemap, noindexRoutes);
    if (next !== sitemap) await writeFile(sitemapPath, next, "utf8");
  } catch {
    // Partial/local flows may omit the dist sitemap.
  }

  const restaurantCount = [...indexableRestaurantsByCity.values()].reduce((sum, routes) => sum + routes.size, 0);
  console.log(
    `SEO inventory consistency ready: ${restaurantCount} fiche(s) indexable(s), ${updatedCities} ville(s) synchronisée(s), `
      + `${demotedCityRoutes.size} ville(s) sous le seuil final, ${updatedSpecialized} sélection(s) synchronisée(s), `
      + `${demotedSpecialized} sélection(s) exclue(s), ${skippedSpecialized} sélection(s) sans inventaire complet vérifiable.`,
  );
  return {
    restaurantCount,
    updatedCities,
    demotedCities: demotedCityRoutes.size,
    updatedSpecialized,
    demotedSpecialized,
    skippedSpecialized,
    noindexRoutes: noindexRoutes.size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reconcileSeoInventory().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
