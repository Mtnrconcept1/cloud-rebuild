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

  it("handles venueSlug and trusted coordinates in LocalRestaurants.tsx", () => {
    expect(localRestaurantsSource).toContain("parseVenueSlug");
    expect(localRestaurantsSource).toContain("venueSlug");
    expect(localRestaurantsSource).toContain('searchParams.get("lat")');
    expect(localRestaurantsSource).toContain('searchParams.get("lng")');
    expect(localRestaurantsSource).toContain('"search_restaurants_nearby"');
    expect(localRestaurantsSource).toContain("Où manger près de");
  });

  it("does not misuse the venue name as a restaurant full-text query", () => {
    expect(localRestaurantsSource).not.toContain("p_query: venueName");
    expect(localRestaurantsSource).toContain("p_query: district || null");
  });

  it("does not hardcode cross-project venue inventory in prerender-seo.mjs", () => {
    expect(prerenderSource).not.toContain("/restaurants-pres/victoria-hall-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/palexpo-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/grand-theatre-de-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/stade-de-geneve");
    expect(prerenderSource).not.toContain("/restaurants-pres/theatre-de-beaulieu-lausanne");
  });
});
