import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isClientCheckoutRestaurantEligible } from "../../supabase/functions/_shared/order-pricing";

const checkoutSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/create-checkout/index.ts"),
  "utf8",
);

describe("client checkout restaurant publication guard", () => {
  it("accepts only an active, approved, non-demo restaurant", () => {
    expect(isClientCheckoutRestaurantEligible({
      is_active: true,
      status: "active",
      is_demo: false,
    })).toBe(true);

    expect(isClientCheckoutRestaurantEligible(null)).toBe(false);
    expect(isClientCheckoutRestaurantEligible({
      is_active: true,
      status: "active",
    })).toBe(false);
    expect(isClientCheckoutRestaurantEligible({
      is_active: false,
      status: "active",
      is_demo: false,
    })).toBe(false);
    expect(isClientCheckoutRestaurantEligible({
      is_active: true,
      status: "pending",
      is_demo: false,
    })).toBe(false);
    expect(isClientCheckoutRestaurantEligible({
      is_active: true,
      status: "needs_changes",
      is_demo: false,
    })).toBe(false);
    expect(isClientCheckoutRestaurantEligible({
      is_active: true,
      status: "rejected",
      is_demo: false,
    })).toBe(false);
    expect(isClientCheckoutRestaurantEligible({
      is_active: true,
      status: "active",
      is_demo: true,
    })).toBe(false);
  });

  it("guards every client Stripe kind but never blocks restaurateur onboarding", () => {
    expect(checkoutSource).toContain(
      'const CLIENT_STRIPE_CHECKOUT_KINDS = new Set(["order", "zero-attente", "chefs-table"]);',
    );
    expect(checkoutSource).toContain('effectiveKind === "restaurant-onboarding"');
    expect(checkoutSource).toContain("isClientCheckoutRestaurantEligible(checkoutRestaurant)");
    expect(checkoutSource).toContain('.select("id, is_active, status, is_demo")');
    expect(checkoutSource).toContain("Ce restaurant n’est pas disponible pour un paiement client.");
  });

  it("runs the authoritative guard before routing, attempts and every Stripe write", () => {
    const guardIndex = checkoutSource.indexOf("const clientCheckoutRestaurantId");
    expect(guardIndex).toBeGreaterThan(-1);

    const downstreamMarkers = [
      "const marketplaceRouting = await resolveMarketplaceRouting",
      "let acquiredAttempt = await acquirePaymentAttempt",
      "stripe.checkout.sessions.retrieve(",
      "stripe.coupons.create(",
      "stripe.checkout.sessions.create(",
    ];

    for (const marker of downstreamMarkers) {
      expect(checkoutSource.lastIndexOf(marker)).toBeGreaterThan(guardIndex);
    }
  });
});
