import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = resolve(repoRoot, "src");
const appSource = readFileSync(resolve(srcRoot, "App.tsx"), "utf8");
const prerenderSource = readFileSync(resolve(repoRoot, "scripts/prerender-seo.mjs"), "utf8");
const localRestaurantsSource = readFileSync(resolve(srcRoot, "pages/LocalRestaurants.tsx"), "utf8");

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
    expect(localRestaurantsSource).toContain("exactStoppinPlaceLabel || venueInfo?.venueName");
    expect(localRestaurantsSource).toContain("candidateSlug === venueInfo.venueBaseSlug");
    expect(localRestaurantsSource).toContain("candidateSlug === venueInfo.routeSlug");
    expect(localRestaurantsSource).toContain(
      "buildRestaurantJsonLd(restaurants, city, category, district, intent, path, venueName)",
    );
    expect(localRestaurantsSource).toContain(
      "[category, city, district, intent, path, restaurants, venueName]",
    );
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
