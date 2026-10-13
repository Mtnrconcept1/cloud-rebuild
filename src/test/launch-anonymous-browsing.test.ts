import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261013014557_launch_guest_discovery_authenticated_clients_only.sql", "utf8");
describe("launch guest discovery and RLS", () => {
  it("allows anonymous discovery subject to existing RLS without removing launch checks", () => {
    expect(sql).toContain("coalesce(auth.role() = 'anon', false)");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_launch_gate()");
    expect(sql).toContain("IF public.launch_table_allowed(v_resource) THEN RETURN; END IF;");
    expect(sql).toContain("MESSAGE='TOK_LAUNCH_CLOSED'");
    expect(sql).not.toMatch(/DROP POLICY .* ON public\./i);
    expect(sql).not.toMatch(/GRANT\s+(ALL|SELECT|INSERT|DELETE|UPDATE)\b/i);
  });
  it("allows only known guest discovery RPCs, not arbitrary anonymous RPCs", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.launch_rpc_allowed");
    expect(sql).toContain("'search_restaurants_catalog_page','get_total_donated_points'");
    expect(sql).toContain("IF public.launch_rpc_allowed(v_resource) THEN RETURN; END IF;");
  });
  it("restores public storage reads while preserving the write guard", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS launch_access_guard ON storage.objects;");
    expect(sql).toContain("CREATE POLICY launch_access_guard ON storage.objects AS RESTRICTIVE");
    expect(sql).toContain("USING (coalesce((SELECT auth.role()='anon'),false)");
    expect(sql).toContain("WITH CHECK (NOT (SELECT public.launch_gate_enabled())");
    expect(sql).toContain("NOTIFY pgrst,'reload schema'");
  });
});
