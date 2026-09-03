import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const MIN_CITY_RESTAURANTS = Math.max(1, Number(process.env.SEO_MIN_LOCAL_RESTAURANTS || 3) || 3);

function normalizeRoute(value) {
  try {
    const url = new URL(String(value || ""), "https://www.thetok.ch");
    if (url.origin !== "https://www.thetok.ch") return null;
    return `/${url.pathname.replace(/^\/+|\/+$/g, "")}` || "/";
  } catch {
    return null;
  }
}

function routeFromFile(filePath) {
  const relative = path.relative(DIST_DIR, filePath).split(path.sep).join("/");
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

function cityFromCityRoute(route) {
  return route?.match(/^\/restaurants\/([^/]+)$/)?.[1] || null;
}

function isNoindex(html) {
  const tag = html.match(/<meta\s+name=["']robots["'][^>]*>/i)?.[0] || "";
  const content = tag.match(/content=["']([^"']+)["']/i)?.[1] || "";
  return /(?:^|,)\s*noindex\s*(?:,|$)/i.test(content);
}

function upsertRobots(html, value) {
  const tag = `<meta name="robots" content="${value}" />`;
  const matcher = /<meta\s+name=["']robots["'][^>]*>/i;
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
    `$1${payload}$2`,
  );
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

export function reconcileCityInventoryHtml(html, exactCount, allowedRestaurantRoutes, options = {}) {
  const minimum = Math.max(1, Number(options.minimum || MIN_CITY_RESTAURANTS));
  let next = html;
  const parsed = extractJsonLd(next);
  const itemList = parsed ? findItemList(parsed) : null;

  if (itemList) {
    const filtered = itemList.itemListElement
      .filter((entry) => {
        const route = routeFromListItem(entry);
        return !route || allowedRestaurantRoutes.has(route);
      })
      .map((entry, index) => ({ ...entry, position: index + 1 }));
    itemList.itemListElement = filtered;
    itemList.numberOfItems = exactCount;
    next = replaceJsonLd(next, parsed);

    const visibleItems = renderRestaurantItems(filtered);
    if (visibleItems.length > 0) {
      next = next.replace(
        /(<h2>Restaurants disponibles<\/h2>\s*<ul>)[\s\S]*?(<\/ul>)/i,
        `$1${visibleItems.join("")}$2`,
      );
    }
  }

  next = next.replace(
    /\d+\s+adresses?\s+actives?\s+(?:est|sont)\s+répertoriée(?:s)?\s+sur\s+cette\s+page\./gi,
    inventorySentence(exactCount),
  );

  if (exactCount < minimum) next = upsertRobots(next, "noindex,follow,noarchive");
  return next;
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

export async function reconcileSeoInventory() {
  const files = await collectIndexFiles(DIST_DIR);
  const indexableRestaurantsByCity = new Map();
  const cityFiles = [];

  for (const filePath of files) {
    const route = routeFromFile(filePath);
    if (!route) continue;
    if (isCityRoute(route)) {
      cityFiles.push({ filePath, route, city: cityFromCityRoute(route) });
      continue;
    }
    const city = cityFromRestaurantRoute(route);
    if (!city) continue;
    const html = await readFile(filePath, "utf8");
    if (isNoindex(html)) continue;
    const routes = indexableRestaurantsByCity.get(city) || new Set();
    routes.add(route);
    indexableRestaurantsByCity.set(city, routes);
  }

  const demotedRoutes = new Set();
  let updatedCities = 0;
  for (const cityFile of cityFiles) {
    const allowed = indexableRestaurantsByCity.get(cityFile.city) || new Set();
    const html = await readFile(cityFile.filePath, "utf8");
    const next = reconcileCityInventoryHtml(html, allowed.size, allowed);
    if (allowed.size < MIN_CITY_RESTAURANTS) demotedRoutes.add(cityFile.route);
    if (next !== html) {
      await writeFile(cityFile.filePath, next, "utf8");
      updatedCities += 1;
    }
  }

  try {
    const sitemapPath = path.join(DIST_DIR, "sitemap-restaurants.xml");
    const sitemap = await readFile(sitemapPath, "utf8");
    const next = removeDemotedCitiesFromSitemap(sitemap, demotedRoutes);
    if (next !== sitemap) await writeFile(sitemapPath, next, "utf8");
  } catch {
    // Partial/local flows may omit the dist sitemap.
  }

  const restaurantCount = [...indexableRestaurantsByCity.values()].reduce((sum, routes) => sum + routes.size, 0);
  console.log(
    `SEO inventory consistency ready: ${restaurantCount} fiche(s) indexable(s), ${updatedCities} ville(s) synchronisée(s), `
      + `${demotedRoutes.size} ville(s) sous le seuil final.`,
  );
  return { restaurantCount, updatedCities, demotedCities: demotedRoutes.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reconcileSeoInventory().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
