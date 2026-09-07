import { HttpError, createAdminClient, getEnv, jsonResponse, writeAuditLog } from "../_shared/auth.ts";
import { enqueueNotification, triggerNotificationDispatch } from "../_shared/notifications.ts";
import { sha256Hex, verifyCloudprinterWebhookApiKey } from "../_shared/print/security.ts";

const MAX_BODY_BYTES = 128_000;

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : value == null ? "" : String(value).trim().slice(0, max);
}

const ORDER_STATE_BY_SIGNAL: Record<string, string> = {
  CloudprinterOrderValidated: "validated",
  ItemValidated: "validated",
  ItemProduce: "producing",
  ItemProduced: "produced",
  ItemPacked: "packed",
  ItemShipped: "shipped",
  ItemError: "production_error",
  ItemCanceled: "canceled",
  ItemDeliveryStarted: "shipped",
  ItemDeliveryCompleted: "delivered",
  ItemDeliveryFailed: "delivery_failed",
};

const REORDER_STATE_BY_SIGNAL: Record<string, string> = {
  CloudprinterOrderValidated: "submitted",
  ItemValidated: "submitted",
  ItemProduce: "producing",
  ItemProduced: "produced",
  ItemPacked: "packed",
  ItemShipped: "shipped",
  ItemError: "failed",
  ItemCanceled: "canceled",
  ItemDeliveryStarted: "shipped",
  ItemDeliveryCompleted: "delivered",
  ItemDeliveryFailed: "failed",
};

