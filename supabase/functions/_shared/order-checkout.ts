import Stripe from "npm:stripe@18.5.0";

import {
  enrichDeliveryMetadata,
  getEstimatedArrivalTime,
  isDeliveryOrder,
} from "./delivery-dispatch.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "./notifications.ts";
import { recordOrderChargeIfMissing } from "./payment-transactions.ts";
import { queueOrderConfirmationEmails, type TransactionalEmailItem } from "./transactional-emails.ts";

type JsonRecord = Record<string, unknown>;

type LoggerLike = {
  error?: (event: string, data?: Record<string, unknown>) => void;
};

export type OrderLookupRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  user_id: string | null;
  restaurant_id: string;
  delivery_address: string | null;
  total_amount: number | null;
  original_total?: number | null;
  discount_amount?: number | null;
  delivery_fee?: number | null;
  service_fee_amount?: number | null;
  order_number: string | null;
  metadata: JsonRecord | null;
  scheduled_at: string | null;
};

export type FinalizedOrderSummary = {
  id: string;
  order_number: string | null;
  restaurant_id: string;
  total_amount: number;
  status: string;
  payment_status: string;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseUuid(value: unknown) {
  const raw = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : null;
}

function getOrderJourneyLabel(input: {
  isDelivery: boolean;
  metadata: Record<string, unknown>;
}) {
  if (input.isDelivery) return "livraison";
  if (typeof input.metadata.pickup_time === "string" && input.metadata.pickup_time) return "a emporter";
  return "commande";
}

export async function restoreReservedSpecialOfferStock(input: {
  adminClient: any;
  order: OrderLookupRow;
  metadata: JsonRecord;
  log?: LoggerLike;
}) {
  if (input.metadata.special_offer_stock_restored_at) {
    return input.metadata;
  }

  const { data: rows, error } = await input.adminClient
    .from("order_items")
    .select("quantity, metadata")
    .eq("order_id", input.order.id);

  if (error) {
    input.log?.error?.("special_offer_stock_restore_lookup_failed", {
      orderId: input.order.id,
      message: error.message,
    });
    return input.metadata;
  }

  const antiWasteQuantities = new Map<string, number>();
  const flashSaleQuantities = new Map<string, number>();

  for (const row of rows || []) {
    const itemMetadata = isJsonRecord(row.metadata) ? row.metadata : {};
    const quantity = Math.max(1, Number(row.quantity || 1));
    const antiWasteOfferId = parseUuid(itemMetadata.anti_waste_offer_id || itemMetadata.offer_id);
    const flashSaleId = parseUuid(itemMetadata.flash_sale_id);

    if (antiWasteOfferId) {
      antiWasteQuantities.set(antiWasteOfferId, (antiWasteQuantities.get(antiWasteOfferId) || 0) + quantity);
    }
    if (flashSaleId) {
      flashSaleQuantities.set(flashSaleId, (flashSaleQuantities.get(flashSaleId) || 0) + quantity);
    }
  }

  const restoreCalls = [
    ...Array.from(antiWasteQuantities.entries()).map(([id, quantity]) => ({
      table: "anti_waste_offers",
      id,
      quantity,
    })),
    ...Array.from(flashSaleQuantities.entries()).map(([id, quantity]) => ({
      table: "flash_sales",
      id,
      quantity,
    })),
  ];

  if (restoreCalls.length === 0) {
    return {
      ...input.metadata,
      special_offer_stock_restored_at: new Date().toISOString(),
      special_offer_stock_restored: false,
    };
  }

  for (const call of restoreCalls) {
    const { error: restoreError } = await input.adminClient.rpc("restore_special_offer_stock", {
      p_table: call.table,
      p_id: call.id,
      p_qty: call.quantity,
    });

    if (restoreError) {
      input.log?.error?.("special_offer_stock_restore_failed", {
        orderId: input.order.id,
        table: call.table,
        id: call.id,
        quantity: call.quantity,
        message: restoreError.message,
      });
      return input.metadata;
    }
  }

  return {
    ...input.metadata,
    special_offer_stock_restored_at: new Date().toISOString(),
    special_offer_stock_restored: true,
    restored_anti_waste_offer_count: antiWasteQuantities.size,
    restored_flash_sale_count: flashSaleQuantities.size,
  };
}

export function allocateAmounts(totalAmount: number, rows: Array<{ amount: number }>) {
  const totalBase = rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
  let remaining = Math.round(totalAmount * 100) / 100;

  return rows.map((row, index) => {
    const share = totalBase > 0 ? Math.max(0, Number(row.amount || 0)) / totalBase : (rows.length > 0 ? 1 / rows.length : 0);
    const value = index === rows.length - 1
      ? Math.max(0, remaining)
      : Math.round((totalAmount * share) * 100) / 100;
    remaining = Math.max(0, Math.round((remaining - value) * 100) / 100);
    return value;
  });
}

async function findOrdersByIdentifiers(
  adminClient: any,
  identifiers: {
    sessionId: string;
    checkoutId?: string | null;
    checkoutGroupId?: string | null;
    orderReference?: string | null;
  },
): Promise<OrderLookupRow[]> {
  const ordersById = new Map<string, OrderLookupRow>();

  const appendOrders = (rows: OrderLookupRow[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.id) ordersById.set(String(row.id), row);
    }
  };

  const baseSelect = "id, status, payment_status, user_id, restaurant_id, delivery_address, total_amount, original_total, discount_amount, delivery_fee, service_fee_amount, order_number, metadata, scheduled_at";

  const { data: sessionOrders } = await adminClient
    .from("orders")
    .select(baseSelect)
    .filter("metadata->>stripe_session_id", "eq", identifiers.sessionId);
  appendOrders(sessionOrders as OrderLookupRow[] | null | undefined);

  if (identifiers.checkoutGroupId) {
    const { data: groupOrders } = await adminClient
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>checkout_group_id", "eq", identifiers.checkoutGroupId);
    appendOrders(groupOrders as OrderLookupRow[] | null | undefined);
  }

  if (identifiers.checkoutId) {
    const { data: checkoutOrders } = await adminClient
      .from("orders")
      .select(baseSelect)
      .eq("checkout_id", identifiers.checkoutId);
    appendOrders(checkoutOrders as OrderLookupRow[] | null | undefined);
  }

  if (identifiers.orderReference) {
    const { data: refOrders } = await adminClient
      .from("orders")
      .select(baseSelect)
      .eq("order_number", identifiers.orderReference);
    appendOrders(refOrders as OrderLookupRow[] | null | undefined);
  }

  return Array.from(ordersById.values()).sort((left, right) => {
    if (left.order_number && right.order_number) {
      return left.order_number.localeCompare(right.order_number);
    }
    return left.id.localeCompare(right.id);
  });
}

