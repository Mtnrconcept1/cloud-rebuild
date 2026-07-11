import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const createCheckoutSource = readFileSync(resolve(process.cwd(), "supabase/functions/create-checkout/index.ts"), "utf8");
const stripeWebhookSource = readFileSync(resolve(process.cwd(), "supabase/functions/stripe-webhook/index.ts"), "utf8");
const stripeWorkerSource = readFileSync(resolve(process.cwd(), "supabase/functions/stripe-worker/index.ts"), "utf8");
const stripeClientSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/stripe-client.ts"), "utf8");
const orderCheckoutSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/order-checkout.ts"), "utf8");
const orderPricingSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/order-pricing.ts"), "utf8");
const processRefundSource = readFileSync(resolve(process.cwd(), "supabase/functions/process-refund/index.ts"), "utf8");
const authorizeMatchGroupOrderSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/authorize-match-group-order/index.ts"),
  "utf8",
);
const chefsTableSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/chefs-table.ts"), "utf8");
const zeroAttenteSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/zero-attente.ts"), "utf8");
const validateOrderSource = readFileSync(resolve(process.cwd(), "supabase/functions/validate-order/index.ts"), "utf8");
const cartSource = readFileSync(resolve(process.cwd(), "src/pages/Panier.tsx"), "utf8");
const cancelPendingCheckoutSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/cancel-pending-order-checkout/index.ts"),
  "utf8",
);
const restoreStockMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260603114000_restore_special_offer_stock.sql"),
  "utf8",
);

