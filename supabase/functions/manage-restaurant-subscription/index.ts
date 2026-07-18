import Stripe from "npm:stripe@18.5.0";

import {
  HttpError,
  authenticateRequest,
  assertProductionFlowAllowed,
  createAdminClient,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKind } from "../_shared/stripe-client.ts";
import { FAIR_GROWTH_ANNUAL_MONTHS_CHARGED } from "../_shared/restaurant-subscription-billing.ts";

type JsonRecord = Record<string, unknown>;
type SubscriptionAction = "cancel" | "resume" | "change_plan";

const SUBSCRIPTION_CANCELLATION_NOTICE_DAYS = 3;
const SUBSCRIPTION_CANCELLATION_NOTICE_MS = SUBSCRIPTION_CANCELLATION_NOTICE_DAYS * 24 * 60 * 60 * 1000;

type RestaurantSubscriptionRow = {
  id: string;
  restaurant_id: string;
  restaurant_subscription_plan_id: string | null;
  plan: string | null;
  status: string | null;
  billing_period: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_mode: string | null;
  stripe_subscription_schedule_id?: string | null;
  cancel_at_period_end?: boolean | null;
  scheduled_plan_change?: JsonRecord | null;
  current_period_start: string | null;
  current_period_end: string | null;
  metadata: JsonRecord | null;
};

type RestaurantSubscriptionPlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_chf: number | string | null;
  position: number | string | null;
  is_active: boolean | null;
};

function normalizeAction(value: unknown): SubscriptionAction {
  if (value === "cancel" || value === "resume") return value;
  // Keep the old client value as a safe compatibility alias during rollout.
  if (value === "change_plan" || value === "downgrade") return "change_plan";
  throw new HttpError(400, "Action d'abonnement invalide");
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEntitledRestaurantStatus(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "active" || normalized === "trialing";
}

function toPositiveNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function finiteUnixTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function unixFromIso(value: string | null | undefined) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp / 1000) : null;
}

function addFallbackPeriod(start: Date, billingPeriod: string | null | undefined) {
  const end = new Date(start);
  if (billingPeriod === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function resolveStripeSubscriptionPeriod(
  stripeSubscription: Stripe.Subscription | null,
  localSubscription: RestaurantSubscriptionRow,
) {
  const fallbackStart = new Date();
  const localStart = unixFromIso(localSubscription.current_period_start);
  const localEnd = unixFromIso(localSubscription.current_period_end);
  const itemPeriodStarts = (stripeSubscription?.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_start?: unknown }).current_period_start))
    .filter((value): value is number => value !== null);
  const itemPeriodEnds = (stripeSubscription?.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_end?: unknown }).current_period_end))
    .filter((value): value is number => value !== null);

  const startUnix =
    finiteUnixTimestamp((stripeSubscription as { current_period_start?: unknown } | null)?.current_period_start) ||
    (itemPeriodStarts.length > 0 ? Math.min(...itemPeriodStarts) : null) ||
    localStart ||
    Math.floor(fallbackStart.getTime() / 1000);
  const endUnix =
    finiteUnixTimestamp((stripeSubscription as { current_period_end?: unknown } | null)?.current_period_end) ||
    (itemPeriodEnds.length > 0 ? Math.max(...itemPeriodEnds) : null) ||
    localEnd ||
    Math.floor(addFallbackPeriod(fallbackStart, localSubscription.billing_period).getTime() / 1000);

  if (!startUnix || !endUnix || endUnix <= startUnix) {
    throw new HttpError(409, "Période d'abonnement invalide");
  }

  return {
    startUnix,
    endUnix,
    startIso: new Date(startUnix * 1000).toISOString(),
    endIso: new Date(endUnix * 1000).toISOString(),
  };
}

function getStripeScheduleId(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (isJsonRecord(value) && typeof value.id === "string") return value.id;
  return null;
}

function getPrimarySubscriptionItem(subscription: Stripe.Subscription) {
  return subscription.items?.data?.[0] || null;
}

