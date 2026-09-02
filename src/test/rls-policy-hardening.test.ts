import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260603143000_rls_policy_hardening.sql",
);

function readMigration() {
  expect(existsSync(migrationPath), "RLS hardening migration should exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("RLS policy hardening", () => {
  it("routes public analytics through the validated Edge Function", () => {
    const sql = readSource("supabase/migrations/20260722123000_secure_public_analytics_ingestion.sql");

    for (const table of ["search_logs", "impressions", "clicks", "event_store"]) {
      expect(sql).toContain(`REVOKE INSERT ON public.${table} FROM anon, authenticated;`);
      expect(sql).toContain(`DROP POLICY IF EXISTS "Allow anyone to insert ${table}" ON public.${table};`);
    }
    expect(sql).not.toContain("WITH CHECK (true)");
  });

  it("keeps public cuisine taxonomy readable without exposing has_role to anon", () => {
    const sql = readSource("supabase/migrations/20260902114500_fix_public_cuisine_catalog_rls.sql");
    const publicPolicy = sql.match(/CREATE POLICY "cuisines_public_select"[\s\S]*?;/i)?.[0] || "";
    const adminPolicy = sql.match(/CREATE POLICY "cuisines_admin_select_archived"[\s\S]*?;/i)?.[0] || "";

    expect(publicPolicy).toContain("TO PUBLIC");
    expect(publicPolicy).toContain("USING (archived_at IS NULL)");
    expect(publicPolicy).not.toContain("has_role");
    expect(adminPolicy).toContain("TO authenticated");
    expect(adminPolicy).toContain("public.has_role(auth.uid(), 'admin')");
    expect(sql).toContain("GRANT SELECT ON public.cuisines TO anon, authenticated;");
    expect(sql).not.toMatch(/GRANT\s+EXECUTE[\s\S]*?has_role[\s\S]*?TO\s+anon/i);
  });

  it("removes generic authenticated policies from targeted operational tables", () => {
    const sql = readMigration();
    const protectedTables = [
      "restaurant_cuisines",
      "restaurant_branches",
      "reservation_tables",
      "reservation_slots",
      "reservation_table_layout_overrides",
      "proof_of_delivery",
      "order_events",
    ];

    for (const table of protectedTables) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "Require auth for ${table}" ON public.${table};`);
      const broadPolicy = new RegExp(
        `ON\\s+public\\.${table}[\\s\\S]{0,220}auth\\.role\\(\\)\\s*=\\s*'authenticated'`,
        "i",
      );
      expect(sql).not.toMatch(broadPolicy);
    }
  });

  it("keeps restaurant cuisine writes behind ownership checks and a transactional RPC", () => {
    const sql = readMigration();
    const dashboardRestaurant = readSource("src/pages/dashboard/DashboardRestaurant.tsx");

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.restaurant_set_cuisines/i);
    expect(sql).toContain("public.auth_owns_restaurant(p_restaurant_id)");
    expect(sql).toContain("DELETE FROM public.restaurant_cuisines");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(dashboardRestaurant).toContain('rpc("restaurant_set_cuisines"');
    expect(dashboardRestaurant).not.toContain('.from("restaurant_cuisines").delete()');
    expect(dashboardRestaurant).not.toContain('.from("restaurant_cuisines").insert(rows)');
  });

  it("locks floor plan tables to restaurant owners or admins", () => {
    const sql = readMigration();

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.auth_can_manage_reservation_slot/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.auth_can_manage_table_layout_override/i);
    expect(sql).toContain("reservation_tables_owner_admin_select");
    expect(sql).toContain("reservation_slots_owner_admin_write");
    expect(sql).toContain("reservation_table_layout_overrides_owner_admin_write");
    expect(sql).toContain("rv.restaurant_id = rb.restaurant_id");
  });

  it("moves checkout order event writes to a validated RPC and revokes direct frontend mutations", () => {
    const sql = readMigration();
    const analytics = readSource("src/lib/analytics.ts");

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.track_order_event/i);
    expect(sql).toContain("public.auth_can_access_order(p_order_id)");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM authenticated;");
    expect(analytics).toContain('rpc("track_order_event"');
    expect(analytics).not.toContain('.from("order_events").insert');
    expect(analytics).toContain("[analytics] checkout event tracking failed");
  });

  it("keeps proof of delivery readable by related actors without direct authenticated inserts", () => {
    const sql = readMigration();

    expect(sql).toContain("DROP POLICY IF EXISTS \"proof_of_delivery_courier_insert\" ON public.proof_of_delivery;");
    expect(sql).toContain("DROP POLICY IF EXISTS \"proof_of_delivery_courier_update\" ON public.proof_of_delivery;");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.proof_of_delivery FROM authenticated;");
    expect(sql).toContain("proof_of_delivery_courier_select");
    expect(sql).toContain("proof_of_delivery_client_select");
    expect(sql).toContain("proof_of_delivery_restaurant_select");
    expect(sql).toContain("proof_of_delivery_admin_select");
  });
});