export async function findOrdersForSession(
  adminClient: any,
  session: Stripe.Checkout.Session,
) {
  return findOrdersByIdentifiers(adminClient, {
    sessionId: session.id,
    checkoutId: session.metadata?.checkout_id || null,
    checkoutGroupId: session.metadata?.checkout_group_id || null,
    orderReference: session.metadata?.order_reference || null,
  });
}

export async function getStripePaymentMethodDetails(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  log?: LoggerLike,
) {
  let cardBrand = "";
  let cardLast4 = "";
  let billingPhone = "";

  const expandedPaymentIntent = session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent
    : null;
  const expandedPaymentMethod = expandedPaymentIntent?.payment_method
    && typeof expandedPaymentIntent.payment_method === "object"
    ? expandedPaymentIntent.payment_method
    : null;

  if (expandedPaymentMethod) {
    billingPhone = expandedPaymentMethod.billing_details?.phone || "";
    if (expandedPaymentMethod.card) {
      cardBrand = expandedPaymentMethod.card.brand || "";
      cardLast4 = expandedPaymentMethod.card.last4 || "";
    }
    return { cardBrand, cardLast4, billingPhone };
  }

  if (session.payment_intent && typeof session.payment_intent === "string") {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ["payment_method"],
      });
      const paymentMethod = paymentIntent.payment_method;
      if (paymentMethod && typeof paymentMethod !== "string") {
        billingPhone = paymentMethod.billing_details?.phone || "";
        if (paymentMethod.card) {
          cardBrand = paymentMethod.card.brand || "";
          cardLast4 = paymentMethod.card.last4 || "";
        }
      }
    } catch (error) {
      log?.error?.("order_checkout_payment_method_lookup_failed", {
        message: error instanceof Error ? error.message : "unknown",
        sessionId: session.id,
      });
    }
  }

  return { cardBrand, cardLast4, billingPhone };
}

