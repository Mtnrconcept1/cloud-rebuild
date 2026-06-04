import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  createAdminClient,
  getEnv,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { normalizeCheckoutReturnUrl } from "../_shared/return-url.ts";

function text(value: unknown) {
  return String(value || "").trim();
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("stripe-connect-onboard");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";
  let accountId = "";

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

    actor = await authenticateRequest(req, { allowServiceRole: false });
    const adminClient = actor.adminClient;
    const body = await req.json().catch(() => ({}));

    restaurantId = text(body.restaurant_id);
    if (!restaurantId) throw new HttpError(400, "restaurant_id requis");

    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const stripeSecretKey = getEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) throw new HttpError(503, "STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    accountId = text(restaurant.stripe_account_id);

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "CH",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: restaurant.name,
          mcc: "5812",
        },
        metadata: {
          restaurant_id: restaurant.id,
          owner_id: actor.userId || "",
        },
      }, {
        idempotencyKey: `stripe-connect-account:${restaurant.id}`,
      });

      accountId = account.id;

      const { data: persistedRestaurant, error: persistError } = await adminClient
        .from("restaurants")
        .update({ stripe_account_id: accountId })
        .eq("id", restaurantId)
        .select("id, stripe_account_id")
        .single();

      if (persistError) throw new HttpError(500, persistError.message);
      if (persistedRestaurant?.stripe_account_id !== accountId) {
        throw new HttpError(500, "stripe_account_id non persiste");
      }
    }

    const siteUrl = getEnv("SITE_URL") || "https://www.thetok.ch";
    const fallbackReturn = `${siteUrl}/dashboard/restaurant`;
    const safeReturnUrl = normalizeCheckoutReturnUrl(body.return_url) || fallbackReturn;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeReturnUrl,
      return_url: safeReturnUrl,
      type: "account_onboarding",
    });

    await writeAuditLog({
      adminClient,
      actor,
      request: req,
      functionName: "stripe-connect-onboard",
      action: "create_stripe_connect_onboarding_link",
      status: "success",
      targetEntityType: "restaurants",
      targetEntityId: restaurant.id,
      metadata: {
        stripe_account_id: accountId,
        reused_existing_account: Boolean(restaurant.stripe_account_id),
      },
    });

    return jsonResponse({ url: accountLink.url, account_id: accountId }, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "stripe-connect-onboard",
      action: "create_stripe_connect_onboarding_link",
      status: "failure",
      targetEntityType: restaurantId ? "restaurants" : null,
      targetEntityId: restaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
      metadata: {
        stripe_account_id: accountId || null,
      },
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
