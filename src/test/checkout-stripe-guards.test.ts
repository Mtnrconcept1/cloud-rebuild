import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const createCheckoutSource = readFileSync(resolve(process.cwd(), "supabase/functions/create-checkout/index.ts"), "utf8");
const stripeWebhookSource = readFileSync(resolve(process.cwd(), "supabase/functions/stripe-webhook/index.ts"), "utf8");
const orderCheckoutSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/order-checkout.ts"), "utf8");
const chefsTableSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/chefs-table.ts"), "utf8");
const validateOrderSource = readFileSync(resolve(process.cwd(), "supabase/functions/validate-order/index.ts"), "utf8");
const cartSource = readFileSync(resolve(process.cwd(), "src/pages/Panier.tsx"), "utf8");
const restoreStockMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260603114000_restore_special_offer_stock.sql"),
  "utf8",
);

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

  it("creates pending online order rows before opening the Stripe redirect", () => {
    const onlineCheckoutBlock = cartSource.slice(
      cartSource.indexOf("if (authoritativeRequiresStripeCheckout)"),
      cartSource.indexOf("if (paymentMethod !== \"cash\" && !authoritativeRequiresStripeCheckout)"),
    );

    expect(onlineCheckoutBlock).toContain("const pendingOrderResults = await Promise.all");
    expect(onlineCheckoutBlock).toContain('checkout_session_state: "pending"');
    expect(onlineCheckoutBlock.indexOf("const pendingOrderResults = await Promise.all"))
      .toBeLessThan(onlineCheckoutBlock.indexOf('invokeSupabaseFunction("create-checkout"'));
    expect(onlineCheckoutBlock.indexOf("writePendingOrderCheckoutSessionId"))
      .toBeGreaterThan(onlineCheckoutBlock.indexOf('invokeSupabaseFunction("create-checkout"'));
  });

  it("preserves fixed pickup slots from Anti-Gaspi and flash sale tools in order metadata", () => {
    expect(cartSource).toContain("const antiGaspiPickupDate = antiGaspiItem?.metadata?.available_date || null");
    expect(cartSource).toContain("const antiGaspiPickupStart = antiGaspiItem?.metadata?.pickup_start || null");
    expect(cartSource).toContain("const antiGaspiPickupEnd = antiGaspiItem?.metadata?.pickup_end || null");
    expect(cartSource).toContain("? antiGaspiPickupDate");
    expect(cartSource).toContain("? antiGaspiPickupStart");
    expect(cartSource).toContain("? antiGaspiPickupEnd");
    expect(cartSource).toContain("? flashPickupDate");
    expect(cartSource).toContain("? flashPickupStart");
    expect(cartSource).toContain("? flashPickupEnd");
    expect(cartSource).toContain("} else if (!hasAntiGaspi && !hasTakeawayFlash) {");
  });

  it("keeps pre-Stripe online orders pending until webhook or completion finalizes them", () => {
    expect(validateOrderSource).toContain("isAwaitingOnlinePayment");
    expect(validateOrderSource).toContain('checkout_session_state');
    expect(validateOrderSource).toContain('payment_status: isAwaitingOnlinePayment');
    expect(validateOrderSource).toContain('status: isAwaitingOnlinePayment ? "pending_payment" : "confirmed"');
    expect(validateOrderSource).toContain("if (!isAwaitingOnlinePayment)");
  });

  it("marks expired checkout sessions as failed without touching captured orders", () => {
    expect(stripeWebhookSource).toContain('case "checkout.session.expired"');
    expect(stripeWebhookSource).toContain("markOrderCheckoutSessionState");
    expect(orderCheckoutSource).toContain('if (order.status !== "pending_payment" && order.payment_status === "captured")');
    expect(orderCheckoutSource).toContain('checkoutState: "expired"');
  });

  it("restores reserved Anti-Gaspi and flash sale stock when an online checkout expires", () => {
    expect(orderCheckoutSource).toContain("restoreReservedSpecialOfferStock");
    expect(orderCheckoutSource).toContain('from("order_items")');
    expect(orderCheckoutSource).toContain("itemMetadata.anti_waste_offer_id || itemMetadata.offer_id");
    expect(orderCheckoutSource).toContain("itemMetadata.flash_sale_id");
    expect(orderCheckoutSource).toContain('input.adminClient.rpc("restore_special_offer_stock"');
    expect(orderCheckoutSource).toContain("special_offer_stock_restored_at");
    expect(restoreStockMigration).toContain("CREATE OR REPLACE FUNCTION public.restore_special_offer_stock");
    expect(restoreStockMigration).toContain("SET quantity_available = quantity_available + p_qty");
    expect(restoreStockMigration).toContain("REVOKE EXECUTE ON FUNCTION public.restore_special_offer_stock(text, uuid, integer) FROM PUBLIC, anon, authenticated");
    expect(restoreStockMigration).toContain("GRANT EXECUTE ON FUNCTION public.restore_special_offer_stock(text, uuid, integer) TO service_role");
  });

  it("creates or updates Zero Attente reservations idempotently after payment", () => {
    expect(stripeWebhookSource).toContain("isZeroAttenteCheckoutKind(checkoutKind)");
    expect(stripeWebhookSource).toContain("existingZeroAttenteReservation");
    expect(stripeWebhookSource).toContain("validate_and_create_reservation");
    expect(stripeWebhookSource).toContain('status: "confirmed"');
    expect(stripeWebhookSource).toContain("recordZeroAttenteChargeIfMissing");
  });

  it("creates or reuses Chef Table reservations idempotently after payment", () => {
    expect(stripeWebhookSource).toContain('checkoutKind === "chefs-table"');
    expect(stripeWebhookSource).toContain("finalizeChefsTableCheckout");
    expect(chefsTableSource).toContain('filter("metadata->>checkout_session_id", "eq", session.id)');
    expect(chefsTableSource).toContain("findExistingChefReservation");
    expect(chefsTableSource).toContain("validate_and_create_reservation");
    expect(chefsTableSource).toContain('status: "confirmed"');
    expect(chefsTableSource).toContain("recordReservationChargeIfMissing");
  });
});