function getPublicAppBaseUrl() {
  return Deno.env.get("PUBLIC_APP_URL")
    || Deno.env.get("APP_BASE_URL")
    || Deno.env.get("SITE_URL")
    || "https://www.thetok.ch";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRelatedRow(value: unknown) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

async function fetchOrderEmailItems(adminClient: any, orderId: string): Promise<TransactionalEmailItem[]> {
  const { data, error } = await adminClient
    .from("order_items")
    .select("quantity, unit_price, total_price, metadata, menu_items(name, description, image_url)")
    .eq("order_id", orderId);

  if (error) throw error;

  return ((data || []) as Array<Record<string, unknown>>).map((row) => {
    const metadata = isJsonRecord(row.metadata) ? row.metadata : {};
    const menuItem = normalizeRelatedRow(row.menu_items);
    return {
      name: readString(menuItem?.name) || readString(metadata.name) || "Article",
      description: readString(menuItem?.description) || readString(metadata.description),
      quantity: Math.max(1, readNumber(row.quantity, 1)),
      unitPrice: readNumber(row.unit_price),
      totalPrice: readNumber(row.total_price),
      imageUrl: readString(menuItem?.image_url) || readString(metadata.image_url),
    };
  });
}

async function getAuthUserEmail(adminClient: any, userId: string | null | undefined) {
  if (!userId) return null;
  const { data } = await adminClient.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

export async function finalizePaidOrderCheckout(input: {
  adminClient: any;
  session: Stripe.Checkout.Session;
  cardBrand: string;
  cardLast4: string;
  billingPhone?: string | null;
  log?: LoggerLike;
  shouldDispatchNotifications?: boolean;
}) {
  const {
    adminClient,
    session,
    cardBrand,
    cardLast4,
    billingPhone,
    log,
    shouldDispatchNotifications = true,
  } = input;

  const orders = await findOrdersForSession(adminClient, session);
  if (!orders.length) {
    return {
      orders: [] as FinalizedOrderSummary[],
      primaryOrderId: null,
      checkoutGroupId: session.metadata?.checkout_group_id || null,
      orderReference: session.metadata?.order_reference || null,
      newlyFinalized: false,
    };
  }

  const allocations = allocateAmounts(
    (session.amount_total || 0) / 100,
    orders.map((order) => ({ amount: Number(order.total_amount || 0) })),
  );

  const explicitPrimaryOrderId = parseUuid(session.metadata?.primary_order_id);
  const primaryOrder = orders.find((order) => order.id === explicitPrimaryOrderId)
    || orders.find((order) => order.order_number === session.metadata?.order_reference)
    || orders[0];

  if (primaryOrder?.user_id) {
    const pointsToRedeem = Math.max(0, Number(session.metadata?.points_to_redeem || 0));
    const promoCodeId = parseUuid(session.metadata?.promo_code_id);
    const promoCodeDiscountAmount = Math.max(0, Number(session.metadata?.promo_code_discount_amount || 0));

    if (pointsToRedeem > 0 || promoCodeId) {
      const { error: benefitsError } = await adminClient.rpc("apply_checkout_benefits", {
        p_user_id: primaryOrder.user_id,
        p_order_id: primaryOrder.id,
        p_points_to_redeem: pointsToRedeem,
        p_promo_code_id: promoCodeId,
        p_discount_applied: promoCodeDiscountAmount,
        p_description: `Paiement commande ${primaryOrder.order_number || primaryOrder.id}`,
      });

      if (benefitsError) {
        throw benefitsError;
      }
    }
  }

  const finalizedOrders: FinalizedOrderSummary[] = [];
  let shouldDispatch = false;

  for (const [index, order] of orders.entries()) {
    const existingMetadata = isJsonRecord(order.metadata) ? order.metadata : {};
    const isDelivery = isDeliveryOrder({
      deliveryAddress: order.delivery_address,
      metadata: existingMetadata,
      orderType: String(existingMetadata.type || ""),
    });
    const deliveryMetadata = isDelivery ? enrichDeliveryMetadata(existingMetadata) : existingMetadata;
    const scheduledAt = isDelivery
      ? String(deliveryMetadata.scheduled_delivery_at || order.scheduled_at || "") || null
      : null;
    const estimatedDeliveryAt = isDelivery
      ? getEstimatedArrivalTime(deliveryMetadata, scheduledAt)
      : null;
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
    const paymentMethod = String(existingMetadata.payment_method || session.metadata?.payment_method_label || "card");
    const wasAlreadyFinalized = order.status === "confirmed" && order.payment_status === "captured";

    await adminClient
      .from("orders")
      .update({
        status: "confirmed",
        payment_status: "captured",
        estimated_delivery_at: estimatedDeliveryAt,
        metadata: {
          ...deliveryMetadata,
          stripe_session_id: session.id,
          stripe_payment_intent: paymentIntentId,
          payment_status: session.payment_status,
          payment_method: paymentMethod,
          billing_phone: billingPhone || null,
          card_brand: cardBrand,
          card_last4: cardLast4,
          checkout_session_state: "completed",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await recordOrderChargeIfMissing({
      adminClient,
      orderId: order.id,
      userId: order.user_id,
      sessionId: session.id,
      paymentIntentId,
      amount: allocations[index] || 0,
      currency: (session.currency || "chf").toLowerCase(),
      metadata: {
        card_brand: cardBrand,
        card_last4: cardLast4,
        billing_phone: billingPhone || null,
        payment_method: paymentMethod,
        order_reference: order.order_number || session.metadata?.order_reference || null,
      },
      log,
    });

    if (isDelivery && scheduledAt) {
      await adminClient.from("delivery_tracking").upsert({
        order_id: order.id,
        status: "scheduled",
        estimated_arrival: estimatedDeliveryAt,
      });
    }

    finalizedOrders.push({
      id: order.id,
      order_number: order.order_number,
      restaurant_id: order.restaurant_id,
      total_amount: Number(order.total_amount || 0),
      status: "confirmed",
      payment_status: "captured",
    });

    if (wasAlreadyFinalized) {
      continue;
    }

    shouldDispatch = true;

    const { data: restaurant } = await adminClient
      .from("restaurants")
      .select("id, owner_id, name, address, city, phone")
      .eq("id", order.restaurant_id)
      .maybeSingle();
    const { data: profile } = order.user_id
      ? await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", order.user_id)
        .maybeSingle()
      : { data: null };

    if (restaurant?.owner_id) {
      const journeyLabel = getOrderJourneyLabel({
        isDelivery,
        metadata: deliveryMetadata as Record<string, unknown>,
      });

      await enqueueNotification({
        adminClient,
        userId: restaurant.owner_id,
        title: "Nouvelle commande",
        body: `${journeyLabel} - ${order.order_number || session.metadata?.order_reference || order.id} - ${Number(order.total_amount || 0).toFixed(2)} CHF`,
        type: "order",
        category: "transactional",
        data: {
          order_id: order.id,
          order_number: order.order_number || session.metadata?.order_reference || null,
          restaurant_id: order.restaurant_id,
          restaurant_name: restaurant.name,
          delivery_address: order.delivery_address || null,
          customer_name: profile?.full_name || null,
          items_count: deliveryMetadata.items_count || null,
          items_summary: deliveryMetadata.items_summary || null,
          scheduled_delivery_at: scheduledAt,
          scheduled_delivery_label: deliveryMetadata.scheduled_delivery_label || null,
          delivery_window_label: deliveryMetadata.delivery_window_label || null,
          service_mode: journeyLabel,
          pickup_time: deliveryMetadata.pickup_time || null,
          total_amount: order.total_amount,
          url: "/dashboard/commandes",
        },
      });
    }

    try {
      const customerEmail = await getAuthUserEmail(adminClient, order.user_id);
      const restaurantEmail = await getAuthUserEmail(adminClient, restaurant?.owner_id);
      const emailItems = await fetchOrderEmailItems(adminClient, order.id);
      const journeyLabel = getOrderJourneyLabel({
        isDelivery,
        metadata: deliveryMetadata as Record<string, unknown>,
      });

      await queueOrderConfirmationEmails({
        adminClient,
        appBaseUrl: getPublicAppBaseUrl(),
        order: {
          id: order.id,
          order_number: order.order_number || session.metadata?.order_reference || null,
          created_at: new Date().toISOString(),
          total_amount: Number(order.total_amount || 0),
          original_total: readNumber(order.original_total ?? deliveryMetadata.original_total ?? deliveryMetadata.pre_discount_subtotal, Number(order.total_amount || 0)),
          discount_amount: readNumber(order.discount_amount ?? deliveryMetadata.discount_amount),
          delivery_fee: readNumber(order.delivery_fee ?? deliveryMetadata.delivery_fee ?? deliveryMetadata.delivery_fee_amount),
          service_fee_amount: readNumber(order.service_fee_amount ?? deliveryMetadata.quality_fee_amount),
          delivery_address: order.delivery_address || null,
          metadata: deliveryMetadata,
        },
        restaurant: {
          id: order.restaurant_id,
          name: restaurant?.name || null,
          address: restaurant?.address || null,
          city: restaurant?.city || null,
          phone: restaurant?.phone || null,
        },
        customer: {
          name: profile?.full_name || null,
          email: customerEmail,
        },
        restaurantEmail,
        orderTypeLabel: journeyLabel,
        scheduledLabel: readString(deliveryMetadata.scheduled_delivery_label),
        paymentMethodLabel: paymentMethod,
        items: emailItems,
      });
    } catch (emailError) {
      log?.error?.("order_confirmation_email_queue_failed", {
        orderId: order.id,
        message: emailError instanceof Error ? emailError.message : "unknown",
      });
    }
  }

  if (shouldDispatch && shouldDispatchNotifications) {
    try {
      await triggerNotificationDispatch({ source: "order-checkout-finalized", push: true, email: true });
    } catch (error) {
      log?.error?.("order_notification_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return {
    orders: finalizedOrders,
    primaryOrderId: primaryOrder?.id || null,
    checkoutGroupId: session.metadata?.checkout_group_id || null,
    orderReference: primaryOrder?.order_number || session.metadata?.order_reference || null,
    newlyFinalized: shouldDispatch,
  };
}

export async function markOrderCheckoutSessionState(input: {
  adminClient: any;
  session: Stripe.Checkout.Session;
  orderStatus: "payment_failed" | "cancelled";
  paymentStatus: string;
  checkoutState: "expired" | "cancelled" | "failed";
  failureCode?: string | null;
  failureMessage?: string | null;
}) {
  const orders = await findOrdersForSession(input.adminClient, input.session);
  const updatedOrderIds: string[] = [];

  for (const order of orders) {
    const existingMetadata = isJsonRecord(order.metadata) ? order.metadata : {};
    if (order.status !== "pending_payment" && order.payment_status === "captured") {
      continue;
    }
    const metadataWithRestoredStock = order.status === "pending_payment"
      ? await restoreReservedSpecialOfferStock({
        adminClient: input.adminClient,
        order,
        metadata: existingMetadata,
      })
      : existingMetadata;

    await input.adminClient
      .from("orders")
      .update({
        status: input.orderStatus,
        payment_status: input.paymentStatus,
        metadata: {
          ...metadataWithRestoredStock,
          checkout_session_state: input.checkoutState,
          payment_failure_code: input.failureCode || null,
          payment_failure_message: input.failureMessage || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    updatedOrderIds.push(order.id);
  }

  return updatedOrderIds;
}
