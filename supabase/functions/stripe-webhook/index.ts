import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";
import { getEnv, writeAuditLog } from "../_shared/auth.ts";
import { makeLogger } from "../_shared/logging.ts";
import { finalizeChefsTableCheckout } from "../_shared/chefs-table.ts";
import { finalizeZeroAttenteCheckout } from "../_shared/zero-attente.ts";
import {
  enqueueNotification,
  triggerNotificationDispatch,
} from "../_shared/notifications.ts";
import {
  allocateAmounts,
  finalizePaidOrderCheckout,
  getStripePaymentMethodDetails,
  markOrderCheckoutSessionState,
} from "../_shared/order-checkout.ts";
import {
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";
import {
  getStripeVerificationRuntime,
  getStripeWebhookSigningSecrets,
  getTokOneStripeRuntime,
} from "../_shared/stripe-client.ts";
import { computeDisabledDashboardFeatures } from "../_shared/pack-entitlements.ts";
import {
  recordCheckoutFinance,
  recordRefundFinance,
} from "../_shared/marketplace-finance.ts";

type JsonRecord = Record<string, unknown>;

type PaymentTransactionRow = {
  order_id: string | null;
  user_id: string | null;
  metadata?: JsonRecord | null;
  amount?: number | null;
};

type LoggerLike = {
  error?: (event: string, data?: Record<string, unknown>) => void;
  info?: (event: string, data?: Record<string, unknown>) => void;
};

type RestaurantTokPurchaseInvoiceItemKind = "launch_pack" | "restaurant_subscription" | "credit_pack";

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function buildPaidTokInvoiceNumber(itemKind: RestaurantTokPurchaseInvoiceItemKind, sessionId: string) {
  const normalizedSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase();
  const kindPrefix: Record<RestaurantTokPurchaseInvoiceItemKind, string> = {
    launch_pack: "PACK",
    restaurant_subscription: "SUB",
    credit_pack: "CREDIT",
  };

  return `TOK-PAID-${kindPrefix[itemKind]}-${normalizedSessionId || "STRIPE"}`;
}

async function claimStripeWebhookEvent(input: {
  adminClient: ReturnType<typeof createClient>;
  event: Stripe.Event;
  log: LoggerLike;
}) {
  const now = new Date().toISOString();
  const { error } = await input.adminClient
    .from("stripe_webhook_events")
    .insert({
      event_id: input.event.id,
      event_type: input.event.type,
      livemode: input.event.livemode,
      processing_status: "processing",
      first_seen_at: now,
      processing_started_at: now,
      last_attempt_at: now,
      attempt_count: 1,
      last_error: null,
      last_error_at: null,
    });

  if (!error) {
    return { claimed: true, duplicate: false, errorMessage: null };
  }

  if (error.code === "23505") {
    const { data: existingEvent, error: lookupError } = await input.adminClient
      .from("stripe_webhook_events")
      .select("processing_status, attempt_count")
      .eq("event_id", input.event.id)
      .maybeSingle();

    if (lookupError) {
      input.log.error?.("stripe_webhook_event_lookup_failed", {
        eventId: input.event.id,
        type: input.event.type,
        code: lookupError.code || null,
        message: lookupError.message,
      });
      return { claimed: false, duplicate: false, errorMessage: lookupError.message };
    }

    if (existingEvent?.processing_status === "failed") {
      const { data: retriedEvent, error: retryError } = await input.adminClient
        .from("stripe_webhook_events")
        .update({
          processing_status: "processing",
          processing_started_at: now,
          last_attempt_at: now,
          attempt_count: Number(existingEvent.attempt_count || 0) + 1,
          last_error: null,
          last_error_at: null,
        })
        .eq("event_id", input.event.id)
        .eq("processing_status", "failed")
        .select("event_id")
        .maybeSingle();

      if (retryError) {
        input.log.error?.("stripe_webhook_event_retry_claim_failed", {
          eventId: input.event.id,
          type: input.event.type,
          code: retryError.code || null,
          message: retryError.message,
        });
        return { claimed: false, duplicate: false, errorMessage: retryError.message };
      }

      if (retriedEvent?.event_id) {
        input.log.info?.("failed_event_retry_claimed", {
          eventId: input.event.id,
          type: input.event.type,
        });
        return { claimed: true, duplicate: false, errorMessage: null };
      }
    }

    input.log.info?.("duplicate_event_skipped", {
      eventId: input.event.id,
      type: input.event.type,
      processingStatus: existingEvent?.processing_status || null,
    });
    return { claimed: false, duplicate: true, errorMessage: null };
  }

  input.log.error?.("stripe_webhook_event_claim_failed", {
    eventId: input.event.id,
    type: input.event.type,
    code: error.code || null,
    message: error.message,
  });
  return { claimed: false, duplicate: false, errorMessage: error.message };
}

async function markStripeWebhookEventSucceeded(input: {
  adminClient: ReturnType<typeof createClient>;
  event: Stripe.Event;
}) {
  const now = new Date().toISOString();
  const { error } = await input.adminClient
    .from("stripe_webhook_events")
    .update({
      processing_status: "succeeded",
      processed_at: now,
      last_attempt_at: now,
      last_error: null,
      last_error_at: null,
    })
    .eq("event_id", input.event.id);

  if (error) throw error;
}

async function markStripeWebhookEventFailed(input: {
  adminClient: ReturnType<typeof createClient>;
  event: Stripe.Event;
  error: unknown;
  log: LoggerLike;
}) {
  const now = new Date().toISOString();
  const errorMessage = input.error instanceof Error ? input.error.message : "Erreur interne";
  const { error } = await input.adminClient
    .from("stripe_webhook_events")
    .update({
      processing_status: "failed",
      last_attempt_at: now,
      last_error: errorMessage,
      last_error_at: now,
    })
    .eq("event_id", input.event.id);

  if (error) {
    input.log.error?.("stripe_webhook_event_failed_mark_failed", {
      eventId: input.event.id,
      type: input.event.type,
      code: error.code || null,
      message: error.message,
    });
  }
}

async function recordRestaurantTokPurchaseInvoiceIfMissing(input: {
  adminClient: ReturnType<typeof createClient>;
  session: Stripe.Checkout.Session;
  restaurantId: string;
  itemKind: RestaurantTokPurchaseInvoiceItemKind;
  sourceTable: string;
  sourceId: string | null;
  sourceLabel: string;
  amount: number;
  paidAt?: string;
  metadata?: JsonRecord;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    session,
    restaurantId,
    itemKind,
    sourceTable,
    sourceId,
    sourceLabel,
    amount,
    paidAt = new Date().toISOString(),
    metadata = {},
    log,
  } = input;
  const paidAmount = toMoney(amount);
  if (!restaurantId || paidAmount <= 0) return null;

  if (sourceId) {
    const { data: existingLine, error: existingLineError } = await adminClient
      .from("restaurant_invoice_line_items")
      .select("invoice_id")
      .eq("restaurant_id", restaurantId)
      .eq("source_table", sourceTable)
      .eq("source_id", sourceId)
      .eq("item_kind", itemKind)
      .limit(1)
      .maybeSingle();

    if (existingLineError) {
      log?.error?.("paid_tok_purchase_invoice_lookup_failed", { message: existingLineError.message });
      throw existingLineError;
    }
    if (existingLine?.invoice_id) return existingLine.invoice_id;
  }

  const invoiceNumber = buildPaidTokInvoiceNumber(itemKind, session.id);
  const { data: existingInvoice, error: existingInvoiceError } = await adminClient
    .from("restaurant_invoices")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("invoice_number", invoiceNumber)
    .limit(1)
    .maybeSingle();

  if (existingInvoiceError) {
    log?.error?.("paid_tok_purchase_invoice_number_lookup_failed", { message: existingInvoiceError.message });
    throw existingInvoiceError;
  }

  let invoiceId = existingInvoice?.id || null;
  const periodDate = toDateOnly(paidAt);

  if (!invoiceId) {
    const { data: invoice, error: invoiceError } = await adminClient
      .from("restaurant_invoices")
      .insert({
        restaurant_id: restaurantId,
        period_start: periodDate,
        period_end: periodDate,
        amount_ht: paidAmount,
        amount_tva: 0,
        amount_ttc: paidAmount,
        status: "paid",
        paid_at: paidAt,
        due_at: paidAt,
        invoice_number: invoiceNumber,
        invoice_type: "payable",
      })
      .select("id")
      .maybeSingle();

    if (invoiceError || !invoice?.id) {
      log?.error?.("paid_tok_purchase_invoice_insert_failed", { message: invoiceError?.message || "missing invoice id" });
      throw invoiceError || new Error("paid_tok_purchase_invoice_missing_id");
    }

    invoiceId = invoice.id;
  }

  const { error: lineError } = await adminClient
    .from("restaurant_invoice_line_items")
    .insert({
      invoice_id: invoiceId,
      restaurant_id: restaurantId,
      item_kind: itemKind,
      source_table: sourceTable,
      source_id: sourceId,
      source_label: sourceLabel,
      occurred_at: paidAt,
      quantity: 1,
      unit_amount: paidAmount,
      base_amount: paidAmount,
      rate_label: "Montant paye",
      rate_value: null,
      amount_ht: paidAmount,
      amount_tva: 0,
      amount_ttc: paidAmount,
      metadata: {
        checkout_kind: session.metadata?.checkout_kind || "",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        currency: (session.currency || "chf").toLowerCase(),
        paid_to: "TOK",
        ...metadata,
      },
    });

  if (lineError && lineError.code !== "23505") {
    log?.error?.("paid_tok_purchase_invoice_line_insert_failed", { message: lineError.message });
    throw lineError;
  }

  return invoiceId;
}

function getCampaignId(metadata: unknown) {
  return isJsonRecord(metadata) && typeof metadata.campaign_id === "string"
    ? metadata.campaign_id
    : null;
}

async function recordTokOnePaymentIfMissing(input: {
  adminClient: ReturnType<typeof createClient>;
  session: Stripe.Checkout.Session;
  userId: string;
  planId: string;
  billingPeriod: string;
  stripeSubscriptionId: string | null;
  stripeMode: "live" | "test";
  eventId: string;
  amountOverride?: number | null;
  checkoutKind?: string;
  metadata?: JsonRecord;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    session,
    userId,
    planId,
    billingPeriod,
    stripeSubscriptionId,
    stripeMode,
    eventId,
    amountOverride = null,
    checkoutKind = "tok-one",
    metadata = {},
    log,
  } = input;

  const amount = amountOverride !== null && Number.isFinite(amountOverride)
    ? Number(amountOverride)
    : (session.amount_total || 0) / 100;
  if (amount <= 0) return;

  const { data: existingTransaction, error: existingTransactionError } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .eq("type", "subscription")
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (existingTransactionError) {
    log?.error?.("tok_one_payment_check_failed", { message: existingTransactionError.message });
    return;
  }

  if (existingTransaction?.id) return;

  await adminClient
    .from("payment_transactions")
    .insert({
      order_id: null,
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amount,
      currency: (session.currency || "chf").toLowerCase(),
      type: "subscription",
      status: "succeeded",
      metadata: {
        checkout_kind: checkoutKind,
        plan_id: planId,
        billing_period: billingPeriod,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_mode: stripeMode,
        stripe_event_id: eventId,
        ...metadata,
      },
    });
}

function isZeroAttenteCheckoutKind(checkoutKind: string | null | undefined) {
  return checkoutKind === "zero-attente" || checkoutKind === "reservation_zero_attente";
}

function finiteUnixTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toIsoFromUnix(timestamp: number | null | undefined, fallback: Date) {
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000).toISOString()
    : fallback.toISOString();
}

