import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

// No CORS needed — Stripe calls this directly, not the browser
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(`Webhook Error: ${err instanceof Error ? err.message : "Unknown"}`, {
      status: 400,
    });
  }

  console.log(`[Stripe Webhook] Event: ${event.type}, ID: ${event.id}`);

  try {
    switch (event.type) {
      // ─── Payment completed ───────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderRef = session.metadata?.order_reference;
        const userId = session.metadata?.user_id;
        const restaurantId = session.metadata?.restaurant_id;

        if (!orderRef) {
          console.warn("No order_reference in session metadata");
          break;
        }

        // Find order by checkout_id or order_number
        const { data: order, error: orderError } = await supabaseAdmin
          .from("orders")
          .select("id, status, restaurant_id, delivery_address, total_amount")
          .or(`order_number.eq.${orderRef},checkout_id.eq.${session.id}`)
          .maybeSingle();

        if (orderError || !order) {
          console.error("Order not found for reference:", orderRef, orderError);
          break;
        }

        // Update order status to confirmed
        await supabaseAdmin
          .from("orders")
          .update({
            status: "confirmed",
            metadata: {
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              payment_status: session.payment_status,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        // Record payment transaction
        await supabaseAdmin.from("payment_transactions").insert({
          order_id: order.id,
          user_id: userId,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string"
            ? session.payment_intent : null,
          amount: (session.amount_total || 0) / 100,
          currency: session.currency || "chf",
          type: "charge",
          status: "succeeded",
        });

        // Create delivery tracking record
        await supabaseAdmin.from("delivery_tracking").insert({
          order_id: order.id,
          status: "preparing",
          estimated_arrival: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        });

        // Create dispatch job
        await supabaseAdmin.from("dispatch_jobs").insert({
          order_id: order.id,
          status: "pending",
        });

        // Notify restaurant via notification
        if (restaurantId) {
          // Find restaurant owner
          const { data: restaurant } = await supabaseAdmin
            .from("restaurants")
            .select("owner_id, name")
            .eq("id", restaurantId)
            .maybeSingle();

          if (restaurant?.owner_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: restaurant.owner_id,
              title: "Nouvelle commande !",
              body: `Commande #${orderRef} reçue — ${order.total_amount} CHF`,
              type: "order",
              category: "transactional",
              data: { order_id: order.id, order_number: orderRef },
            });
          }
        }

        // Notify customer
        if (userId) {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            title: "Commande confirmée",
            body: `Votre commande #${orderRef} est confirmée et en préparation.`,
            type: "order",
            category: "transactional",
            data: { order_id: order.id, order_number: orderRef },
          });
        }

        console.log(`Order ${order.id} confirmed via Stripe session ${session.id}`);
        break;
      }

      // ─── Payment failed ──────────────────────────────────
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Find order by stripe payment intent
        const { data: txn } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle();

        if (txn?.order_id) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "payment_failed", updated_at: new Date().toISOString() })
            .eq("id", txn.order_id);

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: txn.order_id,
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
        }

        console.log(`Payment failed for intent ${paymentIntent.id}`);
        break;
      }

      // ─── Refund ──────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string"
          ? charge.payment_intent : null;

        if (paymentIntentId) {
          const { data: txn } = await supabaseAdmin
            .from("payment_transactions")
            .select("order_id, user_id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .eq("type", "charge")
            .maybeSingle();

          if (txn) {
            const refundAmount = (charge.amount_refunded || 0) / 100;

            await supabaseAdmin.from("payment_transactions").insert({
              order_id: txn.order_id,
              user_id: txn.user_id,
              stripe_payment_intent_id: paymentIntentId,
              amount: refundAmount,
              currency: charge.currency || "chf",
              type: "refund",
              status: "succeeded",
            });

            // Credit user wallet
            if (txn.user_id) {
              const { data: wallet } = await supabaseAdmin
                .from("user_wallets")
                .select("id, balance")
                .eq("user_id", txn.user_id)
                .maybeSingle();

              if (wallet) {
                await supabaseAdmin
                  .from("user_wallets")
                  .update({ balance: wallet.balance + refundAmount, updated_at: new Date().toISOString() })
                  .eq("id", wallet.id);
              } else {
                await supabaseAdmin.from("user_wallets").insert({
                  user_id: txn.user_id,
                  balance: refundAmount,
                });
              }

              await supabaseAdmin.from("notifications").insert({
                user_id: txn.user_id,
                title: "Remboursement effectué",
                body: `${refundAmount.toFixed(2)} CHF ont été crédités sur votre portefeuille.`,
                type: "payment",
                category: "transactional",
                data: { order_id: txn.order_id, amount: refundAmount },
              });
            }

            console.log(`Refund of ${refundAmount} CHF processed for order ${txn.order_id}`);
          }
        }
        break;
      }

      // ─── Subscription events ─────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer : subscription.customer.id;

        // Find user by stripe customer ID in metadata or payment transactions
        const subStatus = subscription.status === "active" ? "active"
          : subscription.status === "canceled" ? "cancelled"
          : subscription.status === "past_due" ? "past_due"
          : subscription.status;

        console.log(`Subscription ${subscription.id} status: ${subStatus} for customer ${customerId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Subscription ${subscription.id} cancelled`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`Error processing event ${event.type}:`, error);
    // Return 200 anyway to prevent Stripe retries for processing errors
    // The event has been received, we just failed to process it
  }

  // Always return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
