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

  it("defines the dynamic /restaurateurs/:city route in App.tsx", () => {
    expect(appSource).toContain('path="/restaurateurs/:city"');
  });

  it("handles venueSlug in LocalRestaurants.tsx", () => {
    expect(localRestaurantsSource).toContain("parseVenueSlug");
    expect(localRestaurantsSource).toContain("venueSlug");
    expect(localRestaurantsSource).toContain("Où manger près de");
  });

  it("prerenders venue landing pages in prerender-seo.mjs", () => {
    expect(prerenderSource).toContain("/restaurants-pres/victoria-hall-geneve");
    expect(prerenderSource).toContain("/restaurants-pres/palexpo-geneve");
    expect(prerenderSource).toContain("/restaurants-pres/grand-theatre-de-geneve");
    expect(prerenderSource).toContain("/restaurants-pres/stade-de-geneve");
    expect(prerenderSource).toContain("/restaurants-pres/theatre-de-beaulieu-lausanne");
  });
});
