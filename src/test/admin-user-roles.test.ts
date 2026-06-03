import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("admin user role governance", () => {
  it("deduplicates roles before sorting in admin_set_user_roles", () => {
    const migration = readFileSync("supabase/migrations/20260603113000_fix_admin_set_user_roles_sorting.sql", "utf8");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_set_user_roles");
    expect(migration).toContain("SELECT COALESCE(array_agg(deduped.role_name ORDER BY deduped.role_name::text)");
    expect(migration).toContain("SELECT DISTINCT role_name");
    expect(migration).not.toContain("SELECT DISTINCT role_name\n    FROM unnest(COALESCE(p_roles, ARRAY['client'::public.app_role])) AS role_name\n    WHERE role_name IS NOT NULL\n    ORDER BY role_name::text");
  });

  it("keeps admin role updates audited and protected", () => {
    const migration = readFileSync("supabase/migrations/20260603113000_fix_admin_set_user_roles_sorting.sql", "utf8");

    expect(migration).toContain("public.has_role(v_actor_id, 'admin')");
    expect(migration).toContain("Cannot remove the last admin role.");
    expect(migration).toContain("INSERT INTO public.audit_log");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role");
  });
});
