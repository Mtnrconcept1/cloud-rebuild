import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, "dist");
const PUBLIC_DIR = path.resolve(ROOT, "public");
const PUBLIC_ONLY = process.argv.includes("--public-only");
const CANONICAL_ORIGIN = "https://www.thetok.ch";
const STOPPIN_ORIGIN = "https://stoppin.ch";
const STOPPIN_FEED_URL = process.env.SEO_STOPPIN_VENUE_FEED_URL || `${STOPPIN_ORIGIN}/thetok-venues.json`;
const MAX_VENUES = Math.max(1, Number(process.env.SEO_STOPPIN_MAX_VENUES || 5000) || 5000);
const FEED_PAGE_SIZE = Math.min(1000, Math.max(50, Number(process.env.SEO_STOPPIN_FEED_PAGE_SIZE || 500) || 500));
const MAX_RESTAURANTS = Math.max(1, Number(process.env.SEO_SITEMAP_MAX_RESTAURANTS || 10000) || 10000);
const RESTAURANT_BATCH_SIZE = 500;
const MIN_NEARBY_RESTAURANTS = Math.max(3, Number(process.env.SEO_STOPPIN_MIN_NEARBY_RESTAURANTS || 3) || 3);
const MAX_NEARBY_RESTAURANTS = Math.max(MIN_NEARBY_RESTAURANTS, Number(process.env.SEO_STOPPIN_NEARBY_LIST_SIZE || 12) || 12);
const NEARBY_RADIUS_KM = Math.max(0.5, Number(process.env.SEO_STOPPIN_RADIUS_KM || 3) || 3);
const SITEMAP_SHARD_SIZE = 10000;
const STOPPIN_SITEMAP_PREFIX = "sitemap-restaurants-stoppin-";

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
      // Public env files are optional in CI; GitHub Actions injects VITE_* values.
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

