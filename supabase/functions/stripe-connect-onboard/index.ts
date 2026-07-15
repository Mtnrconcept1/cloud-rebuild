import {
  HttpError,
  assertProductionFlowAllowed,
  authenticateRequest,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { normalizeCheckoutReturnUrl } from "../_shared/return-url.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";

function text(value: unknown) {
  return String(value || "").trim();
}

function getEnv(name: string) {
  return text(Deno.env.get(name));
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : [];
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
    await assertProductionFlowAllowed(actor, "activation Stripe Connect réelle");
    const adminClient = actor.adminClient;
    const body = await req.json().catch(() => ({}));

    restaurantId = text(body.restaurant_id);
    if (!restaurantId) throw new HttpError(400, "restaurant_id requis");

    const restaurant = await requireRestaurantAccess(actor, restaurantId, { allowDemo: true });
    if (restaurant.is_demo) {
      throw new HttpError(
        409,
        "DEMO_SIDE_EFFECT_BLOCKED: Stripe Connect est désactivé pour les restaurants de démonstration.",
      );
    }
    const { stripe } = getStripeRuntimeForCheckoutKind("stripe-connect");

    accountId = text(restaurant.stripe_account_id);

    if (!accountId) {
      const userLookup = actor.userClient ? await actor.userClient.auth.getUser() : null;
      const ownerEmail = text(userLookup?.data.user?.email);
      const restaurantPhone = text(restaurant.phone);

      const account = await stripe.accounts.create({
        type: "express",
        country: "CH",
        email: ownerEmail || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: text(restaurant.name),
          mcc: "5812",
          product_description: "Restaurant partenaire de la plateforme TOK",
          support_phone: restaurantPhone || undefined,
          url: text(restaurant.website_url) || undefined,
        },
        metadata: {
          restaurant_id: restaurant.id,
          owner_id: actor.userId || "",
          platform: "TOK",
          payout_share_percent: "90",
          platform_fee_percent: "10",
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

    const account = await stripe.accounts.retrieve(accountId);
    const currentlyDue = stringArray(account.requirements?.currently_due);
    const ready = Boolean(
      account.details_submitted
      && account.charges_enabled
      && account.payouts_enabled
      && currentlyDue.length === 0,
    );

    const { error: syncError } = await adminClient
      .from("restaurants")
      .update({
        stripe_connect_details_submitted: Boolean(account.details_submitted),
        stripe_connect_charges_enabled: Boolean(account.charges_enabled),
        stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
        stripe_connect_requirements_due: currentlyDue,
        stripe_connect_disabled_reason: text(account.requirements?.disabled_reason) || null,
        stripe_connect_onboarding_completed_at: ready
          ? text(restaurant.stripe_connect_onboarding_completed_at) || new Date().toISOString()
          : null,
        stripe_connect_last_synced_at: new Date().toISOString(),
      })
      .eq("id", restaurantId);

    if (syncError) throw new HttpError(500, syncError.message);

    const siteUrl = getEnv("SITE_URL") || "https://www.thetok.ch";
    const fallbackReturn = `${siteUrl}/dashboard/restaurant?stripe_connect=returned`;
    const safeReturnUrl = normalizeCheckoutReturnUrl(body.return_url) || fallbackReturn;

    if (ready) {
      return jsonResponse({
        account_id: accountId,
        ready: true,
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        requirements_due: [],
      }, 200, corsHeaders);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeReturnUrl,
      return_url: safeReturnUrl,
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
        future_requirements: "include",
      },
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
        collection_fields: "eventually_due",
        future_requirements: "include",
        requirements_due: currentlyDue,
      },
    });

    return jsonResponse({
      url: accountLink.url,
      account_id: accountId,
      ready: false,
      details_submitted: Boolean(account.details_submitted),
      charges_enabled: Boolean(account.charges_enabled),
      payouts_enabled: Boolean(account.payouts_enabled),
      requirements_due: currentlyDue,
    }, 200, corsHeaders);
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
