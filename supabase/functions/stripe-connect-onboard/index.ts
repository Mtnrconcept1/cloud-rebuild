import { assertSentinelAllowed } from "../_shared/tok-sentinel-guard.ts";
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
import { getStripeConnectRuntime } from "../_shared/stripe-client.ts";
import {
  createRestaurantConnectAccount,
  createRestaurantConnectOnboardingLink,
  readRestaurantConnectAccount,
} from "../_shared/stripe-connect-account.ts";
import {
  STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED,
  isStripeConnectPlatformProfileRequired,
} from "../_shared/stripe-connect-platform-profile.ts";

function text(value: unknown) {
  return String(value || "").trim();
}

function getEnv(name: string) {
  return text(Deno.env.get(name));
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
    await assertSentinelAllowed(actor, "payments", restaurantId);
    const { stripe } = getStripeConnectRuntime();

    accountId = text(restaurant.stripe_account_id);

    if (!accountId) {
      const userLookup = actor.userClient ? await actor.userClient.auth.getUser() : null;
      const ownerEmail = text(userLookup?.data.user?.email);
      accountId = await createRestaurantConnectAccount(stripe, {
        restaurantId: restaurant.id,
        restaurantName: text(restaurant.name),
        ownerEmail,
        ownerId: actor.userId || "",
      });

      const { data: persistedRestaurant, error: persistError } = await adminClient
        .from("restaurants")
        .update({ stripe_account_id: accountId })
        .eq("id", restaurantId)
        .is("stripe_account_id", null)
        .select("id, stripe_account_id")
        .maybeSingle();

      if (persistError) throw new HttpError(500, persistError.message);
      if (!persistedRestaurant) {
        const { data: winner, error: winnerError } = await adminClient
          .from("restaurants")
          .select("stripe_account_id")
          .eq("id", restaurantId)
          .single();
        if (winnerError) throw new HttpError(500, winnerError.message);
        if (winner?.stripe_account_id !== accountId) {
          throw new HttpError(409, "STRIPE_CONNECT_ACCOUNT_CONCURRENT_LINK_CONFLICT");
        }
      } else if (persistedRestaurant.stripe_account_id !== accountId) {
        throw new HttpError(500, "stripe_account_id non persiste");
      }
    }

    const account = await readRestaurantConnectAccount(stripe, accountId);
    const currentlyDue = account.requirementsDue;
    const ready = account.ready;

    const { data: existingCompletion, error: completionError } = ready
      ? await adminClient.from("restaurants")
        .select("stripe_connect_onboarding_completed_at")
        .eq("id", restaurantId)
        .single()
      : { data: null, error: null };
    if (completionError) throw new HttpError(500, completionError.message);

    const { error: syncError } = await adminClient
      .from("restaurants")
      .update({
        stripe_connect_details_submitted: account.detailsSubmitted,
        stripe_connect_charges_enabled: account.chargesEnabled,
        stripe_connect_payouts_enabled: account.payoutsEnabled,
        stripe_connect_requirements_due: currentlyDue,
        stripe_connect_disabled_reason: account.disabledReason,
        stripe_connect_onboarding_completed_at: ready
          ? text(existingCompletion?.stripe_connect_onboarding_completed_at) || new Date().toISOString()
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

    const accountLinkUrl = await createRestaurantConnectOnboardingLink(
      stripe, account, safeReturnUrl,
    );

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
        account_api: account.api,
        requirements_due: currentlyDue,
      },
    });

    return jsonResponse({
      url: accountLinkUrl,
      account_id: accountId,
      ready: false,
      details_submitted: account.detailsSubmitted,
      charges_enabled: account.chargesEnabled,
      payouts_enabled: account.payoutsEnabled,
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

    if (isStripeConnectPlatformProfileRequired(error)) {
      // Legal/risk acknowledgement must be completed in the platform's
      // authenticated Stripe Dashboard by an authorized person. Never bypass
      // the Connect onboarding requirement or disclose Stripe API details.
      return jsonResponse({
        error: STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED,
        code: "STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED",
      }, 409, corsHeaders);
    }

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
