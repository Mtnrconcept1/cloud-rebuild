import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import {
  getEstimatedArrivalTime,
  isDeliveryOrder,
  shouldDispatchDeliveryNow,
  triggerDispatchOrder,
} from "../_shared/delivery-dispatch.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getEdgeErrorDiagnostic, getEdgeErrorPayload } from "../_shared/error-diagnostics.ts";
import { makeLogger } from "../_shared/logging.ts";
import { notifyAdmins, triggerNotificationDispatch } from "../_shared/notifications.ts";

const ALLOWED_STATUSES = new Set([
  "pending",
  "confirmed",
  "accepted",
  "preparing",
  "ready",
  "delivering",
  "delivered",
  "cancelled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTruthy(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "oui";
}

function hasSpecialPaidOrderMarkers(metadata: Record<string, unknown>) {
  const feature = String(metadata.feature || "").trim().toLowerCase();
  const hasAntiGaspi = isTruthy(metadata.has_anti_gaspi)
    || isTruthy(metadata.is_anti_waste)
    || feature === "anti-gaspi"
    || feature === "anti_waste"
    || feature === "zero-gaspi"
    || String(metadata.anti_waste_offer_id || "").trim() !== "";
  const hasFlashSale = isTruthy(metadata.has_flash_sale)
    || isTruthy(metadata.is_flash_sale)
    || feature === "ventes-flash"
    || feature === "ventes_flash"
    || feature === "flash_sale"
    || feature === "flash-sale"
    || String(metadata.flash_sale_id || "").trim() !== "";

  return hasAntiGaspi || hasFlashSale;
}

function isPaidSpecialOrderLocked(
  paymentStatus: unknown,
  metadata: unknown,
  orderItems: Array<{ anti_waste_offer_id?: string | null; metadata?: unknown }> = [],
) {
  const normalizedPaymentStatus = String(paymentStatus || "").trim().toLowerCase();
  if (normalizedPaymentStatus !== "captured" && normalizedPaymentStatus !== "paid") {
    return false;
  }

  const safeMetadata = isRecord(metadata) ? metadata : {};
  if (hasSpecialPaidOrderMarkers(safeMetadata)) {
    return true;
  }

  return orderItems.some((item) => {
    const itemMetadata = isRecord(item.metadata) ? item.metadata : {};
    return Boolean(item.anti_waste_offer_id)
      || String(itemMetadata.flash_sale_id || "").trim() !== ""
      || isTruthy(itemMetadata.is_anti_waste)
      || isTruthy(itemMetadata.is_flash_sale);
  });
}

function normalizeStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "on_the_way") return "delivering";
  if (normalized === "ready_for_pickup") return "ready";
  if (normalized === "picked_up") return "delivered";
  return normalized;
}

type DispatchResult =
  | { state: "skipped" }
  | { state: "scheduled"; scheduled_at: string | null }
  | { state: "queued"; status: number | null }
  | { state: "failed"; error: string; status: number | null; diagnostic: Record<string, unknown> | null };