function getBillingInterval(billingPeriod: string | null | undefined): "month" | "year" {
  return billingPeriod === "yearly" ? "year" : "month";
}

function getRecurringAmountCents(plan: RestaurantSubscriptionPlanRow, billingPeriod: string | null | undefined) {
  const monthlyAmount = toPositiveNumber(plan.price_monthly_chf);
  const multiplier = billingPeriod === "yearly" ? FAIR_GROWTH_ANNUAL_MONTHS_CHARGED : 1;
  return Math.round(monthlyAmount * multiplier * 100);
}

function getCurrentPlanLookup(subscription: RestaurantSubscriptionRow) {
  if (subscription.restaurant_subscription_plan_id) {
    return { column: "id", value: subscription.restaurant_subscription_plan_id };
  }
  return { column: "slug", value: String(subscription.plan || "") };
}

function getAuditAction(action: SubscriptionAction) {
  if (action === "resume") return "resume_restaurant_subscription";
  if (action === "change_plan") return "schedule_restaurant_subscription_plan_change";
  return "cancel_restaurant_subscription_at_period_end";
}

function assertCancellationNoticeWindow(
  periodEndIso: string,
  action: "cancel" | "change_plan",
  billingPeriod: string | null | undefined,
) {
  const periodEnd = Date.parse(periodEndIso);
  if (!Number.isFinite(periodEnd)) {
    throw new HttpError(409, "Periode d'abonnement invalide");
  }

  const latestChangeAt = periodEnd - SUBSCRIPTION_CANCELLATION_NOTICE_MS;
  if (Date.now() > latestChangeAt) {
    const actionLabel = action === "change_plan" ? "changer de plan" : "resilier";
    const renewalLabel = billingPeriod === "yearly"
      ? "une nouvelle periode annuelle de douze mois"
      : "une nouvelle periode mensuelle";
    throw new HttpError(
      409,
      `Il faut ${actionLabel} au plus tard ${SUBSCRIPTION_CANCELLATION_NOTICE_DAYS} jours avant la fin de la periode payee. Passe ce delai, l'abonnement sera renouvele pour ${renewalLabel}.`,
    );
  }
}

function clearPendingMetadata(metadata: JsonRecord | null | undefined) {
  const next = { ...(isJsonRecord(metadata) ? metadata : {}) };
  delete next.pending_restaurant_subscription_change;
  delete next.pending_restaurant_subscription_effective_at;
  delete next.pending_restaurant_subscription_requested_at;
  delete next.pending_restaurant_subscription_requested_by;
  delete next.pending_restaurant_subscription_plan_id;
  delete next.pending_restaurant_subscription_plan_slug;
  delete next.pending_restaurant_subscription_plan_name;
  delete next.pending_restaurant_subscription_schedule_id;
  return next;
}

function stripeMetadataDeletes() {
  return {
    pending_restaurant_subscription_change: "",
    pending_restaurant_subscription_effective_at: "",
    pending_restaurant_subscription_requested_at: "",
    pending_restaurant_subscription_requested_by: "",
    pending_restaurant_subscription_plan_id: "",
    pending_restaurant_subscription_plan_slug: "",
    pending_restaurant_subscription_plan_name: "",
    pending_restaurant_subscription_schedule_id: "",
  };
}

async function getLatestRestaurantSubscription(adminClient: ReturnType<typeof createAdminClient>, restaurantId: string) {
  const { data, error } = await adminClient
    .from("restaurant_ai_subscriptions")
    .select("id, restaurant_id, restaurant_subscription_plan_id, plan, status, billing_period, stripe_subscription_id, stripe_checkout_session_id, stripe_mode, stripe_subscription_schedule_id, cancel_at_period_end, scheduled_plan_change, current_period_start, current_period_end, metadata")
    .eq("restaurant_id", restaurantId)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  return data as RestaurantSubscriptionRow | null;
}

