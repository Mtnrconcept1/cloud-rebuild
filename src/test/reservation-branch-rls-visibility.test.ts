import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260726030142_restore_production_reservation_visibility.sql";
const migration = readFileSync(migrationPath, "utf8");

describe("reservation branch RLS visibility", () => {
  it("lets unscoped production rows continue to their ownership policies", () => {
    expect(migration).toContain("WHEN p_branch_id IS NULL THEN true");
    expect(migration).toContain(
      "public.can_view_commercial_demo_branch(NULL::uuid) IS DISTINCT FROM true",
    );
  });

  it("preserves non-null commercial-demo branch isolation", () => {
    expect(migration).toContain(
      "public.can_view_commercial_demo_restaurant(branch.restaurant_id)",
    );
    expect(migration).toMatch(
      /WHERE public\.can_view_commercial_demo_branch\(branch\.id\)\s+IS DISTINCT FROM public\.can_view_commercial_demo_restaurant\(branch\.restaurant_id\)/,
    );
    expect(migration).toContain(
      "qual = 'can_view_commercial_demo_branch(branch_id)'",
    );
  });

  it("keeps the RLS helper hardened and validates its runtime contract", () => {
    expect(migration).toContain("STABLE");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("helper_owner IS DISTINCT FROM 'postgres'::name");
    expect(migration).toContain(
      "'public.can_view_commercial_demo_branch(uuid)'",
    );
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });
});
