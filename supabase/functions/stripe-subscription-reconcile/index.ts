import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "npm:stripe@22.3.2";

import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  authenticateRequest,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { getStripeRuntimeForCheckoutKindAndMode } from "../_shared/stripe-client.ts";

const FUNCTION_NAME = "stripe-subscription-reconcile";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type SubscriptionRow = {
  id: string;
  restaurant_id: string;
  stripe_subscription_id: string;
  stripe_mode: "live" | "test";
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  scheduled_plan_change: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

function normalizeRestaurantSubscriptionStatus(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "canceled") return "cancelled";
  if (["trialing", "active", "past_due", "paused", "cancelled"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "incomplete" || normalized === "unpaid") return "past_due";
  if (normalized === "incomplete_expired") return "cancelled";
  return "paused";
}

function finiteUnixTimestamp(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveSubscriptionPeriod(subscription: Stripe.Subscription) {
  const starts = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp(
      (item as { current_period_start?: unknown }).current_period_start,
    ))
    .filter((value): value is number => value !== null);
  const ends = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp(
      (item as { current_period_end?: unknown }).current_period_end,
    ))
    .filter((value): value is number => value !== null);

  return {
    currentPeriodStart: starts.length > 0
      ? new Date(Math.min(...starts) * 1000).toISOString()
      : null,
    currentPeriodEnd: ends.length > 0
      ? new Date(Math.max(...ends) * 1000).toISOString()
      : null,
  };
}

function sameTimestamp(left: string | null, right: string | null) {
  if (!left || !right) return left === right;
  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);
  return Number.isFinite(leftTimestamp)
    && Number.isFinite(rightTimestamp)
    && leftTimestamp === rightTimestamp;
}

function stableFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown_error";
  return message
    .split(":", 1)[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "unknown_error";
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  const action = "reconcile_restaurant_subscriptions";
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, {
      allowServiceRole: true,
      allowSchedulerSecret: true,
    });
    if (!actor.isServiceRole) {
      return jsonResponse({ ok: false, error: "forbidden" }, 403, cors);
    }
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, cors);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const limit = Math.min(
      Math.max(Math.floor(Number(body.limit) || DEFAULT_LIMIT), 1),
      MAX_LIMIT,
    );
    const { data, error } = await actor.adminClient
      .from("restaurant_ai_subscriptions")
      .select("id, restaurant_id, stripe_subscription_id, stripe_mode, status, current_period_start, current_period_end, cancel_at_period_end, scheduled_plan_change, metadata")
      .not("stripe_subscription_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`subscription_lookup_failed:${error.message}`);

    const rows = (Array.isArray(data) ? data : []) as SubscriptionRow[];
    let repaired = 0;
    let unchanged = 0;
    let failed = 0;
    const failureCodes = new Set<string>();

    for (const row of rows) {
      try {
        const runtime = getStripeRuntimeForCheckoutKindAndMode(
          "restaurant-subscription",
          row.stripe_mode,
        );
        const subscription = await runtime.stripe.subscriptions.retrieve(
          row.stripe_subscription_id,
        );
        const normalizedStatus = normalizeRestaurantSubscriptionStatus(subscription.status);
        const persistedStatus = row.status === "activation_pending"
            && ["active", "trialing"].includes(normalizedStatus)
          ? "activation_pending"
          : normalizedStatus;
        const period = resolveSubscriptionPeriod(subscription);
        const currentPeriodStart = period.currentPeriodStart || row.current_period_start;
        const currentPeriodEnd = period.currentPeriodEnd || row.current_period_end;
        const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
        const differs = row.status !== persistedStatus
          || !sameTimestamp(row.current_period_start, currentPeriodStart)
          || !sameTimestamp(row.current_period_end, currentPeriodEnd)
          || row.cancel_at_period_end !== cancelAtPeriodEnd;

        if (!differs) {
          unchanged += 1;
          continue;
        }

        const { data: updated, error: updateError } = await actor.adminClient
          .from("restaurant_ai_subscriptions")
          .update({
            status: persistedStatus,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
            scheduled_plan_change: cancelAtPeriodEnd
              ? row.scheduled_plan_change || {}
              : {},
            metadata: {
              ...(row.metadata || {}),
              stripe_subscription_status: subscription.status,
              stripe_subscription_cancel_at_period_end: cancelAtPeriodEnd,
              stripe_reconciled_at: new Date().toISOString(),
              stripe_reconciliation_source: FUNCTION_NAME,
            },
          })
          .eq("id", row.id)
          .eq("stripe_subscription_id", row.stripe_subscription_id)
          .select("id")
          .maybeSingle();
        if (updateError || !updated) {
          throw new Error(`subscription_update_failed:${updateError?.message || "row_not_found"}`);
        }
        repaired += 1;
      } catch (error) {
        failed += 1;
        failureCodes.add(stableFailureCode(error));
        log.warn("subscription reconciliation failed", {
          restaurantId: row.restaurant_id,
          code: stableFailureCode(error),
        });
      }
    }

    const stableFailureCodes = [...failureCodes].sort().slice(0, 10);
    await writeAuditLog({
      adminClient: actor.adminClient,
      actor,
      request: req,
      functionName: FUNCTION_NAME,
      action,
      status: failed > 0 ? "failure" : "success",
      errorMessage: failed > 0
        ? `stripe_subscription_reconcile_failed:${stableFailureCodes.join(",")}`
        : undefined,
      metadata: {
        rid: log.rid,
        checked: rows.length,
        repaired,
        unchanged,
        failed,
        failure_codes: stableFailureCodes,
      },
    });

    const responseStatus = failed > 0 ? 503 : 200;
    return jsonResponse({
      ok: failed === 0,
      checked: rows.length,
      repaired,
      unchanged,
      failed,
      failure_codes: stableFailureCodes,
    }, responseStatus, cors);
  } catch (error) {
    const candidateStatus = Number((error as { status?: unknown })?.status);
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
      ? candidateStatus
      : 500;
    const publicMessage = stableFailureCode(error);
    log.error("subscription reconciliation aborted", { status, error: publicMessage });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        actor,
        request: req,
        functionName: FUNCTION_NAME,
        action,
        status: "failure",
        errorMessage: publicMessage,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }
    return jsonResponse({ ok: false, error: publicMessage }, status, cors);
  }
});
