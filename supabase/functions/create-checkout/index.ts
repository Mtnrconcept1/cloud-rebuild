import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      items,
      payment_method,
      return_url,
      order_metadata,
    } = await req.json();

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Aucun article" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });

    // Look up restaurant's Stripe Connected Account for payment routing
    let stripeAccountId: string | null = null;
    const restaurantId = order_metadata?.restaurant_id;
    if (restaurantId) {
      const { data: restaurant } = await supabaseAdmin
        .from("restaurants")
        .select("stripe_account_id")
        .eq("id", restaurantId)
        .maybeSingle();
      stripeAccountId = restaurant?.stripe_account_id || null;
    }

    // Map payment method to Stripe payment_method_types
    const paymentMethodTypes: string[] = [];
    switch (payment_method) {
      case "twint":
        paymentMethodTypes.push("twint");
        break;
      case "postfinance_card":
      case "postfinance_efinance":
        // PostFinance not directly supported by Stripe Checkout — fall back to card
        paymentMethodTypes.push("card");
        break;
      case "card":
      default:
        paymentMethodTypes.push("card");
        break;
    }

    // Build line items
    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: "chf",
        product_data: {
          name: item.name,
          description: item.restaurant_name || undefined,
        },
        unit_amount: Math.round(item.price * 100), // cents
      },
      quantity: item.quantity,
    }));

    // Add delivery fee if present
    if (order_metadata?.delivery_fee && order_metadata.delivery_fee > 0) {
      lineItems.push({
        price_data: {
          currency: "chf",
          product_data: {
            name: "Frais de livraison",
            description: undefined,
          },
          unit_amount: Math.round(order_metadata.delivery_fee * 100),
        },
        quantity: 1,
      });
    }

    // Build Stripe Checkout Session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: paymentMethodTypes,
      line_items: lineItems,
      mode: "payment",
      success_url: `${return_url}?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${return_url}?status=cancelled`,
      customer_email: userData.user.email,
      metadata: {
        user_id: userData.user.id,
        order_reference: order_metadata?.order_reference || "",
        restaurant_id: order_metadata?.restaurant_id || "",
        payment_method_label: payment_method,
      },
    };

    // Route payment to restaurant's Stripe Connected Account via destination charge
    if (stripeAccountId) {
      const platformFeePercent = 0.10; // 10% platform commission
      const totalAmount = lineItems.reduce(
        (sum: number, li: any) => sum + li.price_data.unit_amount * li.quantity,
        0
      );
      sessionParams.payment_intent_data = {
        transfer_data: {
          destination: stripeAccountId,
        },
        application_fee_amount: Math.round(totalAmount * platformFeePercent),
      };
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("create-checkout error:", error);
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
