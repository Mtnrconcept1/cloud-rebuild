import { assertProductionFlowAllowed, authenticateRequest, HttpError, jsonResponse, requireRestaurantAccess, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "../_shared/stripe-client.ts";

Deno.serve(async req => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    await assertProductionFlowAllowed(actor, "rattachement Elite");
    const body = await req.json();
    const source = String(body.source_restaurant_id || "");
    const target = String(body.restaurant_id || "");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(source) || !uuid.test(target)) throw new HttpError(400, "restaurant_required");
    await requireRestaurantAccess(actor, source);
    await requireRestaurantAccess(actor, target);
    const { data: request, error } = await actor.adminClient.rpc("prepare_restaurant_seat", {
      p_source: source, p_target: target, p_actor: actor.userId,
    });
    if (error) throw new HttpError(409, "Rattachement indisponible : vérifiez le contrat Elite et les rattachements en cours.");
    if (request.status === "completed") return jsonResponse({ ok: true }, 200, cors);
    const runtime = getStripeRuntimeForCheckoutKindAndMode("restaurant-subscription", "live");
    const subscription = await runtime.stripe.subscriptions.retrieve(request.stripe_subscription_id);
    if (!subscription.livemode || !["active", "trialing"].includes(subscription.status)
      || subscription.cancel_at_period_end || subscription.pending_update) {
      throw new HttpError(409, "Le contrat Stripe doit être actif, sans résiliation ni modification en attente.");
    }
    let addon = subscription.items.data.find(item => item.metadata?.tok_establishment_addon === "true");
    if (request.extra_quantity > 0 && (addon?.quantity || 0) < request.extra_quantity) {
      if (body.accept_additional_billing !== true) throw new HttpError(409, "Confirmez le tarif des établissements supplémentaires.");
      const monthlyCents = Number(request.monthly_cents);
      if (!Number.isInteger(monthlyCents) || monthlyCents <= 0) throw new HttpError(503, "Tarif supplémentaire non configuré.");
      const primary = subscription.items.data.find(item => item.metadata?.tok_establishment_addon !== "true");
      if (!primary) throw new HttpError(409, "Contrat Stripe incomplet.");
      // A paid update must succeed before the database grants the new seat.
      // The durable request id also survives an HTTP timeout after Stripe success.
      if (addon) {
        addon = await runtime.stripe.subscriptionItems.update(addon.id, {
          quantity: request.extra_quantity, payment_behavior: "error_if_incomplete", proration_behavior: "always_invoice",
        }, { idempotencyKey: `tok-elite-seat-${request.id}` });
      } else {
        const interval = primary.price.recurring?.interval;
        if (interval !== "month" && interval !== "year") throw new HttpError(409, "Période non prise en charge.");
        const product = typeof primary.price.product === "string" ? primary.price.product : primary.price.product.id;
        addon = await runtime.stripe.subscriptionItems.create({
          subscription: subscription.id, quantity: request.extra_quantity,
          metadata: { tok_establishment_addon: "true" },
          price_data: { currency: "chf", product, unit_amount: monthlyCents * (interval === "year" ? 11 : 1),
            recurring: { interval }, tax_behavior: primary.price.tax_behavior === "inclusive" || primary.price.tax_behavior === "exclusive" ? primary.price.tax_behavior : undefined },
          payment_behavior: "error_if_incomplete", proration_behavior: "always_invoice",
        }, { idempotencyKey: `tok-elite-seat-${request.id}` });
      }
    }
    const { error: capacityError } = await actor.adminClient.rpc("sync_restaurant_extra_capacity", {
      p_subscription_id: request.subscription_id, p_stripe_subscription_id: subscription.id,
      p_quantity: Math.min(17, addon?.quantity || 0),
    });
    if (capacityError) throw new HttpError(409, "Capacité à réconcilier. Réessayez le même établissement.");
    const { error: completeError } = await actor.adminClient.rpc("complete_restaurant_seat", {
      p_request: request.id, p_stripe_item: addon?.id || null,
    });
    if (completeError) throw new HttpError(409, "Rattachement à réconcilier. Réessayez le même établissement ; aucun second achat ne sera créé.");
    await writeAuditLog({ adminClient: actor.adminClient, actor, request: req,
      functionName: "manage-restaurant-establishments", action: "attach_elite_establishment", status: "success",
      metadata: { source_restaurant_id: source, restaurant_id: target, request_id: request.id } });
    return jsonResponse({ ok: true }, 200, cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    return jsonResponse({ ok: false, error: error instanceof HttpError ? error.message
      : "Paiement ou rattachement non confirmé. Vérifiez votre moyen de paiement puis réessayez le même établissement." }, status, cors);
  }
});