function resolveRestaurantSubscriptionPeriod(subscription: Stripe.Subscription | null) {
  const fallbackDate = new Date();
  if (!subscription) {
    const periodEnd = new Date(fallbackDate);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    return {
      currentPeriodStart: fallbackDate.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    };
  }

  const itemPeriodStarts = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_start?: unknown }).current_period_start))
    .filter((value): value is number => value !== null);
  const itemPeriodEnds = (subscription.items?.data || [])
    .map((item) => finiteUnixTimestamp((item as { current_period_end?: unknown }).current_period_end))
    .filter((value): value is number => value !== null);
  const currentPeriodStart =
    finiteUnixTimestamp((subscription as { current_period_start?: unknown }).current_period_start) ||
    (itemPeriodStarts.length > 0 ? Math.min(...itemPeriodStarts) : null) ||
    finiteUnixTimestamp(subscription.start_date);
  const currentPeriodEnd =
    finiteUnixTimestamp((subscription as { current_period_end?: unknown }).current_period_end) ||
    (itemPeriodEnds.length > 0 ? Math.max(...itemPeriodEnds) : null);

  if (currentPeriodStart && currentPeriodEnd && currentPeriodEnd > currentPeriodStart) {
    return {
      currentPeriodStart: toIsoFromUnix(currentPeriodStart, fallbackDate),
      currentPeriodEnd: toIsoFromUnix(currentPeriodEnd, fallbackDate),
    };
  }

  const fallbackEnd = new Date(fallbackDate);
  fallbackEnd.setMonth(fallbackEnd.getMonth() + 1);
  return {
    currentPeriodStart: toIsoFromUnix(currentPeriodStart, fallbackDate),
    currentPeriodEnd: fallbackEnd.toISOString(),
  };
}

