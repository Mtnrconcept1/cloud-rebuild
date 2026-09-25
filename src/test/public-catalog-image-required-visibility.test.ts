import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260925104552_require_public_restaurant_images.sql";
const sql = readFileSync(migrationPath, "utf8");

describe("public restaurant image visibility", () => {
  it("requires a non-empty image on every broad public restaurant read path", () => {
    expect(sql).toContain("CREATE POLICY restaurants_public_select");
    expect(sql).toContain("CREATE POLICY production_hide_demo_restaurants");
    expect(sql).toContain(
      "CREATE POLICY scope_production_restaurants_for_commercial_demo_accounts",
    );

    expect(
      sql.match(/NULLIF\(btrim\(image_url\), ''\) IS NOT NULL/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("requires truth verification for directory listing images", () => {
    expect(
      sql.match(
        /is_directory_listing IS FALSE OR directory_image_verified IS TRUE/g,
      )?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it("applies the same photo gates inside the security-definer public catalog RPC", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.search_restaurants_catalog_page",
    );
    expect(sql).toContain("NULLIF(btrim(r.image_url), '') IS NOT NULL");
    expect(sql).toContain(
      "(r.is_directory_listing IS FALSE OR r.directory_image_verified IS TRUE)",
    );
  });

  it("does not change the transactional restaurant visibility helper", () => {
    expect(sql).not.toContain(
      "CREATE OR REPLACE FUNCTION public.restaurant_is_publicly_visible",
    );
  });

  it("contains no destructive restaurant data operation", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.restaurants/i);
    expect(sql).not.toMatch(/TRUNCATE\s+public\.restaurants/i);
  });
});
