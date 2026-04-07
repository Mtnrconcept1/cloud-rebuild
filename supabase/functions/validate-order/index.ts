import {
  HttpError,
  authenticateRequest,
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let auditRestaurantId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
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
      userId: actor.userId!,
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
          metadata: authoritativeMetadata,
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
          ...authoritativeMetadata,
          _internal_user_id: actor.userId,
        },
        checkout_id_param: checkoutUuid,
        items_param: itemsJson,
      },
    );

    if (orderError) {
      throw new HttpError(500, orderError.message);
    }

    const orderReference = String(authoritativeMetadata.order_reference || "");
    const hasStripeSession = Boolean((authoritativeMetadata as Record<string, unknown>).stripe_session_id);
    const paymentMethod = String((authoritativeMetadata as Record<string, unknown>).payment_method || "cash");
    const isSettledWithoutStripe = !hasStripeSession && paymentMethod !== "cash" && pricing.total <= 0.01;

    const finalMetadata = isDelivery
      ? enrichDeliveryMetadata(authoritativeMetadata)
      : authoritativeMetadata;
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
        payment_status: hasStripeSession
          ? "pending"
          : (paymentMethod === "cash" ? "pending" : (isSettledWithoutStripe ? "captured" : "authorized")),
        status: hasStripeSession ? "pending_payment" : "confirmed",
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
      .eq("user_id", actor.userId!)
      .maybeSingle();
    const { data: authUser } = await actor.adminClient.auth.admin.getUserById(actor.userId!);
    const userEmail = authUser?.user?.email || "client@tok.ch";

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

    if (isDelivery && scheduledDelivery) {
      await actor.adminClient.from("delivery_tracking").upsert({
        order_id: orderId,
        status: "scheduled",
        estimated_arrival: estimatedDeliveryAt,
      });
    }

    if (!hasStripeSession) {
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
        console.error("validate-order push trigger failed:", error);
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
        scheduled_at: scheduledDelivery?.scheduledAt || null,
      },
    });

    return jsonResponse(
      {
        order_id: orderId,
        verified_total: pricing.total,
        original_total: pricing.originalTotal,
        discount_amount: pricing.discountAmount,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("validate-order error:", error);
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
