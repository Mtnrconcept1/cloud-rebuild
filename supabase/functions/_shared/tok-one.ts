import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

type AdminClient = ReturnType<typeof createClient>;

const TOK_ONE_ENTITLED_STATUSES = new Set(["active", "trialing"]);

export function isTokOneEntitledStatus(status: string | null | undefined) {
  return TOK_ONE_ENTITLED_STATUSES.has(String(status || "").toLowerCase());
}

function normalizeTokOneStatus(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "canceled") return "cancelled";
  return normalized || "inactive";
}

function toIsoFromUnix(timestamp: number | null | undefined, fallback: Date) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return fallback.toISOString();
  }
  return new Date(timestamp * 1000).toISOString();
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function finiteUnixTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function resolveTokOneSubscriptionPeriod(subscription: Stripe.Subscription, fallbackDate: Date) {
  const subscriptionItems = subscription.items?.data || [];
  const itemPeriodStarts = subscriptionItems
    .map((item) => finiteUnixTimestamp((item as { current_period_start?: unknown }).current_period_start))
    .filter((value): value is number => value !== null);
  const itemPeriodEnds = subscriptionItems
    .map((item) => finiteUnixTimestamp((item as { current_period_end?: unknown }).current_period_end))
    .filter((value): value is number => value !== null);

  const currentPeriodStart =
    finiteUnixTimestamp((subscription as { current_period_start?: unknown }).current_period_start) ||
    (itemPeriodStarts.length > 0 ? Math.min(...itemPeriodStarts) : null) ||
    finiteUnixTimestamp(subscription.trial_start) ||
    finiteUnixTimestamp(subscription.start_date) ||
    toUnixSeconds(fallbackDate);

  const currentPeriodEnd =
    finiteUnixTimestamp((subscription as { current_period_end?: unknown }).current_period_end) ||
    (itemPeriodEnds.length > 0 ? Math.max(...itemPeriodEnds) : null) ||
    finiteUnixTimestamp(subscription.trial_end) ||
    null;

  if (currentPeriodEnd && currentPeriodEnd > currentPeriodStart) {
    return { currentPeriodStart, currentPeriodEnd };
  }

  if (!isTokOneEntitledStatus(subscription.status)) {
    return { currentPeriodStart, currentPeriodEnd: toUnixSeconds(fallbackDate) };
  }

  const metadata = subscription.metadata || {};
  const fallbackDays = subscription.status === "trialing"
    ? 14
    : metadata.billing_period === "yearly"
    ? 366
    : 31;
  return {
    currentPeriodStart,
    currentPeriodEnd: currentPeriodStart + fallbackDays * 24 * 60 * 60,
  };
}

async function findExistingTokOneSubscription(input: {
  adminClient: AdminClient;
  stripeSubscriptionId?: string | null;
  userId?: string | null;
  planId?: string | null;
  stripeMode: "live" | "test";
}) {
  const { adminClient, stripeSubscriptionId, userId, planId, stripeMode } = input;

  if (stripeSubscriptionId) {
    const { data, error } = await adminClient
      .from("tok_one_subscriptions")
      .select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id, billing_provider, apple_original_transaction_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .eq("stripe_mode", stripeMode)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (!userId || !planId) return null;

  const { data, error } = await adminClient
    .from("tok_one_subscriptions")
    .select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id, billing_provider, apple_original_transaction_id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("stripe_mode", stripeMode)
    .eq("billing_provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getLatestTokOneSubscription(adminClient: AdminClient, userId: string) {
  const { data, error } = await adminClient
    .from("tok_one_subscriptions")
    .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id, billing_provider, apple_original_transaction_id")
    .eq("user_id", userId)
    .eq("stripe_mode", "live")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function syncTokOneSubscriptionRecord(input: {
  adminClient: AdminClient;
  subscription: Stripe.Subscription;
  fallbackUserId?: string | null;
  fallbackPlanId?: string | null;
  stripeMode?: "live" | "test" | string | null;
  stripeCheckoutSessionId?: string | null;
}) {
  const {
    adminClient,
    subscription,
    fallbackUserId = null,
    fallbackPlanId = null,
    stripeMode = null,
    stripeCheckoutSessionId = null,
  } = input;
  const metadata = subscription.metadata || {};
  const normalizedStripeMode = stripeMode === "test" ? "test" : "live";

  const existing = await findExistingTokOneSubscription({
    adminClient,
    stripeSubscriptionId: subscription.id,
    userId: typeof metadata.user_id === "string" ? metadata.user_id : fallbackUserId,
    planId: typeof metadata.plan_id === "string" ? metadata.plan_id : fallbackPlanId,
    stripeMode: normalizedStripeMode,
  });

  const userId = typeof metadata.user_id === "string" && metadata.user_id
    ? metadata.user_id
    : (existing?.user_id || fallbackUserId);
  const planId = typeof metadata.plan_id === "string" && metadata.plan_id
    ? metadata.plan_id
    : (existing?.plan_id || fallbackPlanId);

  if (!userId || !planId) {
    console.warn("Tok One subscription sync skipped: missing user_id or plan_id", {
      stripe_subscription_id: subscription.id,
      user_id: userId,
      plan_id: planId,
    });
    return { updated: false, row: existing || null };
  }

  const fallbackDate = new Date();
  const period = resolveTokOneSubscriptionPeriod(subscription, fallbackDate);
  const payload = {
    user_id: userId,
    plan_id: planId,
    status: normalizeTokOneStatus(subscription.status),
    current_period_start: toIsoFromUnix(period.currentPeriodStart, fallbackDate),
    current_period_end: toIsoFromUnix(period.currentPeriodEnd, fallbackDate),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_subscription_id: subscription.id,
    stripe_mode: normalizedStripeMode,
    billing_provider: "stripe",
    stripe_checkout_session_id: stripeCheckoutSessionId || existing?.stripe_checkout_session_id || null,
  };

  const { data, error } = existing?.id
    ? await adminClient
      .from("tok_one_subscriptions")
      .update(payload)
      .eq("id", existing.id)
      .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id")
      .single()
    : await adminClient
      .from("tok_one_subscriptions")
      .insert(payload)
      .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, stripe_mode, stripe_checkout_session_id")
      .single();

  if (error) throw error;

  return { updated: true, row: data };
}
