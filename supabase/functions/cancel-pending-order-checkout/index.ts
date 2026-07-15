import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  restoreReservedSpecialOfferStock,
  type OrderLookupRow,
} from "../_shared/order-checkout.ts";

const FUNCTION_NAME = "cancel-pending-order-checkout";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    actor = await authenticateRequest(req);
    await assertProductionFlowAllowed(actor, "annulation de commande réelle");
    const body = await req.json().catch(() => ({}));
    const orderIds = Array.isArray(body.order_ids)
      ? Array.from(new Set(
        body.order_ids
          .map((id: unknown) => String(id || "").trim())
          .filter((id: string) => UUID_REGEX.test(id)),
      ))
      : [];
    const checkoutGroupId = typeof body.checkout_group_id === "string"
      && UUID_REGEX.test(body.checkout_group_id.trim())
      ? body.checkout_group_id.trim().toLowerCase()
      : null;
    const paymentAttemptId = typeof body.payment_attempt_id === "string"
      && UUID_REGEX.test(body.payment_attempt_id.trim())
      ? body.payment_attempt_id.trim().toLowerCase()
      : null;
    const reason = String(body.reason || "checkout_creation_failed").slice(0, 240);

    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }
    if ((orderIds.length === 0 && !checkoutGroupId && !paymentAttemptId) || orderIds.length > 20) {
      throw new HttpError(400, "order_ids, checkout_group_id ou payment_attempt_id requis");
    }

    const select = "id, status, payment_status, user_id, restaurant_id, delivery_address, total_amount, order_number, metadata, scheduled_at";
    const rowsById = new Map<string, OrderLookupRow>();
    const appendOwnedRows = (rows: OrderLookupRow[] | null | undefined) => {
      for (const order of rows || []) {
        if (order.user_id === actor?.userId) rowsById.set(order.id, order);
      }
    };

    if (orderIds.length > 0) {
      const { data, error } = await actor.adminClient
        .from("orders")
        .select(select)
        .in("id", orderIds);
      if (error) throw new HttpError(500, error.message);
      appendOwnedRows(data as OrderLookupRow[] | null);
    }

    for (const [metadataKey, metadataValue] of [
      ["checkout_group_id", checkoutGroupId],
      ["payment_attempt_id", paymentAttemptId],
      ["client_payment_attempt_id", paymentAttemptId],
    ] as const) {
      if (!metadataValue) continue;
      const { data, error } = await actor.adminClient
        .from("orders")
        .select(select)
        .eq("user_id", actor.userId)
        .filter(`metadata->>${metadataKey}`, "eq", metadataValue)
        .limit(20);
      if (error) throw new HttpError(500, error.message);
      appendOwnedRows(data as OrderLookupRow[] | null);
    }

    const rows = Array.from(rowsById.values());

    const compensatedOrderIds: string[] = [];
    const skippedOrderIds: string[] = [];

    for (const order of rows) {
      const metadata = isRecord(order.metadata) ? order.metadata : {};
      const hasStripeSession = Boolean(
        String(metadata.stripe_session_id || metadata.checkout_session_id || "").trim(),
      );

      if (order.status !== "pending_payment" || hasStripeSession) {
        skippedOrderIds.push(order.id);
        continue;
      }

      const metadataWithRestoredStock = await restoreReservedSpecialOfferStock({
        adminClient: actor.adminClient,
        order,
        metadata,
        log: console,
      });

      const { error: updateError } = await actor.adminClient
        .from("orders")
        .update({
          status: "payment_failed",
          payment_status: "failed",
          metadata: {
            ...metadataWithRestoredStock,
            checkout_session_state: "failed",
            payment_failure_code: "checkout_creation_failed",
            payment_failure_message: reason,
            checkout_compensated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "pending_payment");

      if (updateError) {
        skippedOrderIds.push(order.id);
        continue;
      }

      compensatedOrderIds.push(order.id);
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action: "cancel_pending_order_checkout",
      actor,
      request: req,
      targetEntityType: "order",
      metadata: {
        requested_order_count: orderIds.length,
        matched_order_count: rows.length,
        checkout_group_id: checkoutGroupId,
        payment_attempt_id: paymentAttemptId,
        compensated_order_ids: compensatedOrderIds,
        skipped_order_ids: skippedOrderIds,
        reason,
      },
    });

    return jsonResponse({
      success: true,
      compensated_order_ids: compensatedOrderIds,
      skipped_order_ids: skippedOrderIds,
    }, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Internal error";

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        action: "cancel_pending_order_checkout",
        actor,
        request: req,
        errorMessage: message,
      });
    }

    return jsonResponse({ error: message }, status, corsHeaders);
  }
});

