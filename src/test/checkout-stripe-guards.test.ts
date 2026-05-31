import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const createCheckoutSource = readFileSync(resolve(process.cwd(), "supabase/functions/create-checkout/index.ts"), "utf8");
const stripeWebhookSource = readFileSync(resolve(process.cwd(), "supabase/functions/stripe-webhook/index.ts"), "utf8");
const orderCheckoutSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/order-checkout.ts"), "utf8");

describe("checkout and Stripe webhook safety guards", () => {
  it("creates Stripe sessions with required metadata for reconciliation", () => {
    expect(createCheckoutSource).toContain("metadata: sessionMetadata");
    expect(createCheckoutSource).toContain("client_reference_id: actor.userId || undefined");
    expect(createCheckoutSource).toContain("success_url:");
    expect(createCheckoutSource).toContain("cancel_url:");
    expect(createCheckoutSource).toContain("checkout_kind: effectiveKind");
    expect(createCheckoutSource).toContain("user_id: actor.userId ||");
    expect(createCheckoutSource).toContain("restaurant_id:");
    expect(createCheckoutSource).toContain("authoritative_total");
    expect(createCheckoutSource).toContain("payment_method_label");
  });

  it("verifies Stripe webhook signatures and records event ids for idempotency before processing", () => {
    expect(stripeWebhookSource).toContain("constructEventAsync");
    expect(stripeWebhookSource).toContain("STRIPE_WEBHOOK_SECRET");
    expect(stripeWebhookSource).toContain("STRIPE_WEBHOOK_SIGNING_SECRET");
    expect(stripeWebhookSource).toContain("stripe_webhook_events");
    expect(stripeWebhookSource).toContain("duplicate_event_skipped");
    expect(stripeWebhookSource).toContain("insert({ event_id: event.id, event_type: event.type, livemode: event.livemode })");
  });

  it("activates paid campaigns only from checkout.session.completed", () => {
    expect(stripeWebhookSource).toContain('case "checkout.session.completed"');
    expect(stripeWebhookSource).toContain('checkoutKind === "campaign"');
    expect(stripeWebhookSource).toContain('status: "active"');
    expect(stripeWebhookSource).toContain('payment_status: "paid"');
    expect(stripeWebhookSource).toContain("stripe_checkout_session_id: session.id");
    expect(stripeWebhookSource).toContain("stripe_payment_intent_id");
  });

  it("finalizes paid orders by session identifiers and records captured payment state", () => {
    expect(orderCheckoutSource).toContain("findOrdersForSession");
    expect(orderCheckoutSource).toContain('filter("metadata->>stripe_session_id", "eq", identifiers.sessionId)');
    expect(orderCheckoutSource).toContain('filter("metadata->>checkout_group_id", "eq", identifiers.checkoutGroupId)');
    expect(orderCheckoutSource).toContain('eq("checkout_id", identifiers.checkoutId)');
    expect(orderCheckoutSource).toContain('status: "confirmed"');
    expect(orderCheckoutSource).toContain('payment_status: "captured"');
    expect(orderCheckoutSource).toContain('checkout_session_state: "completed"');
    expect(orderCheckoutSource).toContain("recordOrderChargeIfMissing");
  });

  it("marks expired checkout sessions as failed without touching captured orders", () => {
    expect(stripeWebhookSource).toContain('case "checkout.session.expired"');
    expect(stripeWebhookSource).toContain("markOrderCheckoutSessionState");
    expect(orderCheckoutSource).toContain('if (order.status !== "pending_payment" && order.payment_status === "captured")');
    expect(orderCheckoutSource).toContain('checkoutState: "expired"');
  });

  it("creates or updates Zero Attente reservations idempotently after payment", () => {
    expect(stripeWebhookSource).toContain("isZeroAttenteCheckoutKind(checkoutKind)");
    expect(stripeWebhookSource).toContain("existingZeroAttenteReservation");
    expect(stripeWebhookSource).toContain("validate_and_create_reservation");
    expect(stripeWebhookSource).toContain('status: "confirmed"');
    expect(stripeWebhookSource).toContain("recordZeroAttenteChargeIfMissing");
  });
});
