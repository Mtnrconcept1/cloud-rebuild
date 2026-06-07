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

describe("plan 2 sensitive SECURITY DEFINER RPC grants", () => {
  it("removes anonymous execution from sensitive helper RPCs without closing public read helpers", () => {
    const { sql } = latestMigrationContaining("plan2_sensitive_rpc_execute_hardening");

    for (const signature of [
      "get_order_customers(uuid)",
      "get_reservation_customers(uuid)",
      "has_role(uuid, public.app_role)",
      "is_feature_flag_active(text)",
    ]) {
      expect(sql).toContain(`IF to_regprocedure('public.${signature}') IS NOT NULL THEN`);
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM PUBLIC, anon;`);
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`,
      );
    }

    expect(sql).toContain("IF to_regprocedure('public.log_audit()') IS NOT NULL THEN");
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.log_audit() TO service_role;");
    expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION public.log_audit() TO authenticated");

    for (const publicRpc of [
      "get_total_donated_meals",
      "get_total_donated_points",
      "get_restaurant_reservation_slot_availability",
    ]) {
      expect(sql).not.toContain(publicRpc);
    }

    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });

  it("documents the complementary plan 2 decision for sensitive and public RPCs", () => {
    const audit = readFileSync(
      resolve(process.cwd(), "docs/supabase/anon-security-definer-audit.md"),
      "utf8",
    );

    expect(audit).toContain("20260607053200_plan2_sensitive_rpc_execute_hardening.sql");

    for (const sensitiveRpc of [
      "get_order_customers(uuid)",
      "get_reservation_customers(uuid)",
      "has_role(uuid, public.app_role)",
      "is_feature_flag_active(text)",
      "log_audit()",
    ]) {
      expect(audit).toContain(sensitiveRpc);
      expect(audit).toContain("a revoquer pour `anon`");
    }

    for (const publicRpc of [
      "get_total_donated_meals()",
      "get_total_donated_points()",
      "get_restaurant_reservation_slot_availability(uuid, date)",
    ]) {
      expect(audit).toContain(publicRpc);
      expect(audit).toContain("publique volontaire");
    }
  });
});
