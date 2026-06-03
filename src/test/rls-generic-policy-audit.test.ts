import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260603151000_rls_generic_policy_audit.sql",
);

function readMigration() {
  expect(existsSync(migrationPath), "generic RLS audit migration should exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("generic authenticated RLS audit", () => {
  it("drops the legacy Require auth policies across the historical audit surface", () => {
    const sql = readMigration();
    const legacyTables = [
      "user_wallets",
      "user_profiles",
      "user_addresses",
      "user_payment_methods",
      "restaurant_hours",
      "restaurant_documents",
      "categories",
      "dishes",
      "inventory_items",
      "carts",
      "cart_items",
      "order_items",
      "order_refunds",
      "delivery_batches",
      "delivery_routes",
      "payouts",
      "loyalty_accounts",
      "incident_reports",
      "reservation_status_history",
      "event_store",
      "feature_store",
      "fraud_signals",
    ];

    for (const table of legacyTables) {
      expect(sql).toContain(`'${table}'`);
    }

    expect(sql).toContain("legacy_require_auth_tables text[]");
    expect(sql).toContain("DROP POLICY IF EXISTS %I ON public.%I");
    expect(sql).toContain("'Require auth for ' || t");
    expect(sql).not.toMatch(/auth\.role\(\)\s*=\s*'authenticated'/i);
  });

  it("splits owner-managed user tables by operation instead of FOR ALL", () => {
    const sql = readMigration();

    expect(sql).toContain("user_crud_tables text[]");
    expect(sql).toContain("'user_profiles'");
    expect(sql).toContain("t || '_owner_select'");
    expect(sql).toContain("t || '_owner_insert'");
    expect(sql).toContain("t || '_owner_update'");
    expect(sql).toContain("t || '_owner_delete'");
    expect(sql).toContain("CREATE POLICY %I ON public.%I FOR SELECT TO authenticated");
    expect(sql).toContain("CREATE POLICY %I ON public.%I FOR INSERT TO authenticated");
    expect(sql).toContain("CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated");
    expect(sql).toContain("CREATE POLICY %I ON public.%I FOR DELETE TO authenticated");
    expect(sql).not.toMatch(/CREATE\s+POLICY\s+.*FOR\s+ALL\s+USING\s*\(\s*auth\.role\(\)/i);
  });

  it("keeps sensitive financial, delivery, analytics, and ML tables away from direct client writes", () => {
    const sql = readMigration();

    for (const table of [
      "wallet_transactions",
      "delivery_batches",
      "delivery_routes",
      "payout_batches",
      "payouts",
      "invoices",
      "credit_notes",
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE\\s+INSERT,\\s+UPDATE,\\s+DELETE\\s+ON\\s+public\\.${table}\\s+FROM\\s+[^;]*authenticated`, "i"));
    }

    expect(sql).toContain("user_read_tables text[]");
    expect(sql).toContain("'user_wallets'");
    expect(sql).toContain("'fraud_signals'");
    expect(sql).toContain("EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t)");
    expect(sql).toContain("admin_read_tables text[]");
    expect(sql).toContain("'event_store'");
    expect(sql).toContain("'feature_store'");
    expect(sql).toContain("'ml_predictions'");
    expect(sql).toContain("EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t)");
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;');
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can insert emails" ON public.email_queue;');
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.email_queue FROM authenticated;");
  });

  it("replaces broad joins with explicit helper ownership functions", () => {
    const sql = readMigration();

    for (const fn of [
      "auth_can_access_cart",
      "auth_can_access_cart_item",
      "auth_can_manage_menu_category",
      "auth_can_manage_dish",
      "auth_can_manage_inventory_item",
      "auth_can_access_order_item",
      "auth_can_access_reservation_record",
      "auth_can_access_legacy_invoice",
      "auth_can_access_credit_note",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}`, "i"));
      expect(sql).toMatch(new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}`, "i"));
      expect(sql).toMatch(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}`, "i"));
    }

    expect(sql).toContain("public.auth_can_access_order(oi.order_id)");
    expect(sql).toContain("public.auth_can_view_dispatch_job(dispatch_job_id)");
    expect(sql).toContain("public.auth_owns_restaurant(recipient_id)");
    expect(sql).toContain("public.auth_owns_courier(recipient_id)");
  });
});
