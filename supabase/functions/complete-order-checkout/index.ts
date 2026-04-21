import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  isJsonRecord,
  getEnv,
  jsonResponse,
  writeAuditLog,
  buildCorsHeaders,
  handleCorsPreflight,
  enrichDeliveryMetadata,
  getEstimatedArrivalTime,
  isDeliveryOrder,
  makeLogger,
} from "./_local.ts";

type JsonRecord = Record<string, unknown>;

type OrderLookupRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  user_id: string | null;
  restaurant_id: string;
  delivery_address: string | null;
  total_amount: number | null;
  order_number: string | null;
  metadata: JsonRecord | null;
  scheduled_at: string | null;
};

async function getPaymentMethodDetails(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  log: ReturnType<typeof makeLogger>,
) {
  let cardBrand = "";
  let cardLast4 = "";

  const expandedPaymentIntent = session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent
    : null;
  const expandedPaymentMethod = expandedPaymentIntent?.payment_method
    && typeof expandedPaymentIntent.payment_method === "object"
    ? expandedPaymentIntent.payment_method
    : null;

  if (expandedPaymentMethod?.card) {
    return {
      cardBrand: expandedPaymentMethod.card.brand || "",
      cardLast4: expandedPaymentMethod.card.last4 || "",
    };
  }

  if (session.payment_intent && typeof session.payment_intent === "string") {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ["payment_method"],
      });
      const paymentMethod = paymentIntent.payment_method;
      if (paymentMethod && typeof paymentMethod !== "string" && paymentMethod.card) {
        cardBrand = paymentMethod.card.brand;
        cardLast4 = paymentMethod.card.last4;
      }
    } catch (error) {
      log.error("order_checkout_payment_method_lookup_failed", {
        message: error instanceof Error ? error.message : "unknown",
        sessionId: session.id,
      });
    }
  }

  return { cardBrand, cardLast4 };
}

async function findOrdersForSession(
  adminClient: any,
  session: Stripe.Checkout.Session,
): Promise<OrderLookupRow[]> {
  const orderRef = session.metadata?.order_reference || null;
  const checkoutId = session.metadata?.checkout_id || null;
  const checkoutGroupId = session.metadata?.checkout_group_id || null;
  const ordersById = new Map<string, OrderLookupRow>();

  const appendOrders = (rows: OrderLookupRow[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.id) ordersById.set(String(row.id), row);
    }
  };

  const baseSelect = "id, status, payment_status, user_id, restaurant_id, delivery_address, total_amount, order_number, metadata, scheduled_at";

  const { data: sessionOrders } = await adminClient
    .from("orders")
    .select(baseSelect)
    .filter("metadata->>stripe_session_id", "eq", session.id);
  appendOrders(sessionOrders as OrderLookupRow[] | null | undefined);

  if (checkoutGroupId) {
    const { data: groupOrders } = await adminClient
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>checkout_group_id", "eq", checkoutGroupId);
    appendOrders(groupOrders as OrderLookupRow[] | null | undefined);
  }

  if (checkoutId) {
    const { data: checkoutOrders } = await adminClient
      .from("orders")
      .select(baseSelect)
      .eq("checkout_id", checkoutId);
    appendOrders(checkoutOrders as OrderLookupRow[] | null | undefined);
  }

  if (orderRef) {
    const { data: refOrders } = await adminClient
      .from("orders")
      .select(baseSelect)
      .eq("order_number", orderRef);
    appendOrders(refOrders as OrderLookupRow[] | null | undefined);
  }

  return Array.from(ordersById.values());
}

