import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  buildRequestMetadata,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  finalizePaidOrderCheckout,
  getStripePaymentMethodDetails,
} from "../_shared/order-checkout.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import {
  assertCheckoutSessionIntegrity,
  finalizePaymentAttempt,
  readStripeObjectId,
} from "../_shared/payment-attempts.ts";
import { recordReconciledCheckoutFinance } from "../_shared/marketplace-finance.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("complete-order-checkout");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let sessionId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    await assertProductionFlowAllowed(actor, "confirmation de commande réelle");
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const requestMetadata = buildRequestMetadata(req);
    const rateLimiter = createRateLimiter(actor.adminClient, "complete-order-checkout");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 30, windowSeconds: 300 });
    if (requestMetadata.ip) {
      await rateLimiter.consume(`ip:${requestMetadata.ip}`, { maxRequests: 120, windowSeconds: 300 });
    }
    await rateLimiter.consume("global", { maxRequests: 800, windowSeconds: 60 });

    const body = await req.json().catch(() => ({}));
    sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) {
      throw new HttpError(400, "session_id requis");
    }

    const stripeRuntime = getStripeRuntimeForCheckoutKind("order");
    const { stripe } = stripeRuntime;

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method", "payment_intent.latest_charge.balance_transaction"],
    });

    if (!session || session.payment_status !== "paid") {
      throw new HttpError(400, "Session Stripe non payee.");
    }

    const checkoutKind = String(session.metadata?.checkout_kind || "order");
    if (checkoutKind !== "order") {
      throw new HttpError(400, "Session Stripe invalide pour une commande.");
    }

    if (String(session.metadata?.user_id || "") !== actor.userId) {
      throw new HttpError(403, "Forbidden");
    }

    assertCheckoutSessionIntegrity({
      session,
      livemode: stripeRuntime.mode === "live",
      expectedCurrency: "CHF",
    });

    const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
    const result = await finalizePaidOrderCheckout({
      adminClient: actor.adminClient,
      session,
      cardBrand: paymentDetails.cardBrand,
      cardLast4: paymentDetails.cardLast4,
      billingPhone: paymentDetails.billingPhone,
      log,
      shouldDispatchNotifications: true,
    });

    const expandedPaymentIntent = session.payment_intent && typeof session.payment_intent === "object"
      ? session.payment_intent
      : null;
    const latestCharge = expandedPaymentIntent?.latest_charge && typeof expandedPaymentIntent.latest_charge === "object"
      ? expandedPaymentIntent.latest_charge
      : null;
    const balanceTransaction = latestCharge?.balance_transaction && typeof latestCharge.balance_transaction === "object"
      ? latestCharge.balance_transaction
      : null;
    const stripeFeeCents = Number.isFinite(Number(balanceTransaction?.fee))
      ? Math.max(0, Math.round(Number(balanceTransaction?.fee)))
      : null;
    const taxCents = session.total_details?.amount_tax ?? null;

    await recordReconciledCheckoutFinance({
      adminClient: actor.adminClient,
      checkoutSessionId: session.id,
      paymentIntentId: readStripeObjectId(session.payment_intent),
      checkoutKind: "order",
      restaurantId: session.metadata?.restaurant_id || null,
      grossCents: Number(session.amount_total || 0),
      currency: session.currency || "chf",
      livemode: stripeRuntime.mode === "live",
      metadata: {
        ...session.metadata,
        reconciliation_source: "complete-order-checkout",
        finance_routing_mode: session.metadata?.finance_routing_mode || "legacy_manual",
        tax_cents: taxCents,
        vat_reconciliation_required: taxCents == null,
        stripe_fee_cents: stripeFeeCents,
        stripe_fee_reconciliation_required: stripeFeeCents == null,
      },
      log,
    });

    if (session.metadata?.payment_attempt_version === "2") {
      await finalizePaymentAttempt({
        adminClient: actor.adminClient,
        attemptId: session.metadata.payment_attempt_id || null,
        operationKey: session.metadata.operation_key || null,
        checkoutSessionId: session.id,
        paymentIntentId: readStripeObjectId(session.payment_intent),
        subscriptionId: readStripeObjectId(session.subscription),
        livemode: stripeRuntime.mode === "live",
        amountCents: session.amount_total,
        currency: session.currency,
        metadata: { finalized_by: "complete-order-checkout" },
      });
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "complete-order-checkout",
      action: "complete_paid_order_checkout",
      status: "success",
      targetEntityType: "stripe_session",
      targetEntityId: session.id,
      metadata: {
        order_ids: result.orders.map((order) => order.id),
      },
    });

    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    log.error("complete_order_checkout_failed", {
      message: error instanceof Error ? error.message : "unknown",
      sessionId,
    });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "complete-order-checkout",
      action: "complete_paid_order_checkout",
      status: "failure",
      targetEntityType: sessionId ? "stripe_session" : null,
      targetEntityId: sessionId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      500,
      corsHeaders,
    );
  }
});
