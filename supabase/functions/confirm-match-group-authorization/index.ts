import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function env(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function getIntentId(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = env("STRIPE_SECRET_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey || !stripeKey) {
    return json({ error: "Server not configured" }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Unauthorized" }, 401);

  let body: { member_order_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.member_order_id) return json({ error: "member_order_id required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: order, error: orderError } = await admin
    .from("group_member_orders")
    .select("id,user_id,group_id,restaurant_id,subtotal,stripe_checkout_session_id,payment_status")
    .eq("id", body.member_order_id)
    .maybeSingle();

  if (orderError) return json({ error: orderError.message }, 500);
  if (!order) return json({ error: "Commande introuvable" }, 404);
  if (order.user_id !== userId) return json({ error: "Forbidden" }, 403);
  if (order.payment_status === "authorized" || order.payment_status === "captured") {
    return json({ ok: true, already_confirmed: true });
  }
  if (!order.stripe_checkout_session_id) return json({ error: "Session de prépaiement introuvable" }, 409);

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, {
    expand: ["payment_intent"],
  });

  const paymentIntentId = getIntentId(session);
  if (session.payment_status !== "paid" || !paymentIntentId) {
    return json({ error: "Prépaiement non confirmé", payment_status: session.payment_status || "unknown" }, 409);
  }

  const { data: marked, error: markError } = await admin.rpc("mark_match_group_member_authorized", {
    p_member_order_id: order.id,
    p_checkout_session_id: order.stripe_checkout_session_id,
    p_payment_intent_id: paymentIntentId,
    p_authorized_amount: Number(session.amount_total || 0) / 100,
    p_metadata: {
      stripe_session_status: session.status,
      stripe_payment_status: session.payment_status,
      authorized_currency: session.currency,
      order_sent_to_restaurant: true,
    },
  });

  if (markError) return json({ error: markError.message }, 500);

  await admin.rpc("refresh_match_group_discount", { p_group_id: order.group_id });

  return json({
    ok: true,
    confirmed: Boolean(marked),
    group_id: order.group_id,
    member_order_id: order.id,
  });
});
