import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = resolve(
  root,
  "supabase/migrations/20260909153000_optimize_expanded_public_catalog_rpc.sql",
);

describe("expanded public restaurant catalogue timeout remediation", () => {
  it("replaces per-restaurant enrichment with indexed search and grouped aggregates", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.search_restaurants_catalog_page");
    expect(migration).toContain("search_vector @@");
    expect(migration).toContain("GROUP BY reservation.restaurant_id");
    expect(migration).toContain("GROUP BY customer_order.restaurant_id");
    expect(migration).toContain("GROUP BY offer.restaurant_id");
    expect(migration).toContain("GROUP BY formula.restaurant_id");
    expect(migration).not.toContain("LEFT JOIN LATERAL");
    expect(migration).not.toMatch(/SET\s+statement_timeout/i);
  });

  it("keeps verified restaurants visible without restoring the image gate", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    const candidateSection = migration.match(
      /base_restaurants AS MATERIALIZED \(([\s\S]*?)\),\s*restaurant_categories AS/,
    )?.[1] || "";

    expect(candidateSection).toContain("r.is_active IS TRUE");
    expect(candidateSection).toContain("r.is_demo IS FALSE");
    expect(candidateSection).toContain("r.directory_public_name_verified IS TRUE");
    expect(candidateSection).not.toContain("NULLIF(btrim(r.image_url), '') IS NOT NULL");
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });
});
