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

  it("keeps every active restaurant eligible for individual HTML prerendering", () => {
    expect(prerender).toContain("SEO_SITEMAP_MAX_RESTAURANTS || 10000");
    expect(prerender).toContain('.from("restaurants")');
    expect(prerender).toContain('.eq("is_active", true)');
    expect(prerender).toContain("const restaurantPages = restaurants.map");
    expect(prerender).toContain("buildRestaurantSeoPath(restaurant)");
  });

  it("wires contextual Stoppin pages into production HTML and sitemap builds", () => {
    expect(packageJson.scripts?.["build:prod"]).toContain("prerender-stoppin-restaurants.mjs");
    expect(packageJson.scripts?.["seo:prerender"]).toContain("prerender-stoppin-restaurants.mjs");
    expect(packageJson.scripts?.["seo:sitemap"]).toContain("prerender-stoppin-restaurants.mjs --public-only");
  });

  it("uses a bounded public Stoppin feed and real geospatial inventory instead of doorway keywords", () => {
    expect(stoppinPrerender).toContain("https://stoppin.ch");
    expect(stoppinPrerender).toContain("/thetok-venues.json");
    expect(stoppinPrerender).toContain("SEO_STOPPIN_MAX_VENUES || 5000");
    expect(stoppinPrerender).toContain("MIN_NEARBY_RESTAURANTS");
    expect(stoppinPrerender).toContain("SEO_STOPPIN_MIN_NEARBY_RESTAURANTS || 3");
    expect(stoppinPrerender).toContain("distanceKm(");
    expect(stoppinPrerender).toContain("restaurant.distance_km <= NEARBY_RADIUS_KM");
    expect(stoppinPrerender).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(stoppinPrerender).not.toContain("service_role");
  });

  it("creates canonical static pages with visible TOK↔Stoppin entity links and structured data", () => {
    expect(stoppinPrerender).toContain("`/restaurants-pres/${venue.tok_slug}`");
    expect(stoppinPrerender).toContain('"@type": "Restaurant"');
    expect(stoppinPrerender).toContain('"@type": "ItemList"');
    expect(stoppinPrerender).toContain('"@type": "Place"');
    expect(stoppinPrerender).toContain("Voir ${escapeHtml(venue.name)} sur Stoppin");
    expect(stoppinPrerender).toContain("sitemap-restaurants-stoppin-");
    expect(stoppinPrerender).toContain("SITEMAP_SHARD_SIZE = 10000");
    expect(stoppinPrerender).toContain('robotsTag = \'<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">\'');
  });

  it("fails soft until the Stoppin feed is deployed instead of breaking TOK builds", () => {
    expect(stoppinPrerender).toContain("flux HTTP ${response.status}");
    expect(stoppinPrerender).toContain("return []");
    expect(stoppinPrerender).toContain("Les pages contextuelles seront générées dès que Stoppin sera déployé");
  });
});
