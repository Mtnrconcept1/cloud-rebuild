import { authenticateRequest, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

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
        const intent = await stripe.paymentIntents.capture(paymentIntentId, {
          amount_to_capture: amountToCapture,
        });

        const capturedAmount = Number(intent.amount_received || amountToCapture) / 100;
        await actor.adminClient.rpc("mark_match_group_member_captured", {
          p_member_order_id: memberOrderId,
          p_payment_intent_id: paymentIntentId,
          p_captured_amount: capturedAmount,
          p_metadata: {
            stripe_payment_intent_status: intent.status,
            amount_to_capture: amountToCapture / 100,
            currency: intent.currency,
          },
        });

        captured += 1;
        details.push({ member_order_id: memberOrderId, status: "captured", amount: capturedAmount });
      } catch (captureError) {
        const message = captureError instanceof Error ? captureError.message : "Capture Stripe echouee";
        const terminal = isTerminalStripeError(captureError) || Number(candidate.capture_attempts || 0) >= 4;

        await actor.adminClient.rpc("mark_match_group_member_capture_failed", {
          p_member_order_id: memberOrderId,
          p_error: message,
          p_terminal: terminal,
        });

        failed += 1;
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

    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