function readMigrationContaining(pattern: RegExp) {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const fileName = readdirSync(migrationsDir).find((name) => {
    if (!name.endsWith(".sql")) return false;
    return pattern.test(readFileSync(resolve(migrationsDir, name), "utf8"));
  });

  expect(fileName, `migration matching ${pattern} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, fileName!), "utf8");
}

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

  it("lets Stripe live configuration control payment methods instead of hardcoded checkout methods", () => {
    expect(createCheckoutSource).not.toContain("payment_method_types");
    expect(authorizeMatchGroupOrderSource).not.toContain("payment_method_types");
  });

  it("verifies Stripe webhook signatures and records event ids for idempotency before processing", () => {
    const webhookSecretSources = `${stripeWebhookSource}\n${stripeClientSource}`;

    expect(stripeWebhookSource).toContain("constructEventAsync");
    expect(webhookSecretSources).toContain("STRIPE_WEBHOOK_SECRET");
    expect(webhookSecretSources).toContain("STRIPE_WEBHOOK_SIGNING_SECRET");
    expect(stripeWebhookSource).toContain("stripe_webhook_events");
    expect(stripeWebhookSource).toContain("duplicate_event_skipped");
    expect(stripeWebhookSource).toContain("claimStripeWebhookEvent");
    expect(stripeWebhookSource).toContain('error.code === "23505"');
    expect(stripeWebhookSource).toContain("stripe_webhook_event_claim_failed");
    expect(stripeWebhookSource).not.toMatch(
      /\.select\("event_id"\)[\s\S]{0,240}\.eq\("event_id", event\.id\)[\s\S]{0,240}\.maybeSingle/,
    );
  });

  it("accepts the Supabase live Stripe secret alias used in production Edge Functions", () => {
    const authSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/auth.ts"), "utf8");
    const confirmMatchGroupSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/confirm-match-group-authorization/index.ts"),
      "utf8",
    );
    const workflowSource = readFileSync(resolve(process.cwd(), ".github/workflows/deploy-production.yml"), "utf8");
    const secretsScriptSource = readFileSync(resolve(process.cwd(), "scripts/write-supabase-secrets-env.mjs"), "utf8");

    expect(authSource).toContain('Deno.env.get("STRIPE_SECRET_KEY_LIVE")');
    expect(authSource).toContain('Deno.env.get("STRIPE_PERSONNAL_SECRET_KEY")');
    expect(confirmMatchGroupSource).toContain('Deno.env.get("STRIPE_SECRET_KEY_LIVE")');
    expect(confirmMatchGroupSource).toContain('Deno.env.get("STRIPE_PERSONNAL_SECRET_KEY")');
    expect(stripeClientSource).toContain("isPlatformStripeSecretName");
    expect(stripeClientSource).toContain('"STRIPE_PERSONNAL_SECRET_KEY"');
    expect(stripeClientSource).toContain('"STRIPE_PERSONAL_SECRET_KEY"');
    expect(stripeClientSource).toContain('"STRIPE_SECRET_KEY_LIVE"');
    expect(stripeClientSource).toContain('"STRIPE_LIVE_WEBHOOK"');
    expect(stripeClientSource).toContain('"STRIPE_WEBHOOK_SECRET_LIVE"');
    expect(stripeClientSource).toContain('"STRIPE_WEBHOOK_SIGNING_SECRET_LIVE"');
    expect(secretsScriptSource).toContain('"STRIPE_SECRET_KEY_LIVE"');
    expect(secretsScriptSource).toContain('"STRIPE_PERSONNAL_SECRET_KEY"');
    expect(secretsScriptSource).toContain('"STRIPE_PERSONAL_SECRET_KEY"');
    expect(secretsScriptSource).toContain("removePublicStripeKeyAliases");
    expect(secretsScriptSource).toContain('"STRIPE_LIVE_WEBHOOK"');
    expect(secretsScriptSource).toContain('"STRIPE_WEBHOOK_SECRET_LIVE"');
    expect(secretsScriptSource).toContain('"STRIPE_WEBHOOK_SIGNING_SECRET_LIVE"');
    expect(workflowSource).toContain(
      "STRIPE_SECRET_KEY_LIVE: ${{ secrets.STRIPE_PERSONNAL_SECRET_KEY || secrets.STRIPE_PERSONAL_SECRET_KEY || secrets.STRIPE_SECRET_KEY_LIVE }}",
    );
    expect(workflowSource).toContain(
      "STRIPE_SECRET_KEY: ${{ secrets.STRIPE_PERSONNAL_SECRET_KEY || secrets.STRIPE_PERSONAL_SECRET_KEY || secrets.STRIPE_SECRET_KEY_LIVE }}",
    );
    expect(workflowSource).toContain(
      "VITE_STRIPE_PUBLISHABLE_KEY: ${{ secrets.VITE_STRIPE_PUBLISHABLE_KEY }}",
    );
    expect(workflowSource).not.toContain(
      "VITE_STRIPE_PUBLISHABLE_KEY: ${{ secrets.VITE_STRIPE_PUBLISHABLE_KEY || secrets.STRIPE_SECRET_KEY }}",
    );
    expect(workflowSource).toContain("STRIPE_LIVE_WEBHOOK: ${{ secrets.STRIPE_LIVE_WEBHOOK }}");
    expect(workflowSource).toContain(
      "STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET || secrets.STRIPE_LIVE_WEBHOOK }}",
    );
    expect(workflowSource).toContain(
      "STRIPE_WEBHOOK_SECRET_LIVE: ${{ secrets.STRIPE_LIVE_WEBHOOK || secrets.STRIPE_WEBHOOK_SECRET }}",
    );
    expect(workflowSource).toContain(
      "STRIPE_WEBHOOK_SIGNING_SECRET_LIVE: ${{ secrets.STRIPE_LIVE_WEBHOOK || secrets.STRIPE_WEBHOOK_SIGNING_SECRET }}",
    );
  });

  it("keeps the legacy stripe-worker endpoint as a raw webhook proxy", () => {
    const configSource = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

    expect(configSource).toContain("[functions.stripe-worker]");
    expect(configSource).toContain("[functions.stripe-worker]\nverify_jwt = false");
    expect(stripeWorkerSource).toContain("/functions/v1/stripe-webhook");
    expect(stripeWorkerSource).toContain("body: req.body");
    expect(stripeWorkerSource).toContain("stripe-signature");
    expect(stripeWorkerSource).toContain('"x-tok-forwarded-from", "stripe-worker"');
  });

  it("does not acknowledge claimed Stripe events when processing fails", () => {
    expect(stripeWebhookSource).toContain("markStripeWebhookEventSucceeded");
    expect(stripeWebhookSource).toContain("markStripeWebhookEventFailed");
    expect(stripeWebhookSource).toContain("processing_status");
    expect(stripeWebhookSource).toContain('return new Response("Stripe webhook processing failed"');
    expect(stripeWebhookSource).toMatch(/status:\s*500/);
    const failureResponseIndex = stripeWebhookSource.indexOf('return new Response("Stripe webhook processing failed"');
    const successResponseIndex = stripeWebhookSource.lastIndexOf("return new Response(JSON.stringify({ received: true })");

    expect(failureResponseIndex).toBeGreaterThan(0);
    expect(successResponseIndex).toBeGreaterThan(failureResponseIndex);
  });

  it("migrates Stripe webhook idempotency to explicit processing states", () => {
    const migration = readMigrationContaining(/stripe_webhook_events_processing_status_check/);

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS processing_status");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS attempt_count");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS last_error");
    expect(migration).toContain("processing_status IN ('processing', 'succeeded', 'failed')");
    expect(migration).toContain("idx_stripe_webhook_events_failed_retry");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE ON public.stripe_webhook_events TO service_role");
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

  it("applies Miamz and promo benefits before confirming captured orders", () => {
    const benefitsIndex = orderCheckoutSource.indexOf("apply_checkout_benefits");
    const confirmIndex = orderCheckoutSource.indexOf('status: "confirmed"');

    expect(benefitsIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(-1);
    expect(benefitsIndex).toBeLessThan(confirmIndex);
  });

  it("creates Stripe refunds with stable idempotency and admin-only service evidence overrides", () => {
    expect(processRefundSource).toContain("refundIdempotencyKey");
    expect(processRefundSource).toContain("idempotencyKey: refundIdempotencyKey");
    expect(processRefundSource).toContain("entity.refundedAmount");
    expect(processRefundSource).toContain("Math.round(refundAmount * 100)");
    expect(processRefundSource).toContain("hasFinalServiceEvidence");
    expect(processRefundSource).toContain("order_status_history");
    expect(processRefundSource).toContain("reservation_status_history");
    expect(processRefundSource).toContain("Une commande ou reservation deja servie requiert un remboursement admin.");
  });

  it("does not create wallet credit on top of a Stripe refund", () => {
    const refundBlock = stripeWebhookSource.slice(
      stripeWebhookSource.indexOf('case "charge.refunded"'),
      stripeWebhookSource.indexOf('case "customer.subscription.created"'),
    );

    expect(refundBlock).toContain("existingRefundTransactions");
    expect(refundBlock).toContain("charge_refund_already_recorded");
    expect(refundBlock).toContain("stripe_refund_delta_chf");
    expect(refundBlock).toContain("moyen de paiement d'origine");
    expect(refundBlock).not.toContain('from("user_wallets")');
    expect(refundBlock).not.toContain("balance: wallet.balance + refundAmount");
  });

  it("creates pending online order rows before opening the Stripe redirect", () => {
    const onlineCheckoutBlock = cartSource.slice(
      cartSource.indexOf("if (authoritativeRequiresStripeCheckout)"),
      cartSource.indexOf("if (paymentMethod !== \"cash\" && !authoritativeRequiresStripeCheckout)"),
    );

    expect(onlineCheckoutBlock).toContain("const pendingOrderResults = await Promise.all");
    expect(onlineCheckoutBlock).toContain('checkout_session_state: "pending"');
    const createCheckoutIndex = onlineCheckoutBlock.indexOf('"create-checkout"');
    expect(createCheckoutIndex).toBeGreaterThan(-1);
    expect(onlineCheckoutBlock.indexOf("const pendingOrderResults = await Promise.all"))
      .toBeLessThan(createCheckoutIndex);
    expect(onlineCheckoutBlock).toContain("compensatePendingCheckout");
    expect(onlineCheckoutBlock).toContain('invokeSupabaseFunction("cancel-pending-order-checkout"');
    expect(onlineCheckoutBlock.indexOf("compensatePendingCheckout"))
      .toBeGreaterThan(onlineCheckoutBlock.indexOf("const pendingOrderResults = await Promise.all"));
    expect(onlineCheckoutBlock.indexOf("writePendingOrderCheckoutSessionId"))
      .toBeGreaterThan(createCheckoutIndex);
  });

  it("sends loyalty point redemption count to server validation metadata", () => {
    expect(cartSource).toContain("points_to_redeem: pointsDiscountAmount > 0 ? Math.round(pointsDiscountAmount * 100) : 0");
    expect(cartSource).toContain("points_discount_amount: pointsDiscountAmount > 0 ? Number(pointsDiscountAmount.toFixed(2)) : 0");
    expect(createCheckoutSource).toContain("points_to_redeem: Math.round((pointsByPaymentGroup.get(paymentGroupKey) || 0) * 100)");
    expect(orderPricingSource).toContain("const requestedPointsToRedeem = Math.max(0, Math.floor(toNumber(metadata.points_to_redeem)))");
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

  it("preserves guaranteed delivery slots from the dedicated journey through cart checkout", () => {
    expect(cartSource).toContain("getGuaranteedDeliveryCartContext(cartMetadata, items)");
    expect(cartSource).toContain("buildGuaranteedDeliveryOrderMetadata(guaranteedDeliveryContext)");
    expect(cartSource).toContain("isGuaranteedDeliveryCheckout || (isSingleRestaurant && deliveryFeatureEnabled)");
    expect(cartSource).toContain("setDeliveryScheduleMode(guaranteedDeliveryContext.deliveryScheduleMode)");
    expect(cartSource).toContain("setDeliveryDate(guaranteedDeliveryContext.deliveryDate)");
    expect(cartSource).toContain("setDeliveryTime(guaranteedDeliveryContext.deliveryTime)");
    expect(cartSource).toContain("!deliveryDate || (!selectedDeliverySlot && !isGuaranteedDeliveryCheckout)");
    expect(cartSource).toContain('isGuaranteedDeliveryCheckout ? "creneaux-garantis" : cartMetadata?.feature');
    expect(cartSource).toContain("Créneau garanti verrouillé");
    expect(cartSource).toContain("...guaranteedDeliveryOrderMetadata");
  });

  it("keeps pre-Stripe online orders pending until webhook or completion finalizes them", () => {
    expect(validateOrderSource).toContain("isAwaitingOnlinePayment");
    expect(validateOrderSource).toContain('checkout_session_state');
    expect(validateOrderSource).toContain('payment_status: isAwaitingOnlinePayment');
    expect(validateOrderSource).toContain('status: isAwaitingOnlinePayment ? "pending_payment" : "confirmed"');
    expect(validateOrderSource).toContain("if (!isAwaitingOnlinePayment)");
  });

  it("blocks online payment orders from being confirmed before payment capture", () => {
    const migration = readMigrationContaining(/guard_online_order_confirmation_requires_payment/);

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.guard_online_order_confirmation_requires_payment");
    expect(migration).toContain("CREATE TRIGGER guard_online_order_confirmation_requires_payment");
    expect(migration).toContain("BEFORE UPDATE OF status, payment_status ON public.orders");
    expect(migration).toContain("payment_method");
    expect(migration).toContain("'card'");
    expect(migration).toContain("'twint'");
    expect(migration).toContain("'postfinance_card'");
    expect(migration).toContain("'postfinance_efinance'");
    expect(migration).toContain("'pending_payment'");
    expect(migration).toContain("'captured'");
    expect(migration).toContain("'paid'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.trigger_order_status_notification");
    expect(migration).toContain("RETURN NEW");
    expect(migration).toContain("DELETE FROM public.notifications");
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

  it("compensates pending payment orders when Stripe checkout creation fails before a session id exists", () => {
    expect(orderCheckoutSource).toContain("export async function restoreReservedSpecialOfferStock");
    expect(cancelPendingCheckoutSource).toContain("cancel-pending-order-checkout");
    expect(cancelPendingCheckoutSource).toContain("restoreReservedSpecialOfferStock");
    expect(cancelPendingCheckoutSource).toContain('status: "payment_failed"');
    expect(cancelPendingCheckoutSource).toContain('payment_status: "failed"');
    expect(cancelPendingCheckoutSource).toContain('checkout_session_state: "failed"');
    expect(cancelPendingCheckoutSource).toContain("checkout_creation_failed");
    expect(cancelPendingCheckoutSource).toContain("hasStripeSession");
    expect(cancelPendingCheckoutSource).toContain("writeAuditLog");
  });

  it("creates or updates Zero Attente reservations idempotently after payment", () => {
    expect(stripeWebhookSource).toContain("isZeroAttenteCheckoutKind(checkoutKind)");
    expect(stripeWebhookSource).toContain("finalizeZeroAttenteCheckout");
    expect(zeroAttenteSource).toContain("existingReservation");
    expect(zeroAttenteSource).toContain("validate_and_create_reservation");
    expect(zeroAttenteSource).toContain('status: "confirmed"');
    expect(zeroAttenteSource).toContain("recordZeroAttenteChargeIfMissing");
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
