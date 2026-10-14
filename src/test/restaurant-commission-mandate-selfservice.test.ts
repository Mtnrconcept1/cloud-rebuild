import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const backend = read("supabase/functions/manage-restaurant-subscription/index.ts");
const billing = read("src/pages/dashboard/DashboardAccountBilling.tsx");
const collector = read("supabase/migrations/20261014010000_recurring_restaurant_reservation_commissions.sql");

describe("legacy restaurant commission consent remediation", () => {
  it("requires real owner authentication and a separate affirmative acceptance", () => {
    expect(backend).toContain("restaurant.owner_id !== actor.userId");
    expect(backend).toContain('action === "accept_commission_mandate"');
    expect(backend).toContain("body?.confirmation !== true");
    expect(backend).toContain("body?.acknowledged_fee_cents !== 500");
    expect(backend).toContain("COMMISSION_MANDATE_CONTRACT_VERSION");
    expect(backend).toContain('commission_auto_debit_consent_source: "restaurant_billing_dashboard"');
    expect(backend).toContain("commission_auto_debit_consent_actor_user_id: actor.userId");
    expect(backend).toContain(".eq(\"updated_at\", signup.updated_at)");
    expect(backend).toContain('if (action === "commission_mandate_status") {');
    expect(backend).toContain("subscription_status: null, auto_debit_enabled: false");
  });

  it("does not create payments or activate commission automation on acceptance", () => {
    const consentBranch = backend.split('if (action === "commission_mandate_status" || action === "accept_commission_mandate") {')[1]
      ?.split("const period = resolveStripeSubscriptionPeriod")[0] || "";
    expect(consentBranch).not.toContain("paymentIntents.create");
    expect(consentBranch).not.toContain("subscriptions.create");
    expect(consentBranch).not.toContain("reservation_commission_auto_debit_enabled: true");
    expect(collector).toContain("reservation_commission_auto_debit_enabled");
    expect(collector).toContain("commission_auto_debit_consent_accepted_at");
    expect(collector).toContain("sub.status='active'");
  });

  it("shows a distinct unchecked checkbox and preserves inactive-subscription guidance", () => {
    expect(billing).toContain('id="restaurant-commission-debit-mandate"');
    expect(billing).toContain("useState(false)");
    expect(billing).toContain('action: "commission_mandate_status"');
    expect(billing).toContain('action: "accept_commission_mandate"');
    expect(billing).toContain("disabled={!commissionConsentChecked || commissionConsentSubmitting}");
    expect(billing).toContain("Abonnement à régulariser");
    expect(billing).toContain("Aucun prélèvement immédiat");
  });
});
