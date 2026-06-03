import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { normalizeCheckoutReturnUrl } from "../_shared/return-url.ts";

const getEnv = (name: string) => Deno.env.get(name)?.trim() || "";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("stripe-connect-onboard");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_ANON_KEY"),
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
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { restaurant_id, return_url } = await req.json();

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user owns this restaurant
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id, stripe_account_id, owner_id, name")
      .eq("id", restaurant_id)
      .single();

    if (!restaurant || restaurant.owner_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Restaurant non trouvé" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    let accountId = restaurant.stripe_account_id;

    // Create a new Stripe Connected Account if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "CH",
        email: userData.user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: restaurant.name,
          mcc: "5812", // Eating Places, Restaurants
        },
      });

      accountId = account.id;

      // Save the Stripe account ID on the restaurant
      await supabaseAdmin
        .from("restaurants")
        .update({ stripe_account_id: accountId })
        .eq("id", restaurant_id);
    }

    // Validate return_url against allowlist to prevent open redirect.
    const siteUrl = Deno.env.get("SITE_URL") || "https://www.thetok.ch";
    const fallbackReturn = `${siteUrl}/dashboard/restaurant`;
    const safeReturnUrl = normalizeCheckoutReturnUrl(return_url) || fallbackReturn;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeReturnUrl,
      return_url: safeReturnUrl,
      type: "account_onboarding",
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, account_id: accountId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