async function getPlanById(adminClient: ReturnType<typeof createAdminClient>, planId: string) {
  const { data, error } = await adminClient
    .from("restaurant_subscription_plans")
    .select("id, slug, name, description, price_monthly_chf, position, is_active")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  return data as RestaurantSubscriptionPlanRow | null;
}

async function getCurrentPlan(adminClient: ReturnType<typeof createAdminClient>, subscription: RestaurantSubscriptionRow) {
  const lookup = getCurrentPlanLookup(subscription);
  if (!lookup.value) return null;

  const { data, error } = await adminClient
    .from("restaurant_subscription_plans")
    .select("id, slug, name, description, price_monthly_chf, position, is_active")
    .eq(lookup.column, lookup.value)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  return data as RestaurantSubscriptionPlanRow | null;
}

async function updateLocalSubscriptionState(input: {
  adminClient: ReturnType<typeof createAdminClient>;
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
  scheduledPlanChange: JsonRecord;
  stripeSubscriptionScheduleId?: string | null;
  metadata: JsonRecord;
}) {
  const { data, error } = await input.adminClient
    .from("restaurant_ai_subscriptions")
    .update({
      cancel_at_period_end: input.cancelAtPeriodEnd,
      scheduled_plan_change: input.scheduledPlanChange,
      stripe_subscription_schedule_id: input.stripeSubscriptionScheduleId || null,
      metadata: input.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.subscriptionId)
    .select("id, restaurant_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, scheduled_plan_change, stripe_subscription_schedule_id")
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  return data;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("manage-restaurant-subscription");

  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  let action: SubscriptionAction = "cancel";
  let restaurantId: string | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    await assertProductionFlowAllowed(actor, "abonnement restaurateur réel");

    const body = await req.json().catch(() => ({}));
    action = normalizeAction(body?.action);
    restaurantId = typeof body?.restaurant_id === "string" ? body.restaurant_id.trim() : "";
    const targetPlanId = typeof body?.target_plan_id === "string" ? body.target_plan_id.trim() : "";

    if (!restaurantId) throw new HttpError(400, "restaurant_id requis");
    await requireRestaurantAccess(actor, restaurantId);

    const subscription = await getLatestRestaurantSubscription(actor.adminClient, restaurantId);
    if (!subscription) {
      throw new HttpError(404, "Aucun abonnement restaurateur introuvable");
    }

    const period = resolveStripeSubscriptionPeriod(null, subscription);
    if (new Date(period.endIso) <= new Date() && action !== "resume") {
      throw new HttpError(409, "La période payée est déjà terminée");
    }

    if (!isEntitledRestaurantStatus(subscription.status) && action !== "resume") {
      throw new HttpError(409, "Aucun abonnement actif à modifier");
    }

    const requestedAt = new Date().toISOString();
    const currentMetadata = isJsonRecord(subscription.metadata) ? subscription.metadata : {};

    if (action === "cancel") {
      assertCancellationNoticeWindow(period.endIso, "cancel", subscription.billing_period);

      const scheduledPlanChange = {
        action: "cancel",
        effective_at: period.endIso,
        requested_at: requestedAt,
        requested_by: actor.userId,
      };
      let stripeSubscription: Stripe.Subscription | null = null;
      let stripeScheduleId = subscription.stripe_subscription_schedule_id || null;
      const nextMetadata = {
        ...currentMetadata,
        pending_restaurant_subscription_change: "cancel_at_period_end",
        pending_restaurant_subscription_effective_at: period.endIso,
        pending_restaurant_subscription_requested_at: requestedAt,
        pending_restaurant_subscription_requested_by: actor.userId,
      };

      if (subscription.stripe_subscription_id) {
        const stripeRuntime = getStripeRuntimeForCheckoutKind("restaurant-subscription-upgrade");
        stripeSubscription = await stripeRuntime.stripe.subscriptions.update(
          subscription.stripe_subscription_id,
          {
            cancel_at_period_end: true,
            metadata: {
              pending_restaurant_subscription_change: "cancel_at_period_end",
              pending_restaurant_subscription_effective_at: period.endIso,
              pending_restaurant_subscription_requested_at: requestedAt,
              pending_restaurant_subscription_requested_by: actor.userId,
            },
          },
        );
        stripeScheduleId = getStripeScheduleId(stripeSubscription.schedule);
      }

      const updatedSubscription = await updateLocalSubscriptionState({
        adminClient: actor.adminClient,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: true,
        scheduledPlanChange,
        stripeSubscriptionScheduleId: stripeScheduleId,
        metadata: {
          ...nextMetadata,
          stripe_subscription_id: subscription.stripe_subscription_id || "",
          stripe_subscription_cancel_at_period_end: true,
        },
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "manage-restaurant-subscription",
        action: getAuditAction(action),
        status: "success",
        targetEntityType: "restaurant_ai_subscriptions",
        targetEntityId: subscription.id,
        metadata: {
          restaurant_id: restaurantId,
          effective_at: period.endIso,
          stripe_subscription_id: subscription.stripe_subscription_id || null,
          stripe_subscription_schedule_id: stripeScheduleId,
        },
      });

      return jsonResponse({ ok: true, subscription: updatedSubscription }, 200, corsHeaders);
    }

    if (action === "resume") {
      let stripeScheduleId: string | null = null;

      if (subscription.stripe_subscription_id) {
        const stripeRuntime = getStripeRuntimeForCheckoutKind("restaurant-subscription-upgrade");
        const stripeSubscription = await stripeRuntime.stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id,
          { expand: ["schedule"] },
        );
        stripeScheduleId = getStripeScheduleId(stripeSubscription.schedule) || subscription.stripe_subscription_schedule_id || null;

        if (stripeScheduleId) {
          await stripeRuntime.stripe.subscriptionSchedules.release(stripeScheduleId);
        }

        await stripeRuntime.stripe.subscriptions.update(
          subscription.stripe_subscription_id,
          {
            cancel_at_period_end: false,
            metadata: stripeMetadataDeletes(),
          },
        );
      }

      const updatedSubscription = await updateLocalSubscriptionState({
        adminClient: actor.adminClient,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: false,
        scheduledPlanChange: {},
        stripeSubscriptionScheduleId: null,
        metadata: {
          ...clearPendingMetadata(currentMetadata),
          stripe_subscription_cancel_at_period_end: false,
        },
      });

      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: "manage-restaurant-subscription",
        action: getAuditAction(action),
        status: "success",
        targetEntityType: "restaurant_ai_subscriptions",
        targetEntityId: subscription.id,
        metadata: {
          restaurant_id: restaurantId,
          stripe_subscription_id: subscription.stripe_subscription_id || null,
          released_stripe_subscription_schedule_id: stripeScheduleId,
        },
      });

      return jsonResponse({ ok: true, subscription: updatedSubscription }, 200, corsHeaders);
    }

    if (!targetPlanId) {
      throw new HttpError(400, "target_plan_id requis");
    }

    assertCancellationNoticeWindow(period.endIso, "change_plan", subscription.billing_period);

    const [currentPlan, targetPlan] = await Promise.all([
      getCurrentPlan(actor.adminClient, subscription),
      getPlanById(actor.adminClient, targetPlanId),
    ]);

    if (!targetPlan) throw new HttpError(404, "Plan inférieur introuvable ou inactif");
    if (!currentPlan) throw new HttpError(409, "Plan actuel introuvable");

    if (String(currentPlan.id) === String(targetPlan.id)) {
      throw new HttpError(409, "Le plan cible est deja le plan actif");
    }

    const interval = getBillingInterval(subscription.billing_period);
    const targetAmountCents = getRecurringAmountCents(targetPlan, subscription.billing_period);
    if (targetAmountCents <= 0) throw new HttpError(400, "Prix du plan inférieur invalide");

    let stripeScheduleId: string | null = subscription.stripe_subscription_schedule_id || null;
    let targetStripePriceId: string | null = null;

    if (subscription.stripe_subscription_id) {
      const stripeRuntime = getStripeRuntimeForCheckoutKind("restaurant-subscription-upgrade");
      const stripeSubscription = await stripeRuntime.stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id,
        { expand: ["items.data.price", "schedule"] },
      );
      const activeScheduleId = getStripeScheduleId(stripeSubscription.schedule) || subscription.stripe_subscription_schedule_id || null;
      if (activeScheduleId) {
        throw new HttpError(409, "Un changement d'abonnement est déjà programmé");
      }

      const stripePeriod = resolveStripeSubscriptionPeriod(stripeSubscription, subscription);
      const currentItem = getPrimarySubscriptionItem(stripeSubscription);
      const currentPriceId = typeof currentItem?.price === "string"
        ? currentItem.price
        : currentItem?.price?.id || null;

      if (!currentPriceId) {
        throw new HttpError(409, "Prix Stripe actuel introuvable");
      }

      const pendingMetadata = {
        pending_restaurant_subscription_change: "plan_change_at_period_end",
        pending_restaurant_subscription_effective_at: stripePeriod.endIso,
        pending_restaurant_subscription_requested_at: requestedAt,
        pending_restaurant_subscription_requested_by: actor.userId,
        pending_restaurant_subscription_plan_id: targetPlan.id,
        pending_restaurant_subscription_plan_slug: targetPlan.slug,
        pending_restaurant_subscription_plan_name: targetPlan.name,
      };

      const targetPrice = await stripeRuntime.stripe.prices.create({
        currency: "chf",
        recurring: { interval },
        unit_amount: targetAmountCents,
        product_data: {
          name: `Abonnement restaurateur TOK - ${targetPlan.name}`,
          description: String(targetPlan.description || ""),
          metadata: {
            restaurant_subscription_plan_id: targetPlan.id,
            restaurant_subscription_plan_slug: targetPlan.slug,
          },
        },
        metadata: {
          checkout_kind: "restaurant-subscription-plan-change",
          restaurant_id: restaurantId,
          restaurant_subscription_plan_id: targetPlan.id,
          restaurant_subscription_plan_slug: targetPlan.slug,
          billing_period: subscription.billing_period === "yearly" ? "yearly" : "monthly",
          annual_months_charged: subscription.billing_period === "yearly"
            ? String(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED)
            : "1",
          service_months: subscription.billing_period === "yearly" ? "12" : "1",
          entitlement_reset_period: "monthly",
        },
      });
      targetStripePriceId = targetPrice.id;

      const schedule = await stripeRuntime.stripe.subscriptionSchedules.create({
        from_subscription: subscription.stripe_subscription_id,
      });
      stripeScheduleId = schedule.id;

      await stripeRuntime.stripe.subscriptionSchedules.update(
        schedule.id,
        {
          end_behavior: "release",
          metadata: {
            restaurant_id: restaurantId,
            pending_restaurant_subscription_change: "plan_change_at_period_end",
            pending_restaurant_subscription_effective_at: stripePeriod.endIso,
            pending_restaurant_subscription_plan_id: targetPlan.id,
            pending_restaurant_subscription_plan_slug: targetPlan.slug,
          },
          phases: [
            {
              start_date: stripePeriod.startUnix,
              end_date: stripePeriod.endUnix,
              items: [{ price: currentPriceId, quantity: currentItem?.quantity || 1 }],
              metadata: {
                ...(stripeSubscription.metadata || {}),
                ...pendingMetadata,
                checkout_kind: "restaurant-subscription-upgrade",
                restaurant_id: restaurantId,
                restaurant_subscription_plan_id: currentPlan.id,
                restaurant_subscription_plan_slug: currentPlan.slug,
                pending_restaurant_subscription_schedule_id: schedule.id,
              },
              proration_behavior: "none",
            },
            {
              start_date: stripePeriod.endUnix,
              items: [{ price: targetPrice.id, quantity: 1 }],
              metadata: {
                ...(clearPendingMetadata(stripeSubscription.metadata || {}) as Record<string, string>),
                checkout_kind: "restaurant-subscription-upgrade",
                restaurant_id: restaurantId,
                restaurant_subscription_plan_id: targetPlan.id,
                restaurant_subscription_plan_slug: targetPlan.slug,
                plan_id: targetPlan.id,
                plan_slug: targetPlan.slug,
                billing_period: subscription.billing_period === "yearly" ? "yearly" : "monthly",
                annual_months_charged: subscription.billing_period === "yearly"
                  ? String(FAIR_GROWTH_ANNUAL_MONTHS_CHARGED)
                  : "1",
                service_months: subscription.billing_period === "yearly" ? "12" : "1",
                entitlement_reset_period: "monthly",
              },
              proration_behavior: "none",
            },
          ],
        } as Stripe.SubscriptionScheduleUpdateParams,
      );

      await stripeRuntime.stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          cancel_at_period_end: false,
          metadata: {
            ...pendingMetadata,
            pending_restaurant_subscription_schedule_id: schedule.id,
          },
        },
      );
    }

    const effectiveAt = subscription.stripe_subscription_id
      ? period.endIso
      : resolveStripeSubscriptionPeriod(null, subscription).endIso;
    const scheduledPlanChange = {
      action: "change_plan",
      target_plan_id: targetPlan.id,
      target_plan_slug: targetPlan.slug,
      target_plan_name: targetPlan.name,
      current_plan_id: currentPlan.id,
      current_plan_slug: currentPlan.slug,
      effective_at: effectiveAt,
      requested_at: requestedAt,
      requested_by: actor.userId,
      billing_period: subscription.billing_period === "yearly" ? "yearly" : "monthly",
      stripe_subscription_schedule_id: stripeScheduleId,
      stripe_price_id: targetStripePriceId,
    };

    const updatedSubscription = await updateLocalSubscriptionState({
      adminClient: actor.adminClient,
      subscriptionId: subscription.id,
      cancelAtPeriodEnd: false,
      scheduledPlanChange,
      stripeSubscriptionScheduleId: stripeScheduleId,
      metadata: {
        ...currentMetadata,
        pending_restaurant_subscription_change: "plan_change_at_period_end",
        pending_restaurant_subscription_effective_at: effectiveAt,
        pending_restaurant_subscription_requested_at: requestedAt,
        pending_restaurant_subscription_requested_by: actor.userId,
        pending_restaurant_subscription_plan_id: targetPlan.id,
        pending_restaurant_subscription_plan_slug: targetPlan.slug,
        pending_restaurant_subscription_plan_name: targetPlan.name,
        pending_restaurant_subscription_schedule_id: stripeScheduleId || "",
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: "manage-restaurant-subscription",
      action: getAuditAction(action),
      status: "success",
      targetEntityType: "restaurant_ai_subscriptions",
      targetEntityId: subscription.id,
      metadata: {
        restaurant_id: restaurantId,
        current_plan_id: currentPlan.id,
        target_plan_id: targetPlan.id,
        effective_at: effectiveAt,
        stripe_subscription_id: subscription.stripe_subscription_id || null,
        stripe_subscription_schedule_id: stripeScheduleId,
      },
    });

    return jsonResponse({ ok: true, subscription: updatedSubscription }, 200, corsHeaders);
  } catch (error) {
    log.error("manage-restaurant-subscription error", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: actor?.adminClient || createAdminClient(),
      actor,
      request: req,
      functionName: "manage-restaurant-subscription",
      action: getAuditAction(action),
      status: "failure",
      targetEntityType: "restaurant_ai_subscriptions",
      targetEntityId: restaurantId,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
    });

    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }

    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});

