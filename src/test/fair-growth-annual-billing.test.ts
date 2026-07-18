import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FAIR_GROWTH_ANNUAL_FEATURE_FLAG,
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  FAIR_GROWTH_ANNUAL_SERVICE_MONTHS,
  FAIR_GROWTH_STANDARD_VAT_BPS,
  buildRestaurantSubscriptionPricingSnapshot,
  getRestaurantSubscriptionAmountCents,
  getRestaurantSubscriptionStripeInterval,
  parseRestaurantSubscriptionBillingPeriod,
} from "../../supabase/functions/_shared/restaurant-subscription-billing";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Fair Growth annual restaurant billing", () => {
  it("provides twelve months of service while charging exactly eleven monthly prices", () => {
    expect(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED).toBe(11);
    expect(FAIR_GROWTH_ANNUAL_SERVICE_MONTHS).toBe(12);
    expect([69, 129, 199, 499].map((price) =>
      getRestaurantSubscriptionAmountCents(price, "yearly")
    )).toEqual([75_900, 141_900, 218_900, 548_900]);
  });

  it("builds one complete tax-inclusive pricing snapshot for an annual plan transition", () => {
    const snapshot = buildRestaurantSubscriptionPricingSnapshot({
      price_monthly_chf: 69,
      annual_months_charged: 11,
      acquired_reservation_fee_cents: 500,
      marketplace_commission_bps: 990,
      included_establishments: 1,
      additional_establishment_price_cents: null,
      reservation_revenue_cap_bps: 700,
      developer_order_bps: 100,
      developer_tok_revenue_bps: 1000,
      pricing_version: "fair_growth_2026_07",
    }, "yearly");

    expect(snapshot).toMatchObject({
      price_monthly_cents_snapshot: 6_900,
      billing_amount_cents_snapshot: 75_900,
      billing_net_cents_snapshot: 70_213,
      billing_vat_cents_snapshot: 5_687,
      vat_rate_bps_snapshot: FAIR_GROWTH_STANDARD_VAT_BPS,
      annual_months_charged_snapshot: 11,
      acquired_reservation_fee_cents_snapshot: 500,
      marketplace_commission_bps_snapshot: 990,
      developer_order_bps_snapshot: 100,
      developer_tok_revenue_bps_snapshot: 1000,
      pricing_version_snapshot: "fair_growth_2026_07",
    });
    expect(
      snapshot.billing_net_cents_snapshot + snapshot.billing_vat_cents_snapshot,
    ).toBe(snapshot.billing_amount_cents_snapshot);
  });

  it("uses a strict period parser and the matching Stripe recurring interval", () => {
    expect(parseRestaurantSubscriptionBillingPeriod("monthly")).toBe("monthly");
    expect(parseRestaurantSubscriptionBillingPeriod(" YEARLY ")).toBe("yearly");
    expect(parseRestaurantSubscriptionBillingPeriod("annual")).toBeNull();
    expect(parseRestaurantSubscriptionBillingPeriod(undefined)).toBeNull();
    expect(getRestaurantSubscriptionStripeInterval("monthly")).toBe("month");
    expect(getRestaurantSubscriptionStripeInterval("yearly")).toBe("year");
  });

  it("keeps annual rollout fail-closed on both server and client", () => {
    const edgeFlags = source("supabase/functions/_shared/feature-flags.ts");
    const clientFlags = source("src/lib/featureCatalog.ts");
    const checkout = source("supabase/functions/create-checkout/index.ts");
    const signup = source("supabase/functions/submit-signup-application/index.ts");

    expect(FAIR_GROWTH_ANNUAL_FEATURE_FLAG).toBe("billing-fair-growth-annual");
    expect(edgeFlags).toContain('"billing-fair-growth-annual": { defaultEnabled: false }');
    expect(clientFlags).toMatch(/name: "billing-fair-growth-annual"[\s\S]*?defaultEnabled: false/);
    expect(checkout).toContain("isFairGrowthAnnualBillingEnabled(activeFlags)");
    expect(signup).toContain("isFairGrowthAnnualBillingEnabled(activeFlags)");
  });

  it("takes onboarding price from the immutable database snapshot", () => {
    const checkout = source("supabase/functions/create-checkout/index.ts");

    expect(checkout).toContain("billing_amount_chf_snapshot");
    expect(checkout).toContain("price_monthly_chf_snapshot");
    expect(checkout).toContain("STRIPE_SETUP_RESERVED_SUBSCRIPTION_SNAPSHOT_MISMATCH");
    expect(checkout).toContain("subscriptionAmountCents !== expectedSubscriptionAmountCents");
  });

  it("creates yearly Stripe prices while keeping product allowances monthly", () => {
    const worker = source("supabase/functions/stripe-worker/index.ts");
    const webhook = source("supabase/functions/stripe-webhook/index.ts");
    const manager = source("supabase/functions/manage-restaurant-subscription/index.ts");

    expect(worker).toContain("getRestaurantSubscriptionStripeInterval(billingPeriod)");
    expect(worker).toContain('entitlement_reset_period: "monthly"');
    expect(webhook).toContain("resolveRestaurantSubscriptionBillingPeriod");
    expect(webhook).toContain("buildRestaurantSubscriptionPricingSnapshot");
    expect(webhook).toContain('pricing_snapshot_transition: "stripe_plan_change"');
    expect(webhook).toContain("restaurant_subscription_stripe_amount_snapshot_mismatch");
    expect(webhook).toContain('entitlement_reset_period: "monthly"');
    expect(manager).toContain("FAIR_GROWTH_ANNUAL_MONTHS_CHARGED");
    expect(manager).not.toContain('billingPeriod === "yearly" ? 12 : 1');
  });

  it("defers every active annual upgrade or downgrade to the paid period end", () => {
    const checkout = source("supabase/functions/create-checkout/index.ts");
    const manager = source("supabase/functions/manage-restaurant-subscription/index.ts");
    const page = source("src/pages/dashboard/DashboardAccountBilling.tsx");

    expect(checkout).toContain("restaurant_subscription_active_change_requires_scheduling");
    expect(checkout).toContain("Never create a second full-price subscription");
    expect(manager).toContain("from_subscription: subscription.stripe_subscription_id");
    expect(manager).toContain("start_date: stripePeriod.startUnix");
    expect(manager).toContain("end_date: stripePeriod.endUnix");
    expect(manager).toContain("items: [{ price: currentPriceId");
    expect(manager).toContain("items: [{ price: targetStripePriceId");
    expect(manager).toContain('proration_behavior: "none"');
    expect(manager).toContain("stripeScheduleId = activeScheduleId");
    expect(manager).toContain("if (!stripeScheduleId)");
    expect(manager).toContain("releaseStripeScheduleIfActive");
    expect(manager).toContain("une nouvelle periode annuelle de douze mois");

    expect(page).toContain("scheduleAtPeriodEnd={currentSubscriptionIsActive}");
    expect(page).toContain("Facturation automatique annuelle");
    expect(page).toContain("douze mois de service sont renouvelés et onze mois sont facturés");
    expect(page).toContain("renouvellement annuel");
    expect(page).toContain("sans débit immédiat");
    expect(page).not.toContain("renouvellement mensuel.\`");
  });

  it("allows only monthly or gated yearly periods at signup validation", () => {
    const validation = source("supabase/functions/submit-signup-application/validation.ts");
    expect(validation).toContain('["monthly", "yearly"].includes(billingPeriod)');
    expect(validation).not.toContain('billingPeriod !== "monthly"');
  });
});
