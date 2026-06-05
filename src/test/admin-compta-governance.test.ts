import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function readMigration(name: string) {
  return readFileSync(resolve(migrationsDir, name), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const matches = migrationFiles().filter((name) => pattern.test(readMigration(name)));
  expect(matches.length).toBeGreaterThan(0);
  return readMigration(matches[matches.length - 1]);
}

function extractFunction(sql: string, functionName: string) {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(
    new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${escapedFunctionName}[\\s\\S]*?\\nEND;\\n\\$\\$;`, "i"),
  );

  expect(match).toBeTruthy();
  return match![0];
}

describe("admin compta governance", () => {
  it("adds audited accounting locks, Stripe reconciliation and invoice mutation guards", () => {
    const sql = latestMigrationContaining(/admin_month_locks/i);
    const lockFn = extractFunction(sql, "admin_set_accounting_month_lock");
    const controlFn = extractFunction(sql, "admin_get_accounting_period_control");
    const reconciliationFn = extractFunction(sql, "admin_get_accounting_stripe_reconciliation");
    const markPaidFn = extractFunction(sql, "admin_mark_restaurant_invoice_paid");
    const payableWrapperFn = extractFunction(sql, "admin_generate_tok_payable_invoice");
    const payableAllWrapperFn = extractFunction(sql, "admin_generate_tok_payable_invoices_all");
    const triggerFn = extractFunction(sql, "prevent_accounting_period_mutation_when_locked");

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_month_locks/i);
    expect(sql).toMatch(/official_totals\s+jsonb/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.admin_month_locks\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+prevent_restaurant_invoices_locked_period/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+prevent_restaurant_invoice_line_items_locked_period/i);

    expect(lockFn).toMatch(/p_status\s+NOT\s+IN\s+\('open',\s*'closed',\s*'reopened'\)/i);
    expect(lockFn).toMatch(/NULLIF\(trim\(COALESCE\(p_reason,\s*''\)\),\s*''\)\s+IS\s+NULL/i);
    expect(lockFn).toMatch(/public\.build_accounting_month_official_totals/i);
    expect(lockFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);

    expect(controlFn).toMatch(/public\.admin_get_accounting_stripe_reconciliation/i);
    expect(controlFn).toMatch(/admin_month_locks/i);

    expect(reconciliationFn).toMatch(/payment_transactions/i);
    expect(reconciliationFn).toMatch(/stripe_checkout_session_id/i);
    expect(reconciliationFn).toMatch(/orphan_count/i);
    expect(reconciliationFn).toMatch(/mismatch_count/i);

    expect(markPaidFn).toMatch(/public\.assert_accounting_month_open/i);
    expect(markPaidFn).toMatch(/UPDATE\s+public\.restaurant_invoices/i);
    expect(markPaidFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);

    expect(payableWrapperFn).toMatch(/public\.assert_accounting_month_open/i);
    expect(payableWrapperFn).toMatch(/public\.generate_tok_payable_invoice/i);
    expect(payableWrapperFn).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(payableAllWrapperFn).toMatch(/public\.generate_tok_payable_invoices_all/i);

    expect(triggerFn).toMatch(/Accounting month is closed/i);
    expect(triggerFn).toMatch(/restaurant_invoice_line_items/i);

    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_set_accounting_month_lock\(date,\s*text,\s*text\)\s+FROM\s+PUBLIC,\s*anon/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_accounting_stripe_reconciliation\(date\)\s+TO\s+authenticated,\s*service_role/i);
  });

  it("wires exports, month lock controls and audited invoice actions in admin compta screens", () => {
    const shared = readFileSync(resolve(root, "src/pages/admin/adminComptaShared.ts"), "utf8");
    const overview = readFileSync(resolve(root, "src/pages/admin/AdminCompta.tsx"), "utf8");
    const inflow = readFileSync(resolve(root, "src/pages/admin/AdminComptaInflow.tsx"), "utf8");
    const outflow = readFileSync(resolve(root, "src/pages/admin/AdminComptaOutflow.tsx"), "utf8");
    const actions = readFileSync(resolve(root, "src/lib/adminComptaActions.ts"), "utf8");
    const dashboardInflow = readFileSync(resolve(root, "src/pages/dashboard/DashboardFacturesInflow.tsx"), "utf8");
    const dashboardOutflow = readFileSync(resolve(root, "src/pages/dashboard/DashboardFacturesOutflow.tsx"), "utf8");
    const dashboardOverview = readFileSync(resolve(root, "src/pages/dashboard/DashboardFactures.tsx"), "utf8");
    const accountingExports = readFileSync(resolve(root, "src/lib/accountingExports.ts"), "utf8");

    expect(shared).toContain("admin_get_accounting_period_control");
    expect(shared).toContain("admin_get_accounting_stripe_reconciliation");
    expect(shared).toContain("downloadAccountingCsv");
    expect(shared).toContain("isAccountingPeriodClosed");

    expect(overview).toContain("exportAdminComptaCsv");
    expect(overview).toContain("fetchAdminAccountingExportEntries");
    expect(overview).toContain("CSV écritures");
    expect(overview).toContain("PDF bilan");
    expect(overview).toContain("PDF résultat");
    expect(overview).toContain("PDF journal");
    expect(overview).toContain("admin_set_accounting_month_lock");
    expect(overview).toContain("Écarts Stripe");
    expect(overview).toContain("Clôturer le mois");
    expect(overview).toContain("Réouvrir");

    expect(inflow).toContain("exportInflowCsv");
    expect(inflow).toContain("generateAdminTokPayableInvoices");
    expect(inflow).toContain("markAdminRestaurantInvoicePaid");
    expect(inflow).toContain("payingInvoiceId");
    expect(inflow).toContain("Loader2");
    expect(inflow).toContain("downloadInvoicePdf");
    expect(inflow).not.toContain('.from("restaurant_invoices").update');

    expect(outflow).toContain("exportOutflowCsv");
    expect(outflow).toContain("markAdminRestaurantInvoicePaid");
    expect(outflow).toContain("payingInvoiceId");
    expect(outflow).toContain("Loader2");
    expect(outflow).toContain("downloadInvoicePdf");
    expect(outflow).not.toContain('.from("restaurant_invoices").update');

    expect(actions).toContain("admin_generate_tok_payable_invoice");
    expect(actions).toContain("admin_generate_tok_payable_invoices_all");
    expect(actions).toContain("admin_mark_restaurant_invoice_paid");
    expect(actions).toContain("p_reference");

    expect(dashboardInflow).toContain("admin_mark_restaurant_invoice_paid");
    expect(dashboardInflow).toContain("p_reference");
    expect(dashboardInflow).not.toContain('.from("restaurant_invoices").update');
    expect(dashboardOutflow).toContain("admin_mark_restaurant_invoice_paid");
    expect(dashboardOutflow).toContain("p_reference");
    expect(dashboardOutflow).not.toContain('.from("restaurant_invoices").update');

    expect(dashboardOverview).toContain("fetchDashboardAccountingExportEntries");
    expect(dashboardOverview).toContain("CSV écritures");
    expect(dashboardOverview).toContain("PDF bilan");
    expect(dashboardOverview).toContain("PDF résultat");
    expect(dashboardOverview).toContain("PDF journal");

    expect(accountingExports).toContain("buildAccountingExportEntries");
    expect(accountingExports).toContain("buildAccountingStatementSummary");
    expect(accountingExports).toContain("exportAccountingStatementPdf");
    expect(accountingExports).toContain("text/csv;charset=utf-8");
    expect(accountingExports).toContain("\\uFEFF");
  });
});
