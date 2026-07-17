import type Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

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

        if (session.payment_status === "paid" && paymentIntentId) {
          await actor.adminClient.rpc("mark_match_group_member_authorized", {
            p_member_order_id: row.member_order_id,
            p_checkout_session_id: row.stripe_checkout_session_id,
            p_payment_intent_id: paymentIntentId,
            p_authorized_amount: Number(session.amount_total || 0) / 100,
            p_metadata: {
              stripe_session_status: session.status,
              stripe_payment_status: session.payment_status,
              authorized_currency: session.currency,
            },
          });
          authorized += 1;
          details.push({ member_order_id: row.member_order_id, status: "authorized" });
        } else {
          skipped += 1;
          details.push({ member_order_id: row.member_order_id, status: session.payment_status || "pending" });
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
