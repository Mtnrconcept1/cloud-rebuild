import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function allMigrationSource() {
  return readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => read(`supabase/migrations/${name}`))
    .join("\n");
}

describe("restaurant slug SEO", () => {
  it("stores stable restaurant slugs with a city-scoped uniqueness guard", () => {
    const migrations = allMigrationSource();

    expect(migrations).toContain("ADD COLUMN IF NOT EXISTS slug");
    expect(migrations).toContain("idx_restaurants_city_slug_unique");
    expect(migrations).toContain("set_restaurant_slug");
    expect(migrations).toContain("tok_slugify");
  });

  it("uses slug URLs in sitemap generation while keeping id URLs available", () => {
    const prerender = read("scripts/prerender-seo.mjs");
    const app = read("src/App.tsx");
    const localRestaurants = read("src/pages/LocalRestaurants.tsx");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(prerender).toContain("slug");
    expect(prerender).toContain("buildRestaurantSeoPath");
    expect(prerender).toContain("/restaurants/${citySlug}/${restaurantSlug}");
    expect(app).toContain('/restaurant/:id');
    expect(localRestaurants).toContain('queryKey: ["restaurant-slug", city, routeSegment, demoSessionKey]');
    expect(localRestaurants).toContain("resolvedRestaurantId");
    expect(restaurantDetail).toContain("resolvedRestaurantId");
    expect(restaurantDetail).toContain("canonicalPath");
  });
});
