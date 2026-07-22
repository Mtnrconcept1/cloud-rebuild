import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRole,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

const REASON_CODES = new Set([
  "subscription_issue",
  "duplicate_topup",
  "commission_overpayment",
  "billing_error",
  "commercial_gesture",
  "other",
]);

function text(value: unknown) {
  return String(value || "").trim();
}

function amountToCents(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    throw new HttpError(400, "Le montant doit être compris entre 0.01 et 100'000 CHF.");
  }
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 0.000001) {
    throw new HttpError(400, "Le montant ne peut pas contenir plus de deux décimales.");
  }
  return cents;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("admin-restaurant-adjustment");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";
  let adjustmentId = "";

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireRole(actor, ["admin"]);
    await assertProductionFlowAllowed(actor, "versement correctif Stripe Connect réel");

    const body = await req.json().catch(() => ({}));
    restaurantId = text(body.restaurant_id);
    const idempotencyKey = text(body.idempotency_key);
    const reasonCode = text(body.reason_code);
    const reasonDetails = text(body.reason_details);
    const amountCents = amountToCents(body.amount_chf);

    if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new HttpError(400, "idempotency_key invalide");
    }
    if (!REASON_CODES.has(reasonCode)) throw new HttpError(400, "Motif invalide");
    if (reasonDetails.length < 12 || reasonDetails.length > 1000) {
      throw new HttpError(400, "Le détail du motif doit contenir entre 12 et 1000 caractères.");
    }

    const adminClient = actor.adminClient;
    const { data: existing } = await adminClient
      .from("restaurant_stripe_adjustments")
      .select("id, restaurant_id, status, stripe_transfer_id, amount_cents, reason_code, reason_details")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) {
      if (
        existing.restaurant_id !== restaurantId
        || existing.amount_cents !== amountCents
        || existing.reason_code !== reasonCode
        || existing.reason_details !== reasonDetails
      ) throw new HttpError(409, "Clé d'idempotence déjà utilisée avec une autre opération.");
      return jsonResponse({
        ok: existing.status === "succeeded",
        adjustment_id: existing.id,
        status: existing.status,
        stripe_transfer_id: existing.stripe_transfer_id,
        replayed: true,
      }, 200, corsHeaders);
    }

    const { data: restaurant, error: restaurantError } = await adminClient
      .from("restaurants")
      .select("id, name, is_demo, stripe_account_id, stripe_connect_details_submitted, stripe_connect_payouts_enabled, stripe_connect_requirements_due")
      .eq("id", restaurantId)
      .maybeSingle();
    if (restaurantError) throw new HttpError(500, restaurantError.message);
    if (!restaurant) throw new HttpError(404, "Restaurant introuvable.");
    if (restaurant.is_demo) throw new HttpError(409, "Versement interdit pour un restaurant de démonstration.");
    if (!restaurant.stripe_account_id) throw new HttpError(409, "Compte Stripe Connect absent.");
    if (!restaurant.stripe_connect_details_submitted || !restaurant.stripe_connect_payouts_enabled || restaurant.stripe_connect_requirements_due?.length) {
      throw new HttpError(409, "Le compte Stripe Connect n'est pas prêt à recevoir des versements.");
    }

    const { stripe } = getStripeRuntimeForCheckoutKind("stripe-connect");
    const stripeAccount = await stripe.accounts.retrieve(restaurant.stripe_account_id);
    if (stripeAccount.deleted) throw new HttpError(409, "Le compte Stripe Connect a été supprimé.");
    if (!stripeAccount.details_submitted || !stripeAccount.payouts_enabled || stripeAccount.requirements?.currently_due?.length) {
      throw new HttpError(409, "Stripe signale que le compte connecté doit compléter ses coordonnées ou son IBAN.");
    }

    const { data: adjustment, error: insertError } = await adminClient
      .from("restaurant_stripe_adjustments")
      .insert({
        restaurant_id: restaurantId,
        requested_by: actor.userId,
        amount_cents: amountCents,
        reason_code: reasonCode,
        reason_details: reasonDetails,
        idempotency_key: idempotencyKey,
        stripe_account_id: restaurant.stripe_account_id,
      })
      .select("id")
      .single();
    if (insertError) throw new HttpError(500, insertError.message);
    adjustmentId = adjustment.id;

    let transfer: { id: string };
    try {
      transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "chf",
        destination: restaurant.stripe_account_id,
        description: `Correction TOK - ${restaurant.name}`.slice(0, 500),
        transfer_group: `restaurant_adjustment_${adjustment.id}`,
        metadata: {
          adjustment_id: adjustment.id,
          restaurant_id: restaurantId,
          reason_code: reasonCode,
        },
      }, { idempotencyKey: `restaurant-adjustment:${idempotencyKey}` });

    } catch (stripeError) {
      const failureMessage = stripeError instanceof Error ? stripeError.message.slice(0, 1000) : "Erreur Stripe";
      await adminClient.from("restaurant_stripe_adjustments").update({
        status: "failed", failure_message: failureMessage, processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", adjustment.id);
      throw stripeError;
    }

    const processedAt = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from("restaurant_stripe_adjustments")
      .update({ status: "succeeded", stripe_transfer_id: transfer.id, processed_at: processedAt, updated_at: processedAt })
      .eq("id", adjustment.id);
    if (updateError) throw new HttpError(500, `Versement Stripe créé mais journal local non finalisé: ${updateError.message}`);

    await writeAuditLog({
      adminClient, actor, request: req,
      functionName: "admin-restaurant-adjustment",
      action: "create_restaurant_stripe_adjustment",
      status: "success",
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
      metadata: { adjustment_id: adjustment.id, stripe_transfer_id: transfer.id, amount_cents: amountCents, reason_code: reasonCode },
    });

    return jsonResponse({ ok: true, adjustment_id: adjustment.id, status: "succeeded", stripe_transfer_id: transfer.id }, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { restaurant_id: restaurantId, adjustment_id: adjustmentId, message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(), actor, request: req,
      functionName: "admin-restaurant-adjustment", action: "create_restaurant_stripe_adjustment",
      status: "failure", targetEntityType: restaurantId ? "restaurants" : null, targetEntityId: restaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
      metadata: { adjustment_id: adjustmentId || null },
    });
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, corsHeaders);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erreur interne" }, 500, corsHeaders);
  }
});
