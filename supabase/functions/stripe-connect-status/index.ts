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
import { getStripeConnectRuntime } from "../_shared/stripe-client.ts";
import { readRestaurantConnectAccount } from "../_shared/stripe-connect-account.ts";

function text(value: unknown) {
  return String(value || "").trim();
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("stripe-connect-status");
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let restaurantId = "";

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

    actor = await authenticateRequest(req, { allowServiceRole: false });
    await assertProductionFlowAllowed(actor, "consultation Stripe Connect réelle");
    const body = await req.json().catch(() => ({}));
    restaurantId = text(body.restaurant_id);
    if (!restaurantId) throw new HttpError(400, "restaurant_id requis");

    const restaurant = await requireRestaurantAccess(actor, restaurantId, { allowDemo: true });

    if (restaurant.is_demo) {
      return jsonResponse({
        account_id: null,
        ready: false,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: [],
        disabled_reason: "commercial_demo",
        demo: true,
      }, 200, corsHeaders);
    }

    const accountId = text(restaurant.stripe_account_id);

    if (!accountId) {
      return jsonResponse({
        account_id: null,
        ready: false,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: ["stripe_account"],
        disabled_reason: "stripe_account_missing",
      }, 200, corsHeaders);
    }

    const { stripe } = getStripeConnectRuntime();
    const account = await readRestaurantConnectAccount(stripe, accountId);
    const currentlyDue = account.requirementsDue;
    const ready = account.ready;

    const now = new Date().toISOString();
    const { data: existingCompletion, error: completionError } = ready
      ? await actor.adminClient.from("restaurants")
        .select("stripe_connect_onboarding_completed_at")
        .eq("id", restaurantId)
        .single()
      : { data: null, error: null };
    if (completionError) throw new HttpError(500, completionError.message);

    const { error: updateError } = await actor.adminClient
      .from("restaurants")
      .update({
        stripe_connect_details_submitted: account.detailsSubmitted,
        stripe_connect_charges_enabled: account.chargesEnabled,
        stripe_connect_payouts_enabled: account.payoutsEnabled,
        stripe_connect_requirements_due: currentlyDue,
        stripe_connect_disabled_reason: account.disabledReason,
        stripe_connect_onboarding_completed_at: ready
          ? text(existingCompletion?.stripe_connect_onboarding_completed_at) || now
          : null,
        stripe_connect_last_synced_at: now,
      })
      .eq("id", restaurantId);

    if (updateError) throw new HttpError(500, updateError.message);

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "stripe-connect-status",
      action: "sync_stripe_connect_status",
      status: "success",
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
      metadata: {
        stripe_account_id: accountId,
        ready,
        details_submitted: account.detailsSubmitted,
        charges_enabled: account.chargesEnabled,
        payouts_enabled: account.payoutsEnabled,
        requirements_due: currentlyDue,
      },
    });

    return jsonResponse({
      account_id: accountId,
      ready,
      details_submitted: account.detailsSubmitted,
      charges_enabled: account.chargesEnabled,
      payouts_enabled: account.payoutsEnabled,
      requirements_due: currentlyDue,
      disabled_reason: account.disabledReason,
    }, 200, corsHeaders);
  } catch (error) {
    log.error("request_failed", { message: error instanceof Error ? error.message : "unknown" });

    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "stripe-connect-status",
      action: "sync_stripe_connect_status",
      status: "failure",
      targetEntityType: restaurantId ? "restaurants" : null,
      targetEntityId: restaurantId || null,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erreur interne" }, 500, corsHeaders);
  }
});
