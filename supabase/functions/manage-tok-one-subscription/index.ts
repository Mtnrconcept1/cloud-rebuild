import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  getLatestTokOneSubscription,
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";

type SubscriptionAction = "cancel" | "resume";

function normalizeAction(value: unknown): SubscriptionAction {
  return value === "resume" ? "resume" : "cancel";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action: SubscriptionAction = "cancel";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body?.action);

    const subscription = await getLatestTokOneSubscription(actor.adminClient, actor.userId);
    if (!subscription) {
      throw new HttpError(404, "Aucun abonnement Tok One introuvable");
    }

    if (!isTokOneEntitledStatus(subscription.status) && action === "cancel") {
      throw new HttpError(409, "Aucun abonnement actif a resilier");
    }

    if (subscription.stripe_subscription_id) {
      const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
      if (!stripeSecretKey) {
        throw new HttpError(503, "STRIPE_SECRET_KEY not configured");
      }

      const stripe = new Stripe(stripeSecretKey, {
        apiVersion: "2025-08-27.basil",
      });

      const stripeSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          cancel_at_period_end: action === "cancel",
        },
      );

      const syncResult = await syncTokOneSubscriptionRecord({
        adminClient: actor.adminClient,
        subscription: stripeSubscription,
        fallbackUserId: actor.userId,
        fallbackPlanId: subscription.plan_id,
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "manage-tok-one-subscription",
        action: action === "cancel" ? "cancel_tok_one_subscription" : "resume_tok_one_subscription",
        status: "success",
        targetEntityType: "tok_one_subscriptions",
        targetEntityId: subscription.id,
        metadata: {
          stripe_subscription_id: stripeSubscription.id,
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
        },
      });

      return jsonResponse({
        ok: true,
        subscription: syncResult.row,
      }, 200, corsHeaders);
    }

    const localPayload = {
      cancel_at_period_end: action === "cancel",
    };

    const { data: updatedSubscription, error: updateError } = await actor.adminClient
      .from("tok_one_subscriptions")
      .update(localPayload)
      .eq("id", subscription.id)
      .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id")
      .single();

    if (updateError) throw new HttpError(500, updateError.message);

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "manage-tok-one-subscription",
      action: action === "cancel" ? "cancel_tok_one_subscription" : "resume_tok_one_subscription",
      status: "success",
      targetEntityType: "tok_one_subscriptions",
      targetEntityId: subscription.id,
      metadata: {
        stripe_subscription_id: null,
        cancel_at_period_end: localPayload.cancel_at_period_end,
        mode: "local_fallback",
      },
    });

    return jsonResponse({
      ok: true,
      subscription: updatedSubscription,
    }, 200, corsHeaders);
  } catch (error) {
    console.error("manage-tok-one-subscription error:", error);
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "manage-tok-one-subscription",
      action: action === "cancel" ? "cancel_tok_one_subscription" : "resume_tok_one_subscription",
      status: "failure",
      targetEntityType: "tok_one_subscriptions",
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
