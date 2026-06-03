import {
  HttpError,
  authenticateRequest,
  buildRequestMetadata,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildVerifiedOrderPricing } from "../_shared/order-pricing.ts";
import {
  enrichDeliveryMetadata,
  getEstimatedArrivalTime,
  isDeliveryOrder,
  resolveScheduledDelivery,
} from "../_shared/delivery-dispatch.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

interface OrderItem {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  restaurant_id?: string;
  metadata?: Record<string, unknown>;
}

interface ValidateOrderPayload {
  restaurant_id: string;
  delivery_address: string;
  delivery_fee: number;
  total_amount: number;
  notes?: string;
  items: OrderItem[];
  metadata?: Record<string, unknown>;
  checkout_id?: string;
  preview_only?: boolean;
}

function buildItemsSummary(items: Array<{ quantity: number; name: string }>) {
  return items
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ");
}

function getOrderJourneyLabel(input: {
  isDelivery: boolean;
  metadata: Record<string, unknown>;
}) {
  if (input.isDelivery) return "livraison";
  if (typeof input.metadata.pickup_time === "string" && input.metadata.pickup_time) return "a emporter";
  return "commande";
}

function getRecordString(value: Record<string, unknown>, key: string) {
  const raw = value[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function getRecordNumber(value: Record<string, unknown>, key: string, fallback: number) {
  const raw = Number(value[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function resolveCapacityRequestedAt(
  metadata: Record<string, unknown>,
  scheduledDeliveryAt: string | null | undefined,
) {
  if (scheduledDeliveryAt) return scheduledDeliveryAt;

  const scheduledAt = getRecordString(metadata, "scheduled_at")
    || getRecordString(metadata, "scheduled_delivery_at")
    || getRecordString(metadata, "pickup_at");

  if (scheduledAt) return scheduledAt;

  const pickupDate = getRecordString(metadata, "pickup_date");
  const pickupTime = getRecordString(metadata, "pickup_time") || getRecordString(metadata, "arrival_time");
  if (pickupDate && pickupTime && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate) && /^\d{2}:\d{2}/.test(pickupTime)) {
    return `${pickupDate}T${pickupTime.slice(0, 5)}:00+01:00`;
  }

  return new Date().toISOString();
}

async function ensureRestaurantCanAcceptOrder(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  restaurantId: string;
  requestedAt: string;
}) {
  const { data, error } = await input.adminClient.rpc("get_restaurant_order_capacity_state" as any, {
    p_restaurant_id: input.restaurantId,
    p_requested_at: input.requestedAt,
    p_slot_minutes: 15,
  });

  if (error) {
    throw new HttpError(500, error.message);
  }

  const state = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};

  if (state.can_accept_orders !== true) {
    const message = getRecordString(state, "message") || "Ce restaurant ne peut pas accepter cette commande.";
    throw new HttpError(409, message);
  }

  return state;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("validate-order");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditRestaurantId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const requestMetadata = buildRequestMetadata(req);
    const rateLimiter = createRateLimiter(actor.adminClient, "validate-order");
    await rateLimiter.consume(`user:${actor.userId}`, { maxRequests: 60, windowSeconds: 60 });
    if (requestMetadata.ip) {
      await rateLimiter.consume(`ip:${requestMetadata.ip}`, { maxRequests: 180, windowSeconds: 60 });
    }
    await rateLimiter.consume("global", { maxRequests: 1500, windowSeconds: 60 });

    const payload: ValidateOrderPayload = await req.json();
    const {
      restaurant_id,
      delivery_address,
      delivery_fee,
      notes,
      items,
      metadata,
      checkout_id,
      preview_only,
    } = payload;
    auditRestaurantId = restaurant_id;

    if (!restaurant_id || !items || items.length === 0) {
      throw new HttpError(400, "Restaurant et articles requis.");
    }

    const pricing = await buildVerifiedOrderPricing({
      adminClient: actor.adminClient,
      userId: actor.userId,
      restaurantId: restaurant_id,
      items,
      deliveryFee: delivery_fee || 0,
      metadata: metadata || {},
      context: "cart",
    });

    const itemsCount = pricing.validatedItems.reduce((sum, item) => sum + item.quantity, 0);
    const itemsSummary = buildItemsSummary(
      pricing.validatedItems.map((item) => ({ quantity: item.quantity, name: item.name })),
    );

    const baseMetadata = {
      ...(metadata || {}),
      order_reference: String(metadata?.order_reference || ""),
      formula_applied: pricing.formulaName,
      formula_discount_amount: pricing.formulaDiscount,
      formula_discount_percent: pricing.formulaDiscountPercent,
      promotion_applied: pricing.promoName,
      promotion_discount_amount: pricing.promoDiscount,
      promo_code_id: pricing.promoCodeId,
      promo_code_discount_amount: pricing.promoCodeDiscount,
      tok_one_member: pricing.tokOneMember,
      tok_one_discount_amount: pricing.tokOneDiscount,
      tok_one_discount_percent: pricing.tokOneDiscountPercent,
      tok_one_delivery_saved: pricing.tokOneDeliveryDiscount,
      tok_one_total_saved: pricing.tokOneTotalSaved,
      points_discount_amount: pricing.pointsDiscount,
      flex_discount_amount: pricing.flexDiscount,
      pre_discount_subtotal: pricing.subtotal,
      original_total: pricing.originalTotal,
      validated_total: pricing.total,
      quality_fee_amount: pricing.qualityFee,
      items_count: itemsCount,
      items_summary: itemsSummary,
    };

    const isDelivery = isDeliveryOrder({
      deliveryAddress: delivery_address,
      metadata: baseMetadata,
      orderType: String((baseMetadata as Record<string, unknown>).type || ""),
    });

    const scheduledDelivery = isDelivery
      ? await resolveScheduledDelivery(actor.adminClient, restaurant_id, baseMetadata)
      : null;

    const deliveryMetadataBase = scheduledDelivery
      ? {
          ...baseMetadata,
          delivery_schedule_mode: "scheduled",
          delivery_date: scheduledDelivery.dateValue,
          delivery_time: scheduledDelivery.timeValue,
          delivery_service: scheduledDelivery.service,
          scheduled_delivery_at: scheduledDelivery.scheduledAt,
          scheduled_delivery_label: scheduledDelivery.scheduledLabel,
        }
      : baseMetadata;

    const authoritativeMetadata = isDelivery
      ? enrichDeliveryMetadata(deliveryMetadataBase)
      : baseMetadata;
    const capacityState = await ensureRestaurantCanAcceptOrder({
      adminClient: actor.adminClient,
      restaurantId: restaurant_id,
      requestedAt: resolveCapacityRequestedAt(authoritativeMetadata as Record<string, unknown>, scheduledDelivery?.scheduledAt || null),
    });
    const acceptanceDeadlineAt = getRecordString(capacityState, "acceptance_deadline_at");
    const capacityAwareMetadata = {
      ...authoritativeMetadata,
      acceptance_deadline_at: acceptanceDeadlineAt,
      prep_time_minutes: getRecordNumber(capacityState, "prep_time_minutes", 20),
      order_capacity: {
        slot_order_count: getRecordNumber(capacityState, "slot_order_count", 0),
        slot_capacity: getRecordNumber(capacityState, "slot_capacity", 0),
        slot_start: getRecordString(capacityState, "slot_start"),
        slot_end: getRecordString(capacityState, "slot_end"),
      },
    };

    if (preview_only) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "validate-order",
        action: "preview_order_pricing",
        status: "success",
        targetEntityType: "restaurants",
        targetEntityId: restaurant_id,
        metadata: {
          verified_total: pricing.total,
          original_total: pricing.originalTotal,
          discount_amount: pricing.discountAmount,
        },
      });

      return jsonResponse(
        {
          preview_only: true,
          verified_total: pricing.total,
          original_total: pricing.originalTotal,
          discount_amount: pricing.discountAmount,
          metadata: capacityAwareMetadata,
        },
        200,
        corsHeaders,
      );
    }

    const checkoutUuid = checkout_id || crypto.randomUUID();
    const itemsJson = pricing.validatedItems.map((item) => ({
      menu_item_id: /^[0-9a-f-]{36}$/i.test(item.menuItemId) ? item.menuItemId : null,
      restaurant_id: restaurant_id,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.unitPrice * item.quantity,
      metadata: { ...(item.metadata || {}), original_item_id: item.menuItemId },
    }));

    const { data: orderId, error: orderError } = await actor.adminClient.rpc(
      "create_order_with_items",
      {
        restaurant_id_param: restaurant_id,
        delivery_address_param: delivery_address || "",
        delivery_fee_param: pricing.deliveryFee,
        total_amount_param: pricing.total,
        notes_param: notes || null,
        metadata_param: {
          ...capacityAwareMetadata,
          _internal_user_id: actor.userId,
        },
        checkout_id_param: checkoutUuid,
        items_param: itemsJson,
      },
    );

    if (orderError) {
      throw new HttpError(500, orderError.message);
    }

    const orderReference = String(capacityAwareMetadata.order_reference || "");
    const metadataRecord = capacityAwareMetadata as Record<string, unknown>;
    const hasStripeSession = Boolean(metadataRecord.stripe_session_id);
    const checkoutSessionState = String(metadataRecord.checkout_session_state || "");
    const requiresStripeCheckout = metadataRecord.requires_stripe_checkout === true;
    const isAwaitingOnlinePayment = hasStripeSession || checkoutSessionState === "pending" || requiresStripeCheckout;
    const paymentMethod = String(metadataRecord.payment_method || "cash");
    const isSettledWithoutStripe = !isAwaitingOnlinePayment && paymentMethod !== "cash" && pricing.total <= 0.01;

    const finalMetadata = isDelivery
      ? enrichDeliveryMetadata(capacityAwareMetadata)
      : capacityAwareMetadata;
    const estimatedDeliveryAt = isDelivery
      ? getEstimatedArrivalTime(finalMetadata, scheduledDelivery?.scheduledAt || null)
      : null;

    const { error: updateError } = await actor.adminClient
      .from("orders")
      .update({
        order_number: orderReference || null,
        total_amount: pricing.total,
        original_total: pricing.originalTotal,
        discount_amount: pricing.discountAmount,
        scheduled_at: scheduledDelivery?.scheduledAt || null,
        estimated_delivery_at: estimatedDeliveryAt,
        payment_status: isAwaitingOnlinePayment
          ? "pending"
          : (paymentMethod === "cash" ? "pending" : (isSettledWithoutStripe ? "captured" : "authorized")),
        status: isAwaitingOnlinePayment ? "pending_payment" : "confirmed",
        acceptance_deadline_at: isAwaitingOnlinePayment ? null : acceptanceDeadlineAt,
        restaurant_response_status: isAwaitingOnlinePayment ? null : "pending",
        metadata: finalMetadata,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", orderId);

    if (updateError) {
      throw new HttpError(500, updateError.message);
    }

      const { data: profile } = await actor.adminClient
        .from("profiles")
        .select("full_name")
      .eq("user_id", actor.userId)
      .maybeSingle();

    if (!isAwaitingOnlinePayment) {
      const { data: authUser } = await actor.adminClient.auth.admin.getUserById(actor.userId);
      const userEmail = authUser?.user?.email || "client@thetok.ch";

      await actor.adminClient.from("email_queue").insert({
        to_email: userEmail,
        subject: `Confirmation de commande ${orderReference}`.trim(),
        body_text: `Commande enregistree. Total valide: ${pricing.total.toFixed(2)} CHF`,
        metadata: {
          order_id: orderId,
          restaurant_id,
          items: pricing.validatedItems.length,
          customer_name: profile?.full_name || null,
        },
      });
    }

    if (!isAwaitingOnlinePayment && isDelivery && scheduledDelivery) {
      await actor.adminClient.from("delivery_tracking").upsert({
        order_id: orderId,
        status: "scheduled",
        estimated_arrival: estimatedDeliveryAt,
      });
    }

    if (!isAwaitingOnlinePayment) {
      const { data: restaurant } = await actor.adminClient
        .from("restaurants")
        .select("owner_id, name")
        .eq("id", restaurant_id)
        .maybeSingle();

      if (restaurant?.owner_id) {
        const journeyLabel = getOrderJourneyLabel({
          isDelivery,
          metadata: finalMetadata as Record<string, unknown>,
        });

        await enqueueNotification({
          adminClient: actor.adminClient,
          userId: restaurant.owner_id,
          title: "Nouvelle commande",
          body: `${journeyLabel} - ${orderReference || orderId} - ${pricing.total.toFixed(2)} CHF`,
          type: "order",
          category: "transactional",
          data: {
            order_id: orderId,
            order_number: orderReference || null,
            restaurant_id,
            restaurant_name: restaurant.name,
            delivery_address,
            customer_name: profile?.full_name || null,
            items_count: itemsCount,
            items_summary: itemsSummary,
            scheduled_delivery_at: scheduledDelivery?.scheduledAt || null,
            scheduled_delivery_label: scheduledDelivery?.scheduledLabel || null,
            delivery_window_label: finalMetadata.delivery_window_label || null,
            service_mode: journeyLabel,
            pickup_time: finalMetadata.pickup_time || null,
            total_amount: pricing.total,
            url: "/dashboard/commandes",
          },
        });
      }

      try {
        await triggerNotificationDispatch({ source: "validate-order", push: true, email: true });
      } catch (error) {
        log.error("validate-order push trigger failed", { message: error instanceof Error ? error.message : "unknown" });
      }
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "validate-order",
      action: "validate_and_create_order",
      status: "success",
      targetEntityType: "orders",
      targetEntityId: String(orderId),
      metadata: {
        restaurant_id,
        checkout_id: checkoutUuid,
        verified_total: pricing.total,
        slot_order_count: capacityAwareMetadata.order_capacity.slot_order_count,
        slot_capacity: capacityAwareMetadata.order_capacity.slot_capacity,
        prep_time_minutes: capacityAwareMetadata.prep_time_minutes,
        acceptance_deadline_at: acceptanceDeadlineAt,
        scheduled_at: scheduledDelivery?.scheduledAt || null,
      },
    });

    return jsonResponse(
      {
        order_id: orderId,
        verified_total: pricing.total,
        original_total: pricing.originalTotal,
        discount_amount: pricing.discountAmount,
        applied_promo_code_id: pricing.promoCodeId,
        applied_promo_code_discount: pricing.promoCodeDiscount,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    log.error("validate-order error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "validate-order",
      action: "validate_and_create_order",
      status: "failure",
      targetEntityType: auditRestaurantId ? "restaurants" : null,
      targetEntityId: auditRestaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
