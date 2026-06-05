import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function readMigration(name: string) {
  return readFileSync(resolve(migrationsDir, name), "utf8");
}

describe("admin security and business audit hardening", () => {
  it("locks global scheduler RPCs away from ordinary authenticated users", () => {
    const migration = read("supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql");

    for (const fn of ["mark_noshow_reservations", "cleanup_expired_groups", "close_due_match_groups"]) {
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}() FROM PUBLIC`);
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}() FROM anon`);
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}() FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}() TO service_role`);
    }
  });

  it("prevents clients from directly mutating Stripe-backed match group member orders", () => {
    const migration = read("supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql");
    const matchGroupPage = read("src/pages/MatchGroupes.tsx");
    const confirmFunction = read("supabase/functions/confirm-match-group-authorization/index.ts");

    expect(migration).toContain('DROP POLICY IF EXISTS "group_member_orders_update_own_draft"');
    expect(migration).toContain('CREATE POLICY "group_member_orders_update_admin_only"');
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("USING (public.has_role(auth.uid(), 'admin'))");
    expect(migration).toContain("WITH CHECK (public.has_role(auth.uid(), 'admin'))");

    expect(matchGroupPage).not.toContain('"close_due_match_groups"');
    expect(matchGroupPage).not.toContain("'close_due_match_groups'");
    expect(matchGroupPage).toContain("processedReturnKeys");
    expect(matchGroupPage).toContain('retry: false');
    expect(matchGroupPage).toContain('invokeSupabaseFunction<ConfirmMatchGroupAuthorizationResult>("confirm-match-group-authorization"');
    expect(matchGroupPage).toContain("pending_confirmation");
    expect(confirmFunction).toContain('import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts"');
    expect(confirmFunction).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(confirmFunction).toContain("pending_confirmation: true");
    expect(confirmFunction).toContain("retry_after_seconds: 15");
    expect(confirmFunction).toContain("}, 202, corsHeaders)");
  });

  it("keeps raw invoice generators behind service-role or audited admin wrappers", () => {
    const migration = read("supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql");
    const adminCompta = read("src/pages/admin/AdminComptaInflow.tsx");
    const adminComptaActions = read("src/lib/adminComptaActions.ts");
    const dashboardInflow = read("src/pages/dashboard/DashboardFacturesInflow.tsx");

    for (const signature of [
      "generate_tok_payable_invoice(uuid, date)",
      "generate_tok_payable_invoices_all(date)",
      "generate_tok_reservation_fee_invoice(uuid, date)",
      "generate_tok_reservation_fee_invoices_all(date)",
    ]) {
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM anon`);
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`);
    }

    expect(adminCompta).toContain("generateAdminTokPayableInvoices");
    expect(adminComptaActions).toContain("admin_generate_tok_payable_invoice");
    expect(adminComptaActions).toContain("admin_generate_tok_payable_invoices_all");
    expect(dashboardInflow).toContain('supabase.functions.invoke("generate-invoices"');
  });

  it("routes order and reservation status changes through controlled RPCs instead of broad table updates", () => {
    const migration = read("supabase/migrations/20260602133000_admin_security_scheduler_rpc_lockdown.sql");
    const dashboardOrders = read("src/pages/dashboard/DashboardCommandes.tsx");
    const reservationMutations = read("src/lib/reservationMutations.ts");

    expect(migration).toContain('DROP POLICY IF EXISTS "Restaurant owners can update orders"');
    expect(migration).toContain('CREATE POLICY "orders_admin_update_only"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Users can cancel their reservations"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Restaurant owners can update reservations"');
    expect(migration).toContain('CREATE POLICY "reservations_admin_update_only"');

    expect(dashboardOrders).toContain('invokeSupabaseFunction("restaurant-order-status"');
    expect(dashboardOrders).toContain('cancelOrderByRestaurant(');
    expect(dashboardOrders).toContain('mark_order_seen_by_restaurant');
    expect(reservationMutations).toContain('"update_restaurant_reservation_status_safe"');
    expect(reservationMutations).toContain('"cancel_reservation_by_customer"');
    expect(reservationMutations).toContain('"cancel_reservation_by_restaurant"');
  });

  it("keeps direct audit_log insertion closed after the audit hardening migration", () => {
    const hardening = readMigration("20260407194000_linter_security_hardening.sql");
    expect(hardening).toContain('DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log');

    const laterSql = migrationFiles()
      .filter((name) => name > "20260407194000_linter_security_hardening.sql")
      .map(readMigration)
      .join("\n");

    expect(laterSql).not.toMatch(/CREATE\s+POLICY\s+"Authenticated can insert audit logs"/i);
    expect(laterSql).not.toMatch(/CREATE\s+POLICY\s+"System can insert audit logs"/i);
  });

  it("removes anonymous execution from late admin security definer RPCs", () => {
    const migration = readMigration("20260605131641_admin_domain_and_advisor_hardening.sql");

    for (const fn of [
      "admin_archive_chef_table_drop",
      "admin_archive_cuisine",
      "admin_get_actualites_sponsored_posts",
      "admin_log_admin_action",
      "admin_review_social_post_promotion",
      "admin_save_chef_table_drop",
      "admin_update_launch_pack_fulfillment",
      "admin_update_launch_pack_status",
      "admin_update_restaurant_disabled_features",
      "admin_upsert_cuisine",
    ]) {
      expect(migration).toContain(`'${fn}'`);
    }

    expect(migration).toContain("AND p.prosecdef");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon");
  });

  it("surfaces security abuse monitoring in admin audit without automatic polling", () => {
    const auditPage = read("src/pages/admin/AdminAuditLogs.tsx");
    const urgentActions = read("src/components/admin/AdminUrgentActions.tsx");

    expect(auditPage).toContain("admin_get_security_abuse_summary");
    expect(auditPage).toContain("Surveillance sécurité");
    expect(auditPage).toContain("Créations de comptes");
    expect(auditPage).toContain("Échecs sensibles");
    expect(auditPage).toContain("Tests de cartes");
    expect(auditPage).toContain("Uploads massifs");
    expect(auditPage).not.toContain("refetchInterval");

    expect(urgentActions).toContain("refetchOnWindowFocus: false");
    expect(urgentActions).not.toContain("refetchInterval");
  });
});
