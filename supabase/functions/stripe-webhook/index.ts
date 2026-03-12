import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { writeAuditLog } from "../_shared/auth.ts";
import {
  enrichDeliveryMetadata,
  getEstimatedArrivalTime,
  isDeliveryOrder,
} from "../_shared/delivery-dispatch.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";

function allocateAmounts(totalAmount: number, rows: Array<{ amount: number }>) {
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

async function getCardDetails(stripe: Stripe, session: Stripe.Checkout.Session) {
  let cardBrand = "";
  let cardLast4 = "";
  if (session.payment_intent && typeof session.payment_intent === "string") {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
        expand: ["payment_method"],
      });
      const paymentMethod = paymentIntent.payment_method as any;
      if (paymentMethod?.card) {
        cardBrand = paymentMethod.card.brand;
        cardLast4 = paymentMethod.card.last4;
      }
    } catch (error) {
      console.error("Error fetching payment method details:", error);
    }
  }
  return { cardBrand, cardLast4 };
}

function getOrderJourneyLabel(input: {
  isDelivery: boolean;
  metadata: Record<string, unknown>;
}) {
  if (input.isDelivery) return "livraison";
  if (typeof input.metadata.pickup_time === "string" && input.metadata.pickup_time) return "a emporter";
  return "commande";
}