function escapeXml(value) {
  return escapeHtml(value);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalUrl(pathname) {
  return new URL(pathname, CANONICAL_ORIGIN).toString();
}

function buildRestaurantPath(restaurant) {
  const citySlug = slugify(restaurant.city || "geneve");
  const restaurantSlug = slugify(restaurant.slug || "");
  if (citySlug && restaurantSlug) return `/restaurants/${citySlug}/r/${restaurantSlug}`;
  return restaurant.id ? `/restaurant/${restaurant.id}` : "/recherche";
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(aLat, aLng, bLat, bLng) {
  const earthRadiusKm = 6371.0088;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

async function collectStoppinVenues() {
  const venues = [];
  for (let offset = 0; offset < MAX_VENUES; offset += FEED_PAGE_SIZE) {
    const limit = Math.min(FEED_PAGE_SIZE, MAX_VENUES - offset);
    const url = new URL(STOPPIN_FEED_URL);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "TOK-SEO-Prerender/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      console.warn(`SEO Stoppin: flux indisponible (${String(error)}). Les pages existantes TOK restent générées.`);
      return [];
    }
    if (!response.ok) {
      console.warn(`SEO Stoppin: flux HTTP ${response.status}. Les pages contextuelles seront générées dès que Stoppin sera déployé.`);
      return [];
    }
    const payload = await response.json();
    const batch = Array.isArray(payload?.venues) ? payload.venues : [];
    for (const venue of batch) {
      const latitude = validCoordinate(venue?.latitude, -90, 90);
      const longitude = validCoordinate(venue?.longitude, -180, 180);
      const tokSlug = slugify(venue?.tok_slug);
      const name = String(venue?.name || "").trim();
      const cityName = String(venue?.city_name || "").trim();
      if (!venue?.id || !tokSlug || !name || !cityName || latitude === null || longitude === null) continue;
      venues.push({ ...venue, tok_slug: tokSlug, name, city_name: cityName, latitude, longitude });
    }
    if (batch.length < limit || payload?.next_offset == null) break;
  }
  return [...new Map(venues.map((venue) => [venue.tok_slug, venue])).values()];
}

async function collectTokRestaurants() {
  loadPublicEnvFiles();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn("SEO Stoppin: variables Supabase publiques absentes; aucune page contextuelle générée.");
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const restaurants = [];
  for (let offset = 0; offset < MAX_RESTAURANTS; offset += RESTAURANT_BATCH_SIZE) {
    const limit = Math.min(RESTAURANT_BATCH_SIZE, MAX_RESTAURANTS - offset);
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,slug,city,cuisine_type,image_url,rating,review_count,address,latitude,longitude,updated_at")
      .eq("is_active", true)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO Stoppin: inventaire restaurants indisponible (${error?.message || "réponse invalide"}).`);
      return [];
    }
    for (const restaurant of data) {
      const latitude = validCoordinate(restaurant?.latitude, -90, 90);
      const longitude = validCoordinate(restaurant?.longitude, -180, 180);
      if (!restaurant?.id || !restaurant?.name || latitude === null || longitude === null) continue;
      restaurants.push({ ...restaurant, latitude, longitude });
    }
    if (data.length < limit) break;
  }
  return restaurants;
}

function findNearbyRestaurants(venue, restaurants) {
  return restaurants
    .map((restaurant) => ({
      ...restaurant,
      distance_km: distanceKm(venue.latitude, venue.longitude, restaurant.latitude, restaurant.longitude),
    }))
    .filter((restaurant) => restaurant.distance_km <= NEARBY_RADIUS_KM)
    .sort((left, right) => {
      if (left.distance_km !== right.distance_km) return left.distance_km - right.distance_km;
      const ratingDifference = Number(right.rating || 0) - Number(left.rating || 0);
      if (ratingDifference) return ratingDifference;
      return String(left.name).localeCompare(String(right.name), "fr");
    })
    .slice(0, MAX_NEARBY_RESTAURANTS);
}

function renderStructuredData(venue, restaurants, pagePath) {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Restaurants près de ${venue.name}, ${venue.city_name}`,
    numberOfItems: restaurants.length,
    itemListElement: restaurants.map((restaurant, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: canonicalUrl(buildRestaurantPath(restaurant)),
      item: {
        "@type": "Restaurant",
        name: restaurant.name,
        url: canonicalUrl(buildRestaurantPath(restaurant)),
        address: restaurant.address || undefined,
        servesCuisine: restaurant.cuisine_type || undefined,
        image: restaurant.image_url || undefined,
        aggregateRating: Number(restaurant.rating) > 0 && Number(restaurant.review_count) > 0
          ? {
              "@type": "AggregateRating",
              ratingValue: Number(restaurant.rating),
              reviewCount: Number(restaurant.review_count),
            }
          : undefined,
      },
    })),
  };
  const page = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl(pagePath),
    url: canonicalUrl(pagePath),
    name: `Où manger près de ${venue.name}, ${venue.city_name}`,
    about: {
      "@type": "Place",
      name: venue.name,
      url: venue.stoppin_url || `${STOPPIN_ORIGIN}/venue/${venue.slug}`,
      geo: {
        "@type": "GeoCoordinates",
        latitude: venue.latitude,
        longitude: venue.longitude,
      },
    },
    mainEntity: itemList,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Restaurants", item: canonicalUrl("/recherche") },
      { "@type": "ListItem", position: 2, name: `Restaurants à ${venue.city_name}`, item: canonicalUrl(`/restaurants/${slugify(venue.city_name)}`) },
      { "@type": "ListItem", position: 3, name: venue.name, item: canonicalUrl(pagePath) },
    ],
  };
  return [page, breadcrumb];
}

