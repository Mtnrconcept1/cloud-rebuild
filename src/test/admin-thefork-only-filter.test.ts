import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const adminNavigation = resolve(root, "src/components/admin/AdminMobileNavigation.tsx");
const control = resolve(root, "src/components/admin/AdminTheForkVisibilityControl.tsx");
const migration = resolve(root, "supabase/migrations/20260915200000_admin_thefork_only_catalog_filter.sql");

describe("restaurant source visibility mode", () => {
  it("places the source control on the restaurant admin route", () => {
    const navigation = readFileSync(adminNavigation, "utf8");
    expect(navigation).toContain("AdminTheForkVisibilityControl");
    expect(navigation).toContain('pathname === "/admin/restaurants"');
    const source = readFileSync(control, "utf8");
    expect(source).toContain("The fork");
    expect(source).toContain("public-restaurants-all-sources");
    expect(source).toContain("setFlagState");
  });

  it("filters public reads without changing transactional visibility", () => {
    expect(existsSync(migration)).toBe(true);
    if (!existsSync(migration)) return;
    const sql = readFileSync(migration, "utf8");
    expect(sql).toContain("restaurant_thefork_catalog");
    expect(sql).toContain("restaurant_is_thefork_catalog_member");
    expect(sql).toContain("CREATE POLICY restaurants_public_select");
    expect(sql).toContain("CREATE POLICY production_hide_demo_restaurants");
    expect(sql).toContain("search_restaurants_catalog_page");
    expect(sql).toContain("Expected 440 verified TheFork sources");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible");
  });
});
