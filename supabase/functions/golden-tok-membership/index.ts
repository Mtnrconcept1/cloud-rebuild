import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { makeLogger } from "../_shared/logging.ts";

const FUNCTION_NAME = "golden-tok-membership";
const CHECKOUT_KIND = "golden-tok-accreditation";
const CHECKOUT_RETURN_URL = "https://www.thetok.ch/dashboard/formules";

type Accreditation = {
  restaurant_id: string;
  status: string;
  subscription_status: string;
  stripe_mode: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  checkout_lock_until: string | null;
};

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405, corsHeaders);

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId: string | null = null;
  let action = "checkout";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Authentification requise");
    await assertProductionFlowAllowed(actor, "Abonnement La Tok d’Or");

    const body = await req.json().catch(() => ({}));
    restaurantId = typeof body.restaurant_id === "string" ? body.restaurant_id.trim() : "";
    action = typeof body.action === "string" ? body.action : "checkout";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)) {
      throw new HttpError(400, "Restaurant invalide");
    }
    if (!["checkout", "cancel", "resume"].includes(action)) throw new HttpError(400, "Action invalide");
    await requireRestaurantAccess(actor, restaurantId);

    const admin = actor.adminClient;
    const { data: restaurant, error: restaurantError } = await admin.from("restaurants")
      .select("id, is_active, is_demo").eq("id", restaurantId).maybeSingle();
    if (restaurantError || !restaurant || restaurant.is_demo || !restaurant.is_active) {
      throw new HttpError(403, "Restaurant réel et actif requis");
    }

    const { data: record, error: recordError } = await admin.from("golden_tok_accreditations")
      .select("restaurant_id, status, subscription_status, stripe_mode, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id, checkout_lock_until")
      .eq("restaurant_id", restaurantId).maybeSingle();
    if (recordError) throw new HttpError(500, recordError.message);
    if (!record) throw new HttpError(409, "Déposez d'abord votre candidature");

    const membership = record as Accreditation;
    const { stripe, mode } = getStripeRuntimeForCheckoutKind(CHECKOUT_KIND);
    if (mode !== "live") throw new HttpError(503, "Stripe Live requis");

    if (action === "cancel" || action === "resume") {
      if (!membership.stripe_subscription_id || membership.stripe_mode !== "live") {
        throw new HttpError(409, "Aucun abonnement La Tok d’Or modifiable");
      }
      const existing = await stripe.subscriptions.retrieve(membership.stripe_subscription_id);
      if (existing.metadata?.checkout_kind !== CHECKOUT_KIND ||
        existing.metadata?.restaurant_id !== restaurantId) {
        throw new HttpError(409, "Abonnement non attribué à ce restaurant");
      }
      if (!["active", "past_due"].includes(existing.status)) {
        throw new HttpError(409, "État d’abonnement non modifiable");
      }
      if (action === "resume" && membership.status !== "approved") {
        throw new HttpError(409, "Agrément non approuvé");
      }
      const updated = await stripe.subscriptions.update(existing.id, {
        cancel_at_period_end: action === "cancel",
      });
      const { error: updateError } = await admin.from("golden_tok_accreditations")
        .update({ cancel_at_period_end: updated.cancel_at_period_end, updated_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId).eq("stripe_subscription_id", existing.id);
      if (updateError) throw new HttpError(500, updateError.message);
      await writeAuditLog({
        adminClient: admin, actor, request: req, functionName: FUNCTION_NAME,
        action, status: "success", targetEntityType: "golden_tok_accreditation",
        targetEntityId: restaurantId, metadata: { stripe_subscription_id: existing.id },
      });
      return jsonResponse({ ok: true, cancel_at_period_end: updated.cancel_at_period_end }, 200, corsHeaders);
    }

    if (membership.status !== "approved") {
      throw new HttpError(403, "Votre agrément La Tok d’Or doit être approuvé");
    }
    if (membership.stripe_subscription_id) {
      throw new HttpError(409, "Un abonnement existe déjà. Consultez son état ou contactez TOK.");
    }

    // No amount is hard-coded: TOK must explicitly configure a recurring CHF monthly Stripe Price.
    const priceId = (Deno.env.get("GOLDEN_TOK_STRIPE_PRICE_ID") || "").trim();
    if (!/^price_[a-zA-Z0-9]+$/.test(priceId)) {
      throw new HttpError(503, "Tarif La Tok d’Or non encore configuré");
    }
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.currency !== "chf" || price.type !== "recurring" ||
      price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1 ||
      !price.unit_amount || price.unit_amount <= 0) {
      throw new HttpError(503, "Le tarif Stripe doit être un abonnement mensuel CHF actif");
    }

    if (membership.stripe_checkout_session_id) {
      const priorSession = await stripe.checkout.sessions.retrieve(membership.stripe_checkout_session_id);
      if (priorSession.mode === "subscription" && priorSession.metadata?.restaurant_id === restaurantId) {
        if (priorSession.status === "open" && priorSession.url) {
          return jsonResponse({ ok: true, url: priorSession.url, reused: true }, 200, corsHeaders);
        }
        if (priorSession.status === "complete") {
          throw new HttpError(409, "Paiement en cours de confirmation. Veuillez patienter.");
        }
      }
    }

    const now = new Date();
    const lockUntil = new Date(now.getTime() + 90_000).toISOString();
    // Atomic compare-and-set: concurrent tabs cannot open two Stripe subscriptions.
    const { data: lease, error: leaseError } = await admin.from("golden_tok_accreditations")
      .update({ checkout_lock_until: lockUntil })
      .eq("restaurant_id", restaurantId)
      .eq("status", "approved")
      .is("stripe_subscription_id", null)
      .or(`checkout_lock_until.is.null,checkout_lock_until.lt.${now.toISOString()}`)
      .select("restaurant_id").maybeSingle();
    if (leaseError) throw new HttpError(500, leaseError.message);
    if (!lease) throw new HttpError(409, "Un paiement est déjà en préparation");

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        client_reference_id: restaurantId,
        line_items: [{ price: price.id, quantity: 1 }],
        ...(membership.stripe_customer_id ? { customer: membership.stripe_customer_id } : {}),
        allow_promotion_codes: false,
        billing_address_collection: "required",
        success_url: `${CHECKOUT_RETURN_URL}?golden_tok=success`,
        cancel_url: `${CHECKOUT_RETURN_URL}?golden_tok=cancelled`,
        metadata: {
          checkout_kind: CHECKOUT_KIND,
          restaurant_id: restaurantId,
          user_id: actor.userId,
          stripe_mode: "live",
        },
        subscription_data: { metadata: { checkout_kind: CHECKOUT_KIND, restaurant_id: restaurantId } },
      }, { idempotencyKey: `golden-tok:${restaurantId}:${Math.floor(now.getTime() / 900000)}` });

      if (!session.url) throw new Error("URL de paiement Stripe indisponible");
      const { error: saveError } = await admin.from("golden_tok_accreditations")
        .update({
          stripe_checkout_session_id: session.id,
          checkout_lock_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("restaurant_id", restaurantId).eq("checkout_lock_until", lockUntil);
      if (saveError) {
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
        throw new HttpError(500, saveError.message);
      }
      await writeAuditLog({
        adminClient: admin, actor, request: req, functionName: FUNCTION_NAME,
        action: "checkout", status: "success", targetEntityType: "golden_tok_accreditation",
        targetEntityId: restaurantId, metadata: { stripe_checkout_session_id: session.id, stripe_price_id: price.id },
      });
      return jsonResponse({ ok: true, url: session.url }, 200, corsHeaders);
    } finally {
      await admin.from("golden_tok_accreditations")
        .update({ checkout_lock_until: null })
        .eq("restaurant_id", restaurantId).eq("checkout_lock_until", lockUntil);
    }
  } catch (error) {
    log.error("golden_tok_membership_error", { action, message: error instanceof Error ? error.message : "unknown" });
    const status = error instanceof HttpError ? error.status : 500;
    // Never expose a raw Stripe error or a secret in a client-visible response.
    const message = error instanceof HttpError ? error.message : "Paiement temporairement indisponible";
    return jsonResponse({ ok: false, error: message }, status, corsHeaders);
  }
});