function replaceHead(html, { title, description, canonical, structuredData }) {
  let output = html;
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  const descriptionTag = `<meta name="description" content="${escapeHtml(description)}">`;
  if (/<meta\s+name=["']description["'][^>]*>/i.test(output)) {
    output = output.replace(/<meta\s+name=["']description["'][^>]*>/i, descriptionTag);
  } else {
    output = output.replace("</head>", `  ${descriptionTag}\n</head>`);
  }
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(output)) {
    output = output.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonicalTag);
  } else {
    output = output.replace("</head>", `  ${canonicalTag}\n</head>`);
  }
  const robotsTag = '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">';
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(output)) {
    output = output.replace(/<meta\s+name=["']robots["'][^>]*>/i, robotsTag);
  } else {
    output = output.replace("</head>", `  ${robotsTag}\n</head>`);
  }
  output = output.replace("</head>", `  <script type="application/ld+json">${JSON.stringify(structuredData)}</script>\n</head>`);
  return output;
}

function renderStaticContent(venue, restaurants) {
  const cards = restaurants.map((restaurant) => {
    const restaurantPath = buildRestaurantPath(restaurant);
    const distanceLabel = `${restaurant.distance_km.toFixed(1).replace(".", ",")} km`;
    const details = [restaurant.cuisine_type, restaurant.address, distanceLabel].filter(Boolean).join(" · ");
    return `<li><a href="${escapeHtml(restaurantPath)}"><strong>${escapeHtml(restaurant.name)}</strong></a><br><span>${escapeHtml(details)}</span></li>`;
  }).join("\n");
  const stoppinUrl = venue.stoppin_url || `${STOPPIN_ORIGIN}/venue/${encodeURIComponent(venue.slug)}`;
  return `<main data-seo-prerender="stoppin-nearby" style="max-width:1120px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif">
    <nav aria-label="Fil d’Ariane"><a href="/recherche">Restaurants</a> › <a href="/restaurants/${escapeHtml(slugify(venue.city_name))}">${escapeHtml(venue.city_name)}</a> › ${escapeHtml(venue.name)}</nav>
    <h1>Où manger près de ${escapeHtml(venue.name)}, ${escapeHtml(venue.city_name)} ?</h1>
    <p>Découvrez ${restaurants.length} restaurants situés à moins de ${escapeHtml(String(NEARBY_RADIUS_KM).replace(".", ","))} km de ${escapeHtml(venue.name)}. Les distances sont calculées à partir des coordonnées publiques du lieu référencé par Stoppin.</p>
    <p><a href="${escapeHtml(stoppinUrl)}" rel="noopener">Voir ${escapeHtml(venue.name)} sur Stoppin : événements, adresse et informations du lieu</a>.</p>
    <section aria-labelledby="nearby-restaurants"><h2 id="nearby-restaurants">Restaurants à proximité</h2><ol>${cards}</ol></section>
    <section><h2>Préparer votre sortie</h2><p>Consultez la fiche de chaque restaurant pour vérifier cuisine, horaires et services disponibles. Les fonctions de réservation ou de commande ne sont proposées que lorsqu’elles sont activées par l’établissement.</p></section>
  </main>`;
}

function injectStaticRoot(html, staticContent) {
  if (/<div\s+id=["']root["']\s*>[\s\S]*?<\/div>/i.test(html)) {
    return html.replace(/<div\s+id=["']root["']\s*>[\s\S]*?<\/div>/i, `<div id="root">${staticContent}</div>`);
  }
  return html.replace("</body>", `${staticContent}\n</body>`);
}

async function clearOldStoppinSitemaps(targetDir) {
  try {
    const entries = await readdir(targetDir);
    await Promise.all(entries
      .filter((entry) => entry.startsWith(STOPPIN_SITEMAP_PREFIX) && entry.endsWith(".xml"))
      .map((entry) => unlink(path.join(targetDir, entry))));
  } catch {
    // Target may not exist during a public-only bootstrap.
  }
}

function renderSitemap(entries) {
  const rows = entries.map(({ path: pagePath, lastmod }) => {
    const date = lastmod && !Number.isNaN(Date.parse(lastmod)) ? new Date(lastmod).toISOString().slice(0, 10) : null;
    return `  <url>\n    <loc>${escapeXml(canonicalUrl(pagePath))}</loc>${date ? `\n    <lastmod>${date}</lastmod>` : ""}\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

async function addSitemapsToIndex(targetDir, sitemapFiles) {
  const indexPath = path.join(targetDir, "sitemap.xml");
  let sitemapIndex;
  try {
    sitemapIndex = await readFile(indexPath, "utf8");
  } catch {
    return;
  }
  sitemapIndex = sitemapIndex.replace(
    /\s*<sitemap>\s*<loc>https:\/\/www\.thetok\.ch\/sitemap-restaurants-stoppin-[^<]+<\/loc>\s*<\/sitemap>/g,
    "",
  );
  const additions = sitemapFiles
    .map((file) => `  <sitemap>\n    <loc>${CANONICAL_ORIGIN}/${file}</loc>\n  </sitemap>`)
    .join("\n");
  sitemapIndex = sitemapIndex.replace("</sitemapindex>", `${additions ? `${additions}\n` : ""}</sitemapindex>`);
  await writeFile(indexPath, sitemapIndex, "utf8");
}

async function main() {
  const [venues, restaurants] = await Promise.all([collectStoppinVenues(), collectTokRestaurants()]);
  if (!venues.length || !restaurants.length) {
    console.log(`SEO Stoppin: 0 page contextuelle générée (lieux=${venues.length}, restaurants=${restaurants.length}).`);
    return;
  }

  const pages = venues.flatMap((venue) => {
    const nearby = findNearbyRestaurants(venue, restaurants);
    if (nearby.length < MIN_NEARBY_RESTAURANTS) return [];
    return [{
      venue,
      restaurants: nearby,
      path: `/restaurants-pres/${venue.tok_slug}`,
      lastmod: venue.updated_at || nearby[0]?.updated_at || null,
    }];
  });

  const targetDir = PUBLIC_ONLY ? PUBLIC_DIR : DIST_DIR;
  await mkdir(targetDir, { recursive: true });
  await clearOldStoppinSitemaps(targetDir);

  if (!PUBLIC_ONLY) {
    const templatePath = path.join(DIST_DIR, "index.html");
    const template = await readFile(templatePath, "utf8");
    for (const page of pages) {
      const title = `Restaurants près de ${page.venue.name}, ${page.venue.city_name} | TOK`;
      const description = `Trouvez les restaurants proches de ${page.venue.name} à ${page.venue.city_name}, avec distances réelles, cuisines et accès aux fiches TOK.`;
      const structuredData = renderStructuredData(page.venue, page.restaurants, page.path);
      const withHead = replaceHead(template, {
        title,
        description,
        canonical: canonicalUrl(page.path),
        structuredData,
      });
      const html = injectStaticRoot(withHead, renderStaticContent(page.venue, page.restaurants));
      const outputDir = path.join(DIST_DIR, page.path.replace(/^\//, ""));
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, "index.html"), html, "utf8");
    }
  }

  const sitemapFiles = [];
  for (let index = 0; index < pages.length; index += SITEMAP_SHARD_SIZE) {
    const shard = pages.slice(index, index + SITEMAP_SHARD_SIZE);
    const fileName = `${STOPPIN_SITEMAP_PREFIX}${Math.floor(index / SITEMAP_SHARD_SIZE) + 1}.xml`;
    await writeFile(path.join(targetDir, fileName), renderSitemap(shard), "utf8");
    sitemapFiles.push(fileName);
  }
  await addSitemapsToIndex(targetDir, sitemapFiles);

  console.log(
    `SEO Stoppin: ${pages.length} pages HTML contextuelles, ${sitemapFiles.length} sitemap(s), `
      + `${venues.length} lieux éligibles analysés et ${restaurants.length} restaurants géolocalisés.`,
  );
}

await main();