async function findOrdersForSession(
  supabaseAdmin: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  const orderRef = session.metadata?.order_reference || null;
  const checkoutId = session.metadata?.checkout_id || null;
  const checkoutGroupId = session.metadata?.checkout_group_id || null;
  const ordersById = new Map<string, any>();

  const appendOrders = (rows: any[] | null | undefined) => {
    for (const row of rows || []) {
      if (row?.id) ordersById.set(String(row.id), row);
    }
  };

  const baseSelect = "id, status, user_id, restaurant_id, delivery_address, total_amount, order_number, metadata, scheduled_at, notes";

  const { data: sessionOrders } = await supabaseAdmin
    .from("orders")
    .select(baseSelect)
    .filter("metadata->>stripe_session_id", "eq", session.id);
  appendOrders(sessionOrders);

  if (checkoutGroupId) {
    const { data: groupOrders } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .filter("metadata->>checkout_group_id", "eq", checkoutGroupId);
    appendOrders(groupOrders);
  }

  if (checkoutId) {
    const { data: checkoutOrders } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .eq("checkout_id", checkoutId);
    appendOrders(checkoutOrders);
  }

  if (orderRef) {
    const { data: refOrders } = await supabaseAdmin
      .from("orders")
      .select(baseSelect)
      .eq("order_number", orderRef);
    appendOrders(refOrders);
  }

  return Array.from(ordersById.values());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return new Response(`Webhook Error: ${error instanceof Error ? error.message : "Unknown"}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutKind = session.metadata?.checkout_kind || "order";
        const userId = session.metadata?.user_id || null;
        const campaignId = session.metadata?.campaign_id || null;
        let shouldDispatchNotifications = false;

        if (checkoutKind === "campaign" && campaignId) {
          const { cardBrand, cardLast4 } = await getCardDetails(stripe, session);
          const { data: campaign } = await supabaseAdmin
            .from("ad_campaigns")
            .select("id, restaurant_id, title")
            .eq("id", campaignId)
            .maybeSingle();

          if (campaign) {
            await supabaseAdmin
              .from("ad_campaigns")
              .update({
                status: "active",
                payment_status: "paid",
                payment_method: session.metadata?.payment_method_label || null,
                paid_amount: (session.amount_total || 0) / 100,
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
                paid_at: new Date().toISOString(),
                activated_at: new Date().toISOString(),
              } as any)
              .eq("id", campaign.id);

            await supabaseAdmin.from("payment_transactions").insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              amount: (session.amount_total || 0) / 100,
              currency: (session.currency || "chf").toLowerCase(),
              type: "charge",
              status: "succeeded",
              metadata: {
                campaign_id: campaign.id,
                campaign_title: campaign.title,
                restaurant_id: campaign.restaurant_id,
                checkout_kind: "campaign",
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
            });
          }
          break;
        }

        const orders = await findOrdersForSession(supabaseAdmin, session);
        const { data: reservation } = await supabaseAdmin
          .from("reservations")
          .select("id, metadata")
          .filter("metadata->>checkout_session_id", "eq", session.id)
          .maybeSingle();

        const { cardBrand, cardLast4 } = await getCardDetails(stripe, session);

        for (const order of orders) {
          const existingMeta = typeof order.metadata === "object" && !Array.isArray(order.metadata) ? order.metadata : {};
          const isDelivery = isDeliveryOrder({
            deliveryAddress: order.delivery_address,
            metadata: existingMeta,
            orderType: String((existingMeta as Record<string, unknown>).type || ""),
          });
          const deliveryMetadata = isDelivery ? enrichDeliveryMetadata(existingMeta) : existingMeta;
          const scheduledAt = isDelivery
            ? String((deliveryMetadata as Record<string, unknown>).scheduled_delivery_at || order.scheduled_at || "") || null
            : null;
          const estimatedDeliveryAt = isDelivery
            ? getEstimatedArrivalTime(deliveryMetadata, scheduledAt)
            : null;

          await supabaseAdmin
            .from("orders")
            .update({
              status: "confirmed",
              payment_status: "captured",
              estimated_delivery_at: estimatedDeliveryAt,
              metadata: {
                ...deliveryMetadata,
                stripe_session_id: session.id,
                stripe_payment_intent: session.payment_intent,
                payment_status: session.payment_status,
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", order.id);
        }

        if (reservation) {
          const existingMeta = typeof reservation.metadata === "object" && !Array.isArray(reservation.metadata) ? reservation.metadata : {};
          await supabaseAdmin
            .from("reservations")
            .update({
              status: "confirmed",
              metadata: {
                ...existingMeta,
                checkout_session_id: session.id,
                card_brand: cardBrand,
                card_last4: cardLast4,
                paid: true,
              },
            })
            .eq("id", reservation.id);
          shouldDispatchNotifications = true;
        }

        const allocations = allocateAmounts(
          (session.amount_total || 0) / 100,
          orders.map((order: any) => ({ amount: Number(order.total_amount || 0) })),
        );

        for (const [index, order] of orders.entries()) {
          const existingMeta = typeof order.metadata === "object" && !Array.isArray(order.metadata) ? order.metadata : {};
          const isDelivery = isDeliveryOrder({
            deliveryAddress: order.delivery_address,
            metadata: existingMeta,
            orderType: String((existingMeta as Record<string, unknown>).type || ""),
          });
          const deliveryMetadata = isDelivery ? enrichDeliveryMetadata(existingMeta) : existingMeta;
          const scheduledAt = isDelivery
            ? String((deliveryMetadata as Record<string, unknown>).scheduled_delivery_at || order.scheduled_at || "") || null
            : null;
          const estimatedDeliveryAt = isDelivery
            ? getEstimatedArrivalTime(deliveryMetadata, scheduledAt)
            : null;

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: order.id,
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: allocations[index] || 0,
            currency: (session.currency || "chf").toLowerCase(),
            type: "charge",
            status: "succeeded",
            metadata: {
              card_brand: cardBrand,
              card_last4: cardLast4,
              order_reference: order.order_number || session.metadata?.order_reference || null,
              reservation_id: reservation?.id || null,
            },
          });

          if (isDelivery && scheduledAt) {
            await supabaseAdmin.from("delivery_tracking").upsert({
              order_id: order.id,
              status: "scheduled",
              estimated_arrival: estimatedDeliveryAt,
            });
          }

          const { data: restaurant } = await supabaseAdmin
            .from("restaurants")
            .select("owner_id, name")
            .eq("id", order.restaurant_id)
            .maybeSingle();
          const { data: profile } = order.user_id
            ? await supabaseAdmin
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
              adminClient: supabaseAdmin,
              userId: restaurant.owner_id,
              title: "Nouvelle commande",
              body: `${journeyLabel} - ${order.order_number || session.metadata?.order_reference || order.id} - ${order.total_amount} CHF`,
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

          shouldDispatchNotifications = true;
        }

        if (!orders.length && !reservation) {
          console.warn(`No order or reservation found for Stripe session ${session.id}`);
        }

        if (shouldDispatchNotifications) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-checkout", push: true, email: true });
          } catch (error) {
            console.error("stripe-webhook notification trigger failed:", error);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { data: transactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, metadata")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "charge");

        for (const transaction of transactions || []) {
          if (transaction.order_id) {
            await supabaseAdmin
              .from("orders")
              .update({ status: "payment_failed", payment_status: "failed", updated_at: new Date().toISOString() } as any)
              .eq("id", transaction.order_id);
          }

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: transaction.order_id,
            user_id: transaction.user_id,
            stripe_payment_intent_id: paymentIntent.id,
            amount: (paymentIntent.amount || 0) / 100,
            currency: paymentIntent.currency || "chf",
            type: "charge",
            status: "failed",
            metadata: {
              failure_code: paymentIntent.last_payment_error?.code,
              failure_message: paymentIntent.last_payment_error?.message,
            },
          });

          const campaignId = transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
            ? (transaction.metadata as any).campaign_id
            : null;

          if (campaignId) {
            await supabaseAdmin
              .from("ad_campaigns")
              .update({ payment_status: "failed" } as any)
              .eq("id", campaignId);
          }
        }

        if ((transactions || []).some((transaction) => transaction.order_id)) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-payment-failed", push: true, email: true });
          } catch (error) {
            console.error("stripe-webhook payment failure push trigger failed:", error);
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (!paymentIntentId) break;

        const { data: chargeTransactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .eq("type", "charge")
          .eq("status", "succeeded");

        const refundAmount = (charge.amount_refunded || 0) / 100;
        const allocations = allocateAmounts(
          refundAmount,
          (chargeTransactions || []).map((transaction: any) => ({ amount: Number(transaction.amount || 0) })),
        );

        const creditedUsers = new Set<string>();

        for (const [index, transaction] of (chargeTransactions || []).entries()) {
          await supabaseAdmin.from("payment_transactions").insert({
            order_id: transaction.order_id,
            user_id: transaction.user_id,
            stripe_payment_intent_id: paymentIntentId,
            amount: allocations[index] || 0,
            currency: charge.currency || "chf",
            type: "refund",
            status: "succeeded",
          });

          if (transaction.user_id && !creditedUsers.has(transaction.user_id)) {
            creditedUsers.add(transaction.user_id);
          }
        }

        for (const userId of creditedUsers) {
          const { data: wallet } = await supabaseAdmin
            .from("user_wallets")
            .select("id, balance")
            .eq("user_id", userId)
            .maybeSingle();

          if (wallet) {
            await supabaseAdmin
              .from("user_wallets")
              .update({ balance: wallet.balance + refundAmount, updated_at: new Date().toISOString() })
              .eq("id", wallet.id);
          } else {
            await supabaseAdmin.from("user_wallets").insert({
              user_id: userId,
              balance: refundAmount,
            });
          }

          await enqueueNotification({
            adminClient: supabaseAdmin,
            userId,
            title: "Remboursement effectue",
            body: `${refundAmount.toFixed(2)} CHF ont ete credites sur votre portefeuille.`,
            type: "payment",
            category: "transactional",
            data: {
              amount: refundAmount,
              url: "/notifications",
            },
          });
        }

        if (creditedUsers.size > 0) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-refund", push: true, email: true });
          } catch (error) {
            console.error("stripe-webhook refund push trigger failed:", error);
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        console.log(`Subscription event received: ${event.type}`);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: event.type,
      status: "success",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });
  } catch (error) {
    console.error(`Error processing event ${event.type}:`, error);
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: event.type,
      status: "failure",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
