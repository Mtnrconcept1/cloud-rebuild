import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function robotsGroup(robots: string, userAgent: string) {
  return (
    robots
      .trim()
      .split(/\n\s*\n/)
      .find((group) => group.includes(`User-agent: ${userAgent}`)) || ""
  );
}

describe("SEO indexation and crawler hardening", () => {
  it("serves real 404 responses instead of rewriting unknown public URLs", () => {
    const config = JSON.parse(read("vercel.json")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const prerender = read("scripts/prerender-seo.mjs");
    const postDeploy = read("scripts/post-deploy-check.mjs");

    expect(config.rewrites).not.toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
    expect(prerender).toContain("function renderNotFoundHtml");
    expect(prerender).toContain(
      'writeIfDirectoryExists(DIST_DIR, "404.html", renderNotFoundHtml(baseHtml))',
    );
    expect(prerender).toContain("noindex,nofollow,noarchive");
    expect(postDeploy).toContain("route-inexistante-seo-post-deploy-check");
    expect(postDeploy).toContain("expectedStatus: 404");
  });

  it("keeps search crawlers open while opting out training and bulk crawlers", () => {
    const robots = read("public/robots.txt");

    for (const crawler of [
      "Googlebot",
      "bingbot",
      "Applebot",
      "OAI-SearchBot",
      "Claude-SearchBot",
      "PerplexityBot",
    ]) {
      const group = robotsGroup(robots, crawler);
      expect(group).toContain("Allow: /");
      expect(group).not.toContain("Disallow: /");
    }

    for (const crawler of [
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
      "Bytespider",
    ]) {
      expect(robotsGroup(robots, crawler)).toContain("Disallow: /");
    }

    expect(robotsGroup(robots, "*")).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://www.thetok.ch/sitemap.xml");
  });

  it("builds segmented, image-aware sitemaps from paginated public data", () => {
    const prerender = read("scripts/prerender-seo.mjs");
    const sitemapIndex = read("public/sitemap.xml");
    const allCommittedSitemaps = [
      read("public/sitemap-pages.xml"),
      read("public/sitemap-restaurants.xml"),
      read("public/sitemap-actualites.xml"),
    ].join("\n");

    expect(prerender).toContain('fileName: "sitemap-pages.xml"');
    expect(prerender).toContain('fileName: "sitemap-restaurants.xml"');
    expect(prerender).toContain('fileName: "sitemap-actualites.xml"');
    expect(prerender).toContain("RESTAURANT_PRERENDER_BATCH_SIZE");
    expect(prerender).toContain(".range(offset, offset + batchSize - 1)");
    expect(prerender).toContain(
      'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"',
    );
    expect(prerender).toContain("<image:image>");
    expect(sitemapIndex).toContain("<sitemapindex");
    expect(allCommittedSitemaps).not.toMatch(
      /https:\/\/www\.thetok\.ch\/(?:admin|dashboard|courier|commercial|auth|oauth|panier|profil|notifications|commandes|reservations|points-cadeau)(?:\/|<)/,
    );
  });

  it("does not index infinite local-route combinations or empty unknown listings", () => {
    const seoHook = read("src/hooks/useSeoMeta.ts");
    const localRestaurants = read("src/pages/LocalRestaurants.tsx");
    const prerender = read("scripts/prerender-seo.mjs");

    expect(seoHook).not.toContain(
      '["/restaurant/", "/restaurants/", "/actualites/"]',
    );
    expect(localRestaurants).toContain("hasConfirmedEmptyInventory");
    expect(localRestaurants).toContain("unknownListingRoute");
    expect(localRestaurants).toContain("legacySlugMiss");
    expect(localRestaurants).toContain('"noindex,follow,noarchive"');
    expect(prerender).toContain("MIN_LOCAL_RESTAURANTS");
    expect(prerender).toContain("MIN_SPECIALIZED_LOCAL_RESTAURANTS");
    expect(prerender).toContain('page.localPageType === "city"');
    expect(localRestaurants).toContain("hasThinInventory");
    expect(prerender).toContain("MIN_ACTUALITE_TEXT_LENGTH");
    expect(prerender).toContain('page.seoKind === "local-listing"');
    expect(prerender).toContain("includeInSitemap: false");
    expect(prerender).toContain('robots: "noindex,follow,noarchive"');
  });

  it("demotes local pages that merely duplicate the inventory of their parent city page", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    // Une intention comme /restaurants/<ville>/pas-cher ne vaut que si elle sélectionne réellement.
    // Quand price_range est uniforme dans le catalogue, elle reprend toute la ville : c'est un doublon.
    expect(prerender).toContain("MAX_LOCAL_PARENT_COVERAGE");
    expect(prerender).toContain("SEO_MAX_LOCAL_PARENT_COVERAGE || 0.8");
    expect(prerender).toContain("const duplicatesParentCity");
    expect(prerender).toContain("parentInventoryCount");
    expect(prerender).toContain(
      "Number(page.inventoryCount || 0) >= parentInventory * MAX_LOCAL_PARENT_COVERAGE",
    );
    expect(prerender).toContain("const isDemotedLocalPage");
    // Le déclassement doit rester couplé au noindex + exclusion sitemap, jamais à l'un des deux seul.
    expect(prerender).toMatch(
      /isDemotedLocalPage\(page\)\s*\?\s*\{ \.\.\.page, includeInSitemap: false, robots: "noindex,follow,noarchive" \}/,
    );
  });

  it("keeps a city listing out of the index until it holds a real inventory", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    // Une commune à une seule adresse produit ~85 mots : contenu mince, pas une page de destination.
    expect(prerender).toContain("SEO_MIN_LOCAL_RESTAURANTS || 3");
    expect(prerender).toContain("SEO_MIN_SPECIALIZED_LOCAL_RESTAURANTS || 3");
  });

  it("reads verified cuisines from restaurant_cuisines instead of the sparse free-text column", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    expect(prerender).toContain("collectVerifiedCuisinesByRestaurant");
    expect(prerender).toContain('.from("restaurant_cuisines")');
    expect(prerender).toContain('.select("restaurant_id, cuisines(slug, name)")');
    // La lecture est enrichissante, jamais bloquante : un échec ne doit pas casser le build SEO.
    expect(prerender).toContain("SEO cuisines: lecture impossible");
    expect(prerender).toContain("extractRestaurantCuisineSlugs(cuisine, verified.slugs)");
    // Le texte libre existant reste prioritaire sur la source structurée.
    expect(prerender).toContain("const effectiveCuisineType = cuisine || verified.labels.join");
  });

  it("links every restaurant page to its city, its cuisines and its closest neighbours", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    expect(prerender).toContain("const buildRestaurantLinks");
    expect(prerender).toContain("MAX_NEARBY_RESTAURANT_LINKS");
    expect(prerender).toContain("haversineKm");
    // On ne maille que vers des pages cuisine réellement publiables.
    expect(prerender).toContain("MIN_SPECIALIZED_LOCAL_RESTAURANTS;");
    expect(prerender).toContain("links: buildRestaurantLinks({");
    // Une fiche ne doit jamais se lier à elle-même.
    expect(prerender).toContain("link.href !== restaurantPath");
  });

  it("keeps a single indexable page per imported name/address duplicate and disambiguates branches", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    // Le catalogue importé republie la même adresse sous plusieurs fiches homonymes.
    expect(prerender).toContain("const strictDuplicateGroups");
    expect(prerender).toContain("const isRedundantDuplicate");
    // Le représentant conservé doit être stable entre deux builds.
    expect(prerender).toContain("for (const group of strictDuplicateGroups.values()) group.sort();");
    expect(prerender).toContain(
      'redundant ? { includeInSitemap: false, robots: "noindex,follow,noarchive" } : {}',
    );
    // Les vraies succursales restent indexées mais avec un titre et un H1 distincts.
    expect(prerender).toContain("const disambiguationSuffix");
    expect(prerender).toContain("homonymCountByCity");
    // La désambiguïsation n'utilise que l'adresse réellement enregistrée, jamais une donnée inventée.
    expect(prerender).toContain("const address = String(restaurant.address || \"\").trim();");
    expect(prerender).toContain("return address ? ` – ${address}` : \"\";");
  });

  it("derives every city URL from the shared identity module, in both SEO scripts", () => {
    const prerender = read("scripts/prerender-seo.mjs");
    const directoryHardening = read("scripts/harden-directory-restaurant-seo.mjs");

    // Le comportement lui-même est couvert par seo-city-identity.test.ts. Ce qui compte ici, c'est que
    // les deux scripts partagent la même source : une copie divergente ferait chercher les fiches à une
    // URL et les écrire à une autre.
    for (const script of [prerender, directoryHardening]) {
      expect(script).toContain('from "../src/lib/seo/cityIdentity.mjs"');
      expect(script).toContain("pickOneRestaurantPerPath");
    }
    expect(prerender).toContain("citySlug as citySlugOf");
    expect(prerender).toContain("const citySlug = citySlugOf(restaurant.city");
    expect(prerender).toContain("const city = cityLabel(restaurant.city)");
    expect(directoryHardening).toContain("const city = citySlug(restaurant.city");
    // Aucun script ne doit redéfinir la règle localement.
    for (const script of [prerender, directoryHardening]) {
      expect(script).not.toContain("const SWISS_CANTON_SUFFIX");
      expect(script).not.toContain("function cityLabel(");
    }
    // Le conflit d'URL doit rester visible dans les logs de build, jamais silencieux.
    expect(prerender).toContain("partageant l'URL d'une autre");
    expect(directoryHardening).toContain("partageant l'URL d'une autre");
  });

  it("migrates the Carouge catalog under a single spelling without breaking its unique index", () => {
    const migration = read("supabase/migrations/20260902190000_normalize_carouge_city_variant.sql");

    // Les fiches en double doivent être fusionnées AVANT la normalisation : l'index unique porte sur
    // (lower(city), slug) sans filtre sur is_active, donc renommer une jumelle ferait échouer la migration.
    const mergeStep = migration.indexOf("SET is_active = false");
    const renameStep = migration.indexOf("SET city = 'Carouge'");
    expect(mergeStep).toBeGreaterThan(-1);
    expect(renameStep).toBeGreaterThan(mergeStep);

    // Rien n'est supprimé : la désactivation est réversible.
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.restaurants\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    // Les données de la jumelle sont reprises avant sa désactivation, jamais inventées.
    expect(migration).toContain("INSERT INTO public.restaurant_cuisines");
    expect(migration).toContain("ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING");
    expect(migration).toContain("COALESCE(btrim(kept.phone), '') = ''");
    // Le NOT EXISTS protège l'index unique contre tout slug déjà pris côté « Carouge ».
    expect(migration).toContain("AND NOT EXISTS (");
    expect(migration).toContain("lower(COALESCE(other.city, '')) = 'carouge'");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });

  it("redirects the retired Carouge spelling to the canonical commune URLs", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects?: { source: string; destination: string; statusCode?: number }[];
    };

    for (const [source, destination] of [
      ["/restaurants/carouge-ge", "/restaurants/carouge"],
      ["/restaurants/carouge-ge/:path*", "/restaurants/carouge/:path*"],
    ]) {
      const redirects = vercel.redirects?.filter((entry) => entry.source === source) ?? [];
      expect(redirects, `redirection unique attendue pour ${source}`).toEqual([
        { source, destination, statusCode: 301 },
      ]);
    }
  });

  it("redirects sitemap URLs still registered in Search Console to the live index", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects?: { source: string; destination: string; permanent?: boolean }[];
    };

    for (const source of ["/sitemap-seo.xml", "/sitemap_index.xml", "/sitemap-index.xml"]) {
      const redirect = vercel.redirects?.find((entry) => entry.source === source);
      expect(redirect, `redirection manquante pour ${source}`).toBeDefined();
      expect(redirect?.destination).toBe("/sitemap.xml");
      expect(redirect?.permanent).toBe(true);
    }
  });

  it("bounds the public Supabase catalog query before invoking its private implementation", () => {
    const migration = read(
      "supabase/migrations/20260801120000_harden_public_restaurant_search_bounds.sql",
    );

    expect(migration).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100)",
    );
    expect(migration).toContain(
      "LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000)",
    );
    expect(migration).toContain("left(p_query, 160)");
    expect(migration).toContain("to_regprocedure(");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.search_restaurants_catalog_unguarded",
    );
    expect(migration).toContain("TO anon, authenticated, service_role");
  });
});
