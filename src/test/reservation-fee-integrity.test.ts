import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260729090000_campaign_tracking_and_reservation_fee_integrity.sql";

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("reservation fee and Mon pack integrity", () => {
  it("requires the atomic honor flow before a reservation can be completed", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("use_honored_rpc");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.mark_reservation_honored");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.update_restaurant_reservation_status_safe",
    );
    expect(sql).toContain("zz_guard_insert_completed_reservation_honor");
    expect(sql).toMatch(/UPDATE public\.reservations[\s\S]*?status\s*=\s*'completed'/i);
    expect(sql).toContain("reservation_fee_charges");
    expect(sql).toContain(
      "billing_fee_chf =\n        v_existing_charge.fee_cents::numeric / 100",
    );
    expect(sql).toContain(
      "attributed_table_revenue_chf =\n        v_existing_charge.attributed_revenue_cents_snapshot::numeric / 100",
    );
    expect(sql).toMatch(
      /IF v_reservation\.honored_at IS NOT NULL THEN[\s\S]*?'honored_locked'/,
    );
    expect(sql).toContain("v_current_status = 'arrived'");
    expect(sql).toContain("v_status IN ('arrived', 'seated')");
    expect(sql).toContain("v_current_status = 'seated'");
    expect(sql).toContain("AND v_status = 'seated'");
    expect(sql).toContain(
      "La progression de la reservation ne peut pas revenir a un statut anterieur.",
    );
    expect(sql).toContain(
      "PERFORM set_config('app.fair_growth_mark_honored', 'on', true);",
    );
  });

  it("makes the uncalculated fee state and closing action explicit in both reservation layouts", () => {
    const dashboard = read("src/pages/dashboard/DashboardReservations.tsx");

    expect(dashboard.match(/Frais non calculés — clôturez la table/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dashboard.match(/Clôturer la table et calculer les frais/g)?.length).toBeGreaterThanOrEqual(2);
    expect(dashboard).toContain('["arrived", "seated", "completed"]');
    expect(dashboard).toContain('arrived: ["arrived", "seated"]');
    expect(dashboard).toContain('seated: ["seated"]');
  });

  it("uses immutable reservation fee charges as the accounting source of truth", () => {
    const accounting = read("src/pages/admin/adminComptaShared.ts");

    expect(accounting).toContain('.from("reservation_fee_charges")');
    expect(accounting).toContain("honored_at_snapshot");
    expect(accounting).toContain("fee_cents");
    expect(accounting).toContain("toAmount(row.fee_cents) / 100");
    expect(accounting).toContain("!row.invoice_id");
  });

  it("schedules idempotent monthly reservation-fee invoice generation", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("generate_tok_reservation_fee_invoices_all");
    expect(sql).toContain("tok-monthly-reservation-fee-invoices");
    expect(sql).toContain("cron.unschedule");
    expect(sql).toContain("cron.schedule");
  });

  it("keeps disabled Mon pack requests historical, suspended, and non-billable", () => {
    const sql = read(migrationPath);
    const control = read("src/components/admin/AdminMonPackControl.tsx");

    expect(sql).toContain("admin_get_fair_growth_reconciliation");
    expect(sql).toContain("dashboard-pack");
    expect(sql).not.toContain("event.payload #>>");
    expect(control).toContain("Demandes suspendues");
    expect(control).toContain("Modules facturables");
    expect(control).toContain("ne modifient pas les frais de réservation");
  });

  it("enforces each module feature key on both client and database paths", () => {
    const sql = read(migrationPath);
    const dashboard = read("src/pages/dashboard/DashboardPack.tsx");
    const conversionPreflight = sql.match(
      /DO \$assert_single_existing_campaign_conversion_per_entity\$([\s\S]*?)\$assert_single_existing_campaign_conversion_per_entity\$;/,
    )?.[1] || "";

    expect(sql).toContain("feature_keys");
    expect(sql).toContain("fair_growth_module_requires_feature_key");
    expect(sql).toMatch(
      /private_finance\.guard_fair_growth_module_feature_keys\(\)[\s\S]*?IF NEW\.feature_keys IS NULL OR cardinality\(NEW\.feature_keys\) = 0/,
    );
    expect(conversionPreflight).not.toContain("NEW.feature_keys");
    expect(sql).toMatch(
      /SET\s+feature_keys = ARRAY\['dashboard-pack'\]::text\[\],[\s\S]*?updated_at = now\(\)/,
    );
    expect(sql).toContain("module_hidden_by_feature_flag");
    expect(dashboard).toContain("module.feature_keys.every");
    expect(dashboard).toContain("activeFeatures.has");
  });
});
