import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("programmatic restaurant SEO with Stoppin", () => {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const prerender = readFileSync(path.resolve(root, "scripts/prerender-seo.mjs"), "utf8");
  const stoppinPrerender = readFileSync(
    path.resolve(root, "scripts/prerender-stoppin-restaurants.mjs"),
    "utf8",
  );
  const boundedStoppinPrerender = readFileSync(
    path.resolve(root, "scripts/prerender-stoppin-restaurants-bounded.mjs"),
    "utf8",
  );
  const directoryHardening = readFileSync(
    path.resolve(root, "scripts/harden-directory-restaurant-seo.mjs"),
    "utf8",
  );

  it("keeps every active restaurant eligible for individual HTML prerendering", () => {
    expect(prerender).toContain("SEO_SITEMAP_MAX_RESTAURANTS || 10000");
    expect(prerender).toContain('.from("restaurants")');
    expect(prerender).toContain('.eq("is_active", true)');
    expect(prerender).toContain("const restaurantPages = restaurants.map");
    expect(prerender).toContain("buildRestaurantSeoPath(restaurant)");
  });

  it("chains directory differentiation and bounded Stoppin pages into all SEO builds", () => {
    for (const scriptName of ["build:prod", "seo:prerender", "seo:sitemap"] as const) {
      expect(packageJson.scripts?.[scriptName]).toContain("harden-directory-restaurant-seo.mjs");
      expect(packageJson.scripts?.[scriptName]).toContain("prerender-stoppin-restaurants-bounded.mjs");
    }
    expect(packageJson.scripts?.["seo:sitemap"]).toContain("--public-only");
  });

  it("uses bounded geographic Stoppin tiles derived from real TOK restaurant coordinates", () => {
    expect(boundedStoppinPrerender).toContain("SEO_STOPPIN_TILE_DEGREES || 0.25");
    expect(boundedStoppinPrerender).toContain("SEO_STOPPIN_MAX_TILES || 128");
    expect(boundedStoppinPrerender).toContain("SEO_STOPPIN_MAX_VENUES || 15000");
    expect(boundedStoppinPrerender).toContain('url.searchParams.set("min_lat"');
    expect(boundedStoppinPrerender).toContain('url.searchParams.set("max_lat"');
    expect(boundedStoppinPrerender).toContain('url.searchParams.set("min_lng"');
    expect(boundedStoppinPrerender).toContain('url.searchParams.set("max_lng"');
    expect(boundedStoppinPrerender).toContain("buildTiles(points)");
    expect(boundedStoppinPrerender).toContain("restaurantCoordinates.length");
    expect(boundedStoppinPrerender).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("still requires real nearby inventory instead of generating doorway keyword combinations", () => {
    expect(stoppinPrerender).toContain("MIN_NEARBY_RESTAURANTS");
    expect(stoppinPrerender).toContain("SEO_STOPPIN_MIN_NEARBY_RESTAURANTS || 3");
    expect(stoppinPrerender).toContain("distanceKm(");
    expect(stoppinPrerender).toContain("restaurant.distance_km <= NEARBY_RADIUS_KM");
    expect(stoppinPrerender).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(stoppinPrerender).not.toContain("service_role");
  });

  it("creates canonical static pages with TOK↔Stoppin entity context and structured data", () => {
    expect(stoppinPrerender).toContain("`/restaurants-pres/${venue.tok_slug}`");
    expect(stoppinPrerender).toContain('"@type": "Restaurant"');
    expect(stoppinPrerender).toContain('"@type": "ItemList"');
    expect(stoppinPrerender).toContain('"@type": "Place"');
    expect(stoppinPrerender).toContain("Voir ${escapeHtml(venue.name)} sur Stoppin");
    expect(stoppinPrerender).toContain("sitemap-restaurants-stoppin-");
    expect(stoppinPrerender).toContain("SITEMAP_SHARD_SIZE = 10000");
    expect(stoppinPrerender).toContain('robotsTag = \'<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">\'');
  });

  it("keeps direct Google landings spatially coherent without mutating the canonical URL", () => {
    expect(boundedStoppinPrerender).toContain('id="tok-stoppin-venue-context"');
    expect(boundedStoppinPrerender).toContain('type="application/json"');
    expect(boundedStoppinPrerender).toContain("escapeJsonForHtml");
    expect(boundedStoppinPrerender).toContain("preferredPlaceLabel(venue)");
    expect(boundedStoppinPrerender).toContain("latitude");
    expect(boundedStoppinPrerender).toContain("longitude");
    expect(boundedStoppinPrerender).not.toContain("history.replaceState");
  });

  it("turns directory listings into factually distinct public HTML pages", () => {
    expect(directoryHardening).toContain('.eq("is_directory_listing", true)');
    expect(directoryHardening).toContain("données du registre du commerce");
    expect(directoryHardening).toContain("d’autres sources publiques de référence");
    expect(directoryHardening).toContain('id="tok-directory-seo-facts"');
    expect(directoryHardening).toContain("Revendiquer cette fiche restaurant");
    expect(directoryHardening).toContain("directoryMetaDescription");
    expect(directoryHardening).toContain("coreFactsReady");
    expect(directoryHardening).toContain("noindex,follow,noarchive");
    expect(directoryHardening).toContain("sitemap-restaurants.xml");
    expect(directoryHardening).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("fails soft when Stoppin is unavailable instead of breaking TOK restaurant SEO", () => {
    expect(boundedStoppinPrerender).toContain("génération contextuelle reportée");
    expect(boundedStoppinPrerender).toContain("venues: [], unavailable: true");
    expect(stoppinPrerender).toContain("return []");
  });
});
