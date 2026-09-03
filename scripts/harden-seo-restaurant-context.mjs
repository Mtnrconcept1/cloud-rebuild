import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, process.env.SEO_DIST_DIR || "dist");
const MAX_NEARBY = Math.max(1, Number(process.env.SEO_CONTEXT_MAX_NEARBY || 4) || 4);
const MAX_NEARBY_KM = Math.max(0.2, Number(process.env.SEO_CONTEXT_MAX_NEARBY_KM || 3) || 3);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function isNoindex(html) {
  const tag = html.match(/<meta\s+name=["']robots["'][^>]*>/i)?.[0] || "";
  const content = tag.match(/content=["']([^"']+)["']/i)?.[1] || "";
  return /(?:^|,)\s*noindex\s*(?:,|$)/i.test(content);
}

function extractStructuredData(html) {
  const raw = html.match(/<script\s+id=["']tok-page-json-ld["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findRestaurantNode(value) {
  const stack = Array.isArray(value) ? [...value] : [value];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current || typeof current !== "object") continue;
    if (current["@type"] === "Restaurant" && current.name) return current;
    for (const child of Object.values(current)) {
      if (Array.isArray(child)) stack.push(...child);
      else if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

function coordinatesFromRestaurant(node) {
  const latitude = Number(node?.geo?.latitude);
  const longitude = Number(node?.geo?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

export function haversineKm(left, right) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = toRad(right.latitude - left.latitude);
  const dLon = toRad(right.longitude - left.longitude);
  const lat1 = toRad(left.latitude);
  const lat2 = toRad(right.latitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildNearbyContextEntries(current, candidates, options = {}) {
  const maxNearby = Math.max(1, Number(options.maxNearby || MAX_NEARBY));
  const maxKm = Math.max(0.2, Number(options.maxKm || MAX_NEARBY_KM));
  if (!current?.geo || !current?.city || !current?.route) return [];

  return (candidates || [])
    .filter((candidate) => candidate?.route !== current.route && candidate?.city === current.city && candidate?.geo)
    .map((candidate) => ({ ...candidate, distanceKm: haversineKm(current.geo, candidate.geo) }))
    .filter((candidate) => Number.isFinite(candidate.distanceKm) && candidate.distanceKm > 0 && candidate.distanceKm <= maxKm)
    .sort((left, right) => left.distanceKm - right.distanceKm || left.route.localeCompare(right.route))
    .slice(0, maxNearby);
}

function distanceLabel(distanceKm) {
  if (distanceKm < 1) return `${Math.max(50, Math.round((distanceKm * 1000) / 50) * 50)} m`;
  return `${distanceKm.toFixed(1).replace(".", ",")} km`;
}

export function renderNearbyContext(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return "";
  const items = entries.map((entry) => (
    `<li><a href="${escapeHtml(entry.route)}">${escapeHtml(entry.name)}</a> — environ ${escapeHtml(distanceLabel(entry.distanceKm))}</li>`
  )).join("");
  return `<section id="tok-nearby-seo-context" aria-label="Restaurants géolocalisés à proximité">
    <h2>Autres restaurants géolocalisés à proximité</h2>
    <p>Pour comparer cette adresse avec d’autres établissements de la même commune, TOK relie aussi les fiches géolocalisées suivantes. Les distances sont calculées à vol d’oiseau à partir des coordonnées publiques disponibles.</p>
    <ul>${items}</ul>
  </section>`;
}

export function insertNearbyContext(html, renderedContext) {
  if (!renderedContext || html.includes('id="tok-nearby-seo-context"')) return html;
  const navPattern = /<nav\s+aria-label=["']Liens utiles TOK["']>/i;
  if (navPattern.test(html)) return html.replace(navPattern, `${renderedContext}<nav aria-label="Liens utiles TOK">`);
  return html;
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

async function collectRestaurantDocuments() {
  const files = await collectIndexFiles(DIST_DIR);
  const documents = [];
  for (const filePath of files) {
    const route = routeFromFile(filePath);
    const city = cityFromRestaurantRoute(route);
    if (!city) continue;
    const html = await readFile(filePath, "utf8");
    if (isNoindex(html)) continue;
    const restaurant = findRestaurantNode(extractStructuredData(html));
    const geo = coordinatesFromRestaurant(restaurant);
    if (!restaurant?.name || !geo) continue;
    documents.push({
      filePath,
      route,
      city,
      name: String(restaurant.name),
      geo,
    });
  }
  return documents;
}

export async function hardenRestaurantContext() {
  const documents = await collectRestaurantDocuments();
  const byCity = new Map();
  for (const document of documents) {
    const group = byCity.get(document.city) || [];
    group.push(document);
    byCity.set(document.city, group);
  }

  let enriched = 0;
  for (const document of documents) {
    const nearby = buildNearbyContextEntries(document, byCity.get(document.city) || []);
    const context = renderNearbyContext(nearby);
    if (!context) continue;
    const html = await readFile(document.filePath, "utf8");
    const next = insertNearbyContext(html, context);
    if (next !== html) {
      await writeFile(document.filePath, next, "utf8");
      enriched += 1;
    }
  }

  console.log(
    `SEO restaurant context ready: ${documents.length} fiche(s) géolocalisée(s), ${enriched} fiche(s) enrichie(s) avec un contexte local.`,
  );
  return { documents: documents.length, enriched };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hardenRestaurantContext().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
