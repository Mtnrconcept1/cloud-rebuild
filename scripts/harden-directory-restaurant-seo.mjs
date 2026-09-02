import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { cityLabel, citySlug, pickOneRestaurantPerPath } from "../src/lib/seo/cityIdentity.mjs";

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, "dist");
const PUBLIC_DIR = path.resolve(ROOT, "public");
const PUBLIC_ONLY = process.argv.includes("--public-only");
const CANONICAL_ORIGIN = "https://www.thetok.ch";
const MAX_DIRECTORY_RESTAURANTS = Math.max(
  1,
  Number(process.env.SEO_DIRECTORY_MAX_RESTAURANTS || 10000) || 10000,
);
const BATCH_SIZE = 500;
const GENERIC_DIRECTORY_DESCRIPTION =
  "Établissement référencé dans l’annuaire public TOK. Les services de réservation, commande et livraison ne sont activés que lorsque l’établissement les propose officiellement sur TOK.";

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
      // Public environment files are optional in CI.
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

// L'identité de commune vient du module partagé : ce script doit produire exactement la même URL que
// prerender-seo.mjs, sinon il cherche les fiches au mauvais endroit et les laisse silencieusement sans
// enrichissement ni lien de revendication.
function restaurantPath(restaurant) {
  const city = citySlug(restaurant.city || "geneve");
  const restaurantSlug = slugify(restaurant.slug || "");
  if (city && restaurantSlug) return `/restaurants/${city}/r/${restaurantSlug}`;
  return restaurant.id ? `/restaurant/${restaurant.id}` : null;
}

function coreFactsReady(restaurant) {
  return Boolean(
    String(restaurant?.name || "").trim()
      && String(restaurant?.city || "").trim()
      && String(restaurant?.address || "").trim()
      && String(restaurant?.slug || "").trim(),
  );
}

function directoryMetaDescription(restaurant) {
  const name = String(restaurant.name || "Restaurant").trim();
  const city = cityLabel(restaurant.city) || "Genève";
  const address = String(restaurant.address || "").trim();
  const cuisine = String(restaurant.cuisine_type || "").trim();
  const detail = cuisine ? ` Cuisine ${cuisine.toLowerCase()}.` : "";
  const description = `${name} à ${city}${address ? ` — ${address}` : ""}.${detail} Fiche annuaire TOK issue de données publiques d’établissements.`;
  return description.length <= 158 ? description : `${description.slice(0, 157).trimEnd()}…`;
}

function factualParagraph(restaurant) {
  const facts = [
    `${restaurant.name} est référencé à ${restaurant.address}, ${cityLabel(restaurant.city)}`,
    restaurant.cuisine_type ? `La cuisine renseignée est ${restaurant.cuisine_type}` : null,
    restaurant.phone ? `Le numéro public renseigné est ${restaurant.phone}` : null,
  ].filter(Boolean);
  return `${facts.join(". ")}. Cette fiche informative est issue d’un annuaire public d’établissements, notamment de données du registre du commerce et d’autres sources publiques de référence. Les services transactionnels ne sont disponibles que lorsqu’ils sont activés officiellement par l’établissement sur TOK.`;
}

function renderDirectoryFacts(restaurant) {
  const city = citySlug(restaurant.city);
  const claimParams = new URLSearchParams({
    type: "restaurateur",
    claimRestaurant: String(restaurant.id),
    claimName: String(restaurant.name),
  });
  const rows = [
    ["Adresse", restaurant.address],
    ["Commune", cityLabel(restaurant.city)],
    ["Cuisine", restaurant.cuisine_type],
    ["Téléphone public", restaurant.phone],
  ].filter(([, value]) => String(value || "").trim());
  const facts = rows
    .map(([label, value]) => `<li><strong>${escapeHtml(label)} :</strong> ${escapeHtml(value)}</li>`)
    .join("");

  return `<section id="tok-directory-seo-facts" data-directory-public-source="true" style="max-width:1120px;margin:24px auto;padding:24px 20px;border:1px solid #e7e2df;border-radius:18px">
    <h2>Informations publiques sur ${escapeHtml(restaurant.name)}</h2>
    <p>${escapeHtml(factualParagraph(restaurant))}</p>
    <ul>${facts}</ul>
    <nav aria-label="Liens utiles pour ${escapeHtml(restaurant.name)}">
      <a href="/restaurants/${escapeHtml(city)}">Voir les restaurants à ${escapeHtml(cityLabel(restaurant.city))}</a>
      · <a href="/auth?${escapeHtml(claimParams.toString())}">Revendiquer cette fiche restaurant</a>
    </nav>
  </section>`;
}

