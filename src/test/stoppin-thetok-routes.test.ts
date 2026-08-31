import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = resolve(repoRoot, "src");
const appSource = readFileSync(resolve(srcRoot, "App.tsx"), "utf8");
const prerenderSource = readFileSync(resolve(repoRoot, "scripts/prerender-seo.mjs"), "utf8");
const localRestaurantsSource = readFileSync(resolve(srcRoot, "pages/LocalRestaurants.tsx"), "utf8");
const restaurantCardSource = readFileSync(resolve(srcRoot, "components/RestaurantCard.tsx"), "utf8");
const seoMetaSource = readFileSync(resolve(srcRoot, "hooks/useSeoMeta.ts"), "utf8");

describe("Stoppin <-> TheTok link integration", () => {
  it("defines the /restaurants-pres/:venueSlug route in App.tsx", () => {
    expect(appSource).toContain('path="/restaurants-pres/:venueSlug"');
  });

  it("handles venueSlug, exact Stoppin labels and trusted coordinates in LocalRestaurants.tsx", () => {
    expect(localRestaurantsSource).toContain("parseVenueSlug");
    expect(localRestaurantsSource).toContain("resolveStoppinPlaceLabel");
    expect(localRestaurantsSource).toContain("venueBaseSlug");
    expect(localRestaurantsSource).toContain("routeSlug");
    expect(localRestaurantsSource).toContain("venueSlug");
    expect(localRestaurantsSource).toContain('searchParams.get("place")');
    expect(localRestaurantsSource).toContain('searchParams.get("lat")');
    expect(localRestaurantsSource).toContain('searchParams.get("lng")');
    expect(localRestaurantsSource).toContain('"search_restaurants_nearby"');
    expect(localRestaurantsSource).toContain("Où manger près de");
  });

  it("uses the exact validated place label consistently in visible and structured SEO copy", () => {
    expect(localRestaurantsSource).toContain(
      "exactStoppinPlaceLabel || embeddedStoppinVenueContext?.place || venueInfo?.venueName",
    );
    expect(localRestaurantsSource).toContain("candidateSlug === venueInfo.venueBaseSlug");
    expect(localRestaurantsSource).toContain("candidateSlug === venueInfo.routeSlug");
    expect(localRestaurantsSource).toContain(
      "buildRestaurantJsonLd(restaurants, city, category, district, intent, path, venueName)",
    );
    expect(localRestaurantsSource).toContain(
      "[category, city, district, intent, path, restaurants, venueName]",
    );
  });

  it("keeps nearby-route metadata indexable while inventory is loading", () => {
    expect(seoMetaSource).toContain("NEARBY_RESTAURANTS_ROUTE_PATTERN");
    expect(seoMetaSource).toContain("getDynamicPublicRouteFallback");
    expect(seoMetaSource).toContain("privateRoute || !knownPublicRoute ? NOINDEX_ROBOTS : INDEX_ROBOTS");
    expect(localRestaurantsSource).toContain(
      'robots={!isLoading && (isError || hasThinInventory) ? "noindex,follow,noarchive" : undefined}',
    );
    expect(localRestaurantsSource).not.toContain("{!isLoading ? (");
  });

  it("hydrates the canonical URL from a validated embedded venue context", () => {
    expect(localRestaurantsSource).toContain("readEmbeddedStoppinVenueContext");
    expect(localRestaurantsSource).toContain('getElementById("tok-stoppin-venue-context")');
    expect(localRestaurantsSource).toContain("embeddedStoppinVenueContext?.latitude");
    expect(localRestaurantsSource).toContain("embeddedStoppinVenueContext?.longitude");
  });

  it("surfaces the RPC distance on nearby restaurant cards", () => {
    expect(localRestaurantsSource).toContain("distanceKm: Number.isFinite(distanceKm) ? distanceKm : null");
    expect(restaurantCardSource).toContain("distanceKm?: number | null");
    expect(restaurantCardSource).toContain("formatDistance(distanceKm)");
  });

  it("does not misuse the venue name as a restaurant full-text query", () => {
    expect(localRestaurantsSource).not.toContain("p_query: venueName");
    expect(localRestaurantsSource).not.toContain("p_search_text: venueName");
    expect(localRestaurantsSource).toContain("p_search_text: null");
    expect(localRestaurantsSource).toContain("p_query: district || null");
  });

  it("keeps the canonical nearby path independent from Stoppin query parameters", () => {
    expect(localRestaurantsSource).toContain("`/restaurants-pres/${params.venueSlug}`");
    expect(localRestaurantsSource).not.toContain("buildCanonicalUrl(`${path}?");
  });

  it("does not hardcode cross-project venue inventory in prerender-seo.mjs", () => {
    expect(prerenderSource).not.toContain("/restaurants-pres/victoria-hall-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/palexpo-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/grand-theatre-de-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/stade-de-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/theatre-de-beaulieu-lausanne");
  });
});
