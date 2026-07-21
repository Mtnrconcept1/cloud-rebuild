import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type Stripe from "npm:stripe@18.5.0";

import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "../_shared/stripe-client.ts";
import { isClientCheckoutRestaurantEligible } from "../_shared/order-pricing.ts";

function json(payload: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (value) return value;
  if (name === "STRIPE_SECRET_KEY") {
    return Deno.env.get("STRIPE_PERSONNAL_SECRET_KEY")?.trim() ||
      Deno.env.get("STRIPE_PERSONAL_SECRET_KEY")?.trim() ||
      Deno.env.get("STRIPE_SECRET_KEY_LIVE")?.trim() ||
      "";
  }
  if (name === "STRIPE_SECRET_KEY_LIVE") {
    return Deno.env.get("STRIPE_PERSONNAL_SECRET_KEY")?.trim() ||
      Deno.env.get("STRIPE_PERSONAL_SECRET_KEY")?.trim() ||
      "";
  }
  return "";
}

function getIntentId(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id || null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Server not configured" }, 503, corsHeaders);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  let body: { member_order_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  if (!body.member_order_id) return json({ error: "member_order_id required" }, 400, corsHeaders);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: order, error: orderError } = await admin
    .from("group_member_orders")
    .select("id,user_id,group_id,restaurant_id,subtotal,stripe_checkout_session_id,payment_status")
    .eq("id", body.member_order_id)
    .maybeSingle();

  if (orderError) return json({ error: orderError.message }, 500, corsHeaders);
  if (!order) return json({ error: "Commande introuvable" }, 404, corsHeaders);
  if (order.user_id !== userId) return json({ error: "Forbidden" }, 403, corsHeaders);
  if (!order.stripe_checkout_session_id) {
    return json({ error: "Session de pre-paiement introuvable" }, 409, corsHeaders);
  }

  let stripeRuntime: ReturnType<typeof getStripeRuntimeForCheckoutKindAndMode>;
  try {
    stripeRuntime = getStripeRuntimeForCheckoutKindAndMode("match-group", "live");
  } catch {
    return json({ error: "Stripe live not configured" }, 503, corsHeaders);
  }
  const stripe = stripeRuntime.stripe;
  const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, {
    expand: ["payment_intent"],
  });

  const paymentIntentId = getIntentId(session);
  const paymentIntent = session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent
    : paymentIntentId
      ? await stripe.paymentIntents.retrieve(paymentIntentId)
      : null;
  const expectedAmountCents = Math.round(Number(order.subtotal || 0) * 100);
  const identityMatches = Boolean(
    session.livemode
    && session.mode === "payment"
    && session.metadata?.checkout_kind === "match-group"
    && session.metadata?.group_member_order_id === order.id
    && session.metadata?.group_id === order.group_id
    && session.metadata?.restaurant_id === order.restaurant_id
    && session.metadata?.user_id === userId
  );

  if (!identityMatches) {
    return json({ error: "MATCH_GROUP_CHECKOUT_IDENTITY_MISMATCH" }, 409, corsHeaders);
  }

  if (order.payment_status === "captured") {
    if (paymentIntent?.status !== "succeeded") {
      return json({ error: "MATCH_GROUP_CAPTURE_STATE_MISMATCH" }, 409, corsHeaders);
    }
    return json({ ok: true, already_confirmed: true }, 200, corsHeaders);
  }

  const terminateRejectedAuthorization = async (reason: string) => {
    if (session.status === "open") {
      try {
        await stripe.checkout.sessions.expire(session.id, {}, {
          idempotencyKey: `match-group:expire-rejected:${order.id}:${session.id}`.slice(0, 255),
        });
      } catch (expireError) {
        const recoveredSession = await stripe.checkout.sessions.retrieve(session.id);
        if (recoveredSession.status === "open") throw expireError;
      }
    }

    if (paymentIntent?.status === "requires_capture" && paymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(paymentIntentId, {
          cancellation_reason: "abandoned",
        }, {
          idempotencyKey: `match-group:cancel-rejected:${order.id}:${paymentIntentId}`.slice(0, 255),
        });
      } catch (cancelError) {
        const recoveredIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (recoveredIntent.status !== "canceled") throw cancelError;
      }
    } else if (paymentIntent?.status === "succeeded") {
      return false;
    }

    const { error: terminalError } = await admin.rpc(
      "mark_match_group_member_capture_failed",
      {
        p_member_order_id: order.id,
        p_error: reason,
        p_terminal: true,
      },
    );
    if (terminalError) throw terminalError;
    return true;
  };

  const { data: checkoutRestaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select("id,is_active,status,is_demo")
    .eq("id", order.restaurant_id)
    .maybeSingle();
  if (restaurantError) return json({ error: restaurantError.message }, 500, corsHeaders);

  if (!isClientCheckoutRestaurantEligible(checkoutRestaurant)) {
    const terminated = await terminateRejectedAuthorization("MATCH_GROUP_RESTAURANT_UNAVAILABLE");
    return json({
      error: terminated
        ? "MATCH_GROUP_RESTAURANT_UNAVAILABLE"
        : "MATCH_GROUP_PAYMENT_ALREADY_CAPTURED",
    }, 409, corsHeaders);
  }

  if (order.payment_status === "authorized") {
    if (paymentIntent?.status !== "requires_capture") {
      return json({ error: `MATCH_GROUP_AUTHORIZATION_STATE_MISMATCH:${paymentIntent?.status || "missing"}` }, 409, corsHeaders);
    }
    return json({ ok: true, already_confirmed: true }, 200, corsHeaders);
  }

  const authorizationReady = Boolean(
    identityMatches
    && session.status === "complete"
    && paymentIntent
    && paymentIntent.capture_method === "manual"
    && paymentIntent.status === "requires_capture"
    && paymentIntent.currency === "chf"
    && paymentIntent.amount === expectedAmountCents
    && paymentIntent.amount_capturable === expectedAmountCents
  );

  if (!authorizationReady || !paymentIntentId || !paymentIntent) {
    if (session.status === "expired" || paymentIntent?.status === "canceled") {
      return json({
        error: "Session de pre-paiement expiree",
        payment_status: paymentIntent?.status || session.payment_status || "unknown",
      }, 409, corsHeaders);
    }
    return json({
      ok: false,
      pending_confirmation: true,
      payment_status: paymentIntent?.status || session.payment_status || "unknown",
      session_status: session.status || "unknown",
      retry_after_seconds: 15,
    }, 202, corsHeaders);
  }

  const { data: marked, error: markError } = await admin.rpc("mark_match_group_member_authorized", {
    p_member_order_id: order.id,
    p_checkout_session_id: order.stripe_checkout_session_id,
    p_payment_intent_id: paymentIntentId,
    p_authorized_amount: Number(paymentIntent.amount) / 100,
    p_metadata: {
      stripe_session_status: session.status,
      stripe_payment_status: paymentIntent.status,
      stripe_capture_method: paymentIntent.capture_method,
      stripe_amount_capturable: paymentIntent.amount_capturable,
      authorized_currency: paymentIntent.currency,
      order_sent_to_restaurant: true,
    },
  });

  if (markError) return json({ error: markError.message }, 500, corsHeaders);
  if (marked !== true) {
    const terminated = await terminateRejectedAuthorization("MATCH_GROUP_AUTHORIZATION_REJECTED");
    return json({
      error: terminated
        ? "MATCH_GROUP_AUTHORIZATION_REJECTED"
        : "MATCH_GROUP_PAYMENT_ALREADY_CAPTURED",
    }, 409, corsHeaders);
  }

  await admin.rpc("refresh_match_group_discount", { p_group_id: order.group_id });

  return json({
    ok: true,
    confirmed: Boolean(marked),
    group_id: order.group_id,
    member_order_id: order.id,
  }, 200, corsHeaders);
});
