import type Stripe from "npm:stripe@22.3.2";

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
  warn?: (event: string, data?: Record<string, unknown>) => void;
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

const ORDER_LOOKUP_SELECT = "id, status, payment_status, user_id, restaurant_id, delivery_address, total_amount, original_total, discount_amount, delivery_fee, service_fee_amount, order_number, metadata, scheduled_at";

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
  const { data, error } = await input.adminClient.rpc("restore_order_special_offer_stock", { p_order_id: input.order.id });
  if (error) {
    input.log?.error?.("special_offer_stock_restore_failed", { orderId: input.order.id, message: error.message });
    throw error;
  }
  // The database owns special_offer_stock_restored_at and the atomic debit ledger.
  if (!isJsonRecord(data)) throw new Error("ORDER_STOCK_RESTORE_INVALID_RESULT");
  return data;
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
    paymentAttemptId?: string | null;
    clientPaymentAttemptId?: string | null;
  },
): Promise<OrderLookupRow[]> {
  const ordersById = new Map<string, OrderLookupRow>();

  const appendOrders = (rows: OrderLookupRow[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.id) ordersById.set(String(row.id), row);
    }
  };

  const baseSelect = ORDER_LOOKUP_SELECT;

  const { data: sessionOrders, error: sessionOrdersError } = await adminClient
    .from("orders")
    .select(baseSelect)
    .filter("metadata->>stripe_session_id", "eq", identifiers.sessionId);
  if (sessionOrdersError) throw sessionOrdersError;
  appendOrders(sessionOrders as OrderLookupRow[] | null | undefined);

  if (identifiers.checkoutGroupId) {
    const { data: groupOrders, error: groupOrdersError } = await adminClient
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>checkout_group_id", "eq", identifiers.checkoutGroupId);
    if (groupOrdersError) throw groupOrdersError;
    appendOrders(groupOrders as OrderLookupRow[] | null | undefined);
  }

  if (identifiers.checkoutId) {
    const { data: checkoutOrders, error: checkoutOrdersError } = await adminClient
      .from("orders")
      .select(baseSelect)
      .eq("checkout_id", identifiers.checkoutId);
    if (checkoutOrdersError) throw checkoutOrdersError;
    appendOrders(checkoutOrders as OrderLookupRow[] | null | undefined);
  }

  if (identifiers.orderReference) {
    const { data: refOrders, error: refOrdersError } = await adminClient
      .from("orders")
      .select(baseSelect)
      .eq("order_number", identifiers.orderReference);
    if (refOrdersError) throw refOrdersError;
    appendOrders(refOrders as OrderLookupRow[] | null | undefined);
  }

  if (identifiers.paymentAttemptId) {
    const { data: attemptOrders, error: attemptOrdersError } = await adminClient
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>payment_attempt_id", "eq", identifiers.paymentAttemptId);
    if (attemptOrdersError) throw attemptOrdersError;
    appendOrders(attemptOrders as OrderLookupRow[] | null | undefined);
  }

  if (identifiers.clientPaymentAttemptId) {
    const { data: clientAttemptOrders, error: clientAttemptOrdersError } = await adminClient
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>client_payment_attempt_id", "eq", identifiers.clientPaymentAttemptId);
    if (clientAttemptOrdersError) throw clientAttemptOrdersError;
    appendOrders(clientAttemptOrders as OrderLookupRow[] | null | undefined);
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
    paymentAttemptId: session.metadata?.payment_attempt_id || null,
    clientPaymentAttemptId: session.metadata?.client_payment_attempt_id || null,
  });
}

