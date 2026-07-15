import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("commercial sales governance", () => {
  const migration = read("supabase/migrations/20260714232000_commercial_sales_governance_followup.sql");
  const lifecycleMigration = read("supabase/migrations/20260715053108_deferred_subscription_commission_lifecycle.sql");
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
    expect(prospecting).toContain("draftSubscriptionPlanSlug");
    expect(prospecting).toContain("p_subscription_plan_slug: draftStatus === \"signed\"");
    expect(prospecting).toContain('p_subscription_billing_period: draftStatus === "signed" ? "monthly" : null');
    expect(prospecting).toContain('"get_commercial_prospect_signup_referral"');
    expect(prospecting).toContain('url.searchParams.set("commercialReferral"');
    expect(lifecycleMigration).toContain("CREATE OR REPLACE FUNCTION public.record_commercial_prospect_followup");
    expect(lifecycleMigration).toContain("get_commercial_prospect_signup_referral");
    expect(lifecycleMigration).toContain("restaurant_subscription_plans");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("commercial_signature_commission_chf");
    expect(migration).toContain("commercial_compensation_profiles");
  });

  it("limits direct row changes and exposes a privacy-aware read model", () => {
    expect(migration).toContain("REVOKE ALL ON TABLE public.commercial_prospect_followups");
    expect(migration).not.toContain(
      "CREATE POLICY commercial_prospect_followups_admin_insert",
    );
    expect(migration).not.toContain(
      "CREATE POLICY commercial_prospect_followups_admin_update",
    );
    expect(migration).toContain(
      "prevent_commercial_prospect_followup_delete",
    );
    expect(migration).toContain("get_commercial_prospect_followups");
    expect(prospecting).toContain('"get_commercial_prospect_followups"');
    expect(migration).toContain("commercial_prospect_followup_history");
    expect(migration).toContain("commercial_followup_changed_reload_required");
    expect(migration).toContain("prospect_claimed_by_another_commercial_reload_required");
    expect(migration).toContain("FROM PUBLIC, anon, service_role;");
    expect(migration).toContain("IF NOT v_is_commercial THEN");
    expect(migration).toContain("commercial_account_inactive");
    expect(migration).toContain("commercial_prospect_catalog");
    expect(commercialAccounting).toContain("isAdmin ? (requestedCommercialUserId");
  });

  it("keeps commercial accounting read-only and lists the commercial's signed restaurants", () => {
    expect(commercialAccounting).toContain('data-testid="commercial-accounting-readonly"');
    expect(commercialAccounting).toContain("Cette comptabilité est en lecture seule");
    expect(commercialAccounting).not.toContain("AdminCompensationAdjustmentForm");
    expect(commercialAccounting).not.toContain('"admin_add_commercial_compensation_adjustment"');
    expect(commercialAccounting).not.toContain('.from("commercial_compensation_adjustments"');
    expect(commercialAccounting).toContain('.from("commercial_prospect_followups"');
    expect(commercialAccounting).toContain('.eq("signed_by", commercialUserId)');
    expect(commercialAccounting).toContain("fetchGenevaCommercialProspects");
    expect(commercialAccounting).toContain("Mes restaurants signés");
    expect(commercialAccounting).toContain("Historique complet de toutes les signatures");
    expect(commercialAccounting).toContain("pending_commission_chf");
    expect(accountDetail).toContain("AdminCompensationAdjustmentForm");
    expect(accountDetail).toContain('"admin_add_commercial_compensation_adjustment"');
    expect(accountDetail).toContain("financialSnapshotLocked");
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
    expect(salesRules).not.toContain('{ value: "not_interested_unspecified"');
    expect(migration).toContain("get_admin_commercial_refusal_overview");
  });

  it("opens a complete admin profile with activity, objections and accounting", () => {
    expect(accountList).toContain("setSelectedAccount(account)");
    expect(accountList).toContain("Vue globale des refus");
    expect(accountList).toContain("AdminCommercialAccountDetail");
    expect(accountDetail).toContain("Restaurants suivis");
    expect(accountDetail).toContain("Régime décidé par l’admin");
    expect(accountDetail).toContain('"get_commercial_compensation_summary"');
    expect(accountDetail).toContain('"get_admin_commercial_activity"');
    expect(accountDetail).toContain('"admin_correct_commercial_signature"');
    expect(accountDetail).toContain('"admin_correct_commercial_signature_status"');
    expect(accountDetail).toContain("Annuler la signature");
    expect(accountDetail).toContain("Comptabilité du mois");
    expect(migration).toContain("commercial_compensation_profile_events");
    expect(migration).toContain("'period_chf'");
  });

  it("keeps commercial compensation read-only and prevents duplicate bonuses", () => {
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE");
    expect(migration).toContain("admin_add_commercial_compensation_adjustment");
    expect(migration).toContain("WHEN cca.kind = 'sprint_bonus' THEN 0");
    expect(migration).toContain("cpf.commercial_compensation_mode = 'commission_only'");
    expect(migration).toContain("NOT isfinite(v_period_start)");
    expect(migration).toContain("v_period_end - v_period_start > 366");
    expect(migration).not.toContain("WITH secured AS (");
    expect(lifecycleMigration).toContain("commercial_self_adjustment_forbidden");
    expect(lifecycleMigration).toContain("auth.uid() = p_commercial_user_id");
    expect(lifecycleMigration).toContain("earned_commercial_signature_status_is_immutable");
  });

  it("keeps acquisition commissions pending until the subscription invoice is paid", () => {
    expect(lifecycleMigration).toContain("acquisition_commission_status");
    expect(lifecycleMigration).toContain("pending_payment");
    expect(lifecycleMigration).toContain("record_restaurant_subscription_invoice_paid");
    expect(lifecycleMigration).toContain("restaurant_subscription_activation_jobs");
    expect(lifecycleMigration).toContain("signup_restaurateur_onboarding_payment_ready");
    expect(lifecycleMigration).toContain("earned_at");
    expect(lifecycleMigration).toContain("commercial_signup_referral");
    expect(lifecycleMigration).toContain("raw_commercial_source_metadata_not_accepted");
    expect(lifecycleMigration).not.toContain("v_source_objectid := NULLIF(v_source_text");
    expect(commercialAccounting).toContain("Réservée, hors montants acquis");
  });

  it("shows server-generated signature commissions in central admin accounting", () => {
    expect(migration).toContain("get_admin_commercial_commission_summary");
    expect(accounting).toContain('"get_admin_commercial_commission_summary"');
    expect(accounting).toContain("Commissions commerciales acquises");
    expect(accounting).toContain("Commissions de signature acquises");
    expect(accounting).toContain("pending_commission_chf");
  });
});
