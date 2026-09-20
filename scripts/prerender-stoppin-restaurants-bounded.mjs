import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { coordinate, dedupeVenuesByPlace, slugify } from "./lib/stoppin-venue-dedupe.mjs";
import { writeAliasReport } from "./apply-stoppin-venue-redirects.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, "dist");
const STOPPIN_ORIGIN = "https://stoppin.ch";
const STOPPIN_FEED_URL = process.env.SEO_STOPPIN_VENUE_FEED_URL || `${STOPPIN_ORIGIN}/thetok-venues.json`;
const MAX_RESTAURANTS = Math.max(1, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const RESTAURANT_BATCH_SIZE = 500;
const TILE_DEGREES = Math.max(0.05, Number(process.env.SEO_STOPPIN_TILE_DEGREES || 0.25) || 0.25);
const MAX_TILES = Math.max(1, Number(process.env.SEO_STOPPIN_MAX_TILES || 128) || 128);
const MAX_VENUES = Math.max(1, Number(process.env.SEO_STOPPIN_MAX_VENUES || 15000) || 15000);
const FEED_PAGE_SIZE = Math.min(1000, Math.max(50, Number(process.env.SEO_STOPPIN_FEED_PAGE_SIZE || 500) || 500));
const RADIUS_KM = Math.max(0.5, Number(process.env.SEO_STOPPIN_RADIUS_KM || 3) || 3);
const PUBLIC_ONLY = process.argv.includes("--public-only");

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
      // Local public env files are optional in CI.
    }
  }
}

