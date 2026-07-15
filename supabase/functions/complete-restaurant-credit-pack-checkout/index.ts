import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  buildRequestMetadata,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

function toAmountChf(value: number | null | undefined) {
  return Math.round(((value || 0) / 100) * 100) / 100;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("complete-restaurant-credit-pack-checkout");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let sessionId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    await assertProductionFlowAllowed(actor, "achat de crédits réel");

    const requestMetadata = buildRequestMetadata(req);
    const rateLimiter = createRateLimiter(actor.adminClient, "complete-restaurant-credit-pack-checkout");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 30, windowSeconds: 300 });
    if (requestMetadata.ip) {
      await rateLimiter.consume(`ip:${requestMetadata.ip}`, { maxRequests: 120, windowSeconds: 300 });
    }
    await rateLimiter.consume("global", { maxRequests: 800, windowSeconds: 60 });

    const body = await req.json().catch(() => ({}));
    sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const requestedRestaurantId = typeof body?.restaurant_id === "string" ? body.restaurant_id.trim() : "";
    let fallbackPurchase: {
      id: string;
      restaurant_id: string;
      credit_pack_id: string;
      stripe_checkout_session_id: string | null;
    } | null = null;

    if (!sessionId) {
      if (!requestedRestaurantId) throw new HttpError(400, "session_id requis");
      await requireRestaurantAccess(actor, requestedRestaurantId);

      const { data: pendingPurchase, error: pendingPurchaseError } = await actor.adminClient
        .from("restaurant_credit_purchases")
        .select("id, restaurant_id, credit_pack_id, stripe_checkout_session_id")
        .eq("restaurant_id", requestedRestaurantId)
        .eq("purchased_by", actor.userId)
        .eq("status", "pending_payment")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .not("stripe_checkout_session_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingPurchaseError) throw new HttpError(500, pendingPurchaseError.message);
      if (!pendingPurchase?.stripe_checkout_session_id) {
        return jsonResponse({ ok: true, no_pending_purchase: true }, 200, corsHeaders);
      }

      fallbackPurchase = pendingPurchase;
      sessionId = pendingPurchase.stripe_checkout_session_id;
    }

    const stripeRuntime = getStripeRuntimeForCheckoutKind("restaurant-credit-pack");
    const session = await stripeRuntime.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method"],
    });

    if (!session || session.payment_status !== "paid") {
      throw new HttpError(400, "Session Stripe non payee.");
    }

    const checkoutKind = String(session.metadata?.checkout_kind || "");
    if (checkoutKind !== "restaurant-credit-pack") {
      throw new HttpError(400, "Session Stripe invalide pour une recharge de credits.");
    }

    const metadataUserId = String(session.metadata?.user_id || "");
    if (metadataUserId && metadataUserId !== actor.userId) {
      throw new HttpError(403, "Forbidden");
    }
    if (!metadataUserId && !fallbackPurchase) throw new HttpError(403, "Forbidden");

    const restaurantId = String(session.metadata?.restaurant_id || fallbackPurchase?.restaurant_id || "");
    const creditPackId = String(
      session.metadata?.restaurant_credit_pack_id || session.metadata?.credit_pack_id || fallbackPurchase?.credit_pack_id || "",
    );
    const purchaseId = String(
      session.metadata?.restaurant_credit_purchase_id || session.metadata?.credit_pack_purchase_id || fallbackPurchase?.id || "",
    );

    if (!restaurantId || !creditPackId || !purchaseId) {
      throw new HttpError(400, "Metadonnees Stripe incompletes pour la recharge de credits.");
    }

    await requireRestaurantAccess(actor, restaurantId);

    const { data: purchase, error: purchaseError } = await actor.adminClient
      .from("restaurant_credit_purchases")
      .select("id, restaurant_id, credit_pack_id, status, price_chf, stripe_checkout_session_id")
      .eq("id", purchaseId)
      .maybeSingle();

    if (purchaseError) throw new HttpError(500, purchaseError.message);
    if (!purchase) throw new HttpError(404, "Achat de credits introuvable.");
    if (purchase.restaurant_id !== restaurantId || purchase.credit_pack_id !== creditPackId) {
      throw new HttpError(409, "La session Stripe ne correspond pas a cet achat de credits.");
    }
    if (purchase.stripe_checkout_session_id && purchase.stripe_checkout_session_id !== session.id) {
      throw new HttpError(409, "Session Stripe differente de celle enregistree pour cet achat.");
    }

    const amountChf = toAmountChf(session.amount_total);
    const expectedAmountChf = Number(purchase.price_chf || 0);
    if (Math.round(amountChf * 100) !== Math.round(expectedAmountChf * 100)) {
      throw new HttpError(409, "Montant Stripe different du prix de la recharge.");
    }

    if (purchase.status !== "paid") {
      const { error: updateError } = await actor.adminClient
        .from("restaurant_credit_purchases")
        .update({
          status: "paid",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
          stripe_mode: stripeRuntime.mode,
          paid_at: new Date().toISOString(),
          metadata: {
            ...(session.metadata || {}),
            checkout_kind: "restaurant-credit-pack",
            reconciled_from_return: true,
            stripe_mode: stripeRuntime.mode,
          },
        })
        .eq("id", purchase.id);

      if (updateError) throw new HttpError(500, updateError.message);
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "complete-restaurant-credit-pack-checkout",
      action: "complete_restaurant_credit_pack_checkout",
      status: "success",
      targetEntityType: "restaurant_credit_purchases",
      targetEntityId: purchase.id,
      metadata: {
        restaurant_id: restaurantId,
        credit_pack_id: creditPackId,
        stripe_checkout_session_id: session.id,
        already_paid: purchase.status === "paid",
      },
    });

    return jsonResponse({
      ok: true,
      purchase_id: purchase.id,
      already_paid: purchase.status === "paid",
      stripe_mode: stripeRuntime.mode,
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur activation recharge credits";
    log.error("complete_restaurant_credit_pack_checkout_failed", { message, sessionId });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "complete-restaurant-credit-pack-checkout",
      action: "complete_restaurant_credit_pack_checkout",
      status: "failure",
      targetEntityType: sessionId ? "stripe_session" : null,
      targetEntityId: sessionId || null,
      errorMessage: message,
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

