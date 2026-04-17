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

async function findExistingTokOneSubscription(input: {
  adminClient: AdminClient;
  stripeSubscriptionId?: string | null;
  userId?: string | null;
  planId?: string | null;
}) {
  const { adminClient, stripeSubscriptionId, userId, planId } = input;

  if (stripeSubscriptionId) {
    const { data, error } = await adminClient
      .from("tok_one_subscriptions")
      .select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (!userId || !planId) return null;

  const { data, error } = await adminClient
    .from("tok_one_subscriptions")
    .select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, stripe_subscription_id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getLatestTokOneSubscription(adminClient: AdminClient, userId: string) {
  const { data, error } = await adminClient
    .from("tok_one_subscriptions")
    .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id")
    .eq("user_id", userId)
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
}) {
  const { adminClient, subscription, fallbackUserId = null, fallbackPlanId = null } = input;
  const metadata = subscription.metadata || {};

  const existing = await findExistingTokOneSubscription({
    adminClient,
    stripeSubscriptionId: subscription.id,
    userId: typeof metadata.user_id === "string" ? metadata.user_id : fallbackUserId,
    planId: typeof metadata.plan_id === "string" ? metadata.plan_id : fallbackPlanId,
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
  const payload = {
    user_id: userId,
    plan_id: planId,
    status: normalizeTokOneStatus(subscription.status),
    current_period_start: toIsoFromUnix(subscription.current_period_start, fallbackDate),
    current_period_end: toIsoFromUnix(subscription.current_period_end, fallbackDate),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_subscription_id: subscription.id,
  };

  const { data, error } = existing?.id
    ? await adminClient
      .from("tok_one_subscriptions")
      .update(payload)
      .eq("id", existing.id)
      .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id")
      .single()
    : await adminClient
      .from("tok_one_subscriptions")
      .insert(payload)
      .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id")
      .single();

  if (error) throw error;

  return { updated: true, row: data };
}
