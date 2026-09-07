import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isIndexableRestaurant,
  rewriteCustomerSeoCopy,
  rewriteZeroRatingCopy,
  sanitizeRestaurantJsonLdValue,
} from "../../scripts/harden-seo-indexable-inventory.mjs";
import { removeBlockingGoogleFontImport } from "../../scripts/harden-performance-delivery.mjs";
import { buildRestaurantSeoModel } from "../lib/seo/restaurantEntity.mjs";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("SEO and public restaurant performance remediation", () => {
  it("filters public image-backed candidates before expensive catalog scoring", () => {
    const migration = read("supabase/migrations/20260907100000_optimize_public_restaurant_catalog.sql");

    expect(migration).toContain("search_restaurants_catalog_page");
    expect(migration).toContain("public.normalize_search_text(city)");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS");
    expect(migration).not.toContain("2147483647");
    expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 54), 1), 54)");
    expect(migration).toContain("candidate_restaurants AS MATERIALIZED");
    expect(migration).toContain("NULLIF(btrim(r.image_url), '') IS NOT NULL");
    expect(migration).toContain("JOIN candidate_restaurants AS candidate");
    expect(migration).not.toContain("search_restaurants_catalog_unguarded(");
    expect(migration).toContain("SET search_path TO 'public'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog_page");
  });

  it("routes the historical row catalog through the exact paginated catalog RPC", () => {
    const migration = read("supabase/migrations/20260907100000_optimize_public_restaurant_catalog.sql");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.search_restaurants_catalog(");
    expect(migration).toContain("FROM public.search_restaurants_catalog_page(");
    expect(migration).toContain("WITH ORDINALITY AS entry(item, position)");
  });

  it("runs the quality inventory gate after the legacy final SEO passes", () => {
    const hardener = read("scripts/harden-seo-indexable-inventory.mjs");
    const finalQuality = read("scripts/harden-seo-final-quality.mjs");

    expect(hardener).toContain("noindex,follow,noarchive");
    expect(hardener).toContain("directory_image_verified");
    expect(hardener).toContain("opening_hours");
    expect(hardener).toContain("supports_reservation");
    expect(hardener).toContain("delivery_available");
    expect(hardener).toContain("sitemap-restaurants.xml");
    expect(hardener).toContain('id="tok-indexable-restaurant-links"');
    expect(hardener).toContain('id="tok-page-json-ld"');
    expect(finalQuality).toContain("await hardenSeoIndexableInventory()");
    expect(finalQuality).toContain("await hardenPerformanceDelivery()");
    expect(finalQuality.indexOf("await hardenSeoIndexableInventory()"))
      .toBeGreaterThan(finalQuality.indexOf("await optimizeSeoCrawl()"));
  });

  it("runs performance delivery even when SEO data enrichment cannot reach Supabase", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    const buildProd = packageJson.scripts?.["build:prod"] || "";
    const seoPrerender = packageJson.scripts?.["seo:prerender"] || "";

    expect(buildProd).toMatch(/harden-seo-final-quality\.mjs.*harden-performance-delivery\.mjs/);
    expect(seoPrerender).toMatch(/harden-seo-final-quality\.mjs.*harden-performance-delivery\.mjs/);
  });

  it("keeps crawler copy written for customers rather than search engines", () => {
    const input = [
      "TOK publie uniquement les pages locales qui disposent d'un inventaire suffisamment riche. 43 communes sont actuellement éligibles à l'indexation.",
      "1 577 fiches restaurant indexables sont reliées aux pages de ville, de cuisine et de recherche afin d'aider Google comme les utilisateurs à découvrir les bonnes adresses.",
    ].join(" ");
    const output = rewriteCustomerSeoCopy(input);

    expect(output).toContain("adresses locales vérifiées");
    expect(output).toContain("réservez ou commandez");
    expect(output).not.toContain("éligibles à l'indexation");
    expect(output).not.toContain("afin d'aider Google");
  });

  it("discovers two global Google font families from the document head and strips the blocking CSS import", () => {
    const html = read("index.html");
    const cuisineStrip = read("src/components/home/CuisineCategoryStrip.tsx");
    const css = "@import url('https://fonts.googleapis.com/css2?family=Bubblegum+Sans&family=DM+Sans&display=swap');\nbody{font-family:sans-serif}";

    expect(html).toContain('rel="preconnect" href="https://fonts.googleapis.com"');
    expect(html).toContain('rel="preconnect" href="https://fonts.gstatic.com" crossorigin');
    expect(html).toContain("fonts.googleapis.com/css2?family=DM+Sans");
    expect(html).toContain("family=Playfair+Display");
    expect(html).not.toContain("Bubblegum+Sans");
    expect(cuisineStrip).toContain("'Playball', cursive");
    expect(cuisineStrip).not.toContain("'Bubblegum Sans', cursive");
    expect(removeBlockingGoogleFontImport(css)).toBe("body{font-family:sans-serif}");
  });

  it("gives content-hashed Vite assets an immutable browser cache", () => {
    const vercel = read("vercel.json");

    expect(vercel).toContain('"source": "/assets/:path*"');
    expect(vercel).toContain("public, max-age=31536000, immutable");
  });

  it("does not present empty ratings or unverified directory phone data as facts", () => {
    expect(rewriteZeroRatingCopy("<b>0.0/10</b><span>0 avis</span>"))
      .toContain("Pas encore d’avis");

    const sanitized = sanitizeRestaurantJsonLdValue({
      "@type": "Restaurant",
      telephone: "+41 21 000 00 00",
      acceptsReservations: false,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: 0,
        reviewCount: 0,
      },
    }, {
      is_directory_listing: true,
      supports_reservation: false,
    }) as Record<string, unknown>;

    expect(sanitized.telephone).toBeUndefined();
    expect(sanitized.acceptsReservations).toBeUndefined();
    expect(sanitized.aggregateRating).toBeUndefined();
  });

  it("keeps the hydrated restaurant UI and runtime JSON-LD neutral without verified review or directory phone facts", () => {
    const detail = read("src/pages/RestaurantDetail.tsx");
    expect(detail).toContain("const hasPublicRating = reviewCount > 0 && avgRating10 > 0;");
    expect(detail).toContain("Pas encore d’avis");

    const model = buildRestaurantSeoModel({
      restaurant: {
        id: "directory-restaurant",
        name: "Annuaire Test",
        city: "Genève",
        address: "Rue du Test 1",
        phone: "+41 22 000 00 00",
        is_directory_listing: true,
        supports_reservation: false,
        rating: 0,
        review_count: 0,
      },
      averageRating: 0,
      reviewCount: 0,
    });
    const graph = model?.jsonLd?.["@graph"] as Array<Record<string, unknown>> | undefined;
    const restaurant = graph?.find((node) => node["@type"] === "Restaurant");

    expect(restaurant?.telephone).toBeUndefined();
    expect(restaurant?.acceptsReservations).toBeUndefined();
    expect(restaurant?.aggregateRating).toBeUndefined();
  });

  it("requires real evidence before a directory restaurant remains indexable", () => {
    const base = {
      id: "restaurant-1",
      name: "Restaurant Test",
      slug: "restaurant-test",
      city: "Genève",
      address: "Rue du Test 1",
      is_active: true,
      is_demo: false,
      status: "active",
      is_directory_listing: true,
      directory_public_name_verified: true,
      directory_image_verified: false,
      image_url: null,
      opening_hours: {},
      supports_reservation: false,
      delivery_available: false,
    };

    expect(isIndexableRestaurant(base)).toBe(false);
    expect(isIndexableRestaurant({ ...base, image_url: "https://example.test/image.jpg", directory_image_verified: true })).toBe(true);
    expect(isIndexableRestaurant({ ...base, supports_reservation: true })).toBe(true);
  });
});
