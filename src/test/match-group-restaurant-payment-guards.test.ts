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
const fencingMigrationSource = readSource(
  "supabase/migrations/20260721222758_fence_match_group_capture_claims.sql",
);

describe("match group restaurant payment eligibility", () => {
  it("never creates or reuses a Checkout Session for an unavailable restaurant", () => {
    const firstGuard = authorizeSource.indexOf("isClientCheckoutRestaurantEligible(checkoutRestaurant)");
    const reuse = authorizeSource.indexOf("stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id)");
    const reuseGuard = authorizeSource.indexOf(
      "isClientCheckoutRestaurantEligible(restaurantBeforeReuse)",
    );
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
    expect(reuseGuard).toBeGreaterThan(reuse);
    expect(finalGuard).toBeGreaterThan(reuseGuard);
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
    }
    expect(confirmSource.indexOf("if (!identityMatches)")).toBeLessThan(
      confirmSource.indexOf("stripe.paymentIntents.cancel"),
    );
    expect(reconcileSource.indexOf("if (identityMatches)")).toBeLessThan(
      reconcileSource.indexOf(
        'terminateRejectedAuthorization("MATCH_GROUP_RESTAURANT_UNAVAILABLE")',
      ),
    );
  });

  it("checks the restaurant immediately before capture while preserving Stripe truth", () => {
    const claim = captureSource.indexOf('"claim_next_match_group_capture_candidate"');
    const requiresCapture = captureSource.indexOf('authorization.status === "requires_capture"');
    const guard = captureSource.indexOf(
      "isClientCheckoutRestaurantEligible(checkoutRestaurant)",
      requiresCapture,
    );
    const renew = captureSource.indexOf('"renew_match_group_capture_claim"', guard);
    const capture = captureSource.indexOf("stripe.paymentIntents.capture", guard);
    const cancellationRenew = captureSource.indexOf(
      '"renew_match_group_capture_cancellation_claim"',
    );
    const cancel = captureSource.indexOf("stripe.paymentIntents.cancel", cancellationRenew);

    expect(claim).toBeGreaterThan(-1);
    expect(requiresCapture).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(requiresCapture);
    expect(cancellationRenew).toBeGreaterThan(-1);
    expect(cancel).toBeGreaterThan(cancellationRenew);
    expect(renew).toBeGreaterThan(guard);
    expect(capture).toBeGreaterThan(renew);
    expect(captureSource).not.toContain('rpc("get_match_group_capture_candidates"');
    expect(captureSource).toContain("p_claim_token: claimToken");
    expect(captureSource).toContain('"release_match_group_capture_claim"');
    expect(captureSource).toContain('"mark_match_group_member_capture_failed_claimed"');
    expect(captureSource).toContain('"mark_match_group_member_captured_claimed"');
    expect(captureSource).toContain('authorization.status !== "succeeded"');
    expect(captureSource).toContain("MATCH_GROUP_RESTAURANT_ELIGIBILITY_READ_FAILED");
    expect(captureSource).toContain("recoveredIntent.status === \"succeeded\"");
    expect(captureSource).toContain("stripe_state_unknown");
    expect(captureSource).toContain("captureAttempts");
    expect(captureSource).toContain("capture-attempts-exhausted");
  });

  it("uses the same integer-cent subtotal for Stripe and database authorization", () => {
    expect(authorizeSource).toContain("const canonicalSubtotalCents = canonicalItems.reduce");
    expect(authorizeSource).toContain("const priceCents = toCents(price)");
    expect(authorizeSource).toContain("original_price: priceCents / 100");
    expect(authorizeSource).toContain("const canonicalSubtotal = canonicalSubtotalCents / 100");
    expect(authorizeSource).toContain("const grossCents = canonicalSubtotalCents");
    expect(fencingMigrationSource).toContain(
      "round(p_authorized_amount * 100) <> round(v_order.subtotal * 100)",
    );

    const authorizedBranch = authorizeSource.slice(
      authorizeSource.indexOf('if (order.payment_status === "authorized")'),
      authorizeSource.indexOf('if (order.status !== "joined")'),
    );
    expect(authorizedBranch.indexOf("recordedRestaurant")).toBeGreaterThan(-1);
    expect(authorizedBranch.indexOf("recordedRestaurant")).toBeLessThan(
      authorizedBranch.indexOf("already_authorized: true"),
    );
    expect(authorizedBranch).toContain("stripe.paymentIntents.cancel");
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

  it("fences every capture claim with the restaurant row and an opaque token", () => {
    expect(fencingMigrationSource).toContain("ADD COLUMN IF NOT EXISTS capture_claim_token uuid");
    expect(fencingMigrationSource).toContain("ADD COLUMN IF NOT EXISTS capture_claim_expires_at timestamptz");
    expect(fencingMigrationSource).toContain("ADD COLUMN IF NOT EXISTS capture_retry_after timestamptz");
    expect(fencingMigrationSource).toContain("FOR UPDATE OF gmo, restaurant SKIP LOCKED");
    expect(fencingMigrationSource).toContain("LIMIT 1");
    expect(fencingMigrationSource).toContain("capture_claim_token = gen_random_uuid()");
    expect(fencingMigrationSource).toContain("interval '15 minutes'");
    expect(fencingMigrationSource).toContain("FROM public.order_groups og");

    const pausedLegacyRpc = fencingMigrationSource.slice(
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.get_match_group_capture_candidates",
      ),
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.mark_match_group_member_authorized",
      ),
    );
    expect(pausedLegacyRpc).toContain("WHERE false");

    const renewDefinition = fencingMigrationSource.slice(
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.renew_match_group_capture_claim",
      ),
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.renew_match_group_capture_cancellation_claim",
      ),
    );
    expect(renewDefinition.match(/FOR UPDATE;/g)).toHaveLength(2);
    expect(renewDefinition).toContain("gmo.capture_claim_token = p_claim_token");
    expect(renewDefinition).toContain("restaurant.is_active IS TRUE");
    expect(renewDefinition).toContain("restaurant.is_demo IS FALSE");

    const cancelRenewDefinition = fencingMigrationSource.slice(
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.renew_match_group_capture_cancellation_claim",
      ),
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.release_match_group_capture_claim",
      ),
    );
    expect(cancelRenewDefinition.match(/FOR UPDATE;/g)).toHaveLength(2);
    expect(cancelRenewDefinition).toContain("p_require_restaurant_ineligible");
    expect(cancelRenewDefinition).toContain("v_restaurant_eligible");

    for (const functionName of [
      "release_match_group_capture_claim",
      "mark_match_group_member_capture_failed_claimed",
      "mark_match_group_member_captured_claimed",
    ]) {
      const start = fencingMigrationSource.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      expect(start).toBeGreaterThan(-1);
      expect(fencingMigrationSource.slice(start, start + 2400)).toContain(
        "gmo.capture_claim_token = p_claim_token",
      );
    }

    expect(fencingMigrationSource).toContain(
      "AND gmo.capture_claim_token IS NULL",
    );
    expect(fencingMigrationSource).toContain(
      "FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(fencingMigrationSource).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("blocks restaurant eligibility changes and deletion during a live capture", () => {
    const triggerDefinition = fencingMigrationSource.slice(
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.fence_restaurant_payment_capture",
      ),
    );
    expect(triggerDefinition).toContain("OLD.is_active IS TRUE");
    expect(triggerDefinition).toContain("NEW.is_active IS TRUE");
    expect(triggerDefinition).toContain("capture_claim_expires_at > clock_timestamp()");
    expect(triggerDefinition).toContain("RESTAURANT_PAYMENT_CAPTURE_IN_PROGRESS");
    expect(triggerDefinition).toContain("BEFORE UPDATE OF status, is_active, is_demo");
    expect(triggerDefinition).toContain("BEFORE DELETE");
  });

  it("keeps capture claim fields server-owned even for authenticated admins", () => {
    const claimProtection = fencingMigrationSource.slice(
      fencingMigrationSource.indexOf(
        "CREATE OR REPLACE FUNCTION public.protect_match_group_capture_claim_fields",
      ),
      fencingMigrationSource.indexOf(
        "-- Production's pre-PR worker",
      ),
    );
    expect(claimProtection).toContain("auth.role()");
    expect(claimProtection).toContain("'anon', 'authenticated'");
    expect(claimProtection).toContain("NEW.capture_claim_token IS DISTINCT FROM OLD.capture_claim_token");
    expect(claimProtection).toContain(
      "NEW.capture_claim_expires_at IS DISTINCT FROM OLD.capture_claim_expires_at",
    );
    expect(claimProtection).toContain("NEW.capture_retry_after IS DISTINCT FROM OLD.capture_retry_after");
    expect(claimProtection).toContain("MATCH_GROUP_CAPTURE_CLAIM_SERVER_MANAGED");
    expect(claimProtection).toContain("MATCH_GROUP_CAPTURE_IN_PROGRESS");
    expect(claimProtection).toContain("BEFORE UPDATE OR DELETE");
  });
});
