import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FAIR_GROWTH_ANNUAL_FEATURE_FLAG,
  FAIR_GROWTH_ANNUAL_MONTHS_CHARGED,
  FAIR_GROWTH_ANNUAL_SERVICE_MONTHS,
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
    expect(webhook).toContain('entitlement_reset_period: "monthly"');
    expect(manager).toContain("FAIR_GROWTH_ANNUAL_MONTHS_CHARGED");
    expect(manager).not.toContain('billingPeriod === "yearly" ? 12 : 1');
  });

  it("allows only monthly or gated yearly periods at signup validation", () => {
    const validation = source("supabase/functions/submit-signup-application/validation.ts");
    expect(validation).toContain('["monthly", "yearly"].includes(billingPeriod)');
    expect(validation).not.toContain('billingPeriod !== "monthly"');
  });
});