async function collectRestaurantCoordinates() {
  loadPublicEnvFiles();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const coordinates = [];
  for (let offset = 0; offset < MAX_RESTAURANTS; offset += RESTAURANT_BATCH_SIZE) {
    const limit = Math.min(RESTAURANT_BATCH_SIZE, MAX_RESTAURANTS - offset);
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,latitude,longitude")
      .eq("is_active", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO Stoppin bbox: inventaire TOK indisponible (${error?.message || "réponse invalide"}).`);
      return [];
    }
    for (const restaurant of data) {
      const latitude = coordinate(restaurant?.latitude, -90, 90);
      const longitude = coordinate(restaurant?.longitude, -180, 180);
      if (latitude === null || longitude === null) continue;
      coordinates.push({ latitude, longitude });
    }
    if (data.length < limit) break;
  }
  return coordinates;
}

function buildTiles(points) {
  const grouped = new Map();
  for (const point of points) {
    const key = `${Math.floor(point.latitude / TILE_DEGREES)}:${Math.floor(point.longitude / TILE_DEGREES)}`;
    const tile = grouped.get(key) || {
      count: 0,
      minLat: point.latitude,
      maxLat: point.latitude,
      minLng: point.longitude,
      maxLng: point.longitude,
    };
    tile.count += 1;
    tile.minLat = Math.min(tile.minLat, point.latitude);
    tile.maxLat = Math.max(tile.maxLat, point.latitude);
    tile.minLng = Math.min(tile.minLng, point.longitude);
    tile.maxLng = Math.max(tile.maxLng, point.longitude);
    grouped.set(key, tile);
  }

  return [...grouped.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_TILES)
    .map((tile) => {
      const middleLatitude = (tile.minLat + tile.maxLat) / 2;
      const latitudePadding = RADIUS_KM / 111.32 + 0.01;
      const longitudeScale = Math.max(0.2, Math.cos((middleLatitude * Math.PI) / 180));
      const longitudePadding = RADIUS_KM / (111.32 * longitudeScale) + 0.01;
      return {
        ...tile,
        minLat: Math.max(-90, tile.minLat - latitudePadding),
        maxLat: Math.min(90, tile.maxLat + latitudePadding),
        minLng: Math.max(-180, tile.minLng - longitudePadding),
        maxLng: Math.min(180, tile.maxLng + longitudePadding),
      };
    });
}

async function fetchVenueTile(tile, remaining) {
  const venues = [];
  for (let offset = 0; offset < remaining; offset += FEED_PAGE_SIZE) {
    const limit = Math.min(FEED_PAGE_SIZE, remaining - offset);
    const url = new URL(STOPPIN_FEED_URL);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("min_lat", String(tile.minLat));
    url.searchParams.set("max_lat", String(tile.maxLat));
    url.searchParams.set("min_lng", String(tile.minLng));
    url.searchParams.set("max_lng", String(tile.maxLng));

    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "TOK-SEO-Prerender/2.0" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      console.warn(`SEO Stoppin bbox: flux indisponible (${String(error)}).`);
      return { venues: [], unavailable: true };
    }
    if (!response.ok) {
      console.warn(`SEO Stoppin bbox: flux HTTP ${response.status}; génération contextuelle reportée.`);
      return { venues: [], unavailable: true };
    }

    const payload = await response.json();
    const batch = Array.isArray(payload?.venues) ? payload.venues : [];
    venues.push(...batch);
    if (batch.length < limit || payload?.next_offset == null) break;
  }
  return { venues, unavailable: false };
}

async function collectBoundedVenues(points) {
  const tiles = buildTiles(points);
  if (!tiles.length) return { venues: [], tileCount: 0, unavailable: false, aliasToCanonical: new Map() };

  const deduped = new Map();
  for (const tile of tiles) {
    if (deduped.size >= MAX_VENUES) break;
    const result = await fetchVenueTile(tile, MAX_VENUES - deduped.size);
    if (result.unavailable) return { venues: [], tileCount: tiles.length, unavailable: true, aliasToCanonical: new Map() };
    for (const venue of result.venues) {
      const tokSlug = slugify(venue?.tok_slug);
      if (!venue?.id || !tokSlug) continue;
      deduped.set(tokSlug, { ...venue, tok_slug: tokSlug });
      if (deduped.size >= MAX_VENUES) break;
    }
  }
  const { venues, aliasToCanonical } = dedupeVenuesByPlace([...deduped.values()]);
  return { venues, tileCount: tiles.length, unavailable: false, aliasToCanonical };
}

async function startLocalFeedServer(venues) {
  const bySlug = new Map(venues.map((venue) => [venue.tok_slug, venue]));
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const slug = slugify(url.searchParams.get("slug"));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 500) || 500));
    const selected = slug
      ? (bySlug.has(slug) ? [bySlug.get(slug)] : [])
      : venues.slice(offset, offset + limit);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({
      venues: selected,
      offset: slug ? 0 : offset,
      limit: slug ? 1 : limit,
      next_offset: !slug && offset + selected.length < venues.length ? offset + selected.length : null,
    }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to resolve local SEO feed port");
  return {
    server,
    url: `http://127.0.0.1:${address.port}/thetok-venues.json`,
  };
}

function preferredPlaceLabel(venue) {
  const name = String(venue?.name || "").trim();
  const city = String(venue?.city_name || "").trim();
  const tokSlug = slugify(venue?.tok_slug);
  if (slugify(name) === tokSlug) return name;
  const contextual = [name, city].filter(Boolean).join(", ");
  if (slugify(contextual) === tokSlug) return contextual;
  return tokSlug.replace(/-/g, " ");
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function injectVenueContext(venues) {
  if (PUBLIC_ONLY) return 0;
  let updated = 0;
  for (const venue of venues) {
    const tokSlug = slugify(venue?.tok_slug);
    const latitude = coordinate(venue?.latitude, -90, 90);
    const longitude = coordinate(venue?.longitude, -180, 180);
    if (!tokSlug || latitude === null || longitude === null) continue;
    const filePath = path.join(DIST_DIR, "restaurants-pres", tokSlug, "index.html");
    let html;
    try {
      html = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    if (html.includes('id="tok-stoppin-venue-context"')) continue;
    const context = escapeJsonForHtml({
      tokSlug,
      place: preferredPlaceLabel(venue),
      latitude,
      longitude,
    });
    const script = `<script id="tok-stoppin-venue-context" type="application/json">${context}</script>`;
    html = html.replace("</head>", `  ${script}\n</head>`);
    await writeFile(filePath, html, "utf8");
    updated += 1;
  }
  return updated;
}

async function main() {
  const targetDir = PUBLIC_ONLY ? path.resolve(ROOT, "public") : DIST_DIR;
  await writeAliasReport(targetDir, new Map());
  const restaurantCoordinates = await collectRestaurantCoordinates();
  if (!restaurantCoordinates.length) {
    console.warn("SEO Stoppin bbox: aucune coordonnée restaurant disponible; le générateur historique reste fail-soft.");
    await import("./prerender-stoppin-restaurants.mjs");
    return;
  }

  const bounded = await collectBoundedVenues(restaurantCoordinates);
  const localFeed = await startLocalFeedServer(bounded.venues);
  const previousFeedUrl = process.env.SEO_STOPPIN_VENUE_FEED_URL;
  const previousMaxVenues = process.env.SEO_STOPPIN_MAX_VENUES;
  process.env.SEO_STOPPIN_VENUE_FEED_URL = localFeed.url;
  process.env.SEO_STOPPIN_MAX_VENUES = String(Math.max(1, bounded.venues.length));

  try {
    await import("./prerender-stoppin-restaurants.mjs");
    const contextualPages = await injectVenueContext(bounded.venues);
    await writeAliasReport(targetDir, bounded.aliasToCanonical);
    console.log(
      `SEO Stoppin bbox: ${restaurantCoordinates.length} restaurants répartis sur ${bounded.tileCount} zone(s), `
        + `${bounded.venues.length} lieux Stoppin utiles, ${contextualPages} page(s) synchronisée(s) avec React, `
        + `${bounded.aliasToCanonical.size} doublon(s) de lieu neutralisé(s).`,
    );
  } finally {
    if (previousFeedUrl === undefined) delete process.env.SEO_STOPPIN_VENUE_FEED_URL;
    else process.env.SEO_STOPPIN_VENUE_FEED_URL = previousFeedUrl;
    if (previousMaxVenues === undefined) delete process.env.SEO_STOPPIN_MAX_VENUES;
    else process.env.SEO_STOPPIN_MAX_VENUES = previousMaxVenues;
    await new Promise((resolve) => localFeed.server.close(resolve));
  }
}

await main();
