import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import {
  calculateOrderPaymentDistribution,
  recordReconciledCheckoutFinance,
} from "../_shared/marketplace-finance.ts";

function toCents(value: unknown) {
  const parsed = Number(value);
  return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : 0) * 100));
}

function isTerminalStripeError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  const type = String((error as { type?: unknown } | null)?.type || "");
  return type === "StripeCardError" || ["payment_intent_unexpected_state", "charge_already_captured"].includes(code);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("capture-due-match-groups");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    if (!actor.isServiceRole) throw new HttpError(403, "SYSTEM_ACTOR_REQUIRED");

    const { stripe } = getStripeRuntimeForCheckoutKind("match-group");

    await actor.adminClient.rpc("close_due_match_groups");

    const { data: candidates, error } = await actor.adminClient.rpc("get_match_group_capture_candidates", {
      p_limit: 100,
    });

    if (error) throw error;

    let captured = 0;
    let failed = 0;
    const details: Array<Record<string, unknown>> = [];

    for (const candidate of candidates || []) {
      const memberOrderId = candidate.member_order_id;
      const paymentIntentId = candidate.stripe_payment_intent_id;
      const amountToCapture = toCents(candidate.final_total);

      if (!memberOrderId || !paymentIntentId || amountToCapture <= 0) continue;

      try {
        const authorization = await stripe.paymentIntents.retrieve(paymentIntentId);
        const identityMatches = Boolean(
          authorization.livemode
          && authorization.capture_method === "manual"
          && authorization.currency === "chf"
          && authorization.metadata?.checkout_kind === "match-group"
          && authorization.metadata?.group_member_order_id === memberOrderId
          && authorization.metadata?.group_id === candidate.group_id
          && authorization.metadata?.restaurant_id === candidate.restaurant_id
          && authorization.metadata?.user_id === candidate.user_id
        );
        if (!identityMatches) throw new Error("MATCH_GROUP_CAPTURE_IDENTITY_MISMATCH");
        if (
          authorization.status !== "requires_capture"
          && authorization.status !== "succeeded"
        ) {
          throw new Error(`MATCH_GROUP_CAPTURE_INVALID_STATE:${authorization.status}`);
        }

        const platformFeeBps = Number(authorization.metadata?.platform_fee_bps);
        const developerOrderBps = Number(authorization.metadata?.developer_order_bps);
        if (
          authorization.metadata?.finance_snapshot_version !== "fair_growth_v1"
          || !Number.isInteger(platformFeeBps)
          || platformFeeBps < 0
          || platformFeeBps > 990
          || developerOrderBps !== 100
        ) {
          throw new Error("MATCH_GROUP_FINANCE_SNAPSHOT_INVALID");
        }
        const distribution = calculateOrderPaymentDistribution(
          amountToCapture,
          platformFeeBps,
          {
            commissionableCents: amountToCapture,
            tipCents: 0,
            deliveryPassThroughCents: 0,
          },
        );
        let intent = authorization;
        if (authorization.status === "requires_capture") {
          if (authorization.amount_capturable < amountToCapture) {
            throw new Error("MATCH_GROUP_CAPTURE_AMOUNT_EXCEEDS_AUTHORIZATION");
          }
          try {
            intent = await stripe.paymentIntents.capture(paymentIntentId, {
              amount_to_capture: amountToCapture,
              application_fee_amount: distribution.stripeApplicationFeeCents,
            }, {
              idempotencyKey: `match-group:capture:${memberOrderId}:${paymentIntentId}:${amountToCapture}`.slice(0, 255),
            });
          } catch (captureError) {
            const recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (recoveredIntent.status !== "succeeded") throw captureError;
            intent = recoveredIntent;
          }
        }

        if (intent.status !== "succeeded") {
          throw new Error(`MATCH_GROUP_CAPTURE_NOT_SUCCEEDED:${intent.status}`);
        }
        const capturedAmountCents = Number(intent.amount_received || amountToCapture);
        const capturedAmount = capturedAmountCents / 100;

        await recordReconciledCheckoutFinance({
          adminClient: actor.adminClient,
          checkoutSessionId: candidate.stripe_checkout_session_id,
          paymentIntentId,
          checkoutKind: "match-group",
          restaurantId: candidate.restaurant_id,
          grossCents: capturedAmountCents,
          currency: intent.currency,
          livemode: intent.livemode,
          metadata: {
            ...authorization.metadata,
            gross_amount_cents: String(distribution.grossCents),
            commissionable_cents: String(distribution.commissionableCents),
            tip_cents: String(distribution.tipCents),
            delivery_pass_through_cents: String(distribution.deliveryPassThroughCents),
            platform_fee_bps: String(distribution.platformFeeBps),
            platform_fee_amount_cents: String(distribution.platformFeeCents),
            stripe_application_fee_amount_cents:
              String(distribution.stripeApplicationFeeCents),
            restaurant_share_amount_cents: String(distribution.restaurantShareCents),
            restaurant_transfer_amount_cents: String(distribution.restaurantTransferCents),
            developer_order_bps: String(distribution.developerOrderBps),
            developer_share_bps: String(distribution.developerOrderBps),
            developer_share_amount_cents: String(distribution.developerShareCents),
            tok_net_amount_cents: String(distribution.tokNetRevenueCents),
            stripe_fee_reconciliation_required: true,
            vat_reconciliation_required: true,
          },
          log,
        });

        const { data: marked, error: markError } = await actor.adminClient.rpc(
          "mark_match_group_member_captured",
          {
            p_member_order_id: memberOrderId,
            p_payment_intent_id: paymentIntentId,
            p_captured_amount: capturedAmount,
            p_metadata: {
              stripe_payment_intent_status: intent.status,
              amount_to_capture: amountToCapture / 100,
              platform_fee_amount: distribution.platformFeeCents / 100,
              currency: intent.currency,
            },
          },
        );
        if (markError || marked !== true) {
          throw new Error(markError?.message || "MATCH_GROUP_CAPTURE_PERSIST_FAILED");
        }

        captured += 1;
        details.push({ member_order_id: memberOrderId, status: "captured", amount: capturedAmount });
      } catch (captureError) {
        const message = captureError instanceof Error ? captureError.message : "Capture Stripe echouee";
        let capturedAtStripe = false;
        try {
          const recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          capturedAtStripe = recoveredIntent.status === "succeeded";
        } catch {
          capturedAtStripe = false;
        }

        failed += 1;
        if (capturedAtStripe) {
          // Money is already captured: keep the database candidate retryable
          // until ledger and business settlement both succeed.
          details.push({
            member_order_id: memberOrderId,
            status: "settlement_retry",
            error: message,
          });
          continue;
        }

        const terminal = isTerminalStripeError(captureError) || Number(candidate.capture_attempts || 0) >= 4;
        const { error: failureError } = await actor.adminClient.rpc(
          "mark_match_group_member_capture_failed",
          {
            p_member_order_id: memberOrderId,
            p_error: message,
            p_terminal: terminal,
          },
        );
        if (failureError) throw failureError;

        details.push({ member_order_id: memberOrderId, status: terminal ? "failed" : "retry", error: message });
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "capture-due-match-groups",
      action: "capture_authorized_payments",
      status: "success",
      targetEntityType: "group_member_orders",
      metadata: { captured, failed, total: (candidates || []).length, details },
    });

    return jsonResponse({ ok: true, captured, failed, total: (candidates || []).length, details }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erreur capture Match groupe";
    log.error("capture_due_match_groups_failed", { message });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "capture-due-match-groups",
        action: "capture_authorized_payments",
        status: "failure",
        targetEntityType: "group_member_orders",
        errorMessage: message,
      });
    }

    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
