import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const checkout = read("supabase/functions/create-checkout/index.ts");
const attempts = read("supabase/functions/_shared/payment-attempts.ts");
const sharedAuth = read("supabase/functions/_shared/auth.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const refundAllocations = read("supabase/functions/_shared/refund-allocations.ts");
const marketplaceFinance = read("supabase/functions/_shared/marketplace-finance.ts");
const status = read("supabase/functions/payment-attempt-status/index.ts");
const cancel = read("supabase/functions/cancel-payment-attempt/index.ts");
const validateOrder = read("supabase/functions/validate-order/index.ts");
const completeOrder = read("supabase/functions/complete-order-checkout/index.ts");
const reconcileOrders = read("supabase/functions/reconcile-paid-order-checkouts/index.ts");
const processRefund = read("supabase/functions/process-refund/index.ts");
const integrityMigration = read("supabase/migrations/20260715060000_payment_integrity_state_machine.sql");
const idempotentAbandon = read(
  "supabase/migrations/20260805020000_idempotent_payment_attempt_abandonment.sql",
);

describe("durable Stripe payment attempts", () => {
  it("requires one stable client UUID and seals the exact Stripe request", () => {
    expect(checkout).toContain("requireClientPaymentAttemptId");
    expect(checkout).toContain("sealPaymentAttemptRequest");
    expect(checkout).toContain("requestFingerprint");
    expect(checkout).toContain("stripeIdempotencyKey");
    expect(checkout).toContain(":coupon");
    expect(checkout).toContain("persistOrderCheckoutSessionMapping");
    expect(checkout.indexOf("persistOrderCheckoutSessionMapping({")).toBeLessThan(
      checkout.lastIndexOf("bindPaymentAttemptStripe({"),
    );
  });

  it("keeps ambiguous create errors on the same generation", () => {
    expect(attempts).toContain("fail_payment_attempt");
    expect(attempts).toContain("abandon_payment_attempt_session");
    expect(checkout).toContain("expireAndAbandonKnownSession");
    expect(checkout).toContain("PAYMENT_ATTEMPT_INDETERMINATE");
  });

  it("answers replayed session abandonments idempotently so Stripe stops redelivering", () => {
    // checkout.session.expired is terminal and replayable. Raising on an
    // abandonment that already happened made stripe-webhook return 500, and
    // Stripe redelivered the same event for days (evt_1TxHYs... ran 07-26 to
    // 07-28; evt_1U0tRI... and evt_1U0WHr... were still looping on 08-05).
    expect(idempotentAbandon).toContain("stripe_session_history");
    expect(idempotentAbandon).toContain("jsonb_array_elements");
    expect(idempotentAbandon).toContain("v_attempt.state = 'cancelled'");

    // The replay check must precede the finalized guard, otherwise a late
    // expired event for an older generation loops forever once a later
    // generation has been paid.
    expect(idempotentAbandon.indexOf("entry ->> 'checkout_session_id'")).toBeLessThan(
      idempotentAbandon.indexOf("finalized_attempt_cannot_be_abandoned"),
    );

    // Guards protecting a payable session stay in place.
    expect(idempotentAbandon).toContain("finalized_attempt_cannot_be_abandoned");
    expect(idempotentAbandon).toContain("payment_attempt_session_mismatch");
    expect(idempotentAbandon).toContain("payment_attempt_lease_lost");

    // CREATE OR REPLACE rewrites the SET clauses, so dropping this would
    // silently revert 20260804204953 and restore the unbounded lock wait.
    expect(idempotentAbandon).toContain("SET lock_timeout = '5s'");
    expect(idempotentAbandon).toContain("SET search_path = ''");
  });

  it("recovers stale webhook leases and never acknowledges active work as done", () => {
    expect(attempts).toContain("claim_stripe_webhook_event");
    expect(attempts).toContain("complete_stripe_webhook_event");
    expect(webhook).toContain("eventLockToken");
    expect(webhook).toContain("already in progress");
    expect(webhook).toContain('status: 409');
  });

  it("strictly separates test events and covers refunds plus disputes", () => {
    expect(webhook).toContain("stripe_test_event_ignored_by_live_webhook");
    expect(webhook).toContain('case "refund.updated"');
    expect(webhook).toContain('case "refund.failed"');
    expect(webhook).toContain('case "charge.dispute.created"');
    expect(webhook).toContain("record_marketplace_dispute_ledger");
    expect(webhook).toContain("record_refund_status");
    expect(webhook).toContain("planRefundAllocations");
    expect(webhook).toContain("REFUND_RESERVED_ALLOCATION_LOOKUP_FAILED");
    expect(refundAllocations).toContain("reservedOperations");
    expect(refundAllocations).toContain('operation.status !== "pending" && operation.status !== "succeeded"');
    expect(webhook).toContain('stripe_refund_id: refund.id');
    expect(webhook).toContain('stripe_event_id: event.id');
    expect(webhook).toContain('payment_attempt_id: transaction.payment_attempt_id || null');
    expect(webhook).toContain('.eq("stripe_mode", event.livemode ? "live" : "test")');
    expect(integrityMigration).toContain("refund-payment-intent:");
    expect(integrityMigration).toContain("refund_reservations_exceed_target_total");
    expect(integrityMigration).toContain("v_operation.status IN ('failed', 'cancelled')");
  });

  it("keeps payable inventory sessions inside the database hold window", () => {
    expect(checkout).toContain("sessionParams.expires_at");
    expect(checkout).toContain("31 * 60");
    expect(checkout).toContain("stripe_replayed_expired_session");
    expect(checkout).toContain("PAYMENT_ATTEMPT_REQUEST_MISMATCH");
  });

  it("exposes authenticated resume and cancellation endpoints", () => {
    expect(status).toContain("findOwnedPaymentAttempt");
    expect(status).toContain("PAYMENT_ATTEMPT_INDETERMINATE");
    expect(cancel).toContain("checkout.sessions.expire");
    expect(cancel).toContain("release_zero_attente_checkout_hold");
    expect(cancel).toContain("markOrderCheckoutSessionState");
    expect(checkout).toContain("payment_attempt_cancelled_during_create");
    expect(checkout).toContain("releaseCreatedBusinessPrerequisites");
    expect(checkout).toContain("release_zero_attente_checkout_hold");
    expect(checkout).toContain("release_chef_table_checkout_hold");
    expect(checkout).toContain("CREDIT_PACK_HOLD_RELEASE_FAILED");
    expect(integrityMigration).toContain("payment_attempt_cancellation_requested");
    expect(integrityMigration).toContain("payment_attempt_session_became_bound");
    expect(integrityMigration).toContain("cancellation_requested_at");
  });

  it("reclaims subscription attempts that hold nothing payable", () => {
    // A client UUID lives in sessionStorage, so a dead attempt that keeps
    // answering 409 locks the owner out of checkout on every later device.
    expect(checkout).toContain("unbound_subscription_attempt_reclaimed");
    expect(checkout).toContain("expired_subscription_attempt_reclaimed");
    expect(checkout).toContain("conflicting_subscription_session_expired");
    // Only Stripe may declare a bound session unpayable.
    expect(checkout).toContain('conflictingSession.status !== "expired"');
    expect(checkout).toContain("conflictLeaseHeld");
  });

  it("returns the blocking operation key so the owner can resume or cancel it", () => {
    expect(checkout).toContain("buildSubscriptionConflictError");
    expect(checkout).toContain("existing_payment_attempt_id");
    expect(checkout).toContain("PAYMENT_ATTEMPT_OPERATION_CONFLICT");
    expect(checkout).toContain("errorRecovery(error)");
    expect(sharedAuth).toContain("export function errorRecovery");
  });

  it("serializes duplicate order creation and rejects identity drift", () => {
    expect(validateOrder).toContain('"create_order_with_items_idempotent"');
    expect(validateOrder).toContain("checkout_request_fingerprint");
    expect(integrityMigration).toContain("order-checkout:");
    expect(integrityMigration).toContain("checkout_identity_mismatch");
    expect(integrityMigration).toContain("checkout_request_fingerprint_required");
  });

  it("does not guess VAT ownership for mixed marketplace payments", () => {
    expect(integrityMigration).toContain("v_restaurant_payable_cents");
    expect(integrityMigration).toContain('"marketplace_tax_liability_scope"');
    expect(integrityMigration).toContain("finance.reconciliation_required");
  });

  it("leases one canonical finance event for browser and scheduled recovery", () => {
    expect(marketplaceFinance).toContain("recordReconciledCheckoutFinance");
    expect(marketplaceFinance).toContain("internal:checkout-reconciliation:");
    expect(marketplaceFinance).toContain("claimStripeWebhookEvent");
    expect(marketplaceFinance).toContain("completeStripeWebhookEvent");
    expect(completeOrder).toContain("recordReconciledCheckoutFinance");
    expect(reconcileOrders).toContain("recordReconciledCheckoutFinance");
    expect(completeOrder).not.toContain("client-complete:");
    expect(reconcileOrders).not.toContain("eventId: `reconcile:");
  });

  it("keeps concurrent refund clicks idempotent but advances after a terminal failure", () => {
    expect(processRefund).toContain("terminalRefundCount");
    expect(processRefund).toContain('.in("status", ["failed", "cancelled"])');
    expect(processRefund).toContain("refundRetryGeneration");
    expect(processRefund).toContain("idempotencyKey: refundIdempotencyKey");
  });
});
