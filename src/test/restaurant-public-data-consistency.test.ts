import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public restaurant data consistency", () => {
  const migration = read("supabase/migrations/20260901083000_restaurant_public_data_consistency.sql");

  it("never accepts navigation or promotional page copy as a directory restaurant name", () => {
    expect(migration).toContain("directory_public_name_looks_navigation_or_promo");
    expect(migration).toContain("réservations?");
    expect(migration).toContain("rabais");
    expect(migration).toContain("à l.emporter");
    expect(migration).toContain("IN ('h1', 'title')");
    expect(migration).toContain("pending_commercial_name_recheck");
    expect(migration).toContain("protect_directory_public_name_quality");
    expect(migration).toContain("A public directory name must be a verified commercial establishment name.");
  });

  it("deduplicates legal entities only with address, city and official website evidence", () => {
    expect(migration).toContain("duplicate_legal_rows");
    expect(migration).toContain("commercial.address_key = legal.address_key");
    expect(migration).toContain("commercial.city_key = legal.city_key");
    expect(migration).toContain("commercial.website_host = legal.website_host");
    expect(migration).toContain("duplicate_legal_entity_hidden");
  });

  it("hides explicit postal-city contradictions from every broad public read path", () => {
    expect(migration).toContain("restaurant_address_city_is_consistent");
    expect(migration).toContain("[1-9][0-9]{3}");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible");
    expect(migration).toContain("DROP POLICY IF EXISTS restaurants_public_select");
    expect(migration).toContain("DROP POLICY IF EXISTS production_hide_demo_restaurants");
    expect(migration).toContain("DROP POLICY IF EXISTS scope_production_restaurants_for_commercial_demo_accounts");
  });

  it("has postflight checks for unsafe names, duplicate legal rows and bad locations", () => {
    expect(migration).toContain("v_unsafe_verified");
    expect(migration).toContain("v_duplicate_visible");
    expect(migration).toContain("v_inconsistent_public");
  });
});