async function recordOrderChargeIfMissing(input: {
  adminClient: any;
  orderId: string;
  userId: string | null;
  session: Stripe.Checkout.Session;
  amount: number;
  cardBrand: string;
  cardLast4: string;
  orderReference: string | null;
}) {
  const { adminClient, orderId, userId, session, amount, cardBrand, cardLast4, orderReference } = input;

  const { data: existingTransaction, error: existingTransactionError } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("order_id", orderId)
    .eq("stripe_checkout_session_id", session.id)
    .eq("type", "charge")
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (existingTransactionError) {
    throw existingTransactionError;
  }

  if (existingTransaction?.id) {
    return;
  }

  const { error: insertError } = await adminClient
    .from("payment_transactions")
    .insert({
      order_id: orderId,
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null,
      amount,
      currency: (session.currency || "chf").toLowerCase(),
      type: "charge",
      status: "succeeded",
      metadata: {
        card_brand: cardBrand,
        card_last4: cardLast4,
        order_reference: orderReference,
      },
    });

  if (insertError) {
    throw insertError;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("complete-order-checkout");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let sessionId = "";

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const body = await req.json().catch(() => ({}));
    sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) {
      throw new HttpError(400, "session_id requis");
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new HttpError(503, "STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method"],
    });

    if (!session || session.payment_status !== "paid") {
      throw new HttpError(400, "Session Stripe non payee.");
    }

    const checkoutKind = String(session.metadata?.checkout_kind || "order");
    if (checkoutKind !== "order") {
      throw new HttpError(400, "Session Stripe invalide pour une commande.");
    }

    if (String(session.metadata?.user_id || "") !== actor.userId) {
      throw new HttpError(403, "Forbidden");
    }

    const orders = await findOrdersForSession(actor.adminClient, session);
    if (!orders.length) {
      throw new HttpError(404, "Commande introuvable pour cette session Stripe.");
    }

    const { cardBrand, cardLast4 } = await getPaymentMethodDetails(stripe, session, log);
    const totalAmount = (session.amount_total || 0) / 100;
    const baseAmount = orders.reduce((sum, order) => sum + Math.max(0, Number(order.total_amount || 0)), 0);
    let remainingAmount = Math.round(totalAmount * 100) / 100;

    const completedOrders: Array<{ id: string; status: string; payment_status: string }> = [];

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
      const share = baseAmount > 0 ? Math.max(0, Number(order.total_amount || 0)) / baseAmount : (1 / orders.length);
      const allocatedAmount = index === orders.length - 1
        ? Math.max(0, remainingAmount)
        : Math.round((totalAmount * share) * 100) / 100;
      remainingAmount = Math.max(0, Math.round((remainingAmount - allocatedAmount) * 100) / 100);

      const { error: updateError } = await actor.adminClient
        .from("orders")
        .update({
          status: "confirmed",
          payment_status: "captured",
          estimated_delivery_at: estimatedDeliveryAt,
          metadata: {
            ...deliveryMetadata,
            stripe_session_id: session.id,
            stripe_payment_intent: typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id || null,
            payment_status: session.payment_status,
            card_brand: cardBrand,
            card_last4: cardLast4,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) {
        throw updateError;
      }

      await recordOrderChargeIfMissing({
        adminClient: actor.adminClient,
        orderId: order.id,
        userId: order.user_id,
        session,
        amount: allocatedAmount,
        cardBrand,
        cardLast4,
        orderReference: order.order_number || session.metadata?.order_reference || null,
      });

      completedOrders.push({
        id: order.id,
        status: "confirmed",
        payment_status: "captured",
      });
    }

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "complete-order-checkout",
      action: "complete_paid_order_checkout",
      status: "success",
      targetEntityType: "stripe_session",
      targetEntityId: session.id,
      metadata: {
        order_ids: completedOrders.map((order) => order.id),
      },
    });

    return jsonResponse({ orders: completedOrders }, 200, corsHeaders);
  } catch (error) {
    log.error("complete_order_checkout_failed", {
      message: error instanceof Error ? error.message : "unknown",
      sessionId,
    });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "complete-order-checkout",
      action: "complete_paid_order_checkout",
      status: "failure",
      targetEntityType: sessionId ? "stripe_session" : null,
      targetEntityId: sessionId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur interne" },
      500,
      corsHeaders,
    );
  }
});
