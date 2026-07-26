import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260726041631_restore_admin_dashboard_visibility.sql";
const migration = readFileSync(migrationPath, "utf8");

describe("admin production dashboard RLS visibility", () => {
  it("lets nullable production scopes continue to their ownership policies", () => {
    expect(migration).toContain("WHEN p_restaurant_id IS NULL THEN true");
    expect(migration).toContain(
      "public.can_view_commercial_demo_restaurant(NULL::uuid) IS DISTINCT FROM true",
    );
  });

  it("keeps non-null and demo restaurant scopes fail-closed", () => {
    expect(migration).toContain(
      "public.can_view_commercial_demo_restaurant(gen_random_uuid()) IS DISTINCT FROM false",
    );
    expect(migration).toContain("restaurant.is_demo IS FALSE");
    expect(migration).toContain("restaurant.is_demo IS TRUE");
    expect(migration).toContain("hide_commercial_demo_rows");
  });

  it("grants admin reads for production orders and reservations", () => {
    expect(migration).toContain("CREATE POLICY orders_admin_select_production");
    expect(migration).toContain(
      "CREATE POLICY reservations_admin_select_production",
    );
    expect(migration).toContain(
      "public.has_role((SELECT auth.uid()), 'admin'::public.app_role)",
    );
    expect(migration).toContain("admin_policy_count <> 2");
  });

  it("preserves helper ownership, grants and transactional assertions", () => {
    expect(migration).toContain("STABLE");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain("helper_owner IS DISTINCT FROM 'postgres'::name");
    expect(migration).toContain(
      "'public.can_view_commercial_demo_restaurant(uuid)'",
    );
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });
});
