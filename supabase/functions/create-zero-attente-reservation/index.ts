import type Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { finalizeZeroAttenteCheckout } from "../_shared/zero-attente.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

function getPaymentDetails(session: Stripe.Checkout.Session) {
  const paymentMethodData = session.payment_intent && typeof session.payment_intent === "object"
    ? (session.payment_intent.payment_method as Stripe.PaymentMethod | null)
    : null;

  return {
    cardBrand: paymentMethodData?.card?.brand || null,
    cardLast4: paymentMethodData?.card?.last4 || null,
    billingPhone: paymentMethodData?.billing_details?.phone || null,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("create-zero-attente-reservation");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let sessionId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    await assertProductionFlowAllowed(actor, "réservation Zéro Attente réelle");

    const body = await req.json().catch(() => ({}));
    sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) throw new HttpError(400, "session_id requis");

    const { stripe } = getStripeRuntimeForCheckoutKind("zero-attente");

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method"],
    });

    if (!session || session.payment_status !== "paid") {
      throw new HttpError(400, "Session Stripe non payee.");
    }

    const checkoutKind = String(session.metadata?.checkout_kind || "");
    if (!["zero-attente", "reservation_zero_attente"].includes(checkoutKind)) {
      throw new HttpError(400, "Session Stripe invalide pour Zero Attente.");
    }

    if (String(session.metadata?.user_id || "") !== actor.userId) {
      throw new HttpError(403, "Forbidden");
    }

    const paymentDetails = getPaymentDetails(session);
    const result = await finalizeZeroAttenteCheckout({
      adminClient: actor.adminClient,
      session,
      userId: actor.userId,
      cardBrand: paymentDetails.cardBrand,
      cardLast4: paymentDetails.cardLast4,
      billingPhone: paymentDetails.billingPhone,
      log,
      shouldDispatchNotifications: true,
      fetchLineItems: () => stripe.checkout.sessions.listLineItems(session.id, {
        limit: 100,
        expand: ["data.price.product"],
      }),
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "create-zero-attente-reservation",
      action: "finalize_zero_attente_checkout",
      status: "success",
      targetEntityType: "reservations",
      targetEntityId: result.reservationId,
      metadata: {
        restaurant_id: result.restaurantId,
        stripe_session_id: session.id,
        reservation_already_existed: result.reservationAlreadyExisted,
      },
    });

    return jsonResponse({
      reservation_id: result.reservationId,
      restaurant_id: result.restaurantId,
      restaurant_name: result.restaurantName,
      arrival_date: result.arrivalDate,
      arrival_time: result.arrivalTime,
      party_size: result.partySize,
      payment_method: result.paymentMethod,
      pre_discount_subtotal: result.subtotal,
      total_amount: result.total,
      formula_applied: result.formulaApplied,
      formula_discount_amount: result.formulaDiscount,
      formula_discount_percent: result.formulaDiscountPercent,
      tok_one_member: result.tokOneMember,
      tok_one_discount_amount: result.tokOneDiscount,
      tok_one_discount_percent: result.tokOneDiscountPercent,
      points_to_redeem: result.pointsToRedeem,
      points_discount_amount: result.pointsDiscount,
      twint_phone_number: result.twintPhoneNumber,
      preorder_items: result.preorderItems,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("create-zero-attente-reservation error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "create-zero-attente-reservation",
      action: "finalize_zero_attente_checkout",
      status: "failure",
      targetEntityType: sessionId ? "stripe_session" : "reservations",
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
