import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("iOS StoreKit subscription management", () => {
  it("keeps native StoreKit purchase cancellation out of Stripe payment-attempt recovery", () => {
    const page = read("src/pages/TokOne.tsx");

    expect(page).toContain("enabled: !isCommercialDemoClient && !isNativeIos");
    expect(page).toContain('isNativeIos && checkout.state === "cancelled"');
    expect(page).toContain('isNativeIos && checkout.state === "succeeded"');
    expect(page).toContain("clearPaymentAttemptId(TOK_ONE_PAYMENT_ATTEMPT_SCOPE, paymentAttemptId)");
  });

  it("routes Apple subscription management to Apple instead of the Stripe lifecycle endpoint", () => {
    const page = read("src/pages/TokOne.tsx");

    expect(page).toContain('subscription.billing_provider === "apple"');
    expect(page).toContain('https://apps.apple.com/account/subscriptions');
    expect(page).toContain("La résiliation et le renouvellement de cet abonnement sont gérés par Apple.");
  });

  it("prevents Stripe synchronization from reusing an Apple entitlement row", () => {
    const shared = read("supabase/functions/_shared/tok-one.ts");

    expect(shared).toContain('.eq("billing_provider", "stripe")');
    expect(shared).toContain('billing_provider: "stripe"');
    expect(shared).toContain("apple_original_transaction_id");
  });

  it("refuses server-side cancel/resume mutation for Apple-managed subscriptions", () => {
    const manager = read("supabase/functions/manage-tok-one-subscription/index.ts");

    expect(manager).toContain('String(subscription.billing_provider || "").toLowerCase() === "apple"');
    expect(manager).toContain("APPLE_MANAGED_SUBSCRIPTION");
  });
});
