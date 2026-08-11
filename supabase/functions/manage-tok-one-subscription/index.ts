import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getTokOneStripeRuntime, getTokOneStripeRuntimeForCheckoutSession } from "../_shared/stripe-client.ts";
import {
  getLatestTokOneSubscription,
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";

type SubscriptionAction = "cancel" | "resume" | "sync_checkout_session";

const SUBSCRIPTION_CANCELLATION_NOTICE_DAYS = 3;
const SUBSCRIPTION_CANCELLATION_NOTICE_MS = SUBSCRIPTION_CANCELLATION_NOTICE_DAYS * 24 * 60 * 60 * 1000;

function normalizeAction(value: unknown): SubscriptionAction {
  if (value === "sync_checkout_session") return "sync_checkout_session";
  return value === "resume" ? "resume" : "cancel";
}

function getSubscriptionFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (!session.subscription) return null;
  if (typeof session.subscription === "string") return null;
  return session.subscription as Stripe.Subscription;
}

function getAuditAction(action: SubscriptionAction) {
  if (action === "sync_checkout_session") return "sync_tok_one_subscription_checkout";
  return action === "cancel" ? "cancel_tok_one_subscription" : "resume_tok_one_subscription";
}

function assertCancellationNoticeWindow(periodEndIso: string | null | undefined) {
  const periodEnd = Date.parse(periodEndIso || "");
  if (!Number.isFinite(periodEnd)) {
    throw new HttpError(409, "Periode Tok One non synchronisee");
  }

  const latestCancellationAt = periodEnd - SUBSCRIPTION_CANCELLATION_NOTICE_MS;
  if (Date.now() > latestCancellationAt) {
    throw new HttpError(
      409,
      `Il faut resilier Tok One au plus tard ${SUBSCRIPTION_CANCELLATION_NOTICE_DAYS} jours avant la fin de la periode payee. Passe ce delai, l'abonnement repart pour 30 jours.`,
    );
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("manage-tok-one-subscription");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action: SubscriptionAction = "cancel";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    await assertProductionFlowAllowed(actor, "abonnement Tok One réel");
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body?.action);

    if (action === "sync_checkout_session") {
      const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
      if (!sessionId) {
        throw new HttpError(400, "session_id requis");
      }

      const stripeRuntime = getTokOneStripeRuntimeForCheckoutSession(sessionId);
      const session = await stripeRuntime.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });

      const metadata = session.metadata || {};
      if (metadata.checkout_kind !== "tok-one") {
        throw new HttpError(400, "Session Stripe invalide pour Tok One");
      }

      if (metadata.user_id !== actor.userId) {
        throw new HttpError(403, "Session Stripe rattachee a un autre utilisateur");
      }

      if (session.status !== "complete") {
        throw new HttpError(409, "Session Stripe Tok One non finalisee");
      }

      let stripeSubscription = getSubscriptionFromCheckoutSession(session);
      if (!stripeSubscription && typeof session.subscription === "string") {
        stripeSubscription = await stripeRuntime.stripe.subscriptions.retrieve(session.subscription);
      }

      if (!stripeSubscription) {
        throw new HttpError(409, "Abonnement Stripe Tok One introuvable");
      }

      const syncResult = await syncTokOneSubscriptionRecord({
        adminClient: actor.adminClient,
        subscription: stripeSubscription,
        fallbackUserId: actor.userId,
        fallbackPlanId: typeof metadata.plan_id === "string" ? metadata.plan_id : null,
        stripeMode: stripeRuntime.mode,
        stripeCheckoutSessionId: session.id,
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "manage-tok-one-subscription",
        action: getAuditAction(action),
        status: "success",
        targetEntityType: "tok_one_subscriptions",
        targetEntityId: syncResult.row?.id || null,
        metadata: {
          stripe_subscription_id: stripeSubscription.id,
          stripe_checkout_session_id: session.id,
          stripe_mode: stripeRuntime.mode,
          stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
        },
      });

      return jsonResponse({
        ok: true,
        subscription: syncResult.row,
      }, 200, corsHeaders);
    }

    const subscription = await getLatestTokOneSubscription(actor.adminClient, actor.userId);
    if (!subscription) {
      throw new HttpError(404, "Aucun abonnement Tok One introuvable");
    }

    if (!isTokOneEntitledStatus(subscription.status) && action === "cancel") {
      throw new HttpError(409, "Aucun abonnement actif a resilier");
    }

    if (String(subscription.billing_provider || "").toLowerCase() === "apple") {
      throw new HttpError(
        409,
        "APPLE_MANAGED_SUBSCRIPTION: cet abonnement Tok One est géré par Apple. Utilisez la gestion des abonnements Apple pour le modifier ou le résilier.",
      );
    }

    if (action === "cancel") {
      assertCancellationNoticeWindow(subscription.current_period_end);
    }

    if (subscription.stripe_subscription_id) {
      const stripeRuntime = getTokOneStripeRuntime(subscription.stripe_mode);

      const stripeSubscription = await stripeRuntime.stripe.subscriptions.update(
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
        stripeMode: stripeRuntime.mode,
        stripeCheckoutSessionId: subscription.stripe_checkout_session_id || null,
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "manage-tok-one-subscription",
        action: getAuditAction(action),
        status: "success",
        targetEntityType: "tok_one_subscriptions",
        targetEntityId: subscription.id,
        metadata: {
          stripe_subscription_id: stripeSubscription.id,
          cancel_at_period_end: stripeSubscription.cancel_at_period_end,
          stripe_mode: stripeRuntime.mode,
          stripe_key_scope: stripeRuntime.isolatedTokOneKey ? "tok_one" : "default",
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
      action: getAuditAction(action),
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
    log.error("manage-tok-one-subscription error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "manage-tok-one-subscription",
      action: getAuditAction(action),
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