function safeTrackingUrl(value: unknown) {
  const raw = text(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function deriveProviderEventId(payload: RecordValue) {
  const stableFacts = [
    text(payload.type, 80),
    text(payload.order, 200),
    text(payload.item, 200),
    text(payload.order_reference, 200),
    text(payload.item_reference, 200),
    text(payload.datetime, 80),
    text(payload.tracking, 200),
    text(payload.cause, 300),
    text(payload.message, 300),
  ].join("|");
  return sha256Hex(new TextEncoder().encode(stableFacts));
}

function notificationForState(state: string, orderId: string) {
  const data = {
    print_order_id: orderId,
    link: `/dashboard/photos?print_order_id=${encodeURIComponent(orderId)}`,
  };
  if (state === "shipped") {
    return {
      title: "Vos impressions sont expédiées",
      body: "Votre commande TheTok Print est en route.",
      type: "print_shipped",
      data,
    };
  }
  if (state === "delivered") {
    return {
      title: "Impressions livrées",
      body: "Votre commande TheTok Print est indiquée comme livrée.",
      type: "print_delivered",
      data,
    };
  }
  if (state === "production_error") {
    return {
      title: "Action requise pour votre impression",
      body: "Un incident de production a été signalé. Le support TheTok peut intervenir.",
      type: "print_issue",
      data,
    };
  }
  if (state === "delivery_failed") {
    return {
      title: "Problème de livraison",
      body: "La livraison de votre commande d’impression a rencontré un problème.",
      type: "print_delivery_issue",
      data,
    };
  }
  return null;
}

async function notifyOrderOwner(adminClient: any, userId: string | null, state: string, orderId: string) {
  if (!userId) return;
  const notification = notificationForState(state, orderId);
  if (!notification) return;
  await enqueueNotification({
    adminClient,
    userId,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    category: "print",
    data: notification.data,
    requestedChannels: {
      in_app: true,
      push: true,
      email: state === "production_error" || state === "delivery_failed",
    },
  });
  await triggerNotificationDispatch({
    push: true,
    email: state === "production_error" || state === "delivery_failed",
    source: "cloudprinter-webhook",
    userId,
  });
}

Deno.serve(async (req) => {
  const adminClient = createAdminClient();
  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "Payload too large");
    }

    let payload: RecordValue;
    try {
      payload = asRecord(JSON.parse(rawBody));
    } catch {
      throw new HttpError(400, "JSON invalide");
    }

    const configuredKey = getEnv("CLOUDPRINTER_WEBHOOK_API_KEY");
    if (!configuredKey) throw new HttpError(503, "Webhook Cloudprinter non configuré");
    if (!verifyCloudprinterWebhookApiKey(text(payload.apikey, 300), configuredKey)) {
      throw new HttpError(401, "Webhook Cloudprinter invalide");
    }

    const eventType = text(payload.type, 80);
    const normalizedState = ORDER_STATE_BY_SIGNAL[eventType];
    if (!normalizedState) throw new HttpError(400, "Signal Cloudprinter non supporté");
    const orderReference = text(payload.order_reference, 200);
    if (!orderReference) throw new HttpError(400, "order_reference requis");
    const providerEventId = await deriveProviderEventId(payload);

    const storedPayload = { ...payload };
    delete storedPayload.apikey;
    const { data: recorded, error: recordError } = await adminClient.rpc("record_print_provider_event", {
      p_provider: "cloudprinter",
      p_provider_event_id: providerEventId,
      p_event_type: eventType,
      p_provider_order_reference: orderReference,
      p_provider_item_reference: text(payload.item_reference, 200) || null,
      p_provider_order_id: text(payload.order, 200) || null,
      p_provider_item_id: text(payload.item, 200) || null,
      p_occurred_at: text(payload.datetime, 80) || null,
      p_normalized_state: normalizedState,
      p_payload: storedPayload,
    });
    if (recordError) throw recordError;
    if (asRecord(recorded).duplicate === true) return new Response(null, { status: 204 });

    const providerOrderId = text(payload.order, 200) || null;
    const providerItemId = text(payload.item, 200) || null;
    const itemReference = text(payload.item_reference, 200);
    const trackingCode = text(payload.tracking, 200) || null;
    const trackingUrl = safeTrackingUrl(payload.url);
    const carrier = text(payload.shipping_option, 200) || null;

    const { data: order, error: orderError } = await adminClient
      .from("print_orders")
      .select("id, restaurant_id, owner_user_id, status")
      .eq("provider", "cloudprinter")
      .eq("provider_reference", orderReference)
      .maybeSingle();
    if (orderError) throw orderError;

    if (order) {
      const { data: transition, error: advanceError } = await adminClient.rpc("advance_print_order_state", {
        p_order_id: order.id,
        p_state: normalizedState,
        p_provider_state: eventType,
        p_tracking_code: trackingCode,
        p_tracking_url: trackingUrl,
        p_carrier: carrier,
        p_provider_event_id: providerEventId,
        p_message: text(payload.message || payload.cause, 500) || null,
        p_metadata: {
          item_reference: itemReference || null,
          delay_hours: text(payload.delay, 40) || null,
          monotonic: true,
        },
      });
      if (advanceError) throw advanceError;

      if (providerOrderId) {
        const { error } = await adminClient
          .from("print_orders")
          .update({ provider_order_id: providerOrderId, updated_at: new Date().toISOString() })
          .eq("id", order.id);
        if (error) throw error;
      }
      if (itemReference && providerItemId) {
        const { error } = await adminClient
          .from("print_order_items")
          .update({ provider_item_id: providerItemId, provider_state: eventType, updated_at: new Date().toISOString() })
          .eq("print_order_id", order.id)
          .eq("item_reference", itemReference);
        if (error) throw error;
      }

      if (asRecord(transition).advanced === true) {
        await notifyOrderOwner(adminClient, order.owner_user_id, normalizedState, order.id);
      }

      await writeAuditLog({
        adminClient,
        actor: { userId: null, roles: ["cloudprinter_webhook"], isServiceRole: true, authMode: "service_role" },
        request: req,
        functionName: "cloudprinter-webhook",
        action: eventType,
        status: "success",
        targetEntityType: "print_orders",
        targetEntityId: order.id,
        metadata: { provider_event_id: providerEventId, normalized_state: normalizedState },
      });
      return new Response(null, { status: 204 });
    }

    const { data: reorder, error: reorderError } = await adminClient
      .from("print_reorders")
      .select("id")
      .eq("provider", "cloudprinter")
      .eq("provider_reference", orderReference)
      .maybeSingle();
    if (reorderError) throw reorderError;
    if (!reorder) return new Response(null, { status: 204 });

    const reorderState = REORDER_STATE_BY_SIGNAL[eventType];
    const { error: advanceReorderError } = await adminClient.rpc("advance_print_reorder_state", {
      p_reorder_id: reorder.id,
      p_state: reorderState,
      p_provider_order_id: providerOrderId,
      p_provider_item_id: providerItemId,
      p_tracking_code: trackingCode,
      p_tracking_url: trackingUrl,
      p_carrier: carrier,
    });
    if (advanceReorderError) throw advanceReorderError;

    await writeAuditLog({
      adminClient,
      actor: { userId: null, roles: ["cloudprinter_webhook"], isServiceRole: true, authMode: "service_role" },
      request: req,
      functionName: "cloudprinter-webhook",
      action: `reorder:${eventType}`,
      status: "success",
      targetEntityType: "print_reorders",
      targetEntityId: reorder.id,
      metadata: { provider_event_id: providerEventId, normalized_state: reorderState },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Erreur webhook Cloudprinter";
    await writeAuditLog({
      adminClient,
      actor: { userId: null, roles: ["cloudprinter_webhook"], isServiceRole: true, authMode: "service_role" },
      request: req,
      functionName: "cloudprinter-webhook",
      action: "receive",
      status: "failure",
      targetEntityType: "print_provider_events",
      errorMessage: message,
    });
    return jsonResponse({ error: status >= 500 ? "Erreur interne webhook impression" : message }, status);
  }
});
