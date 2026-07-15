import type Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { markOrderCheckoutSessionState } from "../_shared/order-checkout.ts";
import {
  assertCheckoutSessionIntegrity,
  cancelPaymentAttempt,
  findOwnedPaymentAttempt,
  requireClientPaymentAttemptId,
} from "../_shared/payment-attempts.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "../_shared/stripe-client.ts";

function isZeroAttenteKind(kind: string) {
  return kind === "zero-attente" || kind === "zero_attente";
}

async function releaseBusinessHold(input: {
  adminClient: any;
  attemptId: string;
  operationKey: string;
  kind: string;
  session: Stripe.Checkout.Session | null;
}) {
  if (input.kind === "order") {
    const session = input.session || ({
      id: "",
      metadata: {
        payment_attempt_id: input.attemptId,
        client_payment_attempt_id: input.operationKey,
        operation_key: input.operationKey,
      },
    } as unknown as Stripe.Checkout.Session);
    await markOrderCheckoutSessionState({
      adminClient: input.adminClient,
      session,
      orderStatus: "cancelled",
      paymentStatus: "cancelled",
      checkoutState: "cancelled",
      failureCode: "checkout_cancelled_by_user",
      failureMessage: "Paiement annule par l'utilisateur.",
    });
    return;
  }

  if (input.kind === "restaurant-credit-pack") {
    const { error } = await input.adminClient
      .from("restaurant_credit_purchases")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("payment_attempt_id", input.attemptId)
      .eq("status", "pending_payment");
    if (error) throw new Error(`CREDIT_PACK_CANCEL_FAILED:${error.message}`);
    return;
  }

  if (!input.session) return;

  if (isZeroAttenteKind(input.kind)) {
    const { error } = await input.adminClient.rpc("release_zero_attente_checkout_hold", {
      p_session_id: input.session.id,
      p_expected_attempt_id: input.attemptId,
      p_reason: "user_cancelled",
    });
    if (error) throw new Error(`ZERO_ATTENTE_HOLD_RELEASE_FAILED:${error.message}`);
    return;
  }

  if (input.kind === "chefs-table") {
    const { error } = await input.adminClient.rpc("release_chef_table_checkout_hold", {
      p_session_id: input.session.id,
    });
    if (error) throw new Error(`CHEF_TABLE_HOLD_RELEASE_FAILED:${error.message}`);
    return;
  }

}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("cancel-payment-attempt");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let clientPaymentAttemptId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const rateLimiter = createRateLimiter(actor.adminClient, "cancel-payment-attempt");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 30, windowSeconds: 300 });

    const body = await req.json().catch(() => ({}));
    clientPaymentAttemptId = requireClientPaymentAttemptId(body?.payment_attempt_id);
    const reason = String(body?.reason || "user_cancelled").slice(0, 200);
    const attempt = await findOwnedPaymentAttempt({
      adminClient: actor.adminClient,
      clientPaymentAttemptId,
      ownerUserId: actor.userId,
    });

    if (attempt.state === "finalized") {
      throw new HttpError(409, "Un paiement finalise ne peut pas etre annule");
    }
    const wasAlreadyCancelled = attempt.state === "cancelled";

    let session: Stripe.Checkout.Session | null = null;
    if (attempt.stripe_checkout_session_id) {
      const runtime = getStripeRuntimeForCheckoutKindAndMode(attempt.kind, attempt.mode);
      try {
        session = await runtime.stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
      } catch (error) {
        throw new HttpError(
          503,
          `PAYMENT_ATTEMPT_INDETERMINATE:${error instanceof Error ? error.message : "Stripe indisponible"}`,
        );
      }

      if (String(session.metadata?.user_id || "") !== actor.userId) {
        throw new HttpError(409, "La session Stripe n'appartient pas a cet utilisateur");
      }
      assertCheckoutSessionIntegrity({
        session,
        livemode: attempt.mode === "live",
        expectedAmountCents: attempt.amount_cents,
        expectedCurrency: attempt.currency,
      });
      if (session.payment_status === "paid") {
        throw new HttpError(409, "Paiement deja recu; finalisation en cours");
      }
      if (session.status === "open") {
        await runtime.stripe.checkout.sessions.expire(
          session.id,
          {},
          { idempotencyKey: `cancel:${attempt.id}:${session.id}`.slice(0, 255) },
        );
      } else if (session.status === "complete") {
        throw new HttpError(409, "Paiement asynchrone en cours; annulation indisponible");
      }
    }

    // With no known session, reserve the cancellation atomically in Postgres
    // before touching business rows. If create-checkout binds concurrently,
    // the RPC returns refresh_required and nothing is released under a still
    // payable URL. With a bound session, Stripe has already been expired above.
    let cancellation: Record<string, unknown>;
    if (!attempt.stripe_checkout_session_id) {
      cancellation = await cancelPaymentAttempt({
        adminClient: actor.adminClient,
        attemptId: attempt.id,
        reason,
      });
      if (cancellation.cancelled !== true && cancellation.cancellation_requested !== true) {
        throw new HttpError(409, "PAYMENT_ATTEMPT_CANCEL_REFRESH_REQUIRED");
      }
      await releaseBusinessHold({
        adminClient: actor.adminClient,
        attemptId: attempt.id,
        operationKey: attempt.operation_key,
        kind: attempt.kind,
        session: null,
      });
    } else {
      // Stripe is expired first. If a database operation fails, a retry can
      // safely repeat the release/cancel sequence without leaving a payable URL.
      await releaseBusinessHold({
        adminClient: actor.adminClient,
        attemptId: attempt.id,
        operationKey: attempt.operation_key,
        kind: attempt.kind,
        session,
      });
      cancellation = await cancelPaymentAttempt({
        adminClient: actor.adminClient,
        attemptId: attempt.id,
        reason,
        expectedSessionId: attempt.stripe_checkout_session_id,
      });
    }
    const cancellationRequested = cancellation.cancellation_requested === true
      && cancellation.cancelled !== true;
    if (cancellation.cancelled !== true && !cancellationRequested) {
      throw new HttpError(409, "PAYMENT_ATTEMPT_CANCEL_REFRESH_REQUIRED");
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "cancel-payment-attempt",
      action: "cancel_payment_attempt",
      status: "success",
      targetEntityType: "payment_attempt",
      targetEntityId: attempt.id,
      metadata: {
        kind: attempt.kind,
        stripe_session_id: attempt.stripe_checkout_session_id,
        cancellation_requested: cancellationRequested,
      },
    });

    return jsonResponse({
      payment_attempt_id: clientPaymentAttemptId,
      server_payment_attempt_id: attempt.id,
      sessionId: attempt.stripe_checkout_session_id,
      session_id: attempt.stripe_checkout_session_id,
      state: cancellationRequested ? "cancelling" : "cancelled",
      cancelled: !cancellationRequested,
      cancellation_requested: cancellationRequested,
      reused: wasAlreadyCancelled,
    }, cancellationRequested ? 202 : 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur d'annulation du paiement";
    log.error("cancel_payment_attempt_failed", { payment_attempt_id: clientPaymentAttemptId || null, message });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "cancel-payment-attempt",
      action: "cancel_payment_attempt",
      status: "failure",
      targetEntityType: "payment_attempt",
      targetEntityId: clientPaymentAttemptId || null,
      errorMessage: message,
    });
    if (error instanceof HttpError) return jsonResponse({ error: message }, error.status, corsHeaders);
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