function upsertMeta(html, name, content) {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, "i");
  const tag = `<meta name="${name}" content="${escaped}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function upsertPropertyMeta(html, property, content) {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, "i");
  const tag = `<meta property="${property}" content="${escaped}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function markNoindex(html) {
  return upsertMeta(html, "robots", "noindex,follow,noarchive");
}

async function collectDirectoryRestaurants() {
  loadPublicEnvFiles();
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const restaurants = [];
  for (let offset = 0; offset < MAX_DIRECTORY_RESTAURANTS; offset += BATCH_SIZE) {
    const limit = Math.min(BATCH_SIZE, MAX_DIRECTORY_RESTAURANTS - offset);
    const { data, error } = await supabase
      .from("restaurants")
      .select("id,name,slug,city,address,phone,cuisine_type,description,updated_at,is_directory_listing,directory_source")
      .eq("is_active", true)
      .eq("is_directory_listing", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !Array.isArray(data)) {
      console.warn(`SEO annuaire: lecture impossible (${error?.message || "réponse invalide"}).`);
      return [];
    }
    restaurants.push(...data);
    if (data.length < limit) break;
  }
  return restaurants;
}

async function removePathsFromRestaurantSitemap(paths) {
  if (!paths.size) return;
  const sitemapPath = path.join(PUBLIC_ONLY ? PUBLIC_DIR : DIST_DIR, "sitemap-restaurants.xml");
  let xml;
  try {
    xml = await readFile(sitemapPath, "utf8");
  } catch {
    return;
  }
  for (const pathname of paths) {
    const absolute = `${CANONICAL_ORIGIN}${pathname}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    xml = xml.replace(
      new RegExp(`\\s*<url>\\s*<loc>${absolute}<\\/loc>[\\s\\S]*?<\\/url>`, "g"),
      "",
    );
  }
  await writeFile(sitemapPath, xml, "utf8");
}

async function hardenHtml(restaurants) {
  if (PUBLIC_ONLY) return { enriched: 0, noindexed: 0, noindexPaths: new Set() };
  let enriched = 0;
  let noindexed = 0;
  const noindexPaths = new Set();

  for (const restaurant of restaurants) {
    const pathname = restaurantPath(restaurant);
    if (!pathname) continue;
    const filePath = path.join(DIST_DIR, pathname.replace(/^\//, ""), "index.html");
    let html;
    try {
      html = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    if (!coreFactsReady(restaurant)) {
      html = markNoindex(html);
      noindexPaths.add(pathname);
      noindexed += 1;
      await writeFile(filePath, html, "utf8");
      continue;
    }

    const metaDescription = directoryMetaDescription(restaurant);
    html = upsertMeta(html, "description", metaDescription);
    html = upsertPropertyMeta(html, "og:description", metaDescription);
    html = html.split(GENERIC_DIRECTORY_DESCRIPTION).join(factualParagraph(restaurant));
    if (!html.includes('id="tok-directory-seo-facts"')) {
      const facts = renderDirectoryFacts(restaurant);
      html = html.includes('<div id="root">')
        ? html.replace('<div id="root">', `<div id="root">${facts}`)
        : html.replace("</body>", `${facts}\n</body>`);
    }
    await writeFile(filePath, html, "utf8");
    enriched += 1;
  }
  return { enriched, noindexed, noindexPaths };
}

async function main() {
  const collected = await collectDirectoryRestaurants();
  // Deux fiches peuvent viser la même URL. Sans ce filtre, la dernière lue écraserait les métadonnées
  // de celle que le prérendu a retenue : un titre et une description qui ne parlent pas du même
  // établissement. La règle partagée garantit que les deux scripts désignent la même titulaire.
  const restaurants = [...pickOneRestaurantPerPath(
    collected.filter((restaurant) => restaurantPath(restaurant)),
    restaurantPath,
  ).values()];
  const shadowed = collected.length - restaurants.length;
  if (shadowed > 0) {
    console.log(`SEO annuaire: ${shadowed} fiche(s) partageant l'URL d'une autre, ignorée(s).`);
  }
  if (!restaurants.length) {
    console.log("SEO annuaire: aucune fiche publique à durcir; build inchangé.");
    return;
  }

  const guaranteedThinPaths = new Set(
    restaurants
      .filter((restaurant) => !coreFactsReady(restaurant))
      .map(restaurantPath)
      .filter(Boolean),
  );
  const result = await hardenHtml(restaurants);
  for (const pathname of guaranteedThinPaths) result.noindexPaths.add(pathname);
  await removePathsFromRestaurantSitemap(result.noindexPaths);

  console.log(
    `SEO annuaire: ${restaurants.length} fiches contrôlées, ${result.enriched} enrichies, `
      + `${result.noindexPaths.size} fiche(s) trop pauvre(s) exclue(s) du sitemap.`,
  );
}

await main();