export async function persistOrderCheckoutSessionMapping(input: {
  adminClient: any;
  session: Stripe.Checkout.Session;
  paymentAttemptId: string;
  clientPaymentAttemptId: string;
}) {
  const orders = await findOrdersForSession(input.adminClient, input.session);
  if (orders.length === 0) {
    throw new Error("ORDER_CHECKOUT_SESSION_MAPPING_NO_ORDER");
  }

  for (const order of orders) {
    const metadata = isJsonRecord(order.metadata) ? order.metadata : {};
    const { data, error } = await input.adminClient
      .from("orders")
      .update({
        metadata: {
          ...metadata,
          stripe_session_id: input.session.id,
          checkout_session_id: input.session.id,
          checkout_session_state: "open",
          payment_attempt_id: input.paymentAttemptId,
          client_payment_attempt_id: input.clientPaymentAttemptId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error(`ORDER_CHECKOUT_SESSION_MAPPING_NOT_UPDATED:${order.id}`);
  }

  return orders.map((order) => order.id);
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
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) throw error;
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
  stripeEventId?: string | null;
}) {
  const {
    adminClient,
    session,
    cardBrand,
    cardLast4,
    billingPhone,
    log,
    shouldDispatchNotifications = true,
    stripeEventId = null,
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

  const expectedCurrency = String(session.metadata?.authoritative_currency || "CHF").toLowerCase();
  const actualCurrency = String(session.currency || "").toLowerCase();
  if (actualCurrency !== expectedCurrency) {
    throw new Error(`ORDER_CHECKOUT_CURRENCY_MISMATCH:${actualCurrency || "null"}:${expectedCurrency}`);
  }

  const authoritativeOrderCents = orders.reduce(
    (sum, order) => sum + Math.round(Number(order.total_amount || 0) * 100),
    0,
  );
  const sessionAmountCents = Number(session.amount_total || 0);
  if (authoritativeOrderCents !== sessionAmountCents) {
    throw new Error(`ORDER_CHECKOUT_AMOUNT_MISMATCH:${sessionAmountCents}:${authoritativeOrderCents}`);
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

  for (const [index, initialOrder] of orders.entries()) {
    const { order, newlyFinalized } = await reconcilePaidOrderState({
      adminClient, order: initialOrder, session, cardBrand, cardLast4, billingPhone,
    });
    const existingMetadata = isJsonRecord(order.metadata) ? order.metadata : {};
    const isDelivery = isDeliveryOrder({
      deliveryAddress: order.delivery_address,
      metadata: existingMetadata,
      orderType: String(existingMetadata.type || ""),
    });
    const deliveryMetadata = existingMetadata;
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

    await recordOrderChargeIfMissing({
      adminClient,
      orderId: order.id,
      userId: order.user_id,
      sessionId: session.id,
      paymentIntentId,
      amount: allocations[index] || 0,
      currency: (session.currency || "chf").toLowerCase(),
      stripeMode: String(session.metadata?.stripe_mode || "").toLowerCase() === "test" ? "test" : "live",
      paymentAttemptId: parseUuid(session.metadata?.payment_attempt_id),
      stripeEventId,
      metadata: {
        card_brand: cardBrand,
        card_last4: cardLast4,
        billing_phone: billingPhone || null,
        payment_method: paymentMethod,
        order_reference: order.order_number || session.metadata?.order_reference || null,
      },
      log,
    });

    if (order.status === "confirmed" && ["captured", "paid"].includes(String(order.payment_status)) && isDelivery && scheduledAt) {
      const { error: deliveryTrackingError } = await adminClient.from("delivery_tracking").upsert({
        order_id: order.id,
        status: "scheduled",
        estimated_arrival: estimatedDeliveryAt,
      }, { onConflict: "order_id", ignoreDuplicates: true });
      if (deliveryTrackingError) throw deliveryTrackingError;
    }

    finalizedOrders.push({
      id: order.id,
      order_number: order.order_number,
      restaurant_id: order.restaurant_id,
      total_amount: Number(order.total_amount || 0),
      status: String(order.status || ""),
      payment_status: String(order.payment_status || ""),
    });

    if (!newlyFinalized) {
      continue;
    }

    shouldDispatch = true;

    const { data: restaurant, error: restaurantError } = await adminClient
      .from("restaurants")
      .select("id, owner_id, name, address, city, phone")
      .eq("id", order.restaurant_id)
      .maybeSingle();
    if (restaurantError) throw restaurantError;
    const { data: profile, error: profileError } = order.user_id
      ? await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", order.user_id)
        .maybeSingle()
      : { data: null, error: null };
    if (profileError) throw profileError;

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

async function reconcilePaidOrderState(input: {
  adminClient: any;
  order: OrderLookupRow;
  session: Stripe.Checkout.Session;
  cardBrand: string;
  cardLast4: string;
  billingPhone?: string | null;
}) {
  let order = input.order;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const isRefunded = ["refunded", "partially_refunded"].includes(String(order.payment_status || ""));
    const shouldConfirm = order.status === "pending_payment" && !isRefunded;
    const shouldCapture = !isRefunded && !["captured", "paid"].includes(String(order.payment_status || ""));
    if (!shouldConfirm && !shouldCapture) return { order, newlyFinalized: false };

    const metadata = isJsonRecord(order.metadata) ? order.metadata : {};
    const isDelivery = isDeliveryOrder({ deliveryAddress: order.delivery_address, metadata, orderType: String(metadata.type || "") });
    const deliveryMetadata = shouldConfirm && isDelivery ? enrichDeliveryMetadata(metadata) : metadata;
    const scheduledAt = String(deliveryMetadata.scheduled_delivery_at || order.scheduled_at || "") || null;
    const paymentIntentId = typeof input.session.payment_intent === "string"
      ? input.session.payment_intent
      : input.session.payment_intent?.id || null;

    let updateQuery = input.adminClient.from("orders").update({
      ...(shouldConfirm ? {
        status: "confirmed",
        estimated_delivery_at: isDelivery ? getEstimatedArrivalTime(deliveryMetadata, scheduledAt) : null,
      } : {}),
      ...(shouldCapture ? { payment_status: "captured" } : {}),
      metadata: {
        ...deliveryMetadata,
        stripe_session_id: input.session.id,
        stripe_payment_intent: paymentIntentId,
        payment_status: input.session.payment_status,
        payment_method: String(metadata.payment_method || input.session.metadata?.payment_method_label || "card"),
        billing_phone: input.billingPhone || null,
        card_brand: input.cardBrand,
        card_last4: input.cardLast4,
        checkout_session_state: "completed",
      },
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);

    // Only this exact snapshot may claim fulfillment or merge payment metadata.
    // A concurrent completion, refund or restaurant update must win intact.
    for (const field of ["status", "payment_status", "total_amount", "metadata"] as const) {
      updateQuery = order[field] == null
        ? updateQuery.is(field, null)
        : updateQuery.eq(field, field === "metadata" ? JSON.stringify(order[field]) : order[field]);
    }
    const { data: updatedOrder, error: updateError } = await updateQuery.select(ORDER_LOOKUP_SELECT).maybeSingle();
    if (updateError) throw new Error(updateError.message || "ORDER_FINALIZE_UPDATE_FAILED", { cause: updateError });
    if (updatedOrder?.id) return { order: updatedOrder as OrderLookupRow, newlyFinalized: shouldConfirm };

    const { data: latestOrder, error: latestError } = await input.adminClient.from("orders")
      .select(ORDER_LOOKUP_SELECT).eq("id", order.id).maybeSingle();
    if (latestError) throw latestError;
    if (!latestOrder?.id) throw new Error(`ORDER_FINALIZE_NOT_UPDATED:${order.id}`);
    if (Math.round(Number(latestOrder.total_amount || 0) * 100) !== Math.round(Number(input.order.total_amount || 0) * 100)) {
      throw new Error(`ORDER_CHECKOUT_AMOUNT_CHANGED:${order.id}`);
    }
    order = latestOrder as OrderLookupRow;
  }

  throw new Error(`ORDER_FINALIZE_CONCURRENT_UPDATE:${order.id}`);
}

export async function markOrderCheckoutSessionState(input: {
  adminClient: any;
  session: Stripe.Checkout.Session;
  orderStatus: "payment_failed" | "cancelled";
  paymentStatus: string;
  checkoutState: "expired" | "cancelled" | "failed" | "payment_failed";
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

    const { data: updatedOrder, error: updateError } = await input.adminClient
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
      .eq("id", order.id)
      .neq("payment_status", "captured")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedOrder?.id) throw new Error(`ORDER_CHECKOUT_STATE_NOT_UPDATED:${order.id}`);

    updatedOrderIds.push(order.id);
  }

  return updatedOrderIds;
}
