import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = resolve(
  root,
  "supabase/migrations/20260909143000_show_verified_restaurants_without_images.sql",
);
const restaurantCardPath = resolve(root, "src/components/RestaurantCard.tsx");

describe("public restaurant catalogue image-optional visibility", () => {
  it("ships a new migration that keeps verified restaurants visible while images are enriched", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.search_restaurants_catalog_page");
    expect(migration).toContain("r.is_active IS TRUE");
    expect(migration).toContain("r.is_demo IS FALSE");
    expect(migration).toContain("lower(COALESCE(r.status, '')) = 'active'");
    expect(migration).toContain("public.restaurant_address_city_is_consistent(r.address, r.city)");
    expect(migration).toContain("r.is_directory_listing IS FALSE OR r.directory_public_name_verified IS TRUE");
    expect(migration).toContain("idx_restaurants_public_catalog_visible_city_trgm");

    const candidateSection = migration.match(
      /WITH candidate_restaurants AS MATERIALIZED \(([\s\S]*?)\),\s*restaurant_categories AS/,
    )?.[1] || "";

    expect(candidateSection).not.toContain("NULLIF(btrim(r.image_url), '') IS NOT NULL");
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });

  it("keeps the restaurant card placeholder fallback for rows without an image", () => {
    const restaurantCard = readFileSync(restaurantCardPath, "utf8");

    expect(restaurantCard).toContain('/images/tok-restaurant-placeholder.svg');
    expect(restaurantCard).toContain("return CUISINE_FALLBACKS.default");
  });
});
