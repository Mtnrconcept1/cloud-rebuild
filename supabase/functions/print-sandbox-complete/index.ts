import {
  HttpError,
  createAdminClient,
  writeAuditLog,
} from "../_shared/auth.ts";
import { finalizePaymentAttempt } from "../_shared/payment-attempts.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "../_shared/stripe-client.ts";
import { getCloudprinterMode } from "../_shared/print/cloudprinter.ts";

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HttpError(400, `${field} requis`);
  return normalized;
}

function safeAppOrigin() {
  const candidate = Deno.env.get("SITE_URL")?.trim()
    || Deno.env.get("PUBLIC_APP_URL")?.trim()
    || "https://www.thetok.ch";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "https://www.thetok.ch";
    }
    return url.origin;
  } catch {
    return "https://www.thetok.ch";
  }
}

function dashboardRedirect(input: {
  status: "sandbox_success" | "sandbox_error";
  orderId?: string | null;
  paymentAttemptId?: string | null;
}) {
  const url = new URL("/dashboard/photos", safeAppOrigin());
  url.searchParams.set("status", input.status);
  if (input.orderId) url.searchParams.set("print_order_id", input.orderId);
  if (input.paymentAttemptId) url.searchParams.set("payment_attempt_id", input.paymentAttemptId);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function hasPaymentIntent(session: { payment_intent?: unknown }) {
  const value = session.payment_intent;
  if (typeof value === "string") return Boolean(value.trim());
  return Boolean(value && typeof value === "object" && "id" in value && String((value as { id?: unknown }).id || "").trim());
}

Deno.serve(async (req) => {
  const adminClient = createAdminClient();
  let orderId: string | null = null;
  let clientPaymentAttemptId: string | null = null;

  try {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    if (getCloudprinterMode() !== "sandbox") {
      throw new HttpError(409, "PRINT_SANDBOX_MODE_REQUIRED");
    }

    const requestUrl = new URL(req.url);
    const sessionId = required(requestUrl.searchParams.get("session_id"), "session_id");
    if (!sessionId.startsWith("cs_test_")) throw new HttpError(400, "PRINT_SANDBOX_TEST_SESSION_REQUIRED");

    const stripeRuntime = getStripeRuntimeForCheckoutKindAndMode("marketing-print", "test");
    const session = await stripeRuntime.stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};

    const validSandboxSession =
      metadata.payment_attempt_version === "2"
      && metadata.checkout_kind === "marketing-print"
      && metadata.print_sandbox === "true"
      && metadata.provider_mode === "sandbox"
      && metadata.no_financial_ledger === "true"
      && metadata.stripe_mode === "test"
      && metadata.checkout_amount_cents === "0"
      && session.livemode === false
      && session.mode === "payment"
      && session.payment_status === "no_payment_required"
      && session.status === "complete"
      && Number(session.amount_total || 0) === 0
      && String(session.currency || "").toUpperCase() === "CHF"
      && !hasPaymentIntent(session);
    if (!validSandboxSession) throw new HttpError(409, "PRINT_SANDBOX_SESSION_INVALID");

    const attemptId = required(metadata.payment_attempt_id, "payment_attempt_id");
    clientPaymentAttemptId = required(metadata.client_payment_attempt_id, "client_payment_attempt_id");
    orderId = required(metadata.print_order_id, "print_order_id");
    const restaurantId = required(metadata.restaurant_id, "restaurant_id");

    const { data: attempt, error: attemptError } = await adminClient
      .from("payment_attempts")
      .select("id, operation_key, owner_user_id, restaurant_id, kind, mode, state, amount_cents, currency, stripe_checkout_session_id")
      .eq("id", attemptId)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) throw new HttpError(404, "PRINT_SANDBOX_PAYMENT_ATTEMPT_NOT_FOUND");
    if (
      attempt.kind !== "marketing_print_order"
      || attempt.mode !== "test"
      || !["session_bound", "finalized"].includes(String(attempt.state || ""))
      || Number(attempt.amount_cents) !== 0
      || String(attempt.currency || "").toUpperCase() !== "CHF"
      || attempt.restaurant_id !== restaurantId
      || attempt.stripe_checkout_session_id !== session.id
      || attempt.operation_key !== clientPaymentAttemptId
    ) {
      throw new HttpError(409, "PRINT_SANDBOX_PAYMENT_ATTEMPT_MISMATCH");
    }

    const { data: order, error: orderError } = await adminClient
      .from("print_orders")
      .select("id, restaurant_id, owner_user_id, payment_attempt_id, customer_amount_cents, customer_currency, payment_status, status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new HttpError(404, "PRINT_SANDBOX_ORDER_NOT_FOUND");
    if (
      order.restaurant_id !== restaurantId
      || order.owner_user_id !== attempt.owner_user_id
      || order.payment_attempt_id !== attempt.id
      || !["pending", "paid"].includes(String(order.payment_status || ""))
      || Number(order.customer_amount_cents) !== 0
      || String(order.customer_currency || "").toUpperCase() !== "CHF"
    ) {
      throw new HttpError(409, "PRINT_SANDBOX_ORDER_MISMATCH");
    }

    if (attempt.state !== "finalized") {
      await finalizePaymentAttempt({
        adminClient,
        attemptId: attempt.id,
        operationKey: attempt.operation_key,
        stripeEventId: null,
        checkoutSessionId: session.id,
        paymentIntentId: null,
        subscriptionId: null,
        livemode: false,
        amountCents: 0,
        currency: "CHF",
        metadata: {
          source: "print_sandbox_complete",
          print_order_id: order.id,
          provider_mode: "sandbox",
          no_financial_ledger: true,
        },
      });
    }

    if (order.payment_status !== "paid") {
      const { error: finalizeOrderError } = await adminClient.rpc("finalize_paid_print_order", {
        p_order_id: order.id,
        p_payment_attempt_id: attempt.id,
        p_stripe_event_id: null,
      });
      if (finalizeOrderError) throw finalizeOrderError;
    }

    let orchestratorTriggered = false;
    let orchestratorError: string | null = null;
    try {
      const { error } = await adminClient.functions.invoke("print-orchestrator", {
        body: { limit: 1 },
      });
      if (error) throw error;
      orchestratorTriggered = true;
    } catch (error) {
      orchestratorError = error instanceof Error ? error.message.slice(0, 300) : "orchestrator_unavailable";
    }

    await writeAuditLog({
      adminClient,
      functionName: "print-sandbox-complete",
      action: "complete_zero_checkout",
      status: "success",
      request: req,
      targetEntityType: "print_orders",
      targetEntityId: order.id,
      metadata: {
        restaurant_id: restaurantId,
        payment_attempt_id: attempt.id,
        checkout_session_id: session.id,
        provider_mode: "sandbox",
        stripe_mode: "test",
        amount_cents: 0,
        no_financial_ledger: true,
        orchestrator_triggered: orchestratorTriggered,
        orchestrator_error: orchestratorError,
      },
    });

    return dashboardRedirect({
      status: "sandbox_success",
      orderId: order.id,
      paymentAttemptId: clientPaymentAttemptId,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500)
      : "Erreur finalisation impression Sandbox";
    await writeAuditLog({
      adminClient,
      functionName: "print-sandbox-complete",
      action: "complete_zero_checkout",
      status: "failure",
      request: req,
      targetEntityType: "print_orders",
      targetEntityId: orderId,
      errorMessage: message,
      metadata: {
        provider_mode: getCloudprinterMode(),
        stripe_mode: "test",
      },
    });

    return dashboardRedirect({
      status: "sandbox_error",
      orderId,
      paymentAttemptId: clientPaymentAttemptId,
    });
  }
});
