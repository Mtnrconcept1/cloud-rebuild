import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  assertCheckoutSessionIntegrity,
  findOwnedPaymentAttempt,
  requireClientPaymentAttemptId,
} from "../_shared/payment-attempts.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "../_shared/stripe-client.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("payment-attempt-status");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let clientPaymentAttemptId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const rateLimiter = createRateLimiter(actor.adminClient, "payment-attempt-status");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 120, windowSeconds: 300 });

    const body = await req.json().catch(() => ({}));
    clientPaymentAttemptId = requireClientPaymentAttemptId(body?.payment_attempt_id);
    const attempt = await findOwnedPaymentAttempt({
      adminClient: actor.adminClient,
      clientPaymentAttemptId,
      ownerUserId: actor.userId,
    });

    let state = attempt.state;
    let paymentStatus: string | null = null;
    let stripeStatus: string | null = null;
    let url: string | null = null;
    let indeterminate = false;

    if (attempt.stripe_checkout_session_id) {
      const runtime = getStripeRuntimeForCheckoutKindAndMode(attempt.kind, attempt.mode);
      try {
        const session = await runtime.stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
        if (String(session.metadata?.user_id || "") !== actor.userId) {
          throw new HttpError(409, "La session Stripe n'appartient pas a cet utilisateur");
        }
        if (String(session.metadata?.operation_key || "") !== attempt.operation_key) {
          throw new HttpError(409, "La session Stripe ne correspond pas a cette tentative");
        }
        assertCheckoutSessionIntegrity({
          session,
          livemode: attempt.mode === "live",
          expectedAmountCents: attempt.amount_cents,
          expectedCurrency: attempt.currency,
        });

        paymentStatus = session.payment_status;
        stripeStatus = session.status;
        if (session.status === "open" && session.url) {
          state = "session_bound";
          url = session.url;
        } else if (session.payment_status === "paid") {
          state = attempt.state === "finalized" ? "finalized" : "paid" as typeof state;
        } else if (session.status === "expired") {
          state = "expired";
        }
      } catch (error) {
        if (error instanceof HttpError) throw error;
        indeterminate = true;
        log.warn("payment_attempt_stripe_lookup_failed", {
          payment_attempt_id: attempt.id,
          stripe_session_id: attempt.stripe_checkout_session_id,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    const terminal = ["finalized", "cancelled", "failed"].includes(state);
    const payload = {
      payment_attempt_id: clientPaymentAttemptId,
      server_payment_attempt_id: attempt.id,
      state: indeterminate ? "indeterminate" : state,
      sessionId: attempt.stripe_checkout_session_id,
      session_id: attempt.stripe_checkout_session_id,
      url,
      payment_status: paymentStatus,
      stripe_status: stripeStatus,
      indeterminate,
      error_code: indeterminate ? "PAYMENT_ATTEMPT_INDETERMINATE" : null,
      retryable: !terminal,
      last_error_code: attempt.last_error_code || null,
      last_error_message: attempt.last_error_message || null,
    };

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "payment-attempt-status",
      action: "resolve_payment_attempt",
      status: "success",
      targetEntityType: "payment_attempt",
      targetEntityId: attempt.id,
      metadata: { state: payload.state, indeterminate },
    });

    return jsonResponse(payload, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de resolution du paiement";
    log.error("payment_attempt_status_failed", { payment_attempt_id: clientPaymentAttemptId || null, message });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "payment-attempt-status",
      action: "resolve_payment_attempt",
      status: "failure",
      targetEntityType: "payment_attempt",
      targetEntityId: clientPaymentAttemptId || null,
      errorMessage: message,
    });
    if (error instanceof HttpError) return jsonResponse({ error: message }, error.status, corsHeaders);
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
