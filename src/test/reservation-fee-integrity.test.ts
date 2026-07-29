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
    // L'action de cloture reste presente dans les deux dispositions, mais son
    // libelle est desormais factorise : il depend de « Mon pack », coupe ou non.
    // Compter la chaine litterale reviendrait a exiger le libelle Fair Growth
    // meme la ou il est faux.
    expect(dashboard.match(/honorCtaLabel/g)?.length).toBeGreaterThanOrEqual(3);
    expect(dashboard).toContain('"Clôturer la table et calculer les frais"');
    expect(dashboard).toContain('"Clôturer la table"');
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

  it("retire Mon pack et ses modules sans toucher aux journaux comptables", () => {
    const removal = read(
      "supabase/migrations/20260729170000_remove_mon_pack_and_fair_growth_modules.sql",
    );

    // Le catalogue, les souscriptions et leur cycle de vie disparaissent.
    expect(removal).toContain("DROP TABLE IF EXISTS public.fair_growth_modules");
    expect(removal).toContain("DROP TABLE IF EXISTS public.restaurant_paid_modules");
    expect(removal).toContain("DROP FUNCTION IF EXISTS public.request_fair_growth_module");
    expect(removal).toContain("DELETE FROM public.feature_flags WHERE name = 'dashboard-pack'");

    // Le garde de drapeau lit fair_growth_modules : le laisser en place ferait
    // echouer la suppression du drapeau, quelques instructions plus bas.
    const dropGuard = removal.indexOf("DROP FUNCTION IF EXISTS private_finance.guard_referenced_feature_flag");
    const deleteFlag = removal.indexOf("DELETE FROM public.feature_flags");
    expect(dropGuard).toBeGreaterThan(-1);
    expect(deleteFlag).toBeGreaterThan(dropGuard);

    // Les journaux deja factures sont de la comptabilite : on cesse d'y
    // ecrire, on n'efface rien.
    expect(removal).not.toContain("DROP TABLE IF EXISTS public.reservation_fee_charges");
    expect(removal).not.toContain("DROP TABLE IF EXISTS public.reservation_fee_adjustments");

    // Le garde d'integrite financiere porte un nom d'epoque mais protege
    // encore l'immuabilite du couple honored_at / billing_fee_chf.
    expect(removal).not.toContain("DROP FUNCTION IF EXISTS private_finance.set_reservation_fair_growth_snapshot");
  });

  it("facture un forfait unique, sans interrupteur ni plafond", () => {
    const removal = read(
      "supabase/migrations/20260729170000_remove_mon_pack_and_fair_growth_modules.sql",
    );

    expect(removal).toContain("v_fee_cents constant integer := 500");
    expect(removal).toContain("DROP FUNCTION IF EXISTS private_finance.flat_reservation_billing_active()");

    // Plus de branche a pourcentage ni d'ecriture dans le registre Fair Growth.
    expect(removal).not.toContain("reservation_fee_cap_bps_snapshot, 700");
    expect(removal).not.toContain("INSERT INTO public.reservation_fee_charges");

    // Un forfait ne s'arrondit pas a zero : les revues administratives que le
    // pourcentage imposait n'ont plus d'objet, et auraient contredit la
    // facturation a l'arrivee, qui honore a 5.- avec un couvert nul.
    expect(removal).not.toContain("zero_fee_requires_review");
    expect(removal).not.toContain("zero_revenue_requires_review");
  });
});
