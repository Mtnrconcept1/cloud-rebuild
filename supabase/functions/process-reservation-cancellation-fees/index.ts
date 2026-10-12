import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

type FeeRow = {
  fee_id: string;
  reservation_id: string;
  user_id: string;
  amount_cents: number;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  stripe_payment_intent_id: string | null;
};
type RestaurantConnect = {
  stripe_account_id: string | null;
  stripe_connect_charges_enabled: boolean | null;
  stripe_connect_payouts_enabled: boolean | null;
};
function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}
function diagnostic(error: unknown) {
  const raw = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error ? error.name : "unknown";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  const log = makeLogger("process-reservation-cancellation-fees");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  try {
    actor = await authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true });
    if (!actor.isServiceRole) return jsonResponse({ ok: false, error: "forbidden" }, 403, cors);
    if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, cors);

    // No live off-session debit until terms, Stripe Test verification and
    // destination-charge accounting have been approved by TOK operations.
    if (Deno.env.get("TOK_RESERVATION_CANCELLATION_COLLECTION_ENABLED") !== "true") {
      return jsonResponse({ ok: true, enabled: false, processed: 0 }, 200, cors);
    }

    const runtime = getStripeRuntimeForCheckoutKind("reservation");
    if (runtime.mode !== "live") throw new Error("STRIPE_MODE_MISMATCH");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const limit = Math.min(50, Math.max(1, Math.floor(Number(body.limit) || 20)));
    const { data, error } = await actor.adminClient.rpc("claim_reservation_cancellation_fees", {
      p_limit: limit,
    });
    if (error) throw new Error("FEE_CLAIM_FAILED");
    const fees = (data || []) as FeeRow[];
    const totals = { claimed: fees.length, paid: 0, failed: 0, requires_action: 0, retry: 0 };

    for (const fee of fees) {
      try {
        const { data: booking, error: lookupError } = await actor.adminClient
          .from("reservations")
          .select("status, cancelled_by, restaurant_id, user_id, party_size")
          .eq("id", fee.reservation_id).maybeSingle();
        if (lookupError || !booking || booking.status !== "cancelled"
          || booking.cancelled_by !== "customer" || booking.user_id !== fee.user_id
          || booking.party_size * 1000 !== fee.amount_cents) {
          throw new Error("FEE_RESERVATION_INTEGRITY_FAILED");
        }
        const { data: restaurant, error: restaurantError } = await actor.adminClient
          .from("restaurants")
          .select("stripe_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled")
          .eq("id", booking.restaurant_id).maybeSingle();
        if (restaurantError || !restaurant) throw new Error("RESTAURANT_NOT_FOUND");
        const connect = restaurant as RestaurantConnect;
        if (!connect.stripe_account_id || !connect.stripe_connect_charges_enabled
          || !connect.stripe_connect_payouts_enabled) {
          throw new Error("RESTAURANT_CONNECT_NOT_READY");
        }

        let intent;
        if (fee.stripe_payment_intent_id) {
          intent = await runtime.stripe.paymentIntents.retrieve(fee.stripe_payment_intent_id);
        } else {
          intent = await runtime.stripe.paymentIntents.create({
            amount: fee.amount_cents,
            currency: "chf",
            customer: fee.stripe_customer_id,
            payment_method: fee.stripe_payment_method_id,
            confirm: false,
            transfer_data: { destination: connect.stripe_account_id },
            description: "TOK - frais d'annulation acceptes lors de la reservation",
            metadata: {
              tok_purpose: "reservation_cancellation_fee",
              fee_id: fee.fee_id,
              reservation_id: fee.reservation_id,
              user_id: fee.user_id,
              beneficiary_restaurant_id: booking.restaurant_id,
            },
          }, { idempotencyKey: `tok:cancellation-fee:create:${fee.fee_id}` });

          const { data: bound, error: bindError } = await actor.adminClient
            .from("reservation_cancellation_fees")
            .update({ stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString() })
            .eq("id", fee.fee_id).eq("status", "processing")
            .is("stripe_payment_intent_id", null).select("id").maybeSingle();
          if (bindError || !bound) throw new Error("FEE_BIND_FAILED");
        }

        if (intent.currency !== "chf" || intent.amount !== fee.amount_cents
          || objectId(intent.customer) !== fee.stripe_customer_id
          || objectId(intent.payment_method) !== fee.stripe_payment_method_id
          || intent.metadata?.fee_id !== fee.fee_id
          || intent.transfer_data?.destination !== connect.stripe_account_id) {
          throw new Error("FEE_INTENT_INTEGRITY_FAILED");
        }

        if (intent.status === "requires_confirmation") {
          try {
            intent = await runtime.stripe.paymentIntents.confirm(intent.id,
              { off_session: true },
              { idempotencyKey: `tok:cancellation-fee:confirm:${fee.fee_id}` });
          } catch (confirmationError) {
            // Recover the exact same Stripe object if HTTP failed after success.
            const checked = await runtime.stripe.paymentIntents.retrieve(intent.id);
            if (["succeeded", "requires_action", "requires_payment_method", "processing"].includes(checked.status)) {
              intent = checked;
            } else {
              throw confirmationError;
            }
          }
        }

        const outcome = intent.status === "succeeded" ? "paid"
          : intent.status === "requires_action" ? "requires_action"
          : ["requires_payment_method", "canceled"].includes(intent.status) ? "failed"
          : "processing";

        const { error: updateError } = await actor.adminClient.from("reservation_cancellation_fees")
          .update({
            status: outcome,
            lease_until: outcome === "processing" ? new Date(Date.now() + 5 * 60_000).toISOString() : null,
            last_error_code: outcome === "paid" ? null : intent.status,
            paid_at: outcome === "paid" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq("id", fee.fee_id).eq("stripe_payment_intent_id", intent.id);
        if (updateError) throw new Error("FEE_PERSIST_FAILED");
        if (outcome === "paid") totals.paid++;
        else if (outcome === "requires_action") totals.requires_action++;
        else if (outcome === "failed") totals.failed++;
        else totals.retry++;
      } catch (feeError) {
        const code = diagnostic(feeError);
        log.warn("cancellation_fee_pending_review", { fee_id: fee.fee_id, reason: code });
        // Keep processing lease: on restart, the already bound Stripe Intent
        // is retrieved, never replaced with another charged Intent.
        const { error: markError } = await actor.adminClient.from("reservation_cancellation_fees")
          .update({ status: "processing", lease_until: new Date(Date.now() + 15 * 60_000).toISOString(),
            last_error_code: code, updated_at: new Date().toISOString() })
          .eq("id", fee.fee_id).eq("status", "processing");
        if (markError) log.error("fee_error_persist_failed", { fee_id: fee.fee_id });
        totals.retry++;
      }
    }
    await writeAuditLog({ adminClient: actor.adminClient, actor, request: req,
      functionName: "process-reservation-cancellation-fees", action: "collect_consent_based_fees",
      status: "success", metadata: totals });
    return jsonResponse({ ok: true, enabled: true, ...totals }, 200, cors);
  } catch (error) {
    log.error("cancellation_fee_batch_failed", { code: diagnostic(error) });
    return jsonResponse({ ok: false, error: "cancellation_fee_batch_failed" }, 500, cors);
  }
});
