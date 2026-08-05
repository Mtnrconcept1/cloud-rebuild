import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

function latestMigrationContaining(marker: string) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(resolve(migrationsDir, name), "utf8"),
    }))
    .filter((migration) => migration.sql.includes(marker));

  expect(matches.length, `migration containing ${marker}`).toBeGreaterThan(0);
  return matches[matches.length - 1]!;
}

function extractFunction(sql: string, functionName: string) {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(
    new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\nEND;\\n\\$\\$;`,
      "i",
    ),
  );

  expect(match, `${functionName} should be redefined in the hardening migration`).toBeTruthy();
  return match![0];
}

describe("super admin sensitive RLS hardening", () => {
  it("defines an explicit super-admin helper pinned to rbarman@hotmail.ch", () => {
    const { sql } = latestMigrationContaining("super_admin_sensitive_rls_hardening");

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.auth_is_super_admin\(\)/i);
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public/i);
    expect(sql).toContain("auth.users au");
    expect(sql).toContain("lower(au.email) = 'rbarman@hotmail.ch'");
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.auth_is_super_admin\(\)\s+FROM\s+PUBLIC,\s*anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.auth_is_super_admin\(\)\s+TO\s+authenticated,\s*service_role/i);
    expect(sql).toContain("ON CONFLICT (user_id, role) DO NOTHING");
  });

  it("keeps direct user role changes restricted to the super admin", () => {
    const { sql } = latestMigrationContaining("super_admin_sensitive_rls_hardening");
    const rolesFn = extractFunction(sql, "admin_set_user_roles");

    expect(sql).toContain('DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;');
    expect(sql).toContain('CREATE POLICY "user_roles_self_select"');
    expect(sql).toContain('CREATE POLICY "user_roles_super_admin_all"');
    expect(sql).toContain("USING (public.auth_is_super_admin())");
    expect(sql).toContain("WITH CHECK (public.auth_is_super_admin())");

    expect(rolesFn).toContain("Super admin access required.");
    expect(rolesFn).toContain("NOT public.auth_is_super_admin()");
    expect(rolesFn).not.toContain("NOT public.has_role(v_actor_id, 'admin')");
    expect(rolesFn).toContain("ON CONFLICT (user_id, role) DO NOTHING");
  });

  it("keeps feature flags readable while restricting rollout writes", () => {
    const { sql } = latestMigrationContaining("feature_flags_public_select");
    const { sql: hardeningSql } = latestMigrationContaining("feature_flags_super_admin_write");

    expect(sql).toContain('CREATE POLICY "feature_flags_public_select"');
    expect(sql).toMatch(/FOR SELECT\s+TO anon,\s*authenticated/i);
    expect(sql).toContain("USING (true)");
    expect(hardeningSql).toContain('CREATE POLICY "feature_flags_super_admin_write"');
    expect(hardeningSql).toContain("USING (public.auth_is_super_admin())");
    expect(hardeningSql).toContain("WITH CHECK (public.auth_is_super_admin())");
  });

  it("locks admin audit, finance, token and security tables behind super-admin policies", () => {
    const { sql } = latestMigrationContaining("super_admin_sensitive_rls_hardening");

    for (const table of [
      "admin_user_account_states",
      "admin_supabase_advisor_snapshots",
      "feature_flag_audit_logs",
      "edge_function_audit_logs",
      "ai_admin_events",
      "ai_security_events",
      "platform_revenue_entries",
      "platform_cost_entries",
      "marketing_budget_periods",
      "ai_usage_costs",
      "stripe_webhook_events",
      "rate_limit_buckets",
      "tok_connect_access_tokens",
      "tok_connect_idempotency_keys",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }

    expect(sql).toContain("super_admin_tables text[]");
    expect(sql).toContain("DROP POLICY IF EXISTS %I ON public.%I");
    expect(sql).toContain("t || '_super_admin_all'");
    expect(sql).toContain("public.auth_is_super_admin()");
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.%I\s+FROM\s+anon/i);
  });

  it("removes direct authenticated writes to audit and email queues", () => {
    const { sql } = latestMigrationContaining("super_admin_sensitive_rls_hardening");

    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can insert emails" ON public.email_queue;');
    expect(sql).toContain('CREATE POLICY "audit_log_super_admin_select"');
    expect(sql).toContain('CREATE POLICY "email_queue_super_admin_select"');
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon, authenticated;");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.email_queue FROM anon, authenticated;");
  });

  it("keeps commercial compensation self-readable but super-admin writable", () => {
    const { sql } = latestMigrationContaining("super_admin_sensitive_rls_hardening");
    const prospectFn = extractFunction(sql, "get_commercial_prospect_commission_summary");
    const compensationFn = extractFunction(sql, "get_commercial_compensation_summary");

    expect(sql).toContain('DROP POLICY IF EXISTS "commercial_compensation_profiles_admin_write"');
    expect(sql).toContain('CREATE POLICY "commercial_compensation_profiles_self_or_super_select"');
    expect(sql).toContain('CREATE POLICY "commercial_compensation_profiles_super_admin_write"');
    expect(sql).toContain('CREATE POLICY "commercial_compensation_adjustments_self_or_super_select"');
    expect(sql).toContain('CREATE POLICY "commercial_compensation_adjustments_super_admin_write"');
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_commercial_compensation_adjustments_created_by");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_last_contacted_by");

    expect(prospectFn).toContain("v_is_super_admin boolean := public.auth_is_super_admin()");
    expect(prospectFn).toContain("v_followup.signed_by IS DISTINCT FROM v_actor_id");
    expect(prospectFn).not.toContain("ur.role::text IN ('admin', 'commercial')");

    expect(compensationFn).toContain("v_is_super_admin boolean := public.auth_is_super_admin()");
    expect(compensationFn).not.toContain("public.has_role(auth.uid(), 'admin'");
  });

  it("removes Data API execution from internal trigger routines", () => {
    const { sql } = latestMigrationContaining("super_admin_sensitive_rls_hardening");

    for (const signature of [
      "public.handle_new_user()",
      "public.log_feature_flag_audit()",
      "public.trigger_reservation_notifications()",
      "public.trigger_restaurant_review_notification()",
    ]) {
      expect(sql).toContain(`'${signature}'`);
    }

    expect(sql).toContain("internal_security_definer_functions text[]");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