function normalizeRestaurantSubscriptionStatus(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "canceled") return "cancelled";
  if (["trialing", "active", "past_due", "paused", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "active";
}

function getStripeSubscriptionScheduleId(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (isJsonRecord(value) && typeof value.id === "string") return value.id;
  return null;
}

function buildRestaurantScheduledPlanChange(
  metadata: JsonRecord,
  currentPeriodEnd: string,
  stripeSubscriptionScheduleId: string | null,
) {
  const pendingChange = String(metadata.pending_restaurant_subscription_change || "");
  if (pendingChange === "cancel_at_period_end") {
    return {
      action: "cancel",
      effective_at: String(metadata.pending_restaurant_subscription_effective_at || currentPeriodEnd),
      requested_at: String(metadata.pending_restaurant_subscription_requested_at || ""),
      requested_by: String(metadata.pending_restaurant_subscription_requested_by || ""),
    };
  }

  if (pendingChange === "downgrade_at_period_end") {
    return {
      action: "downgrade",
      target_plan_id: String(metadata.pending_restaurant_subscription_plan_id || ""),
      target_plan_slug: String(metadata.pending_restaurant_subscription_plan_slug || ""),
      target_plan_name: String(metadata.pending_restaurant_subscription_plan_name || ""),
      effective_at: String(metadata.pending_restaurant_subscription_effective_at || currentPeriodEnd),
      requested_at: String(metadata.pending_restaurant_subscription_requested_at || ""),
      requested_by: String(metadata.pending_restaurant_subscription_requested_by || ""),
      stripe_subscription_schedule_id: String(metadata.pending_restaurant_subscription_schedule_id || stripeSubscriptionScheduleId || ""),
    };
  }

  return {};
}

async function syncRestaurantSubscriptionRecord(input: {
  adminClient: ReturnType<typeof createClient>;
  subscription: Stripe.Subscription;
  stripeMode: "live" | "test";
  stripeCheckoutSessionId?: string | null;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    subscription,
    stripeMode,
    stripeCheckoutSessionId = null,
    log,
  } = input;
  const metadata = subscription.metadata || {};
  const checkoutKind = String(metadata.checkout_kind || "");

  let restaurantId = String(metadata.restaurant_id || "");
  let planId = String(metadata.restaurant_subscription_plan_id || metadata.plan_id || "");
  let planSlug = String(metadata.restaurant_subscription_plan_slug || metadata.plan_slug || "");

  const { data: existing, error: existingError } = await adminClient
    .from("restaurant_ai_subscriptions")
    .select("id, restaurant_id, restaurant_subscription_plan_id, plan, metadata")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (existingError) {
    log?.error?.("restaurant_subscription_lookup_failed", { message: existingError.message });
    return { updated: false, row: null };
  }

  restaurantId = restaurantId || String(existing?.restaurant_id || "");
  planId = planId || String(existing?.restaurant_subscription_plan_id || "");
  planSlug = planSlug || String(existing?.plan || "");

  if (!restaurantId || (!planId && !planSlug)) {
    return { updated: false, row: null };
  }

  const planQuery = adminClient
    .from("restaurant_subscription_plans")
    .select("id, slug, name, price_monthly_chf, campaign_credit_chf, ai_tool_credits, ai_photo_credits, monthly_conversation_limit, monthly_text_tool_limit, monthly_image_limit, monthly_premium_image_limit, monthly_voice_minutes_limit")
    .limit(1);
  const { data: plans, error: planError } = planId
    ? await planQuery.eq("id", planId)
    : await planQuery.eq("slug", planSlug);

  if (planError) {
    log?.error?.("restaurant_subscription_plan_lookup_failed", { message: planError.message });
    return { updated: false, row: null };
  }

  const plan = Array.isArray(plans) ? plans[0] : null;
  if (!plan) {
    return { updated: false, row: null };
  }

  const period = resolveRestaurantSubscriptionPeriod(subscription);
  const stripeSubscriptionScheduleId = getStripeSubscriptionScheduleId(subscription.schedule);
  const payload = {
    restaurant_id: restaurantId,
    restaurant_subscription_plan_id: plan.id,
    plan: plan.slug,
    status: normalizeRestaurantSubscriptionStatus(subscription.status),
    monthly_conversation_limit: Number(plan.monthly_conversation_limit || 0),
    monthly_text_tool_limit: Number(plan.monthly_text_tool_limit || 0),
    monthly_image_limit: Number(plan.monthly_image_limit || 0),
    monthly_premium_image_limit: Number(plan.monthly_premium_image_limit || 0),
    monthly_voice_minutes_limit: Number(plan.monthly_voice_minutes_limit || 0),
    monthly_campaign_credit_chf: Number(plan.campaign_credit_chf || 0),
    monthly_ai_tool_credits: Number(plan.ai_tool_credits || 0),
    monthly_photo_retouch_credits: Number(plan.ai_photo_credits || 0),
    current_period_start: period.currentPeriodStart,
    current_period_end: period.currentPeriodEnd,
    started_at: period.currentPeriodStart,
    billing_period: "monthly",
    stripe_subscription_id: subscription.id,
    stripe_checkout_session_id: stripeCheckoutSessionId || String(metadata.stripe_checkout_session_id || ""),
    stripe_mode: stripeMode,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_subscription_schedule_id: stripeSubscriptionScheduleId,
    scheduled_plan_change: buildRestaurantScheduledPlanChange(metadata, period.currentPeriodEnd, stripeSubscriptionScheduleId),
    metadata: {
      ...(isJsonRecord(existing?.metadata) ? existing.metadata : {}),
      ...metadata,
      checkout_kind: checkoutKind || "restaurant-subscription-sync",
      restaurant_subscription_plan_id: plan.id,
      restaurant_subscription_plan_slug: plan.slug,
      stripe_subscription_id: subscription.id,
      stripe_checkout_session_id: stripeCheckoutSessionId || String(metadata.stripe_checkout_session_id || ""),
      stripe_subscription_status: subscription.status,
      stripe_subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      stripe_subscription_schedule_id: stripeSubscriptionScheduleId || "",
    },
  };

  const { data: row, error: upsertError } = await adminClient
    .from("restaurant_ai_subscriptions")
    .upsert(payload, { onConflict: "restaurant_id" })
    .select("id, restaurant_id, plan, status")
    .maybeSingle();

  if (upsertError) {
    log?.error?.("restaurant_subscription_sync_failed", { message: upsertError.message });
    return { updated: false, row: null };
  }

  return { updated: true, row };
}

Deno.serve(async (req) => {
  const log = makeLogger("stripe-webhook");

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let stripeRuntime: ReturnType<typeof getStripeVerificationRuntime>;
  try {
    stripeRuntime = getStripeVerificationRuntime();
  } catch {
    return new Response("Stripe verification secret not configured", { status: 503 });
  }
  const stripe = stripeRuntime.stripe;

  const supabaseAdmin = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecrets = getStripeWebhookSigningSecrets();

  if (webhookSecrets.length === 0) {
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: "STRIPE_WEBHOOK_SECRET not configured",
    });
    return new Response("STRIPE_WEBHOOK_SECRET not configured", { status: 503 });
  }

  if (!signature) {
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: "Missing stripe-signature header",
    });
    return new Response("Missing stripe signature", { status: 400 });
  }

  let event: Stripe.Event;
  let signatureError: unknown = null;
  try {
    let verifiedEvent: Stripe.Event | null = null;

    for (const webhookSecret of webhookSecrets) {
      try {
        verifiedEvent = await stripe.webhooks.constructEventAsync(
          body,
          signature,
          webhookSecret,
        );
        break;
      } catch (error) {
        signatureError = error;
      }
    }

    if (!verifiedEvent) {
      throw signatureError ?? new Error("Invalid webhook signature");
    }

    event = verifiedEvent;
  } catch (error) {
    log.warn("signature_verification_failed", { message: error instanceof Error ? error.message : "unknown" });
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: error instanceof Error ? error.message : "Invalid webhook signature",
    });
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // Idempotency: acquire the event atomically before any side effect.
  const eventClaim = await claimStripeWebhookEvent({ adminClient: supabaseAdmin, event, log });

  if (eventClaim.duplicate) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!eventClaim.claimed) {
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "claim_webhook_event",
      status: "failure",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      errorMessage: eventClaim.errorMessage || "Failed to claim Stripe webhook event",
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });
    return new Response("Could not record Stripe webhook event", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutKind = String(session.metadata?.checkout_kind || "order");
        const userId = session.metadata?.user_id || null;
        const campaignId = session.metadata?.campaign_id || null;

        if (session.mode === "payment" && session.payment_status !== "paid") {
          log.info("checkout_waiting_for_async_payment", {
            sessionId: session.id,
            checkoutKind,
            paymentStatus: session.payment_status,
          });
          break;
        }

        if (checkoutKind === "campaign" && campaignId) {
          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);
          const { data: campaign } = await supabaseAdmin
            .from("ad_campaigns")
            .select("id, restaurant_id, title")
            .eq("id", campaignId)
            .maybeSingle();

          if (campaign) {
            await supabaseAdmin
              .from("ad_campaigns")
              .update({
                status: "active",
                payment_status: "paid",
                payment_method: session.metadata?.payment_method_label || null,
                paid_amount: (session.amount_total || 0) / 100,
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
                paid_at: new Date().toISOString(),
                activated_at: new Date().toISOString(),
              })
              .eq("id", campaign.id);

            await supabaseAdmin.from("payment_transactions").insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              amount: (session.amount_total || 0) / 100,
              currency: (session.currency || "chf").toLowerCase(),
              type: "charge",
              status: "succeeded",
              metadata: {
                campaign_id: campaign.id,
                campaign_title: campaign.title,
                restaurant_id: campaign.restaurant_id,
                checkout_kind: "campaign",
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
            });

            const paidAmount = ((session.amount_total || 0) / 100).toFixed(2);
            const paymentMethodLabel = session.metadata?.payment_method_label || "carte";

            const { data: campaignRestaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", campaign.restaurant_id)
              .maybeSingle();

            if (campaignRestaurant?.owner_id) {
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: campaignRestaurant.owner_id,
                title: "Paiement de campagne confirme",
                body: `Votre campagne "${campaign.title}" a ete payee avec succes (${paidAmount} CHF via ${paymentMethodLabel}). Elle est maintenant active.`,
                type: "campaign",
                category: "transactional",
                data: {
                  campaign_id: campaign.id,
                  restaurant_id: campaign.restaurant_id,
                  restaurant_name: campaignRestaurant.name,
                  paid_amount: paidAmount,
                  payment_method: paymentMethodLabel,
                  url: "/dashboard/campagnes",
                },
              });
            }

            try {
              await triggerNotificationDispatch({ source: "stripe-webhook-campaign-paid", push: true, email: true });
            } catch (error) {
              log.error("campaign_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
            }
          }
          break;
        }

        if (checkoutKind === "restaurant-credit-pack") {
          const restaurantId = session.metadata?.restaurant_id || null;
          const creditPackId = session.metadata?.restaurant_credit_pack_id || session.metadata?.credit_pack_id || null;
          const creditPackPurchaseId = session.metadata?.restaurant_credit_purchase_id || session.metadata?.credit_pack_purchase_id || null;
          const campaignCreditChf = Number(session.metadata?.campaign_credit_chf || 0);
          const aiToolCredits = Number(session.metadata?.ai_tool_credits || 0);
          const aiPhotoCredits = Number(session.metadata?.ai_photo_credits || 0);

          if (!userId || !restaurantId || !creditPackId || !creditPackPurchaseId) {
            log.warn("restaurant_credit_pack_missing_metadata", { sessionId: session.id });
            break;
          }

          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);
          const paidAt = new Date().toISOString();

          const { error: creditPackUpdateError } = await supabaseAdmin
            .from("restaurant_credit_purchases")
            .update({
              status: "paid",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              stripe_mode: event.livemode ? "live" : "test",
              paid_at: paidAt,
              metadata: {
                checkout_kind: "restaurant-credit-pack",
                restaurant_id: restaurantId,
                credit_pack_id: creditPackId,
                campaign_credit_chf: campaignCreditChf,
                ai_tool_credits: aiToolCredits,
                ai_photo_credits: aiPhotoCredits,
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
            })
            .eq("id", creditPackPurchaseId);

          if (creditPackUpdateError) {
            throw new Error(`restaurant_credit_pack_update_failed: ${creditPackUpdateError.message}`);
          }

          await supabaseAdmin.from("payment_transactions").insert({
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: (session.amount_total || 0) / 100,
            currency: (session.currency || "chf").toLowerCase(),
            type: "charge",
            status: "succeeded",
            metadata: {
              checkout_kind: "restaurant-credit-pack",
              restaurant_id: restaurantId,
              credit_pack_id: creditPackId,
              restaurant_credit_purchase_id: creditPackPurchaseId,
              campaign_credit_chf: campaignCreditChf,
              ai_tool_credits: aiToolCredits,
              ai_photo_credits: aiPhotoCredits,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
          });

          await recordRestaurantTokPurchaseInvoiceIfMissing({
            adminClient: supabaseAdmin,
            session,
            restaurantId,
            itemKind: "credit_pack",
            sourceTable: "restaurant_credit_purchases",
            sourceId: creditPackPurchaseId,
            sourceLabel: "Pack de credits TOK",
            amount: (session.amount_total || 0) / 100,
            paidAt,
            metadata: {
              credit_pack_id: creditPackId,
              restaurant_credit_purchase_id: creditPackPurchaseId,
              campaign_credit_chf: campaignCreditChf,
              ai_tool_credits: aiToolCredits,
              ai_photo_credits: aiPhotoCredits,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
            log,
          });

          try {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Pack de credits active",
                body: "Votre pack de credits TOK a ete ajoute a votre solde de facturation.",
                type: "payment",
                category: "transactional",
                data: {
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  credit_pack_id: creditPackId,
                  restaurant_credit_purchase_id: creditPackPurchaseId,
                  url: "/dashboard/mon-compte-facturation",
                },
              });
              await triggerNotificationDispatch({ source: "stripe-webhook-restaurant-credit-pack", push: true, email: true });
            }
          } catch (error) {
            log.error("restaurant_credit_pack_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          break;
        }

        if (checkoutKind === "tok-one") {
          const userId = session.metadata?.user_id || null;
          const planId = session.metadata?.plan_id || null;
          const billingPeriod = session.metadata?.billing_period || "monthly";
          const tokOneStripeRuntime = getTokOneStripeRuntime(event.livemode ? "live" : "test");

          if (!userId || !planId) {
            log.warn("tok_one_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await tokOneStripeRuntime.stripe.subscriptions.retrieve(session.subscription);
            await syncTokOneSubscriptionRecord({
              adminClient: supabaseAdmin,
              subscription: stripeSubscription,
              fallbackUserId: userId,
              fallbackPlanId: planId,
              stripeMode: tokOneStripeRuntime.mode,
              stripeCheckoutSessionId: session.id,
            });
          } else {
            log.warn("tok_one_no_subscription", { sessionId: session.id });
          }

          await recordTokOnePaymentIfMissing({
            adminClient: supabaseAdmin,
            session,
            userId,
            planId,
            billingPeriod,
            stripeSubscriptionId: stripeSubscription?.id || null,
            stripeMode: tokOneStripeRuntime.mode,
            eventId: event.id,
            log,
          });

          // Notify user
          try {
            const isTrialing = stripeSubscription?.status === "trialing";
            await enqueueNotification({
              adminClient: supabaseAdmin,
              userId,
              title: "Bienvenue dans Tok One !",
              body: isTrialing
                ? `Votre essai gratuit Tok One (${billingPeriod === "yearly" ? "annuel" : "mensuel"}) est actif. Vous profitez deja de vos avantages premium jusqu'a la fin de la periode d'essai.`
                : `Votre abonnement Tok One (${billingPeriod === "yearly" ? "annuel" : "mensuel"}) est maintenant actif. Profitez de la livraison gratuite et de tous vos avantages premium.`,
              type: "subscription",
              category: "transactional",
              data: {
                plan_id: planId,
                billing_period: billingPeriod,
                stripe_subscription_id: stripeSubscription?.id || null,
                stripe_mode: tokOneStripeRuntime.mode,
              },
            });
            await triggerNotificationDispatch({ source: "stripe-webhook-tok-one", push: true, email: true });
          } catch (error) {
            log.error("tok_one_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          break;
        }

        if (checkoutKind === "restaurant-onboarding") {
          const restaurantLaunchPackId = session.metadata?.restaurant_launch_pack_id || null;
          const packId = session.metadata?.pack_id || null;
          const planId = session.metadata?.plan_id || null;
          const planSlug = session.metadata?.restaurant_subscription_plan_slug || null;
          const billingPeriod = "monthly";
          const restaurantId = session.metadata?.restaurant_id || null;
          const signupApplicationId = session.metadata?.signup_application_id || null;
          const packAmount = Number(session.metadata?.launch_pack_amount || 0);
          const subscriptionAmount = Number(session.metadata?.subscription_amount || 0);
          const campaignCreditChf = Number(session.metadata?.campaign_credit_chf || 0);
          const aiToolCredits = Number(session.metadata?.ai_tool_credits || 0);
          const aiPhotoCredits = Number(session.metadata?.ai_photo_credits || 0);

          if (!userId || !planId || !planSlug || !restaurantId) {
            log.warn("restaurant_onboarding_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
          } else {
            log.warn("restaurant_onboarding_no_subscription", { sessionId: session.id });
          }

          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);
          const period = resolveRestaurantSubscriptionPeriod(stripeSubscription);
          const paidAt = new Date().toISOString();

          if (restaurantLaunchPackId) {
            await supabaseAdmin
              .from("restaurant_launch_packs")
              .update({
                status: "paid",
                stripe_checkout_session_id: session.id,
                stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
                paid_at: paidAt,
                metadata: {
                  checkout_kind: "restaurant-onboarding",
                  signup_application_id: signupApplicationId,
                  plan_id: planId,
                  restaurant_subscription_plan_id: planId,
                  restaurant_subscription_plan_slug: planSlug,
                  billing_period: billingPeriod,
                  stripe_subscription_id: stripeSubscription?.id || null,
                },
              })
              .eq("id", restaurantLaunchPackId);
          }

          const { data: restaurantSubscriptionRow, error: restaurantSubscriptionError } = await supabaseAdmin
            .from("restaurant_ai_subscriptions")
            .upsert({
              restaurant_id: restaurantId,
              restaurant_subscription_plan_id: planId,
              plan: planSlug,
              status: normalizeRestaurantSubscriptionStatus(stripeSubscription?.status || "active"),
              monthly_conversation_limit: Number(session.metadata?.monthly_conversation_limit || 0),
              monthly_text_tool_limit: Number(session.metadata?.monthly_text_tool_limit || 0),
              monthly_image_limit: Number(session.metadata?.monthly_image_limit || 0),
              monthly_premium_image_limit: Number(session.metadata?.monthly_premium_image_limit || 0),
              monthly_voice_minutes_limit: Number(session.metadata?.monthly_voice_minutes_limit || 0),
              monthly_campaign_credit_chf: campaignCreditChf,
              monthly_ai_tool_credits: aiToolCredits,
              monthly_photo_retouch_credits: aiPhotoCredits,
              current_period_start: period.currentPeriodStart,
              current_period_end: period.currentPeriodEnd,
              started_at: period.currentPeriodStart,
              billing_period: "monthly",
              stripe_subscription_id: stripeSubscription?.id || null,
              stripe_checkout_session_id: session.id,
              stripe_mode: event.livemode ? "live" : "test",
              metadata: {
                checkout_kind: "restaurant-onboarding",
                signup_application_id: signupApplicationId,
                restaurant_launch_pack_id: restaurantLaunchPackId,
                pack_id: packId,
                plan_id: planId,
                plan_slug: planSlug,
                campaign_credit_chf: campaignCreditChf,
                ai_tool_credits: aiToolCredits,
                ai_photo_credits: aiPhotoCredits,
              },
            }, { onConflict: "restaurant_id" })
            .select("id")
            .maybeSingle();

          if (restaurantSubscriptionError) {
            log.error("restaurant_onboarding_subscription_upsert_failed", { message: restaurantSubscriptionError.message });
          }

          const { data: pack } = restaurantLaunchPackId && packId
            ? await supabaseAdmin
              .from("launch_packs")
              .select("name, services")
              .eq("id", packId)
              .maybeSingle()
            : { data: null };

          if (restaurantLaunchPackId && pack?.services && Array.isArray(pack.services)) {
            const fulfillments = (pack.services as Array<{ service: string; label: string }>).map((svc) => ({
              restaurant_pack_id: restaurantLaunchPackId,
              service_slug: svc.service,
              service_label: svc.label,
              status: "pending",
            }));

            if (fulfillments.length > 0) {
              await supabaseAdmin
                .from("launch_pack_service_fulfillments")
                .upsert(fulfillments, { onConflict: "restaurant_pack_id,service_slug" });
            }

            const disabledFeatures = computeDisabledDashboardFeatures(
              pack.services as Array<{ service?: string | null }>,
            );

            await supabaseAdmin
              .from("restaurants")
              .update({ disabled_dashboard_features: disabledFeatures })
              .eq("id", restaurantId);
          }

          if (restaurantLaunchPackId && packId && packAmount > 0) {
            await supabaseAdmin.from("payment_transactions").insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              amount: packAmount,
              currency: (session.currency || "chf").toLowerCase(),
              type: "charge",
              status: "succeeded",
              metadata: {
                checkout_kind: "restaurant-onboarding",
                charge_component: "launch-pack",
                pack_id: packId,
                restaurant_launch_pack_id: restaurantLaunchPackId,
                restaurant_id: restaurantId,
                plan_id: planId,
                restaurant_subscription_plan_id: planId,
                restaurant_subscription_plan_slug: planSlug,
                billing_period: billingPeriod,
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
            });
          }

          await recordTokOnePaymentIfMissing({
            adminClient: supabaseAdmin,
            session,
            userId,
            planId,
            billingPeriod,
            stripeSubscriptionId: stripeSubscription?.id || null,
            stripeMode: event.livemode ? "live" : "test",
            eventId: event.id,
            amountOverride: subscriptionAmount,
            checkoutKind: "restaurant-onboarding",
            metadata: {
              charge_component: "subscription",
              restaurant_id: restaurantId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
            },
            log,
          });

          if (restaurantLaunchPackId && packId && packAmount > 0) {
          await recordRestaurantTokPurchaseInvoiceIfMissing({
            adminClient: supabaseAdmin,
            session,
            restaurantId,
            itemKind: "launch_pack",
            sourceTable: "restaurant_launch_packs",
            sourceId: restaurantLaunchPackId,
            sourceLabel: "Pack de lancement TOK",
            amount: packAmount > 0 ? packAmount : (session.amount_total || 0) / 100,
            paidAt,
            metadata: {
              checkout_kind: "restaurant-onboarding",
              plan_id: planId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              billing_period: billingPeriod,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
            log,
          });
          }

          await recordRestaurantTokPurchaseInvoiceIfMissing({
            adminClient: supabaseAdmin,
            session,
            restaurantId,
            itemKind: "restaurant_subscription",
            sourceTable: "restaurant_ai_subscriptions",
            sourceId: restaurantSubscriptionRow?.id || null,
            sourceLabel: `Abonnement restaurateur TOK - ${planSlug}`,
            amount: subscriptionAmount,
            paidAt,
            metadata: {
              checkout_kind: "restaurant-onboarding",
              charge_component: "subscription",
              plan_id: planId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              billing_period: billingPeriod,
              stripe_subscription_id: stripeSubscription?.id || null,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
            log,
          });

          if (signupApplicationId) {
            const { data: application } = await supabaseAdmin
              .from("signup_applications")
              .select("metadata")
              .eq("id", signupApplicationId)
              .maybeSingle();
            const metadata = isJsonRecord(application?.metadata) ? application.metadata : {};

            await supabaseAdmin
              .from("signup_applications")
              .update({
                metadata: {
                  ...metadata,
                  onboarding_payment_status: "paid",
                  onboarding_checkout_session_id: session.id,
                  onboarding_paid_at: paidAt,
                  restaurant_subscription_plan_id: planId,
                  restaurant_subscription_plan_slug: planSlug,
                  stripe_subscription_id: stripeSubscription?.id || null,
                },
              })
              .eq("id", signupApplicationId);
          }

          try {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              const paidAmount = ((session.amount_total || 0) / 100).toFixed(2);
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Onboarding restaurateur paye",
                body: `Votre abonnement TOK a ete paye avec succes (${paidAmount} CHF). L'administration peut finaliser la validation de votre compte.`,
                type: "payment",
                category: "transactional",
                data: {
                  signup_application_id: signupApplicationId,
                  plan_id: planId,
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  paid_amount: paidAmount,
                  url: "/dashboard",
                },
              });
              await triggerNotificationDispatch({ source: "stripe-webhook-restaurant-onboarding", push: true, email: true });
            }
          } catch (error) {
            log.error("restaurant_onboarding_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          break;
        }

        if (checkoutKind === "restaurant-subscription-upgrade") {
          const planId = session.metadata?.plan_id || session.metadata?.restaurant_subscription_plan_id || null;
          const planSlug = session.metadata?.restaurant_subscription_plan_slug || null;
          const restaurantId = session.metadata?.restaurant_id || null;
          const previousStripeSubscriptionId = session.metadata?.previous_stripe_subscription_id || null;
          const subscriptionAmount = Number(session.metadata?.subscription_amount || 0);

          if (!userId || !planId || !planSlug || !restaurantId) {
            log.warn("restaurant_subscription_upgrade_missing_metadata", { sessionId: session.id });
            break;
          }

          let stripeSubscription: Stripe.Subscription | null = null;
          if (typeof session.subscription === "string") {
            stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
          } else {
            log.warn("restaurant_subscription_upgrade_no_subscription", { sessionId: session.id });
            break;
          }

          const syncResult = await syncRestaurantSubscriptionRecord({
            adminClient: supabaseAdmin,
            subscription: stripeSubscription,
            stripeMode: event.livemode ? "live" : "test",
            stripeCheckoutSessionId: session.id,
            log,
          });

          if (!syncResult.updated) {
            log.warn("restaurant_subscription_upgrade_sync_skipped", { sessionId: session.id });
            break;
          }

          await recordTokOnePaymentIfMissing({
            adminClient: supabaseAdmin,
            session,
            userId,
            planId,
            billingPeriod: "monthly",
            stripeSubscriptionId: stripeSubscription.id,
            stripeMode: event.livemode ? "live" : "test",
            eventId: event.id,
            amountOverride: subscriptionAmount,
            checkoutKind: "restaurant-subscription-upgrade",
            metadata: {
              charge_component: "restaurant_subscription_upgrade",
              restaurant_id: restaurantId,
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              previous_stripe_subscription_id: previousStripeSubscriptionId,
            },
            log,
          });

          await recordRestaurantTokPurchaseInvoiceIfMissing({
            adminClient: supabaseAdmin,
            session,
            restaurantId,
            itemKind: "restaurant_subscription",
            sourceTable: "restaurant_ai_subscriptions",
            sourceId: syncResult.row?.id || null,
            sourceLabel: `Abonnement restaurateur TOK - ${planSlug}`,
            amount: subscriptionAmount,
            metadata: {
              charge_component: "restaurant_subscription_upgrade",
              restaurant_subscription_plan_id: planId,
              restaurant_subscription_plan_slug: planSlug,
              previous_stripe_subscription_id: previousStripeSubscriptionId,
              stripe_subscription_id: stripeSubscription.id,
            },
            log,
          });

          if (previousStripeSubscriptionId && previousStripeSubscriptionId !== stripeSubscription.id) {
            try {
              await stripe.subscriptions.cancel(previousStripeSubscriptionId, {
                invoice_now: false,
                prorate: false,
              });
            } catch (error) {
              log.error("restaurant_subscription_previous_cancel_failed", {
                previousStripeSubscriptionId,
                message: error instanceof Error ? error.message : "unknown",
              });
            }
          }

          try {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Abonnement restaurateur upgrade",
                body: `Votre abonnement TOK est passe sur l'offre ${planSlug}. Vos nouveaux credits sont en cours d'activation.`,
                type: "subscription",
                category: "transactional",
                data: {
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  plan_id: planId,
                  plan_slug: planSlug,
                  stripe_subscription_id: stripeSubscription.id,
                  url: "/dashboard/mon-compte-facturation",
                },
              });
              await triggerNotificationDispatch({ source: "stripe-webhook-restaurant-subscription-upgrade", push: true, email: true });
            }
          } catch (error) {
            log.error("restaurant_subscription_upgrade_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }

          log.info("restaurant_subscription_upgrade_completed", {
            restaurantId,
            planSlug,
            subscriptionId: stripeSubscription.id,
          });

          break;
        }

        if (checkoutKind === "launch-pack") {
          const restaurantLaunchPackId = session.metadata?.restaurant_launch_pack_id || null;
          const packId = session.metadata?.pack_id || null;

          if (!restaurantLaunchPackId || !packId) {
            log.warn("launch_pack_missing_metadata", { sessionId: session.id });
            break;
          }

          const { cardBrand, cardLast4 } = await getStripePaymentMethodDetails(stripe, session, log);

          // Update purchase record to paid
          await supabaseAdmin
            .from("restaurant_launch_packs")
            .update({
              status: "paid",
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              paid_at: new Date().toISOString(),
            })
            .eq("id", restaurantLaunchPackId);

          // Fetch pack services to create fulfillment records
          const { data: pack } = await supabaseAdmin
            .from("launch_packs")
            .select("services")
            .eq("id", packId)
            .maybeSingle();

          if (pack?.services && Array.isArray(pack.services)) {
            const fulfillments = (pack.services as Array<{ service: string; label: string }>).map((svc) => ({
              restaurant_pack_id: restaurantLaunchPackId,
              service_slug: svc.service,
              service_label: svc.label,
              status: "pending",
            }));

            if (fulfillments.length > 0) {
              await supabaseAdmin
                .from("launch_pack_service_fulfillments")
                .insert(fulfillments);
            }

            // Auto-configure dashboard feature gating based on pack services
            const disabledFeatures = computeDisabledDashboardFeatures(
              pack.services as Array<{ service?: string | null }>,
            );

            const restaurantId = session.metadata?.restaurant_id || null;
            if (restaurantId) {
              await supabaseAdmin
                .from("restaurants")
                .update({ disabled_dashboard_features: disabledFeatures })
                .eq("id", restaurantId);
            }
          }

          // Record payment transaction
          await supabaseAdmin.from("payment_transactions").insert({
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            amount: (session.amount_total || 0) / 100,
            currency: (session.currency || "chf").toLowerCase(),
            type: "charge",
            status: "succeeded",
            metadata: {
              checkout_kind: "launch-pack",
              restaurant_id: session.metadata?.restaurant_id || null,
              card_brand: cardBrand,
              card_last4: cardLast4,
            },
          });

          // Notify restaurant owner
          const restaurantId = session.metadata?.restaurant_id || null;
          if (restaurantId) {
            await recordRestaurantTokPurchaseInvoiceIfMissing({
              adminClient: supabaseAdmin,
              session,
              restaurantId,
              itemKind: "launch_pack",
              sourceTable: "restaurant_launch_packs",
              sourceId: restaurantLaunchPackId,
              sourceLabel: "Pack de lancement TOK",
              amount: (session.amount_total || 0) / 100,
              metadata: {
                checkout_kind: "launch-pack",
                pack_id: packId,
                restaurant_launch_pack_id: restaurantLaunchPackId,
                card_brand: cardBrand,
                card_last4: cardLast4,
              },
              log,
            });
          }

          if (restaurantId) {
            const { data: restaurant } = await supabaseAdmin
              .from("restaurants")
              .select("owner_id, name")
              .eq("id", restaurantId)
              .maybeSingle();

            const { data: packInfo } = await supabaseAdmin
              .from("launch_packs")
              .select("name")
              .eq("id", packId)
              .maybeSingle();

            if (restaurant?.owner_id) {
              const paidAmount = ((session.amount_total || 0) / 100).toFixed(2);
              await enqueueNotification({
                adminClient: supabaseAdmin,
                userId: restaurant.owner_id,
                title: "Pack de lancement active",
                body: `Votre ${packInfo?.name || "pack"} a ete paye avec succes (${paidAmount} CHF). Notre equipe va vous contacter sous 48h pour planifier les services.`,
                type: "payment",
                category: "transactional",
                data: {
                  restaurant_id: restaurantId,
                  restaurant_name: restaurant.name,
                  paid_amount: paidAmount,
                  url: "/dashboard/pack",
                },
              });

              try {
                await triggerNotificationDispatch({ source: "stripe-webhook-launch-pack", push: true, email: true });
              } catch (error) {
                log.error("launch_pack_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
              }
            }
          }
          break;
        }

        if (isZeroAttenteCheckoutKind(checkoutKind)) {
          if (!userId) {
            log.warn("zero_attente_missing_user", { sessionId: session.id });
            break;
          }

          const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
          await finalizeZeroAttenteCheckout({
            adminClient: supabaseAdmin,
            session,
            userId,
            cardBrand: paymentDetails.cardBrand,
            cardLast4: paymentDetails.cardLast4,
            billingPhone: paymentDetails.billingPhone,
            log,
            shouldDispatchNotifications: true,
            fetchLineItems: () => stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
              expand: ["data.price.product"],
            }),
          });
          break;
        }
        if (checkoutKind === "chefs-table") {
          if (!userId) {
            log.warn("chefs_table_missing_user", { sessionId: session.id });
            break;
          }

          const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
          await finalizeChefsTableCheckout({
            adminClient: supabaseAdmin,
            session,
            userId,
            cardBrand: paymentDetails.cardBrand,
            cardLast4: paymentDetails.cardLast4,
            log,
            shouldDispatchNotifications: true,
            fetchLineItems: () => stripe.checkout.sessions.listLineItems(session.id, {
              limit: 100,
              expand: ["data.price.product"],
            }),
          });
          break;
        }

        const paymentDetails = await getStripePaymentMethodDetails(stripe, session, log);
        const finalizedOrders = await finalizePaidOrderCheckout({
          adminClient: supabaseAdmin,
          session,
          cardBrand: paymentDetails.cardBrand,
          cardLast4: paymentDetails.cardLast4,
          billingPhone: paymentDetails.billingPhone,
          log,
          shouldDispatchNotifications: true,
        });

        if (!finalizedOrders.orders.length) {
          log.warn("no_order_for_checkout_session", { sessionId: session.id });
        }
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutKind = String(session.metadata?.checkout_kind || "order");
        const asyncPaymentFailed = event.type === "checkout.session.async_payment_failed";

        if (checkoutKind === "order") {
          await markOrderCheckoutSessionState({
            adminClient: supabaseAdmin,
            session,
            orderStatus: "payment_failed",
            paymentStatus: asyncPaymentFailed ? "failed" : "expired",
            checkoutState: asyncPaymentFailed ? "payment_failed" : "expired",
            failureMessage: asyncPaymentFailed
              ? "Le moyen de paiement asynchrone a echoue."
              : "Session Stripe expiree avant paiement.",
          });
        } else if (isZeroAttenteCheckoutKind(checkoutKind)) {
          const { error: releaseError } = await supabaseAdmin
            .from("reservations")
            .update({
              status: "cancelled",
              metadata: {
                ...(session.metadata || {}),
                checkout_session_id: session.id,
                checkout_session_state: "expired",
                hold_released_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("feature", "zero-attente")
            .eq("status", "pending")
            .filter("metadata->>checkout_session_id", "eq", session.id);

          if (releaseError) {
            log.error("zero_attente_hold_release_failed", {
              sessionId: session.id,
              message: releaseError.message,
            });
          }
        } else if (checkoutKind === "chefs-table") {
          const { error: releaseError } = await supabaseAdmin.rpc(
            "release_chef_table_checkout_hold",
            { p_session_id: session.id },
          );

          if (releaseError) {
            log.error("chef_table_hold_release_failed", {
              sessionId: session.id,
              message: releaseError.message,
            });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { data: transactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, metadata")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "charge");
        const paymentTransactions = (transactions || []) as PaymentTransactionRow[];

        for (const transaction of paymentTransactions) {
          if (transaction.order_id) {
            await supabaseAdmin
              .from("orders")
              .update({ status: "payment_failed", payment_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", transaction.order_id);
          }

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: transaction.order_id,
            user_id: transaction.user_id,
            stripe_payment_intent_id: paymentIntent.id,
            amount: (paymentIntent.amount || 0) / 100,
            currency: paymentIntent.currency || "chf",
            type: "charge",
            status: "failed",
            metadata: {
              failure_code: paymentIntent.last_payment_error?.code,
              failure_message: paymentIntent.last_payment_error?.message,
            },
          });

          const campaignId = getCampaignId(transaction.metadata);

          if (campaignId) {
            await supabaseAdmin
              .from("ad_campaigns")
              .update({ payment_status: "failed" })
              .eq("id", campaignId);
          }
        }

        if (paymentTransactions.some((transaction) => transaction.order_id)) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-payment-failed", push: true, email: true });
          } catch (error) {
            log.error("payment_failure_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (!paymentIntentId) break;

        const { data: chargeTransactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .eq("type", "charge")
          .eq("status", "succeeded");
        const successfulChargeTransactions = (chargeTransactions || []) as PaymentTransactionRow[];

        const totalRefundedAmount = (charge.amount_refunded || 0) / 100;
        const { data: existingRefundTransactions } = await supabaseAdmin
          .from("payment_transactions")
          .select("amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .eq("type", "refund")
          .eq("status", "succeeded");
        const alreadyRecordedRefundAmount = ((existingRefundTransactions || []) as Array<{ amount: number | string | null }>)
          .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
        const refundAmount = Math.max(
          0,
          Math.round((totalRefundedAmount - alreadyRecordedRefundAmount) * 100) / 100,
        );

        if (refundAmount <= 0) {
          log.info("charge_refund_already_recorded", {
            payment_intent_id: paymentIntentId,
            stripe_charge_id: charge.id,
            stripe_refunded_total_chf: totalRefundedAmount,
            recorded_refund_total_chf: alreadyRecordedRefundAmount,
          });
          break;
        }

        await recordRefundFinance({
          adminClient: supabaseAdmin,
          eventId: event.id,
          paymentIntentId,
          refundSourceId: `${charge.id}:${charge.amount_refunded || Math.round(totalRefundedAmount * 100)}`,
          refundAmountCents: Math.round(refundAmount * 100),
          currency: charge.currency || "chf",
          metadata: {
            stripe_charge_id: charge.id,
            stripe_refunded_total_cents: charge.amount_refunded || 0,
          },
          log,
        });

        const allocations = allocateAmounts(
          refundAmount,
          successfulChargeTransactions.map((transaction) => ({ amount: Number(transaction.amount || 0) })),
        );

        const notifiedUsers = new Map<string, number>();

        for (const [index, transaction] of successfulChargeTransactions.entries()) {
          const allocatedAmount = allocations[index] || 0;
          if (allocatedAmount <= 0) continue;

          await supabaseAdmin.from("payment_transactions").insert({
            order_id: transaction.order_id,
            user_id: transaction.user_id,
            stripe_payment_intent_id: paymentIntentId,
            amount: allocatedAmount,
            currency: charge.currency || "chf",
            type: "refund",
            status: "succeeded",
            metadata: {
              stripe_charge_id: charge.id,
              stripe_refunded_total_chf: totalRefundedAmount,
              stripe_refund_delta_chf: refundAmount,
              stripe_webhook_event_id: event.id,
            },
          });

          if (transaction.user_id) {
            const previousAmount = notifiedUsers.get(transaction.user_id) || 0;
            notifiedUsers.set(transaction.user_id, Math.round((previousAmount + allocatedAmount) * 100) / 100);
          }
        }

        for (const [userId, userRefundAmount] of notifiedUsers.entries()) {
          await enqueueNotification({
            adminClient: supabaseAdmin,
            userId,
            title: "Remboursement effectue",
            body: `${userRefundAmount.toFixed(2)} CHF sont rembourses sur le moyen de paiement d'origine.`,
            type: "payment",
            category: "transactional",
            data: {
              amount: userRefundAmount,
              stripe_payment_intent_id: paymentIntentId,
              url: "/notifications",
            },
          });
        }

        if (notifiedUsers.size > 0) {
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-refund", push: true, email: true });
          } catch (error) {
            log.error("refund_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const syncResult = await syncTokOneSubscriptionRecord({
          adminClient: supabaseAdmin,
          subscription,
          stripeMode: event.livemode ? "live" : "test",
        });

        if (!syncResult.updated) {
          const restaurantSyncResult = await syncRestaurantSubscriptionRecord({
            adminClient: supabaseAdmin,
            subscription,
            stripeMode: event.livemode ? "live" : "test",
            log,
          });

          if (!restaurantSyncResult.updated) {
            log.warn("tok_one_subscription_skipped", { subscriptionId: subscription.id });
            break;
          }

          log.info("restaurant_subscription_synced", {
            eventType: event.type,
            subscriptionId: subscription.id,
            restaurantId: restaurantSyncResult.row?.restaurant_id || null,
          });
          break;
        }

        if (
          event.type === "customer.subscription.updated" &&
          !isTokOneEntitledStatus(syncResult.row?.status || null) &&
          syncResult.row?.user_id
        ) {
          await enqueueNotification({
            adminClient: supabaseAdmin,
            userId: syncResult.row.user_id,
            title: "Abonnement Tok One mis à jour",
            body: "Votre abonnement Tok One n'est plus actif. Mettez à jour votre moyen de paiement pour retrouver vos avantages.",
            type: "subscription",
            category: "transactional",
            data: {
              stripe_subscription_id: subscription.id,
              status: syncResult.row?.status || null,
            },
          });
          try {
            await triggerNotificationDispatch({ source: "stripe-webhook-subscription-update", push: true, email: true });
          } catch (error) {
            log.error("subscription_notification_failed", { message: error instanceof Error ? error.message : "unknown" });
          }
        }

        log.info("subscription_synced", { eventType: event.type, subscriptionId: subscription.id });
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        // Revenue recognition is handled once, after the switch, so both Stripe
        // event names remain supported without duplicating ledger entries.
        break;
      }

      default:
        log.info("unhandled_event_type", { eventType: event.type });
    }

    if (
      event.type === "checkout.session.completed"
      || event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.payment_status === "paid") {
        await recordCheckoutFinance({
          adminClient: supabaseAdmin,
          eventId: event.id,
          checkoutSessionId: session.id,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          checkoutKind: String(session.metadata?.checkout_kind || "order"),
          restaurantId: session.metadata?.restaurant_id || null,
          grossCents: Number(session.amount_total || 0),
          currency: session.currency || "chf",
          livemode: event.livemode,
          metadata: {
            payment_status: session.payment_status,
            finance_routing_mode: session.metadata?.finance_routing_mode || "legacy_manual",
            platform_fee_amount_cents: session.metadata?.platform_fee_amount_cents || null,
            restaurant_share_amount_cents: session.metadata?.restaurant_share_amount_cents || null,
          },
          log,
        });
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceRecord = invoice as unknown as Record<string, any>;
      const amountPaid = Number(invoiceRecord.amount_paid || 0);
      if (amountPaid > 0) {
        const subscriptionDetails = invoiceRecord.parent?.subscription_details
          || invoiceRecord.subscription_details
          || {};
        const subscriptionId = typeof invoiceRecord.subscription === "string"
          ? invoiceRecord.subscription
          : typeof subscriptionDetails.subscription === "string"
            ? subscriptionDetails.subscription
            : null;
        let subscriptionMetadata = subscriptionDetails.metadata && typeof subscriptionDetails.metadata === "object"
          ? subscriptionDetails.metadata as Record<string, string>
          : {};

        if (subscriptionId && Object.keys(subscriptionMetadata).length === 0) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionMetadata = subscription.metadata || {};
        }

        const checkoutKind = String(
          subscriptionMetadata.checkout_kind
          || (subscriptionMetadata.restaurant_id ? "restaurant-onboarding" : "tok-one"),
        );

        await recordCheckoutFinance({
          adminClient: supabaseAdmin,
          eventId: event.id,
          checkoutSessionId: invoice.id,
          paymentIntentId: typeof invoiceRecord.payment_intent === "string" ? invoiceRecord.payment_intent : null,
          checkoutKind,
          restaurantId: subscriptionMetadata.restaurant_id || null,
          grossCents: amountPaid,
          currency: invoice.currency || "chf",
          livemode: event.livemode,
          sourceType: "stripe_invoice",
          metadata: {
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: subscriptionId,
            billing_reason: invoiceRecord.billing_reason || null,
          },
          log,
        });
      }
    }

    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: event.type,
      status: "success",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });

    await markStripeWebhookEventSucceeded({ adminClient: supabaseAdmin, event });
  } catch (error) {
    log.error("event_processing_error", { eventType: event.type, message: error instanceof Error ? error.message : "unknown" });
    await markStripeWebhookEventFailed({ adminClient: supabaseAdmin, event, error, log });
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: event.type,
      status: "failure",
      targetEntityType: "stripe_event",
      targetEntityId: event.id,
      errorMessage: error instanceof Error ? error.message : "Erreur interne",
      metadata: {
        livemode: event.livemode,
        type: event.type,
      },
    });
    return new Response("Stripe webhook processing failed", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