async function upsertDispatchRetryAlert(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  orderId: string;
  orderNumber: string | null;
  dispatch: Extract<DispatchResult, { state: "failed" }>;
}) {
  const { data: existingJob } = await input.adminClient
    .from("dispatch_jobs")
    .select("id")
    .eq("order_id", input.orderId)
    .not("status", "in", "(delivered,cancelled)")
    .maybeSingle();

  let dispatchJobId = existingJob?.id || null;
  if (dispatchJobId) {
    await input.adminClient
      .from("dispatch_jobs")
      .update({
        status: "no_courier",
        cancel_reason: `Dispatch retry required: ${input.dispatch.error}`.slice(0, 240),
        updated_at: new Date().toISOString(),
      })
      .eq("id", dispatchJobId);
  } else {
    const { data: newJob } = await input.adminClient
      .from("dispatch_jobs")
      .insert({
        order_id: input.orderId,
        status: "no_courier",
        cancel_reason: `Dispatch retry required: ${input.dispatch.error}`.slice(0, 240),
      })
      .select("id")
      .maybeSingle();
    dispatchJobId = newJob?.id || null;
  }

  const alertKey = `dispatch:retry-required:${input.orderId}`;
  const note = [
    `Dispatch a reprendre pour la commande ${input.orderNumber || input.orderId.slice(0, 8)}.`,
    input.dispatch.status ? `Statut HTTP ${input.dispatch.status}.` : null,
    input.dispatch.error,
  ].filter(Boolean).join(" ");

  await input.adminClient
    .from("marketplace_alert_states")
    .upsert({
      alert_key: alertKey,
      status: "new",
      note,
      handled_by: null,
      handled_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "alert_key" });

  await input.adminClient
    .from("marketplace_alert_state_history")
    .insert({
      alert_key: alertKey,
      previous_status: null,
      next_status: "new",
      note,
      metadata: {
        source: "restaurant-order-status",
        order_id: input.orderId,
        order_number: input.orderNumber,
        dispatch_job_id: dispatchJobId,
        dispatch: input.dispatch,
        action_url: dispatchJobId
          ? `/admin/commandes-reservations?dispatch=${dispatchJobId}`
          : `/admin/commandes-reservations?order=${input.orderId}`,
        recommended_action: "Relancer dispatch-order depuis Operations Center ou assigner un livreur.",
      },
    });

  const actionUrl = dispatchJobId
    ? `/admin/commandes-reservations?dispatch=${dispatchJobId}`
    : `/admin/commandes-reservations?tab=orders&operation=${input.orderId}`;

  await notifyAdmins({
    adminClient: input.adminClient,
    title: "Dispatch à reprendre",
    body: note.slice(0, 240),
    type: "dispatch_alert",
    category: "system",
    data: {
      url: actionUrl,
      action_url: actionUrl,
      order_id: input.orderId,
      order_number: input.orderNumber,
      dispatch_job_id: dispatchJobId,
      status: "dispatch_retry_required",
      source: "restaurant-order-status",
    },
    requestedChannels: { in_app: true, push: true, email: false },
  }).catch((error) => {
    console.warn("[restaurant-order-status] dispatch retry admin notification failed", error);
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("restaurant-order-status");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditOrderId: string | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    await assertProductionFlowAllowed(actor, "mise à jour de commande réelle");

    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const payload = await req.json().catch(() => ({}));
    const orderId = String(payload?.order_id || "").trim();
    const nextStatus = normalizeStatus(payload?.status);
    auditOrderId = orderId || null;

    if (!orderId || !nextStatus) {
      throw new HttpError(400, "Commande et statut requis.");
    }

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      throw new HttpError(400, "Statut de commande invalide.");
    }

    const { data: order, error: orderError } = await actor.adminClient
      .from("orders")
      .select("id, user_id, restaurant_id, status, payment_status, order_number, delivery_address, scheduled_at, estimated_delivery_at, restaurant_viewed_at, restaurant_accepted_at, acceptance_deadline_at, restaurant_response_status, metadata")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw new HttpError(500, orderError.message);
    if (!order) throw new HttpError(404, "Commande introuvable.");

    await requireRestaurantAccess(actor, order.restaurant_id);

    const previousStatus = normalizeStatus(order.status);
    if (previousStatus === nextStatus) {
      return jsonResponse({
        order_id: order.id,
        previous_status: previousStatus,
        status: nextStatus,
        dispatch: { state: "skipped" },
      }, 200, corsHeaders);
    }

    const { data: orderItems, error: orderItemsError } = await actor.adminClient
      .from("order_items")
      .select("anti_waste_offer_id, metadata")
      .eq("order_id", order.id);

    if (orderItemsError) throw new HttpError(500, orderItemsError.message);

    if (isPaidSpecialOrderLocked(order.payment_status, order.metadata, orderItems || [])) {
      throw new HttpError(400, "Cette commande speciale payee ne peut plus changer de statut.");
    }

    const nowIso = new Date().toISOString();
    const acceptanceDeadlineAt = typeof order.acceptance_deadline_at === "string" ? order.acceptance_deadline_at : null;
    const acceptance_deadline_exceeded = Boolean(
      acceptanceDeadlineAt && Date.parse(acceptanceDeadlineAt) < Date.now() && !order.restaurant_accepted_at,
    );
    const shouldMarkAccepted = ["accepted", "preparing", "ready", "delivering", "delivered"].includes(nextStatus);
    const responseStatus = shouldMarkAccepted
      ? "accepted"
      : (order.restaurant_response_status === "accepted" ? "accepted" : "viewed");

    const { error: updateError } = await actor.adminClient
      .from("orders")
      .update({
        status: nextStatus,
        restaurant_viewed_at: order.restaurant_viewed_at || nowIso,
        restaurant_accepted_at: shouldMarkAccepted ? (order.restaurant_accepted_at || nowIso) : order.restaurant_accepted_at,
        restaurant_response_status: responseStatus,
        updated_at: nowIso,
      } as any)
      .eq("id", order.id);

    if (updateError) {
      if (updateError.code === "P0001") {
        throw new HttpError(400, updateError.message);
      }
      throw new HttpError(500, updateError.message);
    }

    const metadata = isRecord(order.metadata) ? order.metadata : {};
    const scheduledAt = typeof order.scheduled_at === "string"
      ? order.scheduled_at
      : (typeof metadata.scheduled_delivery_at === "string" ? metadata.scheduled_delivery_at : null);
    const deliveryOrder = isDeliveryOrder({
      deliveryAddress: order.delivery_address,
      metadata,
      orderType: String((metadata as Record<string, unknown>).type || ""),
    });

    let dispatch: DispatchResult = { state: "skipped" };

    if (deliveryOrder && nextStatus === "preparing") {
      const estimatedArrival = getEstimatedArrivalTime(metadata, scheduledAt);
      const dispatchNow = shouldDispatchDeliveryNow(metadata, scheduledAt);

      await actor.adminClient.from("delivery_tracking").upsert({
        order_id: order.id,
        status: dispatchNow ? "preparing" : "scheduled",
        estimated_arrival: estimatedArrival,
      }, { onConflict: "order_id" });

      if (!dispatchNow) {
        dispatch = {
          state: "scheduled",
          scheduled_at: scheduledAt,
        };
      } else {
        const response = await triggerDispatchOrder({ orderId: order.id });
        if (response.ok) {
          dispatch = {
            state: "queued",
            status: typeof response.status === "number" ? response.status : null,
          };
        } else {
          dispatch = {
            state: "failed",
            status: typeof response.status === "number" ? response.status : null,
            error: response.error || response.body || "Dispatch failed",
            diagnostic: response.diagnostic || null,
          };
          await upsertDispatchRetryAlert({
            adminClient: actor.adminClient,
            orderId: order.id,
            orderNumber: order.order_number || null,
            dispatch,
          });
        }
      }
    }

    try {
      await triggerNotificationDispatch({
        source: "restaurant-order-status",
        push: true,
        email: true,
      });
    } catch (error) {
      log.error("restaurant-order-status notification dispatch failed", { message: error instanceof Error ? error.message : "unknown" });
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "restaurant-order-status",
      action: "update_order_status",
      status: dispatch.state === "failed" ? "failure" : "success",
      targetEntityType: "orders",
      targetEntityId: order.id,
      errorMessage: dispatch.state === "failed" ? dispatch.error : null,
      metadata: {
        previous_status: previousStatus,
        status: nextStatus,
        restaurant_response_status: responseStatus,
        restaurant_viewed_at: order.restaurant_viewed_at || nowIso,
        restaurant_accepted_at: shouldMarkAccepted ? (order.restaurant_accepted_at || nowIso) : order.restaurant_accepted_at,
        acceptance_deadline_at: acceptanceDeadlineAt,
        acceptance_deadline_exceeded,
        dispatch,
      },
    });

    return jsonResponse({
      order_id: order.id,
      previous_status: previousStatus,
      status: nextStatus,
      restaurant_response_status: responseStatus,
      restaurant_viewed_at: order.restaurant_viewed_at || nowIso,
      restaurant_accepted_at: shouldMarkAccepted ? (order.restaurant_accepted_at || nowIso) : order.restaurant_accepted_at,
      acceptance_deadline_at: acceptanceDeadlineAt,
      acceptance_deadline_exceeded,
      dispatch,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("restaurant-order-status error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "restaurant-order-status",
      action: "update_order_status",
      status: "failure",
      targetEntityType: "orders",
      targetEntityId: auditOrderId,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
      metadata: {
        diagnostic: getEdgeErrorDiagnostic(error, actor),
      },
    });

    if (error instanceof HttpError) {
      return jsonResponse(getEdgeErrorPayload(error, actor), error.status, corsHeaders);
    }

    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message, diagnostic: getEdgeErrorDiagnostic(error, actor) }, 500, corsHeaders);
  }
});
