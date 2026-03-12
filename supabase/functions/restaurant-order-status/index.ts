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
import { triggerNotificationDispatch } from "../_shared/notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_STATUSES = new Set([
  "pending",
  "confirmed",
  "preparing",
  "delivering",
  "delivered",
  "cancelled",
]);

function normalizeStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "on_the_way") return "delivering";
  return normalized;
}

type DispatchResult =
  | { state: "skipped" }
  | { state: "scheduled"; scheduled_at: string | null }
  | { state: "queued"; status: number | null }
  | { state: "failed"; error: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      .select("id, user_id, restaurant_id, status, order_number, delivery_address, scheduled_at, estimated_delivery_at, metadata")
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

    const { error: updateError } = await actor.adminClient
      .from("orders")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", order.id);

    if (updateError) throw new HttpError(500, updateError.message);

    const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
      ? order.metadata
      : {};
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
      });

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
      console.error("restaurant-order-status notification dispatch failed:", error);
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
    console.error("restaurant-order-status error:", error);
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
