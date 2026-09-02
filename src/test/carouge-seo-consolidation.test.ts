import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildRestaurantSeoPath,
  canonicalizeRestaurantCitySegment,
} from "../lib/restaurantSlugs";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260902212500_consolidate_carouge_city.sql";
const rollbackPath = "docs/seo/rollbacks/20260902212500_consolidate_carouge_city.sql";

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("Carouge SEO consolidation", () => {
  it("canonicalizes the legacy Carouge GE city segment in restaurant URLs", () => {
    expect(canonicalizeRestaurantCitySegment("Carouge GE")).toBe("carouge");
    expect(canonicalizeRestaurantCitySegment("Carouge")).toBe("carouge");
    expect(
      buildRestaurantSeoPath({
        city: "Carouge GE",
        slug: "creperie-du-vieux-carouge",
      }),
    ).toBe("/restaurants/carouge/r/creperie-du-vieux-carouge");
  });

  it("keeps permanent 301 redirects for the whole legacy Carouge GE URL tree", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      redirects?: Array<Record<string, unknown>>;
    };
    const redirects = vercel.redirects || [];

    expect(redirects).toContainEqual({
      source: "/restaurants/carouge-ge",
      destination: "/restaurants/carouge",
      statusCode: 301,
    });
    expect(redirects).toContainEqual({
      source: "/restaurants/carouge-ge/:path*",
      destination: "/restaurants/carouge/:path*",
      statusCode: 301,
    });
  });

  it("fails closed on production drift and resolves all audited slug collisions before the city merge", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("v_carouge_ge_rows NOT IN (0, 214)");
    expect(migration).toContain("normalize_restaurant_city_alias");
    expect(migration).toContain("cross-city slug collisions remain");
    expect(migration).toContain("directory_source_reference IN ('2600000037', '2600000057', '14025', '14528')");
    expect(migration).toContain("SET city = 'Carouge'");
    expect(migration).toContain("WHERE city = 'Carouge GE'");
  });

  it("ships an executable guarded rollback for the audited 214-row migration", () => {
    const rollback = read(rollbackPath);

    expect(rollback).toContain("v_migrated_rows <> 214");
    expect(rollback).toContain("DROP TRIGGER IF EXISTS normalize_restaurant_city_alias");
    expect(rollback).toContain("SET city = 'Carouge GE'");
    expect(rollback).toContain("v_carouge_rows <> 32 OR v_carouge_ge_rows <> 214");
    expect(rollback).toContain("COMMIT;");
  });
});
