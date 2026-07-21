import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { isClientCheckoutRestaurantEligible } from "../_shared/order-pricing.ts";
import {
  calculateOrderPaymentDistribution,
  recordReconciledCheckoutFinance,
} from "../_shared/marketplace-finance.ts";

function toCents(value: unknown) {
  const parsed = Number(value);
  return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : 0) * 100));
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

    let captured = 0;
    let failed = 0;
    let total = 0;
    const details: Array<Record<string, unknown>> = [];

    const releaseClaim = async (
      memberOrderId: string,
      claimToken: string,
      message: string,
    ) => {
      const { data, error } = await actor!.adminClient.rpc(
        "release_match_group_capture_claim",
        {
          p_member_order_id: memberOrderId,
          p_claim_token: claimToken,
          p_error: message,
        },
      );
      return { released: data === true, error };
    };

    const markClaimFailed = async (
      memberOrderId: string,
      claimToken: string,
      message: string,
      terminal: boolean,
    ) => {
      const { data, error } = await actor!.adminClient.rpc(
        "mark_match_group_member_capture_failed_claimed",
        {
          p_member_order_id: memberOrderId,
          p_claim_token: claimToken,
          p_error: message,
          p_terminal: terminal,
        },
      );
      return { marked: data === true, error };
    };

    const renewCancellationClaim = async (
      memberOrderId: string,
      claimToken: string,
      requireRestaurantIneligible: boolean,
    ) => {
      const { data, error } = await actor!.adminClient.rpc(
        "renew_match_group_capture_cancellation_claim",
        {
          p_member_order_id: memberOrderId,
          p_claim_token: claimToken,
          p_require_restaurant_ineligible: requireRestaurantIneligible,
        },
      );
      return { renewed: data === true, error };
    };

    const cancelAuthorizedIntent = async (input: {
      memberOrderId: string;
      paymentIntentId: string;
      claimToken: string;
      requireRestaurantIneligible: boolean;
      reason: string;
    }) => {
      const claim = await renewCancellationClaim(
        input.memberOrderId,
        input.claimToken,
        input.requireRestaurantIneligible,
      );
      if (claim.error) {
        return { status: "claim_error" as const, error: claim.error };
      }
      if (!claim.renewed) {
        return { status: "claim_lost" as const };
      }

      try {
        const canceledIntent = await stripe.paymentIntents.cancel(
          input.paymentIntentId,
          { cancellation_reason: "abandoned" },
          {
            // A new token is a new, fenced cancellation attempt. If a prior
            // response was lost, the next invocation first observes Stripe's
            // authoritative state before issuing another mutation.
            idempotencyKey: `match-group:cancel:${input.reason}:${input.memberOrderId}:${input.paymentIntentId}:${input.claimToken}`.slice(0, 255),
          },
        );
        if (canceledIntent.status === "canceled") {
          return { status: "canceled" as const, intent: canceledIntent };
        }
        if (canceledIntent.status === "succeeded") {
          return { status: "succeeded" as const, intent: canceledIntent };
        }
        return { status: "not_canceled" as const, intent: canceledIntent };
      } catch (cancelError) {
        try {
          const recoveredIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
          if (recoveredIntent.status === "canceled") {
            return { status: "canceled" as const, intent: recoveredIntent };
          }
          if (recoveredIntent.status === "succeeded") {
            return { status: "succeeded" as const, intent: recoveredIntent };
          }
          return {
            status: "not_canceled" as const,
            intent: recoveredIntent,
            error: cancelError,
          };
        } catch (recoveryError) {
          return {
            status: "unknown" as const,
            error: recoveryError,
          };
        }
      }
    };

    // One candidate is claimed immediately before processing. Twenty serial
    // candidates keeps the invocation bounded well below the fifteen-minute
    // database lease even on the hosted 400-second Edge runtime.
    for (let claimIndex = 0; claimIndex < 20; claimIndex += 1) {
      const { data: claimedRows, error: claimError } = await actor.adminClient.rpc(
        "claim_next_match_group_capture_candidate",
      );
      if (claimError) throw claimError;

      const candidate = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
      if (!candidate) break;
      total += 1;

      const memberOrderId = String(candidate.member_order_id || "");
      const paymentIntentId = String(candidate.stripe_payment_intent_id || "");
      const claimToken = String(candidate.capture_claim_token || "");
      const amountToCapture = toCents(candidate.final_total);
      const paymentIntentIdentityMatches = (intent: {
        livemode?: boolean;
        capture_method?: string;
        currency?: string;
        metadata?: Record<string, string> | null;
      }) => Boolean(
        intent.livemode
        && intent.capture_method === "manual"
        && intent.currency === "chf"
        && intent.metadata?.checkout_kind === "match-group"
        && intent.metadata?.group_member_order_id === memberOrderId
        && intent.metadata?.group_id === candidate.group_id
        && intent.metadata?.restaurant_id === candidate.restaurant_id
        && intent.metadata?.user_id === candidate.user_id
      );

      try {
        if (!memberOrderId || !paymentIntentId || !claimToken || amountToCapture <= 0) {
          throw new Error("MATCH_GROUP_CAPTURE_CANDIDATE_INVALID");
        }

        const authorization = await stripe.paymentIntents.retrieve(paymentIntentId);
        const identityMatches = paymentIntentIdentityMatches(authorization);
        if (!identityMatches) throw new Error("MATCH_GROUP_CAPTURE_IDENTITY_MISMATCH");

        if (authorization.status === "canceled") {
          const canceledResult = await markClaimFailed(
            memberOrderId,
            claimToken,
            "MATCH_GROUP_PAYMENT_INTENT_CANCELED",
            true,
          );
          if (canceledResult.error) throw canceledResult.error;

          failed += 1;
          details.push({
            member_order_id: memberOrderId,
            status: canceledResult.marked ? "canceled" : "claim_lost_after_cancellation",
          });
          continue;
        }

        if (
          authorization.status !== "requires_capture"
          && authorization.status !== "succeeded"
        ) {
          throw new Error(`MATCH_GROUP_CAPTURE_INVALID_STATE:${authorization.status}`);
        }

        const captureAttempts = Number(candidate.capture_attempts || 0);
        if (authorization.status === "requires_capture" && captureAttempts >= 5) {
          const exhaustedCancellation = await cancelAuthorizedIntent({
            memberOrderId,
            paymentIntentId,
            claimToken,
            requireRestaurantIneligible: false,
            reason: "capture-attempts-exhausted",
          });
          if (exhaustedCancellation.status === "claim_error") {
            throw new Error(
              `MATCH_GROUP_CAPTURE_CLAIM_RENEW_FAILED:${exhaustedCancellation.error.message}`,
            );
          }
          if (exhaustedCancellation.status === "claim_lost") {
            throw new Error("MATCH_GROUP_CAPTURE_CLAIM_LOST_BEFORE_CANCEL");
          }
          if (exhaustedCancellation.status === "unknown") {
            const recoveryMessage = exhaustedCancellation.error instanceof Error
              ? exhaustedCancellation.error.message
              : "unknown";
            throw new Error(`MATCH_GROUP_STRIPE_STATE_UNKNOWN_AFTER_CANCEL:${recoveryMessage}`);
          }
          if (exhaustedCancellation.status === "not_canceled") {
            throw new Error(
              `MATCH_GROUP_CANCEL_NOT_CONFIRMED:${exhaustedCancellation.intent.status}`,
            );
          }
          if (exhaustedCancellation.status === "succeeded") {
            throw new Error("MATCH_GROUP_CAPTURE_SUCCEEDED_DURING_TERMINAL_CANCELLATION");
          }

          const terminalResult = await markClaimFailed(
            memberOrderId,
            claimToken,
            "MATCH_GROUP_CAPTURE_ATTEMPTS_EXHAUSTED",
            true,
          );
          if (terminalResult.error) throw terminalResult.error;
          failed += 1;
          details.push({
            member_order_id: memberOrderId,
            status: terminalResult.marked ? "capture_canceled" : "claim_lost_after_cancellation",
          });
          continue;
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
          const { data: checkoutRestaurant, error: restaurantError } = await actor.adminClient
            .from("restaurants")
            .select("id,is_active,status,is_demo")
            .eq("id", candidate.restaurant_id)
            .maybeSingle();
          if (restaurantError) {
            throw new Error(`MATCH_GROUP_RESTAURANT_ELIGIBILITY_READ_FAILED:${restaurantError.message}`);
          }

          const restaurantUnavailable = candidate.restaurant_eligible !== true
            || !isClientCheckoutRestaurantEligible(checkoutRestaurant);

          if (restaurantUnavailable) {
            const cancellation = await cancelAuthorizedIntent({
              memberOrderId,
              paymentIntentId,
              claimToken,
              requireRestaurantIneligible: true,
              reason: "restaurant-unavailable",
            });

            if (cancellation.status === "claim_error") {
              throw new Error(
                `MATCH_GROUP_CAPTURE_CLAIM_RENEW_FAILED:${cancellation.error.message}`,
              );
            }
            if (cancellation.status === "claim_lost") {
              throw new Error("MATCH_GROUP_CAPTURE_CLAIM_LOST_BEFORE_CANCEL");
            }
            if (cancellation.status === "unknown") {
              const recoveryMessage = cancellation.error instanceof Error
                ? cancellation.error.message
                : "unknown";
              throw new Error(`MATCH_GROUP_STRIPE_STATE_UNKNOWN_AFTER_CANCEL:${recoveryMessage}`);
            }
            if (cancellation.status === "not_canceled") {
              throw new Error(
                `MATCH_GROUP_CANCEL_NOT_CONFIRMED:${cancellation.intent.status}`,
              );
            }
            if (cancellation.status === "canceled") {
              const terminalResult = await markClaimFailed(
                memberOrderId,
                claimToken,
                "MATCH_GROUP_RESTAURANT_UNAVAILABLE",
                true,
              );
              if (terminalResult.error) throw terminalResult.error;

              failed += 1;
              details.push({
                member_order_id: memberOrderId,
                status: terminalResult.marked
                  ? "restaurant_unavailable"
                  : "claim_lost_after_cancellation",
              });
              continue;
            }

            // A cancellation race may reveal that Stripe already captured the
            // payment. Reconcile that immutable truth below.
            intent = cancellation.intent;
          } else {
            if (authorization.amount_capturable < amountToCapture) {
              throw new Error("MATCH_GROUP_CAPTURE_AMOUNT_EXCEEDS_AUTHORIZATION");
            }

            const { data: renewed, error: renewError } = await actor.adminClient.rpc(
              "renew_match_group_capture_claim",
              {
                p_member_order_id: memberOrderId,
                p_claim_token: claimToken,
              },
            );
            if (renewError) {
              throw new Error(`MATCH_GROUP_CAPTURE_CLAIM_RENEW_FAILED:${renewError.message}`);
            }
            if (renewed !== true) {
              throw new Error("MATCH_GROUP_CAPTURE_CLAIM_LOST");
            }

            try {
              intent = await stripe.paymentIntents.capture(paymentIntentId, {
                amount_to_capture: amountToCapture,
                application_fee_amount: distribution.stripeApplicationFeeCents,
              }, {
                // Keep the same key while Stripe's result is unknown. A
                // confirmed requires_capture result increments capture_attempts,
                // giving the next safe retry a fresh generation.
                idempotencyKey: `match-group:capture:${memberOrderId}:${paymentIntentId}:${amountToCapture}:${captureAttempts}`.slice(0, 255),
              });
            } catch (captureError) {
              const recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
              if (recoveredIntent.status !== "succeeded") throw captureError;
              intent = recoveredIntent;
            }
          }
        }

        if (intent.status !== "succeeded") {
          throw new Error(`MATCH_GROUP_CAPTURE_NOT_SUCCEEDED:${intent.status}`);
        }
        const capturedAmountCents = Number(intent.amount_received || 0);
        if (!Number.isSafeInteger(capturedAmountCents) || capturedAmountCents <= 0) {
          throw new Error("MATCH_GROUP_CAPTURED_AMOUNT_INVALID");
        }
        const capturedAmount = capturedAmountCents / 100;
        const settledDistribution = capturedAmountCents === amountToCapture
          ? distribution
          : calculateOrderPaymentDistribution(
            capturedAmountCents,
            platformFeeBps,
            {
              commissionableCents: capturedAmountCents,
              tipCents: 0,
              deliveryPassThroughCents: 0,
            },
          );

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
            gross_amount_cents: String(settledDistribution.grossCents),
            commissionable_cents: String(settledDistribution.commissionableCents),
            tip_cents: String(settledDistribution.tipCents),
            delivery_pass_through_cents: String(settledDistribution.deliveryPassThroughCents),
            platform_fee_bps: String(settledDistribution.platformFeeBps),
            platform_fee_amount_cents: String(settledDistribution.platformFeeCents),
            stripe_application_fee_amount_cents:
              String(settledDistribution.stripeApplicationFeeCents),
            restaurant_share_amount_cents: String(settledDistribution.restaurantShareCents),
            restaurant_transfer_amount_cents: String(settledDistribution.restaurantTransferCents),
            developer_order_bps: String(settledDistribution.developerOrderBps),
            developer_share_bps: String(settledDistribution.developerOrderBps),
            developer_share_amount_cents: String(settledDistribution.developerShareCents),
            tok_net_amount_cents: String(settledDistribution.tokNetRevenueCents),
            stripe_fee_reconciliation_required: true,
            vat_reconciliation_required: true,
          },
          log,
        });

        const { data: marked, error: markError } = await actor.adminClient.rpc(
          "mark_match_group_member_captured_claimed",
          {
            p_member_order_id: memberOrderId,
            p_claim_token: claimToken,
            p_payment_intent_id: paymentIntentId,
            p_captured_amount: capturedAmount,
            p_metadata: {
              stripe_payment_intent_status: intent.status,
              amount_to_capture: capturedAmount,
              platform_fee_amount: settledDistribution.platformFeeCents / 100,
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
        failed += 1;

        const claimUnavailable = message.includes("MATCH_GROUP_CAPTURE_CLAIM_LOST")
          || message.startsWith("MATCH_GROUP_CAPTURE_CLAIM_RENEW_FAILED:");
        if (claimUnavailable) {
          // No Stripe mutation followed a failed renewal. Do not call Stripe
          // again after the worker has explicitly lost its fencing token.
          const released = await releaseClaim(memberOrderId, claimToken, message);
          details.push({
            member_order_id: memberOrderId,
            status: released.released ? "claim_released" : "claim_lost",
            error: released.error?.message || message,
          });
          continue;
        }

        const eligibilityReadFailed = message.startsWith("MATCH_GROUP_RESTAURANT_ELIGIBILITY_READ_FAILED:");
        if (eligibilityReadFailed) {
          const released = await releaseClaim(memberOrderId, claimToken, message);
          details.push({
            member_order_id: memberOrderId,
            status: released.error
              ? "eligibility_retry_lease_timeout"
              : released.released
                ? "eligibility_retry"
                : "eligibility_retry_claim_lost",
            error: released.error?.message || message,
          });
          continue;
        }

        let recoveredIntent: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>> | null = null;
        let recoveryErrorMessage = "STRIPE_STATE_UNKNOWN";
        try {
          recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        } catch (recoveryError) {
          recoveryErrorMessage = recoveryError instanceof Error
            ? recoveryError.message
            : recoveryErrorMessage;
        }

        if (!recoveredIntent) {
          // Unknown is a first-class state: the capture or cancellation may
          // have succeeded even though both responses were lost. Never spend a
          // financial attempt or make the row terminal until Stripe is known.
          const released = await releaseClaim(
            memberOrderId,
            claimToken,
            `${message}; recovery=${recoveryErrorMessage}`,
          );
          details.push({
            member_order_id: memberOrderId,
            status: released.error
              ? "stripe_state_unknown_lease_timeout"
              : released.released
                ? "stripe_state_unknown"
                : "stripe_state_unknown_claim_lost",
            error: released.error?.message || recoveryErrorMessage,
          });
          continue;
        }

        if (!paymentIntentIdentityMatches(recoveredIntent)) {
          const identityResult = await markClaimFailed(
            memberOrderId,
            claimToken,
            "MATCH_GROUP_CAPTURE_IDENTITY_MISMATCH",
            true,
          );
          if (identityResult.error) throw identityResult.error;
          details.push({
            member_order_id: memberOrderId,
            status: identityResult.marked ? "identity_rejected" : "claim_lost",
            error: message,
          });
          continue;
        }

        if (recoveredIntent.status === "succeeded") {
          // Stripe truth wins. Release only this worker's token so another
          // invocation can reconcile ledger and business state idempotently.
          const released = await releaseClaim(memberOrderId, claimToken, message);
          details.push({
            member_order_id: memberOrderId,
            status: released.error
              ? "settlement_retry_lease_timeout"
              : released.released
                ? "settlement_retry"
                : "settlement_retry_claim_lost",
            error: released.error?.message || message,
          });
          continue;
        }

        if (recoveredIntent.status === "canceled") {
          const canceledResult = await markClaimFailed(
            memberOrderId,
            claimToken,
            "MATCH_GROUP_PAYMENT_INTENT_CANCELED",
            true,
          );
          if (canceledResult.error) throw canceledResult.error;
          details.push({
            member_order_id: memberOrderId,
            status: canceledResult.marked ? "canceled" : "claim_lost_after_cancellation",
            error: message,
          });
          continue;
        }

        if (recoveredIntent.status !== "requires_capture") {
          const released = await releaseClaim(memberOrderId, claimToken, message);
          details.push({
            member_order_id: memberOrderId,
            status: released.released ? "stripe_state_retry" : "stripe_state_retry_claim_lost",
            error: released.error?.message || message,
          });
          continue;
        }

        // Stripe has definitively confirmed that the capture did not happen.
        // Advancing this counter produces a fresh capture idempotency
        // generation; after five confirmed failures the next claim cancels the
        // remaining bank authorization before marking the row terminal.
        const failureResult = await markClaimFailed(
          memberOrderId,
          claimToken,
          message,
          false,
        );
        if (failureResult.error) throw failureResult.error;

        details.push({
          member_order_id: memberOrderId,
          status: failureResult.marked ? "retry" : "claim_lost",
          error: message,
        });
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
      metadata: { captured, failed, total, details },
    });

    return jsonResponse({ ok: true, captured, failed, total, details }, 200, corsHeaders);
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
