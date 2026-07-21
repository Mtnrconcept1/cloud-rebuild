import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const authorizeSource = readSource("supabase/functions/authorize-match-group-order/index.ts");
const confirmSource = readSource("supabase/functions/confirm-match-group-authorization/index.ts");
const reconcileSource = readSource("supabase/functions/reconcile-match-group-authorizations/index.ts");
const captureSource = readSource("supabase/functions/capture-due-match-groups/index.ts");
const migrationSource = readSource(
  "supabase/migrations/20260721215805_harden_restaurant_payment_eligibility.sql",
);

describe("match group restaurant payment eligibility", () => {
  it("never creates or reuses a Checkout Session for an unavailable restaurant", () => {
    const firstGuard = authorizeSource.indexOf("isClientCheckoutRestaurantEligible(checkoutRestaurant)");
    const reuse = authorizeSource.indexOf("stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id)");
    const finalGuard = authorizeSource.indexOf(
      "isClientCheckoutRestaurantEligible(restaurantBeforeStripeWrite)",
    );
    const create = authorizeSource.indexOf("stripe.checkout.sessions.create({");
    const postCreateGuard = authorizeSource.indexOf(
      "isClientCheckoutRestaurantEligible(restaurantAfterStripeWrite)",
    );
    const exposeUrl = authorizeSource.indexOf("return jsonResponse({ url: session.url");

    expect(firstGuard).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(firstGuard);
    expect(finalGuard).toBeGreaterThan(reuse);
    expect(create).toBeGreaterThan(finalGuard);
    expect(postCreateGuard).toBeGreaterThan(create);
    expect(exposeUrl).toBeGreaterThan(postCreateGuard);
    expect(authorizeSource).toContain("stripe.checkout.sessions.expire");
    expect(authorizeSource).toContain("stripe.paymentIntents.cancel");
    expect(authorizeSource).toContain("MATCH_GROUP_RESTAURANT_UNAVAILABLE");
  });

  it("cancels rejected authorizations in both confirmation paths", () => {
    for (const source of [confirmSource, reconcileSource]) {
      expect(source).toContain("isClientCheckoutRestaurantEligible(checkoutRestaurant)");
      expect(source).toContain("stripe.checkout.sessions.expire");
      expect(source).toContain("stripe.paymentIntents.cancel");
      expect(source).toContain("MATCH_GROUP_AUTHORIZATION_REJECTED");
      expect(source).toContain("marked !== true");
      const identityGuard = Math.max(
        source.indexOf("if (!identityMatches)"),
        source.indexOf("if (identityMatches)"),
      );
      expect(identityGuard).toBeGreaterThan(-1);
      expect(identityGuard).toBeLessThan(source.indexOf("stripe.paymentIntents.cancel"));
    }
  });

  it("checks the restaurant immediately before capture while preserving Stripe truth", () => {
    const requiresCapture = captureSource.indexOf('authorization.status === "requires_capture"');
    const guard = captureSource.indexOf(
      "isClientCheckoutRestaurantEligible(checkoutRestaurant)",
      requiresCapture,
    );
    const cancel = captureSource.indexOf("stripe.paymentIntents.cancel", guard);
    const capture = captureSource.indexOf("stripe.paymentIntents.capture", guard);

    expect(requiresCapture).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(requiresCapture);
    expect(cancel).toBeGreaterThan(guard);
    expect(capture).toBeGreaterThan(cancel);
    expect(captureSource).toContain('authorization.status !== "succeeded"');
    expect(captureSource).toContain("MATCH_GROUP_RESTAURANT_ELIGIBILITY_READ_FAILED");
    expect(captureSource).toContain("recoveredIntent.status === \"succeeded\"");
  });

  it("makes authorization and capture claims atomic and recoverable", () => {
    expect(migrationSource).toContain("FOR UPDATE OF gmo SKIP LOCKED");
    expect(migrationSource).toContain("interval '5 minutes'");
    expect(migrationSource).toContain("SET capture_attempted_at = now()");
    expect(migrationSource).toContain("capture_attempted_at = CASE WHEN p_terminal THEN now() ELSE NULL END");

    const authorizeDefinition = migrationSource.slice(
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.mark_match_group_member_authorized"),
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.get_match_group_capture_candidates"),
    );
    expect(authorizeDefinition.match(/FOR UPDATE;/g)).toHaveLength(3);
    expect(authorizeDefinition).toContain("v_restaurant.is_active IS NOT TRUE");
    expect(authorizeDefinition).toContain("v_restaurant.is_demo IS NOT FALSE");
    expect(authorizeDefinition).toContain("v_group.status <> 'open'");
    expect(authorizeDefinition).toContain("p_authorized_amount <> v_order.subtotal");

    const failureDefinition = migrationSource.slice(
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.mark_match_group_member_capture_failed"),
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.mark_match_group_member_captured"),
    );
    expect(failureDefinition).toContain("payment_status IN ('pending', 'authorized')");
    expect(failureDefinition).not.toContain("payment_status = 'captured'");

    const capturedDefinition = migrationSource.slice(
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.mark_match_group_member_captured"),
    );
    expect(capturedDefinition).toContain("payment_status = 'captured'");
    expect(capturedDefinition).toContain("payment_status = 'failed' AND status = 'expired'");
  });

  it("requires a publicly visible restaurant before subscription activation", () => {
    const genuineClientDefinition = migrationSource.slice(
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.restaurant_subscription_genuine_client"),
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.mark_match_group_member_authorized"),
    );
    expect(genuineClientDefinition).toContain(
      "public.restaurant_is_publicly_visible(restaurant.id)",
    );
    expect(genuineClientDefinition).toContain("restaurant.owner_id IS DISTINCT FROM p_user_id");
  });
});
