import {
  HttpError,
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
import { makeLogger } from "../_shared/logging.ts";
import { triggerNotificationDispatch } from "../_shared/notifications.ts";

const ALLOWED_STATUSES = new Set([
  "pending",
  "confirmed",
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
  | { state: "failed"; error: string };

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("restaurant-order-status");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditOrderId: string | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });

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
      .select("id, user_id, restaurant_id, status, payment_status, order_number, delivery_address, scheduled_at, estimated_delivery_at, metadata")
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

    const { error: updateError } = await actor.adminClient
      .from("orders")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
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
            error: response.body || "Dispatch failed",
          };
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
        dispatch,
      },
    });

    return jsonResponse({
      order_id: order.id,
      previous_status: previousStatus,
      status: nextStatus,
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
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
