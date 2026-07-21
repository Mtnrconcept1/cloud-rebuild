import type Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { isClientCheckoutRestaurantEligible } from "../_shared/order-pricing.ts";

function getIntentId(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id || null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    if (!actor.isServiceRole) throw new HttpError(403, "SYSTEM_ACTOR_REQUIRED");

    const { stripe } = getStripeRuntimeForCheckoutKind("match-group");
    const { data: rows, error } = await actor.adminClient.rpc("get_match_group_pending_authorizations", { p_limit: 100 });
    if (error) throw error;

    let authorized = 0;
    let skipped = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const row of rows || []) {
      try {
        const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id, {
          expand: ["payment_intent"],
        });
        const paymentIntentId = getIntentId(session);
        const paymentIntent = session.payment_intent && typeof session.payment_intent === "object"
          ? session.payment_intent
          : paymentIntentId
            ? await stripe.paymentIntents.retrieve(paymentIntentId)
            : null;
        const expectedAmountCents = Math.round(Number(row.subtotal || 0) * 100);
        const identityMatches = Boolean(
          session.livemode
          && session.mode === "payment"
          && session.metadata?.checkout_kind === "match-group"
          && session.metadata?.group_member_order_id === row.member_order_id
          && session.metadata?.group_id === row.group_id
          && session.metadata?.restaurant_id === row.restaurant_id
          && session.metadata?.user_id === row.user_id
        );
        const authorizationReady = Boolean(
          identityMatches
          && session.status === "complete"
          && paymentIntent
          && paymentIntent.capture_method === "manual"
          && paymentIntent.status === "requires_capture"
          && paymentIntent.currency === "chf"
          && paymentIntent.amount === expectedAmountCents
          && paymentIntent.amount_capturable === expectedAmountCents
        );

        const terminateRejectedAuthorization = async (reason: string) => {
          if (session.status === "open") {
            try {
              await stripe.checkout.sessions.expire(session.id, {}, {
                idempotencyKey: `match-group:expire-rejected:${row.member_order_id}:${session.id}`.slice(0, 255),
              });
            } catch (expireError) {
              const recoveredSession = await stripe.checkout.sessions.retrieve(session.id);
              if (recoveredSession.status === "open") throw expireError;
            }
          }

          if (paymentIntent?.status === "requires_capture" && paymentIntentId) {
            try {
              await stripe.paymentIntents.cancel(paymentIntentId, {
                cancellation_reason: "abandoned",
              }, {
                idempotencyKey: `match-group:cancel-rejected:${row.member_order_id}:${paymentIntentId}`.slice(0, 255),
              });
            } catch (cancelError) {
              const recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
              if (recoveredIntent.status !== "canceled") throw cancelError;
            }
          } else if (paymentIntent?.status === "succeeded") {
            return false;
          }

          const { error: terminalError } = await actor.adminClient.rpc(
            "mark_match_group_member_capture_failed",
            {
              p_member_order_id: row.member_order_id,
              p_error: reason,
              p_terminal: true,
            },
          );
          if (terminalError) throw terminalError;
          return true;
        };

        if (identityMatches) {
          const { data: checkoutRestaurant, error: restaurantError } = await actor.adminClient
            .from("restaurants")
            .select("id,is_active,status,is_demo")
            .eq("id", row.restaurant_id)
            .maybeSingle();
          if (restaurantError) throw restaurantError;

          if (!isClientCheckoutRestaurantEligible(checkoutRestaurant)) {
            const terminated = await terminateRejectedAuthorization("MATCH_GROUP_RESTAURANT_UNAVAILABLE");
            if (!terminated) throw new Error("MATCH_GROUP_PAYMENT_ALREADY_CAPTURED");
            skipped += 1;
            details.push({
              member_order_id: row.member_order_id,
              status: "restaurant_unavailable",
            });
            continue;
          }
        }

        if (authorizationReady && paymentIntentId && paymentIntent) {
          const { data: marked, error: markError } = await actor.adminClient.rpc(
            "mark_match_group_member_authorized",
            {
              p_member_order_id: row.member_order_id,
              p_checkout_session_id: row.stripe_checkout_session_id,
              p_payment_intent_id: paymentIntentId,
              p_authorized_amount: Number(paymentIntent.amount) / 100,
              p_metadata: {
                stripe_session_status: session.status,
                stripe_payment_status: paymentIntent.status,
                stripe_capture_method: paymentIntent.capture_method,
                stripe_amount_capturable: paymentIntent.amount_capturable,
                authorized_currency: paymentIntent.currency,
              },
            },
          );
          if (markError) throw new Error(markError.message);
          if (marked !== true) {
            const terminated = await terminateRejectedAuthorization("MATCH_GROUP_AUTHORIZATION_REJECTED");
            if (!terminated) throw new Error("MATCH_GROUP_PAYMENT_ALREADY_CAPTURED");
            skipped += 1;
            details.push({
              member_order_id: row.member_order_id,
              status: "authorization_rejected",
            });
            continue;
          }
          authorized += 1;
          details.push({ member_order_id: row.member_order_id, status: "authorized" });
        } else {
          skipped += 1;
          details.push({
            member_order_id: row.member_order_id,
            status: paymentIntent?.status || session.status || "pending",
          });
        }
      } catch (error) {
        skipped += 1;
        details.push({ member_order_id: row.member_order_id, status: "error", error: error instanceof Error ? error.message : "unknown" });
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "reconcile-match-group-authorizations",
      action: "reconcile_authorizations",
      status: "success",
      targetEntityType: "group_member_orders",
      metadata: { authorized, skipped, details },
    });

    return jsonResponse({ ok: true, authorized, skipped, details }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erreur reconciliation Match groupe";
    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "reconcile-match-group-authorizations",
        action: "reconcile_authorizations",
        status: "failure",
        targetEntityType: "group_member_orders",
        errorMessage: message,
      });
    }
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
