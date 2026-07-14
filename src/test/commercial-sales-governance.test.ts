import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("commercial sales governance", () => {
  const migration = read("supabase/migrations/20260714195229_secure_commercial_sales_governance.sql");
  const prospecting = read("src/pages/CommercialProspection.tsx");
  const commercialAccounting = read("src/pages/CommercialComptabilite.tsx");
  const accountList = read("src/components/admin/AdminCommercialAccountsPanel.tsx");
  const accountDetail = read("src/components/admin/AdminCommercialAccountDetail.tsx");
  const accounting = read("src/pages/admin/AdminCompta.tsx");
  const salesRules = read("src/lib/commercialSales.ts");

  it("moves all commercial writes and commission calculations behind a guarded RPC", () => {
    expect(prospecting).toContain('"record_commercial_prospect_followup"');
    expect(prospecting).not.toContain('.from("commercial_prospect_followups").upsert');
    expect(prospecting).not.toContain("draftCompensationMode");
    expect(prospecting).not.toContain("draftSignedRestaurantId");
    expect(prospecting).not.toContain("Sprint 60 jours sans fixe");
    expect(prospecting).not.toContain("signed_restaurant_id:");
    expect(prospecting).not.toContain("acquisition_commission_chf:");
    expect(prospecting).toContain("p_subscription_plan_slug");
    expect(prospecting).toContain("p_subscription_billing_period");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.record_commercial_prospect_followup");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("commercial_signature_commission_chf");
    expect(migration).toContain("commercial_compensation_profiles");
  });

  it("limits direct row changes and exposes a privacy-aware read model", () => {
    expect(migration).toContain("commercial_prospect_followups_admin_insert");
    expect(migration).toContain("commercial_prospect_followups_admin_update");
    expect(migration).toContain("get_commercial_prospect_followups");
    expect(prospecting).toContain('"get_commercial_prospect_followups"');
    expect(migration).toContain("commercial_prospect_followup_history");
    expect(migration).toContain("commercial_followup_changed_reload_required");
    expect(migration).toContain("prospect_claimed_by_another_commercial_reload_required");
    expect(commercialAccounting).toContain("isAdmin ? (requestedCommercialUserId");
  });

  it("offers distinct field outcomes and requires structured refusal reasons", () => {
    for (const label of ["Visité", "À repasser", "Signé", "Refusé"]) {
      expect(salesRules).toContain(label);
    }
    expect(salesRules).toContain("price_too_high");
    expect(salesRules).toContain("already_with_competitor");
    expect(salesRules).toContain("unclear_roi");
    expect(salesRules).toContain("other");
    expect(prospecting).toContain("COMMERCIAL_REFUSAL_REASONS");
    expect(prospecting).toContain("draftRefusalReasons");
    expect(prospecting).toContain("p_refusal_reason_codes");
    expect(prospecting).toContain("p_refusal_other_text");
    expect(migration).toContain("refusal_reason_codes");
    expect(migration).toContain("not_interested_unspecified");
  });

  it("opens a complete admin profile with activity, objections and accounting", () => {
    expect(accountList).toContain("setSelectedAccount(account)");
    expect(accountList).toContain("Vue globale des refus");
    expect(accountList).toContain("AdminCommercialAccountDetail");
    expect(accountDetail).toContain("Restaurants suivis");
    expect(accountDetail).toContain("Régime décidé par l’admin");
    expect(accountDetail).toContain('"get_commercial_compensation_summary"');
    expect(accountDetail).toContain("Comptabilité du mois");
  });

  it("shows server-generated signature commissions in central admin accounting", () => {
    expect(migration).toContain("get_admin_commercial_commission_summary");
    expect(accounting).toContain('"get_admin_commercial_commission_summary"');
    expect(accounting).toContain("Commissions commerciales générées");
    expect(accounting).toContain("Commissions de signature générées");
  });
});
