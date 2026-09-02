import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260902150000_expose_restaurant_coordinates_in_catalog.sql",
);

const migration = readFileSync(migrationPath, "utf8");

describe("home nearby restaurant catalog contract", () => {
  it("keeps latitude and longitude in the public search RPC", () => {
    expect(migration).toContain("latitude double precision");
    expect(migration).toContain("longitude double precision");
    expect(migration).toContain("restaurant.latitude");
    expect(migration).toContain("restaurant.longitude");
  });

  it("preserves the bounded public wrapper and visibility guard", () => {
    expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 60), 1), 100)");
    expect(migration).toContain("public.restaurant_is_publicly_visible(result.id)");
    expect(migration).toContain("TO anon, authenticated, service_role");
  });
});
