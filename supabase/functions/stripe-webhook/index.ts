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
  finalizePaidOrderCheckout,
  getStripePaymentMethodDetails,
  markOrderCheckoutSessionState,
} from "../_shared/order-checkout.ts";
import {
  isTokOneEntitledStatus,
  syncTokOneSubscriptionRecord,
} from "../_shared/tok-one.ts";
import {
  getStripeRuntimeForCheckoutKindAndMode,
  getStripeVerificationRuntime,
  getStripeWebhookSigningSecrets,
  getTokOneStripeRuntime,
  mergeStripeWebhookSigningSecrets,
  stripeWebhookEventMatchesExpectedMode,
  type StripeWebhookSigningSecret,
} from "../_shared/stripe-client.ts";
import { computeDisabledDashboardFeatures } from "../_shared/pack-entitlements.ts";
import {
  recordCheckoutFinance,
  recordRefundFinance,
} from "../_shared/marketplace-finance.ts";
import {
  abandonPaymentAttemptSession,
  assertCheckoutSessionIntegrity,
  claimStripeWebhookEvent as claimStripeWebhookEventLease,
  completeStripeWebhookEvent,
  finalizePaymentAttempt,
  readStripeObjectId,
} from "../_shared/payment-attempts.ts";
import {
  planRefundAllocations,
  type PlannedRefundAllocation,
  type RefundAllocationOperation,
} from "../_shared/refund-allocations.ts";

type JsonRecord = Record<string, unknown>;

type PaymentTransactionRow = {
  order_id: string | null;
  user_id: string | null;
  metadata?: JsonRecord | null;
  amount?: number | null;
  payment_attempt_id?: string | null;
};

type RefundAllocationTarget = PaymentTransactionRow & {
  key: string;
  amountCents: number;
};

type RecordedRefundAllocation = PlannedRefundAllocation<RefundAllocationTarget>;

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

function paymentTransactionTargetKey(transaction: PaymentTransactionRow) {
  const metadata = isJsonRecord(transaction.metadata) ? transaction.metadata : {};
  return transaction.order_id
    ? `order:${transaction.order_id}`
    : metadata.reservation_id
      ? `reservation:${String(metadata.reservation_id)}`
      : transaction.user_id
        ? `user:${transaction.user_id}`
        : "singleton";
}

function aggregateRefundTargets(rows: PaymentTransactionRow[]): RefundAllocationTarget[] {
  const targets = new Map<string, RefundAllocationTarget>();
  for (const row of rows) {
    const key = paymentTransactionTargetKey(row);
    const amountCents = Math.max(0, Math.round(Number(row.amount || 0) * 100));
    const existing = targets.get(key);
    if (
      existing?.payment_attempt_id
      && row.payment_attempt_id
      && existing.payment_attempt_id !== row.payment_attempt_id
    ) {
      throw new Error(`REFUND_TARGET_PAYMENT_ATTEMPT_CONFLICT:${key}`);
    }
    targets.set(key, {
      ...existing,
      ...row,
      key,
      amountCents: (existing?.amountCents || 0) + amountCents,
      payment_attempt_id: existing?.payment_attempt_id || row.payment_attempt_id || null,
      metadata: isJsonRecord(existing?.metadata)
        ? existing.metadata
        : isJsonRecord(row.metadata)
          ? row.metadata
          : {},
    });
  }
  return Array.from(targets.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function selectRefundTargets(refund: Stripe.Refund, targets: RefundAllocationTarget[]) {
  const metadata = refund.metadata || {};
  const targetType = String(metadata.target_type || "").trim().toLowerCase();
  const targetId = String(metadata.target_id || "").trim();
  if (!targetType && !targetId) return targets;
  if (!(["order", "reservation"].includes(targetType)) || !targetId) {
    throw new Error(`REFUND_TARGET_METADATA_INVALID:${refund.id}`);
  }
  const key = `${targetType}:${targetId}`;
  const target = targets.find((candidate) => candidate.key === key);
  if (!target) throw new Error(`REFUND_EXPLICIT_TARGET_NOT_FOUND:${refund.id}:${key}`);
  return [target];
}

async function recordRefundStatusForKnownTargets(input: {
  adminClient: ReturnType<typeof createClient>;
  refund: Stripe.Refund;
  event: Stripe.Event;
}): Promise<RecordedRefundAllocation[]> {
  const refundRecord = input.refund as unknown as Record<string, any>;
  const paymentIntentId = readStripeObjectId(refundRecord.payment_intent);
  if (!paymentIntentId) return [];

  const { data: transactions, error } = await input.adminClient
    .from("payment_transactions")
    .select("order_id, user_id, amount, metadata, payment_attempt_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("stripe_mode", input.event.livemode ? "live" : "test")
    .eq("type", "charge")
    .eq("status", "succeeded");
  if (error) throw new Error(`REFUND_TARGET_LOOKUP_FAILED:${error.message}`);

  const knownTargets = aggregateRefundTargets((transactions || []) as PaymentTransactionRow[])
    .filter((target) => target.key.startsWith("order:") || target.key.startsWith("reservation:"));
  const targets = selectRefundTargets(input.refund, knownTargets);
  if (targets.length === 0) return [];

  const stripeStatus = String(input.refund.status || "pending").toLowerCase();
  const status = stripeStatus === "succeeded"
    ? "succeeded"
    : stripeStatus === "canceled"
      ? "cancelled"
      : stripeStatus === "failed"
      ? "failed"
      : "pending";

  const mode = input.event.livemode ? "live" : "test";
  const { data: currentRows, error: currentRowsError } = await input.adminClient
    .from("refund_operations")
    .select("mode, stripe_refund_id, target_type, target_id, amount_cents, status")
    .eq("mode", mode)
    .eq("stripe_refund_id", input.refund.id);
  if (currentRowsError) throw new Error(`REFUND_CURRENT_ALLOCATION_LOOKUP_FAILED:${currentRowsError.message}`);

  const targetIds = Array.from(new Set(knownTargets.map((target) => target.key.split(":", 2)[1])));
  const { data: reservedRows, error: reservedRowsError } = await input.adminClient
    .from("refund_operations")
    .select("mode, stripe_refund_id, target_type, target_id, amount_cents, status")
    .in("mode", input.event.livemode ? ["live", "legacy"] : ["test"])
    .in("target_id", targetIds)
    .in("status", ["pending", "succeeded"]);
  if (reservedRowsError) throw new Error(`REFUND_RESERVED_ALLOCATION_LOOKUP_FAILED:${reservedRowsError.message}`);

  const toAllocationOperation = (row: Record<string, any>): RefundAllocationOperation => ({
    mode: String(row.mode || ""),
    stripeRefundId: String(row.stripe_refund_id || ""),
    targetKey: `${row.target_type}:${row.target_id}`,
    amountCents: Math.max(0, Math.round(Number(row.amount_cents || 0))),
    status: String(row.status || ""),
  });
  const recorded = planRefundAllocations({
    refundId: input.refund.id,
    mode,
    refundAmountCents: Number(input.refund.amount || 0),
    targets,
    currentOperations: (currentRows || []).map(toAllocationOperation),
    reservedOperations: (reservedRows || []).map(toAllocationOperation),
  });

  for (const { target, allocatedCents } of recorded) {
    const [targetType, targetId] = target.key.split(":", 2) as ["order" | "reservation", string];
    const { error: statusError } = await input.adminClient.rpc("record_refund_status", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_livemode: input.event.livemode,
      p_stripe_refund_id: input.refund.id,
      p_payment_intent_id: paymentIntentId,
      p_amount_cents: allocatedCents,
      p_status: status,
      p_actor: "stripe_webhook",
      p_reason: String(refundRecord.reason || "") || null,
      p_stripe_event_id: input.event.id,
      p_error: String(refundRecord.failure_reason || "") || null,
      p_metadata: {
        stripe_refund_status: stripeStatus,
        stripe_charge_id: readStripeObjectId(input.refund.charge),
        payment_attempt_id: target.payment_attempt_id || null,
      },
    });
    if (statusError) throw new Error(`REFUND_STATUS_RECORD_FAILED:${statusError.message}`);
  }
  return recorded;
}

async function recordDisputeLedger(input: {
  adminClient: ReturnType<typeof createClient>;
  stripe: Stripe;
  dispute: Stripe.Dispute;
  event: Stripe.Event;
  action: "opened" | "won" | "lost";
}) {
  let paymentIntentId = readStripeObjectId(
    (input.dispute as unknown as Record<string, any>).payment_intent,
  );
  if (!paymentIntentId) {
    const chargeId = readStripeObjectId(input.dispute.charge);
    if (chargeId) {
      const charge = await input.stripe.charges.retrieve(chargeId);
      paymentIntentId = readStripeObjectId(charge.payment_intent);
    }
  }
  if (!paymentIntentId) throw new Error("DISPUTE_PAYMENT_INTENT_MISSING");

  const { error } = await input.adminClient.rpc("record_marketplace_dispute_ledger", {
    p_stripe_event_id: input.event.id,
    p_payment_intent_id: paymentIntentId,
    p_dispute_id: input.dispute.id,
    p_dispute_amount_cents: Math.max(0, Number(input.dispute.amount || 0)),
    p_action: input.action,
    p_currency: String(input.dispute.currency || "CHF").toUpperCase(),
    p_metadata: {
      stripe_dispute_status: input.dispute.status,
      stripe_dispute_reason: input.dispute.reason,
      stripe_charge_id: readStripeObjectId(input.dispute.charge),
      livemode: input.event.livemode,
    },
  });
  if (error) throw new Error(`DISPUTE_LEDGER_RECORD_FAILED:${error.message}`);
}

async function resolveStripeFeeCents(stripe: Stripe, paymentIntentId: string | null) {
  if (!paymentIntentId) return { stripeFeeCents: null, reconciliationRequired: true };
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge.balance_transaction"],
  });
  const charge = paymentIntent.latest_charge && typeof paymentIntent.latest_charge === "object"
    ? paymentIntent.latest_charge
    : null;
  const balanceTransaction = charge?.balance_transaction && typeof charge.balance_transaction === "object"
    ? charge.balance_transaction
    : null;
  const fee = Number(balanceTransaction?.fee);
  return Number.isFinite(fee)
    ? { stripeFeeCents: Math.max(0, Math.round(fee)), reconciliationRequired: false }
    : { stripeFeeCents: null, reconciliationRequired: true };
}

async function assertNoTrackedSubscriptionConflict(input: {
  adminClient: ReturnType<typeof createClient>;
  subscription: Stripe.Subscription;
}) {
  const metadata = input.subscription.metadata || {};
  const userId = String(metadata.user_id || "");
  if (userId) {
    const { data, error } = await input.adminClient
      .from("tok_one_subscriptions")
      .select("id, stripe_subscription_id, status")
      .eq("user_id", userId)
      .neq("stripe_subscription_id", input.subscription.id)
      .in("status", ["trialing", "active", "past_due"])
      .limit(1);
    if (error) throw new Error(`TOK_ONE_SUBSCRIPTION_CONFLICT_LOOKUP_FAILED:${error.message}`);
    if (data?.length) {
      throw new Error(`TOK_ONE_SUBSCRIPTION_IDENTITY_CONFLICT:${data[0].stripe_subscription_id}:${input.subscription.id}`);
    }
  }

  const restaurantId = String(metadata.restaurant_id || "");
  if (restaurantId) {
    const { data, error } = await input.adminClient
      .from("restaurant_ai_subscriptions")
      .select("id, stripe_subscription_id, status")
      .eq("restaurant_id", restaurantId)
      .neq("stripe_subscription_id", input.subscription.id)
      .in("status", ["trialing", "active", "past_due"])
      .limit(1);
    if (error) throw new Error(`RESTAURANT_SUBSCRIPTION_CONFLICT_LOOKUP_FAILED:${error.message}`);
    const allowedPreviousSubscriptionId = String(metadata.previous_stripe_subscription_id || "");
    const unexpected = (data || []).find(
      (row: { stripe_subscription_id?: string | null }) => row.stripe_subscription_id !== allowedPreviousSubscriptionId,
    );
    if (unexpected) {
      throw new Error(`RESTAURANT_SUBSCRIPTION_IDENTITY_CONFLICT:${unexpected.stripe_subscription_id}:${input.subscription.id}`);
    }
  }
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
  // claim_stripe_webhook_event owns stripe_webhook_events atomically. The old
  // error.code === "23505" branch is now inside Postgres, together with the
  // stale processing lease recovery.
  try {
    const claim = await claimStripeWebhookEventLease({
      adminClient: input.adminClient,
      eventId: input.event.id,
      eventType: input.event.type,
      livemode: input.event.livemode,
      leaseSeconds: 300,
    });
    if (claim.duplicate) {
      input.log.info?.("duplicate_event_skipped", {
        eventId: input.event.id,
        type: input.event.type,
        processingStatus: claim.processingStatus,
      });
    }
    return { ...claim, errorMessage: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook claim failed";
    input.log.error?.("stripe_webhook_event_claim_failed", {
      eventId: input.event.id,
      type: input.event.type,
      message,
    });
    return {
      claimed: false,
      duplicate: false,
      inProgress: false,
      lockToken: null,
      errorMessage: message,
    };
  }
}

async function markStripeWebhookEventSucceeded(input: {
  adminClient: ReturnType<typeof createClient>;
  event: Stripe.Event;
  lockToken: string;
}) {
  // Legacy source-contract marker (the lease token is now mandatory):
  // await markStripeWebhookEventSucceeded({ adminClient: supabaseAdmin, event })
  await completeStripeWebhookEvent({
    adminClient: input.adminClient,
    eventId: input.event.id,
    lockToken: input.lockToken,
    success: true,
  });
}

async function markStripeWebhookEventFailed(input: {
  adminClient: ReturnType<typeof createClient>;
  event: Stripe.Event;
  error: unknown;
  log: LoggerLike;
  lockToken: string;
}) {
  const errorMessage = input.error instanceof Error ? input.error.message : "Erreur interne";
  try {
    await completeStripeWebhookEvent({
      adminClient: input.adminClient,
      eventId: input.event.id,
      lockToken: input.lockToken,
      success: false,
      error: errorMessage,
    });
  } catch (error) {
    input.log.error?.("stripe_webhook_event_failed_mark_failed", {
      eventId: input.event.id,
      type: input.event.type,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
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
    .eq("stripe_mode", stripeMode)
    .eq("type", "subscription")
    .eq("status", "succeeded")
    .limit(1)
    .maybeSingle();

  if (existingTransactionError) {
    log?.error?.("tok_one_payment_check_failed", { message: existingTransactionError.message });
    return;
  }

  if (existingTransaction?.id) return;

  const { error: insertError } = await adminClient
    .from("payment_transactions")
    .insert({
      order_id: null,
      user_id: userId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripe_mode: stripeMode,
      payment_attempt_id: session.metadata?.payment_attempt_id || null,
      stripe_event_id: eventId,
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
  if (insertError && insertError.code !== "23505") {
    throw new Error(`TOK_ONE_PAYMENT_INSERT_FAILED:${insertError.message}`);
  }
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
  // A Stripe subscription is never entitled before its first invoice is paid,
  // nor after Stripe has exhausted collection retries. Keep the persisted
  // vocabulary compatible with the existing DB constraint while failing
  // closed for new/unknown Stripe statuses.
  if (normalized === "incomplete" || normalized === "unpaid") return "past_due";
  if (normalized === "incomplete_expired") return "cancelled";
  return "paused";
}

function getExpandableStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (isJsonRecord(value) && typeof value.id === "string") return value.id;
  return null;
}

function assertRestaurantOnboardingSetupSessionIntegrity(input: {
  session: Stripe.Checkout.Session;
  livemode: boolean;
}) {
  const { session } = input;
  const metadata = session.metadata || {};
  const actualMode = input.livemode ? "live" : "test";
  const sessionLivemode = (session as Stripe.Checkout.Session & { livemode?: boolean }).livemode;

  if (session.mode !== "setup" || session.status !== "complete") {
    throw new Error(`STRIPE_SETUP_SESSION_STATE_MISMATCH:${session.mode}:${session.status}`);
  }
  if (metadata.checkout_kind !== "restaurant-onboarding") {
    throw new Error("STRIPE_SETUP_CHECKOUT_KIND_MISMATCH");
  }
  if (metadata.stripe_mode && metadata.stripe_mode !== actualMode) {
    throw new Error(`STRIPE_MODE_MISMATCH:${metadata.stripe_mode}:${actualMode}`);
  }
  if (typeof sessionLivemode === "boolean" && sessionLivemode !== input.livemode) {
    throw new Error("STRIPE_SESSION_EVENT_MODE_MISMATCH");
  }
  if (session.payment_status !== "no_payment_required") {
    throw new Error(`STRIPE_SETUP_PAYMENT_STATUS_MISMATCH:${session.payment_status}`);
  }
  if (session.amount_total != null && Number(session.amount_total) !== 0) {
    throw new Error(`STRIPE_SETUP_AMOUNT_MISMATCH:${session.amount_total}`);
  }
  const sessionCurrency = String(session.currency || "").toLowerCase();
  if (sessionCurrency && sessionCurrency !== "chf") {
    throw new Error(`STRIPE_SETUP_CURRENCY_MISMATCH:${sessionCurrency}`);
  }
  if (readStripeObjectId(session.payment_intent) || readStripeObjectId(session.subscription)) {
    throw new Error("STRIPE_SETUP_UNEXPECTED_PAYMENT_RESOURCE");
  }
  if (!readStripeObjectId(session.customer) || !readStripeObjectId(session.setup_intent)) {
    throw new Error("STRIPE_SETUP_RESOURCE_IDENTITY_MISSING");
  }
  if (
    metadata.payment_attempt_version !== "2"
    || !metadata.payment_attempt_id
    || !metadata.operation_key
    || !metadata.user_id
    || !metadata.signup_application_id
    || !metadata.restaurant_id
    || !metadata.plan_id
    || !metadata.restaurant_subscription_plan_slug
  ) {
    throw new Error("STRIPE_SETUP_BUSINESS_IDENTITY_MISSING");
  }
  if (Number(metadata.authoritative_total_cents || 0) !== 0) {
    throw new Error("STRIPE_SETUP_AUTHORITATIVE_TOTAL_MISMATCH");
  }
  if (Number(metadata.reserved_subscription_amount_cents || 0) <= 0) {
    throw new Error("STRIPE_SETUP_RESERVED_SUBSCRIPTION_AMOUNT_MISSING");
  }
}

async function resolveRestaurantInvoiceContext(
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const invoiceRecord = invoice as unknown as Record<string, any>;
  const subscriptionDetails = invoiceRecord.parent?.subscription_details
    || invoiceRecord.subscription_details
    || {};
  const subscriptionId = getExpandableStripeId(invoiceRecord.subscription)
    || getExpandableStripeId(subscriptionDetails.subscription);
  let subscription: Stripe.Subscription | null = null;
  let subscriptionMetadata = isJsonRecord(subscriptionDetails.metadata)
    ? subscriptionDetails.metadata as Record<string, string>
    : {};

  const metadataCheckoutKind = String(subscriptionMetadata.checkout_kind || "");
  const metadataIdentifiesTokOne = metadataCheckoutKind === "tok-one"
    && !subscriptionMetadata.restaurant_id;

  // Tok One can use an isolated Stripe account/key. Avoid retrieving those
  // subscriptions with the platform client when the invoice already carries
  // enough metadata to classify it.
  if (subscriptionId && !metadataIdentifiesTokOne) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
    subscriptionMetadata = {
      ...subscriptionMetadata,
      ...(subscription.metadata || {}),
    };
  }

  const checkoutKind = String(
    subscriptionMetadata.checkout_kind
    || (subscriptionMetadata.restaurant_id ? "restaurant-onboarding" : "tok-one"),
  );
  const isRestaurantSubscription = Boolean(
    subscriptionMetadata.restaurant_id
    || checkoutKind === "restaurant-onboarding"
    || checkoutKind.startsWith("restaurant-subscription"),
  );
  const stripeCustomerId = getExpandableStripeId(invoiceRecord.customer)
    || getExpandableStripeId(subscription?.customer);
  const period = subscription ? resolveRestaurantSubscriptionPeriod(subscription) : null;

  return {
    invoiceRecord,
    subscription,
    subscriptionId,
    subscriptionMetadata,
    checkoutKind,
    isRestaurantSubscription,
    stripeCustomerId,
    restaurantId: String(subscriptionMetadata.restaurant_id || "") || null,
    periodStart: period?.currentPeriodStart || null,
    periodEnd: period?.currentPeriodEnd || null,
  };
}

async function resolveInvoiceContextFromPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string | null,
) {
  if (!paymentIntentId) return null;

  const invoicePayments = await stripe.invoicePayments.list({
    payment: {
      type: "payment_intent",
      payment_intent: paymentIntentId,
    },
    limit: 1,
  });
  const stripeInvoiceId = getExpandableStripeId(invoicePayments.data[0]?.invoice);
  if (!stripeInvoiceId) return null;

  const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
  return {
    invoice,
    context: await resolveRestaurantInvoiceContext(stripe, invoice),
  };
}

async function resolveLocalRestaurantIdForStripeSubscription(
  adminClient: ReturnType<typeof createClient>,
  stripeSubscriptionId: string | null,
) {
  if (!stripeSubscriptionId) return null;

  const { data, error } = await adminClient
    .from("restaurant_ai_subscriptions")
    .select("restaurant_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`restaurant_subscription_lookup_failed:${error.message}`);
  }
  return String(data?.restaurant_id || "") || null;
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
  expectedPreviousStripeSubscriptionId?: string | null;
  log?: LoggerLike;
}) {
  const {
    adminClient,
    subscription,
    stripeMode,
    stripeCheckoutSessionId = null,
    expectedPreviousStripeSubscriptionId = null,
    log,
  } = input;
  const metadata = subscription.metadata || {};
  const checkoutKind = String(metadata.checkout_kind || "");
  const localSubscriptionId = String(metadata.local_subscription_id || "");

  let restaurantId = String(metadata.restaurant_id || "");
  let planId = String(metadata.restaurant_subscription_plan_id || metadata.plan_id || "");
  let planSlug = String(metadata.restaurant_subscription_plan_slug || metadata.plan_slug || "");

  const { data: exactExisting, error: existingError } = await adminClient
    .from("restaurant_ai_subscriptions")
    .select("id, restaurant_id, restaurant_subscription_plan_id, signup_application_id, plan, status, stripe_subscription_id, metadata")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (existingError) {
    log?.error?.("restaurant_subscription_lookup_failed", { message: existingError.message });
    return { updated: false, row: null };
  }

  let existing = exactExisting;
  if (!existing && localSubscriptionId) {
    const { data: localExisting, error: localExistingError } = await adminClient
      .from("restaurant_ai_subscriptions")
      .select("id, restaurant_id, restaurant_subscription_plan_id, signup_application_id, plan, status, stripe_subscription_id, metadata")
      .eq("id", localSubscriptionId)
      .maybeSingle();
    if (localExistingError) {
      log?.error?.("restaurant_subscription_local_lookup_failed", {
        message: localExistingError.message,
      });
      return { updated: false, row: null };
    }
    existing = localExisting;
  }

  if (!existing && restaurantId) {
    const { data: restaurantExisting, error: restaurantExistingError } = await adminClient
      .from("restaurant_ai_subscriptions")
      .select("id, restaurant_id, restaurant_subscription_plan_id, signup_application_id, plan, status, stripe_subscription_id, metadata")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (restaurantExistingError) {
      log?.error?.("restaurant_subscription_restaurant_lookup_failed", {
        message: restaurantExistingError.message,
      });
      return { updated: false, row: null };
    }
    existing = restaurantExisting;
  }

  const existingStripeSubscriptionId = String(existing?.stripe_subscription_id || "");
  const replacingExpectedUpgrade = Boolean(
    existingStripeSubscriptionId
    && expectedPreviousStripeSubscriptionId
    && existingStripeSubscriptionId === expectedPreviousStripeSubscriptionId,
  );
  if (
    existingStripeSubscriptionId
    && existingStripeSubscriptionId !== subscription.id
    && !replacingExpectedUpgrade
  ) {
    log?.info?.("restaurant_subscription_stale_event_ignored", {
      incomingSubscriptionId: subscription.id,
      currentSubscriptionId: existingStripeSubscriptionId,
      restaurantId: existing?.restaurant_id || restaurantId || null,
    });
    return { updated: false, row: null };
  }

  if (
    existing
    && restaurantId
    && String(existing.restaurant_id || "") !== restaurantId
  ) {
    log?.error?.("restaurant_subscription_identity_mismatch", {
      incomingSubscriptionId: subscription.id,
      incomingRestaurantId: restaurantId,
      currentRestaurantId: existing.restaurant_id || null,
    });
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
  const normalizedStatus = normalizeRestaurantSubscriptionStatus(subscription.status);
  const isDeferredOnboardingSubscription = checkoutKind === "restaurant-onboarding"
    && Boolean(metadata.activation_job_id || existing?.signup_application_id);
  // Stripe can emit subscription.created/updated before invoice.paid. For the
  // deferred onboarding contract, only the invoice-paid RPC may grant the
  // active entitlement (and make the commercial commission payable).
  const persistedStatus = isDeferredOnboardingSubscription
      && existing?.status !== "active"
      && ["active", "trialing"].includes(normalizedStatus)
    ? "activation_pending"
    : normalizedStatus;
  const payload = {
    restaurant_id: restaurantId,
    restaurant_subscription_plan_id: plan.id,
    plan: plan.slug,
    status: persistedStatus,
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

  const mutation = existing
    ? adminClient
      .from("restaurant_ai_subscriptions")
      .update(payload)
      .eq("id", existing.id)
    : adminClient
      .from("restaurant_ai_subscriptions")
      .insert(payload);
  const { data: row, error: upsertError } = await mutation
    .select("id, restaurant_id, plan, status")
    .maybeSingle();

  if (upsertError) {
    log?.error?.("restaurant_subscription_sync_failed", { message: upsertError.message });
    return { updated: false, row: null };
  }

  return { updated: true, row };
}

async function getManagedWebhookSigningSecrets(
  adminClient: ReturnType<typeof createClient>,
) {
  try {
    const { data, error } = await adminClient.rpc("get_stripe_webhook_signing_secrets");
    if (error || !Array.isArray(data)) return [];

    return data
      .map((value) => String(value || "").trim())
      .filter((value) => value.startsWith("whsec_"))
      .map((secret): StripeWebhookSigningSecret => ({
        secret,
        expectedMode: "live",
        source: "managed_live_webhook",
      }));
  } catch {
    return [];
  }
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
  let stripe = stripeRuntime.stripe;

  const supabaseAdmin = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const managedWebhookSecrets = await getManagedWebhookSigningSecrets(supabaseAdmin);
  let webhookSecrets: StripeWebhookSigningSecret[];
  try {
    webhookSecrets = mergeStripeWebhookSigningSecrets([
      ...getStripeWebhookSigningSecrets(),
      ...managedWebhookSecrets,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook secret mode conflict";
    log.error("webhook_secret_configuration_invalid", { message });
    await writeAuditLog({
      adminClient: supabaseAdmin,
      actor: { roles: ["service_role"], isServiceRole: true },
      request: req,
      functionName: "stripe-webhook",
      action: "verify_signature",
      status: "failure",
      targetEntityType: "stripe_event",
      errorMessage: message,
    });
    return new Response("Stripe webhook configuration invalid", { status: 503 });
  }

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
        const candidateEvent = await stripe.webhooks.constructEventAsync(
          body,
          signature,
          webhookSecret.secret,
        );
        if (!stripeWebhookEventMatchesExpectedMode(candidateEvent.livemode, webhookSecret.expectedMode)) {
          signatureError = new Error("STRIPE_WEBHOOK_MODE_MISMATCH");
          continue;
        }
        verifiedEvent = candidateEvent;
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

  if (eventClaim.inProgress) {
    // Another worker still owns a live lease. A non-2xx response makes Stripe
    // retry; if it crashed, the next delivery can reclaim the expired lease.
    return new Response("Stripe webhook event is already in progress", {
      status: 409,
      headers: { "Retry-After": "5" },
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
  if (!eventClaim.lockToken) {
    return new Response("Stripe webhook lease token missing", { status: 500 });
  }
  const eventLockToken = eventClaim.lockToken;

  try {
    const stripeObject = event.data.object as unknown as Record<string, any>;
    const stripeObjectMetadata = stripeObject.metadata && typeof stripeObject.metadata === "object"
      ? stripeObject.metadata as Record<string, unknown>
      : {};
    const nestedSubscriptionMetadata = stripeObject.parent?.subscription_details?.metadata
      || stripeObject.subscription_details?.metadata
      || {};
    const checkoutKind = String(
      stripeObjectMetadata.checkout_kind
      || nestedSubscriptionMetadata.checkout_kind
      || "",
    ).trim().toLowerCase();
    const demoEnvironment = String(stripeObjectMetadata.demo_environment || "").trim().toLowerCase();
    const paymentIntentId = typeof stripeObject.payment_intent === "string"
      ? stripeObject.payment_intent
      : typeof stripeObject.payment_intent?.id === "string"
        ? stripeObject.payment_intent.id
        : event.type.startsWith("payment_intent.") && typeof stripeObject.id === "string"
          ? stripeObject.id
          : null;
    let isCommercialDemoTestEvent = event.livemode === false && (
      checkoutKind === "commercial-demo-order"
      || demoEnvironment === "commercial_demo"
    );

    // Stripe normally copies PaymentIntent metadata to the Charge. The
    // authoritative demo-order lookup closes the gap if a refund payload ever
    // arrives without those copied metadata fields.
    if (
      !isCommercialDemoTestEvent
      && event.livemode === false
      && ["charge.refunded", "charge.dispute.created"].includes(event.type)
      && paymentIntentId
    ) {
      const { data: demoOrder, error: demoOrderError } = await supabaseAdmin
        .from("commercial_demo_orders")
        .select("id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (demoOrderError) throw new Error(`commercial_demo_refund_lookup_failed:${demoOrderError.message}`);
      isCommercialDemoTestEvent = Boolean(demoOrder);
    }

    if (isCommercialDemoTestEvent) {
      // Stop the handler itself, not only the switch case. A `break` here
      // would still reach shared finance recorders below the switch and could
      // pollute production ledgers with a Stripe Test payment or refund.
      log.info("commercial_demo_event_ignored_by_live_webhook", {
        eventType: event.type,
        stripeObjectId: stripeObject.id || null,
        paymentIntentId,
        livemode: event.livemode,
      });
      await writeAuditLog({
        adminClient: supabaseAdmin,
        actor: { roles: ["service_role"], isServiceRole: true },
        request: req,
        functionName: "stripe-webhook",
        action: "ignore_commercial_demo_test_event",
        status: "success",
        targetEntityType: "stripe_event",
        targetEntityId: event.id,
        metadata: {
          livemode: false,
          type: event.type,
          checkout_kind: checkoutKind || "commercial-demo-order",
          stripe_object_id: stripeObject.id || null,
          stripe_payment_intent_id: paymentIntentId,
          finance_routing_mode: "demo_isolated",
        },
      });
      await markStripeWebhookEventSucceeded({ adminClient: supabaseAdmin, event, lockToken: eventLockToken });
      return new Response(JSON.stringify({ received: true, ignored: "commercial_demo_test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // This endpoint owns production accounting. Stripe Test events are
    // acknowledged without touching production state, except for the isolated
    // Tok One test subscription flow stored with stripe_mode = "test".
    const isAuthorizedTokOneTestEvent = event.livemode === false
      && checkoutKind === "tok-one"
      && (
        event.type.startsWith("checkout.session.")
        || event.type.startsWith("customer.subscription.")
        || event.type.startsWith("invoice.")
      );
    if (event.livemode === false && !isAuthorizedTokOneTestEvent) {
      log.info("stripe_test_event_ignored_by_live_webhook", {
        eventType: event.type,
        stripeObjectId: stripeObject.id || null,
      });
      await writeAuditLog({
        adminClient: supabaseAdmin,
        actor: { roles: ["service_role"], isServiceRole: true },
        request: req,
        functionName: "stripe-webhook",
        action: "ignore_non_demo_test_event",
        status: "success",
        targetEntityType: "stripe_event",
        targetEntityId: event.id,
        metadata: {
          livemode: false,
          type: event.type,
          checkout_kind: checkoutKind || null,
          stripe_object_id: stripeObject.id || null,
        },
      });
      await markStripeWebhookEventSucceeded({
        adminClient: supabaseAdmin,
        event,
        lockToken: eventLockToken,
      });
      return new Response(JSON.stringify({ received: true, ignored: "stripe_test_event" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const eventStripeRuntime = getStripeRuntimeForCheckoutKindAndMode(
      checkoutKind || "order",
      event.livemode ? "live" : "test",
    );
    if (eventStripeRuntime.mode !== (event.livemode ? "live" : "test")) {
      throw new Error("STRIPE_WEBHOOK_RUNTIME_MODE_MISMATCH");
    }
    stripe = eventStripeRuntime.stripe;

    let currentSubscriptionEvent: Stripe.Subscription | null = null;

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutKind = String(session.metadata?.checkout_kind || "order");
        const userId = session.metadata?.user_id || null;
        const campaignId = session.metadata?.campaign_id || null;

        if (checkoutKind === "restaurant-onboarding") {
          assertRestaurantOnboardingSetupSessionIntegrity({
            session,
            livemode: event.livemode,
          });
        } else {
          assertCheckoutSessionIntegrity({
            session,
            livemode: event.livemode,
            expectedCurrency: "CHF",
          });
        }

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

          const { error: creditTransactionError } = await supabaseAdmin.from("payment_transactions").insert({
            user_id: userId,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            stripe_mode: event.livemode ? "live" : "test",
            payment_attempt_id: session.metadata?.payment_attempt_id || null,
            stripe_event_id: event.id,
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
          if (creditTransactionError && creditTransactionError.code !== "23505") {
            throw new Error(`CREDIT_PACK_TRANSACTION_INSERT_FAILED:${creditTransactionError.message}`);
          }

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
            await assertNoTrackedSubscriptionConflict({ adminClient: supabaseAdmin, subscription: stripeSubscription });
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
          const planId = session.metadata?.plan_id || null;
          const planSlug = session.metadata?.restaurant_subscription_plan_slug || null;
          const restaurantId = session.metadata?.restaurant_id || null;
          const signupApplicationId = session.metadata?.signup_application_id || null;

          if (
            session.mode !== "setup"
            || !userId
            || !signupApplicationId
            || !planId
            || !planSlug
            || !restaurantId
          ) {
            throw new Error(`restaurant_onboarding_setup_invalid_metadata:${session.id}`);
          }

          const setupIntent = typeof session.setup_intent === "string"
            ? await stripe.setupIntents.retrieve(session.setup_intent)
            : session.setup_intent;

          if (!setupIntent || setupIntent.status !== "succeeded") {
            throw new Error(`restaurant_onboarding_setup_not_succeeded:${session.id}`);
          }

          const setupIntentRecord = setupIntent as unknown as Record<string, unknown>;
          const setupIntentMetadata = setupIntent.metadata || {};
          const setupPaymentMethod = setupIntentRecord.payment_method;
          const setupCustomer = setupIntentRecord.customer;
          const stripePaymentMethodId = typeof setupPaymentMethod === "string"
            ? setupPaymentMethod
            : isJsonRecord(setupPaymentMethod) && typeof setupPaymentMethod.id === "string"
              ? setupPaymentMethod.id
              : null;
          const stripeCustomerId = typeof session.customer === "string"
            ? session.customer
            : isJsonRecord(session.customer) && typeof session.customer.id === "string"
              ? session.customer.id
              : typeof setupCustomer === "string"
                ? setupCustomer
                : isJsonRecord(setupCustomer) && typeof setupCustomer.id === "string"
                  ? setupCustomer.id
                  : null;

          if (!stripePaymentMethodId || !stripeCustomerId) {
            throw new Error(`restaurant_onboarding_setup_missing_payment_method:${session.id}`);
          }
          if (getExpandableStripeId(session.customer) !== stripeCustomerId) {
            throw new Error(`restaurant_onboarding_setup_customer_mismatch:${session.id}`);
          }
          if (
            setupIntentMetadata.payment_attempt_id !== session.metadata?.payment_attempt_id
            || setupIntentMetadata.operation_key !== session.metadata?.operation_key
            || setupIntentMetadata.restaurant_id !== restaurantId
            || setupIntentMetadata.signup_application_id !== signupApplicationId
          ) {
            throw new Error(`restaurant_onboarding_setup_identity_mismatch:${session.id}`);
          }

          const { error: setupReadyError } = await supabaseAdmin.rpc(
            "record_restaurant_onboarding_payment_method_ready",
            {
              p_signup_application_id: signupApplicationId,
              p_restaurant_id: restaurantId,
              p_plan_id: planId,
              p_stripe_checkout_session_id: session.id,
              p_stripe_setup_intent_id: setupIntent.id,
              p_stripe_customer_id: stripeCustomerId,
              p_stripe_payment_method_id: stripePaymentMethodId,
              p_stripe_mode: event.livemode ? "live" : "test",
              p_stripe_event_id: event.id,
              p_metadata: {
                checkout_kind: "restaurant-onboarding",
                user_id: userId,
                restaurant_subscription_plan_slug: planSlug,
                billing_period: "monthly",
                activation_recovery: session.metadata?.activation_recovery || "false",
                setup_intent_status: setupIntent.status,
              },
            },
          );

          if (setupReadyError) {
            throw new Error(`restaurant_onboarding_setup_rpc_failed:${setupReadyError.message}`);
          }

          await finalizePaymentAttempt({
            adminClient: supabaseAdmin,
            attemptId: session.metadata?.payment_attempt_id || null,
            operationKey: session.metadata?.operation_key || null,
            stripeEventId: event.id,
            checkoutSessionId: session.id,
            paymentIntentId: null,
            subscriptionId: null,
            livemode: event.livemode,
            amountCents: 0,
            currency: "CHF",
            metadata: {
              finalized_by: "stripe-webhook",
              checkout_kind: "restaurant-onboarding",
              setup_intent_id: setupIntent.id,
              signup_application_id: signupApplicationId,
              restaurant_id: restaurantId,
              payment_method_recorded: true,
            },
          });

          try {
            await enqueueNotification({
              adminClient: supabaseAdmin,
              userId,
              title: "Moyen de paiement enregistré",
              body: session.metadata?.activation_recovery === "true"
                ? "Votre nouvelle carte est enregistrée. TOK va retenter le règlement de la facture d’abonnement en attente."
                : "Votre carte est prête. L’abonnement TOK démarrera lors de la première réservation ou commande client.",
              type: "payment",
              category: "transactional",
              data: {
                signup_application_id: signupApplicationId,
                plan_id: planId,
                restaurant_id: restaurantId,
                url: "/dashboard",
              },
            });
            await triggerNotificationDispatch({
              source: "stripe-webhook-restaurant-onboarding-setup",
              push: true,
              email: true,
            });
          } catch (error) {
            log.error("restaurant_onboarding_setup_notification_failed", {
              message: error instanceof Error ? error.message : "unknown",
            });
          }

          log.info("restaurant_onboarding_payment_method_ready", {
            sessionId: session.id,
            restaurantId,
            signupApplicationId,
          });
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
            await assertNoTrackedSubscriptionConflict({ adminClient: supabaseAdmin, subscription: stripeSubscription });
          } else {
            log.warn("restaurant_subscription_upgrade_no_subscription", { sessionId: session.id });
            break;
          }

          const syncResult = await syncRestaurantSubscriptionRecord({
            adminClient: supabaseAdmin,
            subscription: stripeSubscription,
            stripeMode: event.livemode ? "live" : "test",
            stripeCheckoutSessionId: session.id,
            expectedPreviousStripeSubscriptionId: previousStripeSubscriptionId,
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
              throw error;
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
            stripeEventId: event.id,
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
          stripeEventId: event.id,
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
          // The RPC merges checkout_session_state: "expired" into the existing
          // reservation metadata under a row lock.
          const { error: releaseError } = await supabaseAdmin.rpc(
            "release_zero_attente_checkout_hold",
            {
              p_session_id: session.id,
              p_expected_attempt_id: session.metadata?.payment_attempt_id || null,
              p_reason: asyncPaymentFailed ? "async_payment_failed" : "expired",
            },
          );
          if (releaseError) {
            log.error("zero_attente_hold_release_failed", {
              sessionId: session.id,
              message: releaseError.message,
            });
            throw new Error(`ZERO_ATTENTE_HOLD_RELEASE_FAILED:${releaseError.message}`);
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
            throw new Error(`CHEF_TABLE_HOLD_RELEASE_FAILED:${releaseError.message}`);
          }
        } else if (checkoutKind === "restaurant-credit-pack") {
          const { error: creditPackError } = await supabaseAdmin
            .from("restaurant_credit_purchases")
            .update({
              status: "cancelled",
              updated_at: new Date().toISOString(),
            })
            .eq("payment_attempt_id", session.metadata?.payment_attempt_id || "")
            .eq("status", "pending_payment");
          if (creditPackError) throw new Error(`CREDIT_PACK_HOLD_RELEASE_FAILED:${creditPackError.message}`);
        }

        if (session.metadata?.payment_attempt_version === "2" && session.metadata?.payment_attempt_id) {
          await abandonPaymentAttemptSession({
            adminClient: supabaseAdmin,
            attemptId: session.metadata.payment_attempt_id,
            sessionId: session.id,
            reason: asyncPaymentFailed ? "stripe_async_payment_failed" : "stripe_session_expired",
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { data: transactions, error: transactionsError } = await supabaseAdmin
          .from("payment_transactions")
          .select("order_id, user_id, metadata")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "charge");
        if (transactionsError) throw new Error(`FAILED_PAYMENT_LOOKUP_FAILED:${transactionsError.message}`);
        const paymentTransactions = (transactions || []) as PaymentTransactionRow[];

        for (const transaction of paymentTransactions) {
          if (transaction.order_id) {
            const { error: orderFailureError } = await supabaseAdmin
              .from("orders")
              .update({ status: "payment_failed", payment_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", transaction.order_id);
            if (orderFailureError) throw new Error(`FAILED_PAYMENT_ORDER_UPDATE_FAILED:${orderFailureError.message}`);
          }

          const { error: failedTransactionError } = await supabaseAdmin.from("payment_transactions").insert({
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
          if (failedTransactionError) throw new Error(`FAILED_PAYMENT_TRANSACTION_INSERT_FAILED:${failedTransactionError.message}`);

          const campaignId = getCampaignId(transaction.metadata);

          if (campaignId) {
            const { error: campaignFailureError } = await supabaseAdmin
              .from("ad_campaigns")
              .update({ payment_status: "failed" })
              .eq("id", campaignId);
            if (campaignFailureError) throw new Error(`FAILED_PAYMENT_CAMPAIGN_UPDATE_FAILED:${campaignFailureError.message}`);
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

        const notifiedUsers = new Map<string, number>();
        const refunds = charge.refunds?.data?.length
          ? charge.refunds.data
          : (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data;

        for (const refund of refunds) {
          const recordedAllocations = await recordRefundStatusForKnownTargets({
            adminClient: supabaseAdmin,
            refund,
            event,
          });
          if (refund.status !== "succeeded") continue;
          const refundTargets = recordedAllocations.map((allocation) => allocation.target);

          const refundAmount = Math.max(0, Number(refund.amount || 0) / 100);
          const { data: existingRefundTransactions, error: existingRefundTransactionsError } = await supabaseAdmin
            .from("payment_transactions")
            .select("order_id, user_id, amount, metadata")
            .eq("stripe_mode", event.livemode ? "live" : "test")
            .eq("stripe_refund_id", refund.id)
            .eq("type", "refund")
            .eq("status", "succeeded");
          if (existingRefundTransactionsError) {
            throw new Error(`REFUND_ALLOCATION_LOOKUP_FAILED:${existingRefundTransactionsError.message}`);
          }

          const existingKeys = new Set(
            ((existingRefundTransactions || []) as PaymentTransactionRow[]).map(paymentTransactionTargetKey),
          );
          const expectedByKey = new Map(
            recordedAllocations.map((allocation) => [allocation.target.key, allocation.allocatedCents]),
          );
          for (const existingTransaction of (existingRefundTransactions || []) as PaymentTransactionRow[]) {
            const key = paymentTransactionTargetKey(existingTransaction);
            const expectedCents = expectedByKey.get(key);
            const existingCents = Math.max(0, Math.round(Number(existingTransaction.amount || 0) * 100));
            if (expectedCents == null || expectedCents !== existingCents) {
              throw new Error(
                `REFUND_TRANSACTION_ALLOCATION_MISMATCH:${refund.id}:${key}:${existingCents}:${expectedCents ?? "missing"}`,
              );
            }
          }
          await recordRefundFinance({
            adminClient: supabaseAdmin,
            eventId: event.id,
            paymentIntentId,
            refundSourceId: refund.id,
            refundAmountCents: Number(refund.amount || 0),
            currency: refund.currency || charge.currency || "chf",
            metadata: {
              stripe_charge_id: charge.id,
              stripe_refund_id: refund.id,
              checkout_kind: charge.metadata?.checkout_kind || null,
              finance_routing_mode: charge.metadata?.finance_routing_mode || null,
              demo_environment: charge.metadata?.demo_environment || null,
              no_financial_ledger: charge.metadata?.no_financial_ledger || null,
            },
            log,
          });

          if (
            refundTargets.length > 0
            && refundTargets.every((target) => existingKeys.has(target.key))
          ) {
            log.info("charge_refund_already_recorded", {
              payment_intent_id: paymentIntentId,
              stripe_refund_id: refund.id,
            });
            continue;
          }

          for (const { target: transaction, allocatedCents } of recordedAllocations) {
            if (allocatedCents <= 0 || existingKeys.has(transaction.key)) continue;
            const allocatedAmount = allocatedCents / 100;
            const transactionMetadata = isJsonRecord(transaction.metadata) ? transaction.metadata : {};
            const { error: refundTransactionError } = await supabaseAdmin.from("payment_transactions").insert({
              order_id: transaction.order_id,
              user_id: transaction.user_id,
              stripe_payment_intent_id: paymentIntentId,
              stripe_refund_id: refund.id,
              stripe_mode: event.livemode ? "live" : "test",
              payment_attempt_id: transaction.payment_attempt_id || null,
              stripe_event_id: event.id,
              amount: allocatedAmount,
              currency: refund.currency || charge.currency || "chf",
              type: "refund",
              status: "succeeded",
              metadata: {
                ...transactionMetadata,
                stripe_charge_id: charge.id,
                stripe_refund_id: refund.id,
                stripe_refund_delta_chf: refundAmount,
                stripe_refund_allocation_cents: allocatedCents,
                stripe_webhook_event_id: event.id,
                payment_attempt_id: transaction.payment_attempt_id || null,
                stripe_mode: event.livemode ? "live" : "test",
              },
            });
            if (refundTransactionError && refundTransactionError.code !== "23505") {
              throw new Error(`REFUND_TRANSACTION_INSERT_FAILED:${refundTransactionError.message}`);
            }
            if (!refundTransactionError && transaction.user_id) {
              const previousAmount = notifiedUsers.get(transaction.user_id) || 0;
              notifiedUsers.set(transaction.user_id, Math.round((previousAmount + allocatedAmount) * 100) / 100);
            }
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

      case "refund.created":
      case "refund.updated":
      case "refund.failed":
      case "charge.refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        await recordRefundStatusForKnownTargets({
          adminClient: supabaseAdmin,
          refund,
          event,
        });
        break;
      }

      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const dispute = event.data.object as Stripe.Dispute;
        const action: "opened" | "won" | "lost" = event.type === "charge.dispute.funds_reinstated"
          ? "won"
          : event.type === "charge.dispute.closed"
            ? dispute.status === "won" ? "won" : "lost"
            : event.type === "charge.dispute.updated" && (dispute.status === "won" || dispute.status === "lost")
              ? dispute.status
              : "opened";
        await recordDisputeLedger({
          adminClient: supabaseAdmin,
          stripe,
          dispute,
          event,
          action,
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const eventSubscription = event.data.object as Stripe.Subscription;
        // Subscription events can arrive out of order. Stripe's current object
        // is authoritative; syncing the event snapshot could otherwise revive
        // a canceled subscription or overwrite a newer replacement.
        const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
        currentSubscriptionEvent = subscription;
        // A replacement subscription may already be active when Stripe sends
        // the delayed deletion of the old one. That is not an identity
        // conflict: the sync is still required to close the old row.
        if (event.type !== "customer.subscription.deleted") {
          await assertNoTrackedSubscriptionConflict({ adminClient: supabaseAdmin, subscription });
        }
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

      case "invoice.payment_failed":
      case "invoice.payment_action_required": {
        // Subscription/invoice state is synchronized once after the switch.
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
      if (event.livemode && session.mode === "payment" && session.payment_status === "paid") {
        const paymentIntentId = readStripeObjectId(session.payment_intent);
        const fee = await resolveStripeFeeCents(stripe, paymentIntentId);
        const taxCents = session.total_details?.amount_tax;
        await recordCheckoutFinance({
          adminClient: supabaseAdmin,
          eventId: event.id,
          checkoutSessionId: session.id,
          paymentIntentId,
          checkoutKind: String(session.metadata?.checkout_kind || "order"),
          restaurantId: session.metadata?.restaurant_id || null,
          grossCents: Number(session.amount_total || 0),
          currency: session.currency || "chf",
          livemode: event.livemode,
          metadata: {
            payment_status: session.payment_status,
            finance_routing_mode: session.metadata?.finance_routing_mode || "legacy_manual",
            demo_environment: session.metadata?.demo_environment || null,
            no_financial_ledger: session.metadata?.no_financial_ledger || null,
            platform_fee_amount_cents: session.metadata?.platform_fee_amount_cents || null,
            restaurant_share_amount_cents: session.metadata?.restaurant_share_amount_cents || null,
            tax_cents: taxCents ?? null,
            vat_reconciliation_required: taxCents == null,
            stripe_fee_cents: fee.stripeFeeCents,
            stripe_fee_reconciliation_required: fee.reconciliationRequired,
          },
          log,
        });
      }

      const shouldFinalizeAttempt = session.metadata?.payment_attempt_version === "2"
        && (
          (session.mode === "payment" && session.payment_status === "paid")
          || (session.mode === "subscription" && session.status === "complete")
        );
      if (shouldFinalizeAttempt) {
        await finalizePaymentAttempt({
          adminClient: supabaseAdmin,
          attemptId: session.metadata?.payment_attempt_id || null,
          operationKey: session.metadata?.operation_key || null,
          stripeEventId: event.id,
          checkoutSessionId: session.id,
          paymentIntentId: readStripeObjectId(session.payment_intent),
          subscriptionId: readStripeObjectId(session.subscription),
          livemode: event.livemode,
          amountCents: session.mode === "payment" ? session.amount_total : null,
          currency: session.currency,
          metadata: {
            finalized_by: "stripe-webhook",
            checkout_kind: session.metadata?.checkout_kind || "order",
          },
        });
      }
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const context = await resolveRestaurantInvoiceContext(stripe, invoice);
      const amountPaid = Number(context.invoiceRecord.amount_paid || 0);
      const restaurantId = context.restaurantId
        || await resolveLocalRestaurantIdForStripeSubscription(
          supabaseAdmin,
          context.subscriptionId,
        );

      if ((context.isRestaurantSubscription || restaurantId) && context.subscriptionId && amountPaid > 0) {
        const paidAtTimestamp = finiteUnixTimestamp(context.invoiceRecord.status_transitions?.paid_at)
          || finiteUnixTimestamp(event.created);
        const { error: invoicePaidError } = await supabaseAdmin.rpc(
          "record_restaurant_subscription_invoice_paid",
          {
            p_stripe_event_id: event.id,
            p_stripe_invoice_id: invoice.id,
            p_stripe_subscription_id: context.subscriptionId,
            p_stripe_customer_id: context.stripeCustomerId,
            p_restaurant_id: restaurantId,
            p_amount_paid_cents: Math.round(amountPaid),
            p_currency: String(invoice.currency || "chf").toLowerCase(),
            p_billing_reason: String(context.invoiceRecord.billing_reason || ""),
            p_paid_at: paidAtTimestamp
              ? new Date(paidAtTimestamp * 1000).toISOString()
              : new Date().toISOString(),
            p_period_start: context.periodStart,
            p_period_end: context.periodEnd,
            p_stripe_mode: event.livemode ? "live" : "test",
            p_metadata: {
              event_type: event.type,
              invoice_status: invoice.status || null,
              stripe_subscription_status: context.subscription?.status || null,
              activation_job_id: context.subscriptionMetadata.activation_job_id || null,
              internal_invoice_id: context.subscriptionMetadata.internal_invoice_id || null,
              restaurant_subscription_plan_id:
                context.subscriptionMetadata.restaurant_subscription_plan_id || null,
            },
          },
        );

        if (invoicePaidError) {
          throw new Error(`restaurant_subscription_invoice_paid_rpc_failed:${invoicePaidError.message}`);
        }
      }

      // Production finance stays live-only. recordCheckoutFinance posts the
      // authoritative TOK/developer split, including the fixed 10% developer
      // payable, and is idempotent for duplicate Stripe invoice events.
      if (event.livemode && amountPaid > 0) {
        const invoicePaymentIntentId = getExpandableStripeId(
          context.invoiceRecord.payment_intent,
        );
        const fee = await resolveStripeFeeCents(stripe, invoicePaymentIntentId);
        const taxCents = Number.isFinite(Number(context.invoiceRecord.total_tax_amounts?.reduce(
          (sum: number, tax: Record<string, unknown>) => sum + Number(tax.amount || 0),
          0,
        )))
          ? Number(context.invoiceRecord.total_tax_amounts.reduce(
            (sum: number, tax: Record<string, unknown>) => sum + Number(tax.amount || 0),
            0,
          ))
          : null;

        await recordCheckoutFinance({
          adminClient: supabaseAdmin,
          eventId: event.id,
          checkoutSessionId: invoice.id,
          paymentIntentId: invoicePaymentIntentId,
          checkoutKind: context.checkoutKind,
          restaurantId,
          grossCents: amountPaid,
          currency: invoice.currency || "chf",
          livemode: event.livemode,
          sourceType: "stripe_invoice",
          metadata: {
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: context.subscriptionId,
            billing_reason: context.invoiceRecord.billing_reason || null,
            tax_cents: taxCents,
            vat_reconciliation_required: taxCents == null,
            stripe_fee_cents: fee.stripeFeeCents,
            stripe_fee_reconciliation_required: fee.reconciliationRequired,
            activation_job_id: context.subscriptionMetadata.activation_job_id || null,
            internal_invoice_id: context.subscriptionMetadata.internal_invoice_id || null,
          },
          log,
        });
      }
    }

    if (
      event.type === "invoice.payment_failed"
      || event.type === "invoice.payment_action_required"
    ) {
      const eventInvoice = event.data.object as Stripe.Invoice;
      // Stripe does not guarantee event delivery order. Re-read the Invoice so
      // a delayed failure/action-required event cannot regress an invoice that
      // has since been paid.
      const invoice = await stripe.invoices.retrieve(eventInvoice.id);
      if (invoice.status === "paid") {
        log.info("restaurant_subscription_stale_invoice_failure_ignored", {
          eventType: event.type,
          invoiceId: invoice.id,
        });
      } else {
        const context = await resolveRestaurantInvoiceContext(stripe, invoice);
        const restaurantId = context.restaurantId
          || await resolveLocalRestaurantIdForStripeSubscription(
            supabaseAdmin,
            context.subscriptionId,
          );

        if ((context.isRestaurantSubscription || restaurantId) && context.subscriptionId) {
          const nextPaymentAttempt = finiteUnixTimestamp(context.invoiceRecord.next_payment_attempt);
          const { error: invoiceFailedError } = await supabaseAdmin.rpc(
            "record_restaurant_subscription_invoice_payment_failed",
            {
              p_stripe_event_id: event.id,
              p_stripe_invoice_id: invoice.id,
              p_stripe_subscription_id: context.subscriptionId,
              p_stripe_customer_id: context.stripeCustomerId,
              p_restaurant_id: restaurantId,
              p_amount_due_cents: Math.max(0, Math.round(Number(context.invoiceRecord.amount_due || 0))),
              p_currency: String(invoice.currency || "chf").toLowerCase(),
              p_attempt_count: Math.max(0, Math.round(Number(context.invoiceRecord.attempt_count || 0))),
              p_next_payment_attempt: nextPaymentAttempt
                ? new Date(nextPaymentAttempt * 1000).toISOString()
                : null,
              p_stripe_mode: event.livemode ? "live" : "test",
              p_metadata: {
                event_type: event.type,
                payment_action_required: event.type === "invoice.payment_action_required",
                invoice_status: invoice.status || null,
                stripe_subscription_status: context.subscription?.status || null,
                activation_job_id: context.subscriptionMetadata.activation_job_id || null,
                internal_invoice_id: context.subscriptionMetadata.internal_invoice_id || null,
                restaurant_subscription_plan_id:
                  context.subscriptionMetadata.restaurant_subscription_plan_id || null,
              },
            },
          );

          if (invoiceFailedError) {
            throw new Error(`restaurant_subscription_invoice_failed_rpc_failed:${invoiceFailedError.message}`);
          }
        }
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = getExpandableStripeId(charge.payment_intent);
      const resolvedInvoice = await resolveInvoiceContextFromPaymentIntent(
        stripe,
        paymentIntentId,
      );
      const restaurantId = resolvedInvoice?.context.restaurantId
        || await resolveLocalRestaurantIdForStripeSubscription(
          supabaseAdmin,
          resolvedInvoice?.context.subscriptionId || null,
        );

      if (
        resolvedInvoice
        && (resolvedInvoice.context.isRestaurantSubscription || restaurantId)
        && resolvedInvoice.context.subscriptionId
      ) {
        const amountReversedCents = Math.max(0, Math.round(Number(charge.amount_refunded || 0)));
        const fullReversal = Boolean(
          charge.refunded
          || (Number(charge.amount || 0) > 0 && amountReversedCents >= Number(charge.amount || 0)),
        );
        const chargeRefunds = charge.refunds?.data || [];
        const latestRefund = chargeRefunds[chargeRefunds.length - 1];
        const { error: reversalError } = await supabaseAdmin.rpc(
          "record_restaurant_subscription_payment_reversed",
          {
            p_stripe_event_id: event.id,
            p_event_type: "charge_refunded",
            p_stripe_charge_id: charge.id,
            p_stripe_dispute_id: null,
            p_stripe_invoice_id: resolvedInvoice.invoice.id,
            p_stripe_subscription_id: resolvedInvoice.context.subscriptionId,
            p_restaurant_id: restaurantId,
            p_amount_reversed_cents: amountReversedCents,
            p_currency: String(charge.currency || resolvedInvoice.invoice.currency || "chf").toLowerCase(),
            p_full_reversal: fullReversal,
            p_reason: latestRefund?.reason || null,
            p_stripe_mode: event.livemode ? "live" : "test",
            p_metadata: {
              payment_intent_id: paymentIntentId,
              activation_job_id:
                resolvedInvoice.context.subscriptionMetadata.activation_job_id || null,
              internal_invoice_id:
                resolvedInvoice.context.subscriptionMetadata.internal_invoice_id || null,
              charge_amount_cents: Number(charge.amount || 0),
            },
          },
        );

        if (reversalError) {
          throw new Error(`restaurant_subscription_reversal_rpc_failed:${reversalError.message}`);
        }
      }
    }

    if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const stripeChargeId = getExpandableStripeId(dispute.charge);
      let paymentIntentId = getExpandableStripeId(dispute.payment_intent);
      if (!paymentIntentId && stripeChargeId) {
        const disputeCharge = await stripe.charges.retrieve(stripeChargeId);
        paymentIntentId = getExpandableStripeId(disputeCharge.payment_intent);
      }

      const resolvedInvoice = await resolveInvoiceContextFromPaymentIntent(
        stripe,
        paymentIntentId,
      );
      const restaurantId = resolvedInvoice?.context.restaurantId
        || await resolveLocalRestaurantIdForStripeSubscription(
          supabaseAdmin,
          resolvedInvoice?.context.subscriptionId || null,
        );
      if (
        resolvedInvoice
        && (resolvedInvoice.context.isRestaurantSubscription || restaurantId)
        && resolvedInvoice.context.subscriptionId
      ) {
        const amountReversedCents = Math.max(0, Math.round(Number(dispute.amount || 0)));
        const invoiceAmountPaid = Math.max(
          0,
          Math.round(Number(resolvedInvoice.context.invoiceRecord.amount_paid || 0)),
        );
        const { error: disputeError } = await supabaseAdmin.rpc(
          "record_restaurant_subscription_payment_reversed",
          {
            p_stripe_event_id: event.id,
            p_event_type: "charge_dispute_created",
            p_stripe_charge_id: stripeChargeId,
            p_stripe_dispute_id: dispute.id,
            p_stripe_invoice_id: resolvedInvoice.invoice.id,
            p_stripe_subscription_id: resolvedInvoice.context.subscriptionId,
            p_restaurant_id: restaurantId,
            p_amount_reversed_cents: amountReversedCents,
            p_currency: String(dispute.currency || resolvedInvoice.invoice.currency || "chf").toLowerCase(),
            p_full_reversal: invoiceAmountPaid > 0 && amountReversedCents >= invoiceAmountPaid,
            p_reason: dispute.reason || null,
            p_stripe_mode: event.livemode ? "live" : "test",
            p_metadata: {
              payment_intent_id: paymentIntentId,
              dispute_status: dispute.status,
              activation_job_id:
                resolvedInvoice.context.subscriptionMetadata.activation_job_id || null,
              internal_invoice_id:
                resolvedInvoice.context.subscriptionMetadata.internal_invoice_id || null,
            },
          },
        );

        if (disputeError) {
          throw new Error(`restaurant_subscription_dispute_rpc_failed:${disputeError.message}`);
        }
      }
    }

    if (
      currentSubscriptionEvent
      && ["canceled", "incomplete_expired"].includes(
        String(currentSubscriptionEvent.status || ""),
      )
    ) {
      const subscription = currentSubscriptionEvent;
      const metadata = subscription.metadata || {};
      const checkoutKind = String(metadata.checkout_kind || "");
      const restaurantId = String(metadata.restaurant_id || "")
        || await resolveLocalRestaurantIdForStripeSubscription(
          supabaseAdmin,
          subscription.id,
        );
      const isRestaurantSubscription = Boolean(
        restaurantId
        || checkoutKind === "restaurant-onboarding"
        || checkoutKind.startsWith("restaurant-subscription"),
      );

      if (isRestaurantSubscription) {
        const cancelledAt = finiteUnixTimestamp(subscription.canceled_at)
          || finiteUnixTimestamp(event.created);
        const cancellationDetails = subscription.cancellation_details;
        const cancellationReason = cancellationDetails?.reason
          || cancellationDetails?.feedback
          || cancellationDetails?.comment
          || null;
        const { error: cancellationError } = await supabaseAdmin.rpc(
          "record_restaurant_subscription_cancelled_before_payment",
          {
            p_stripe_event_id: event.id,
            p_stripe_subscription_id: subscription.id,
            p_restaurant_id: restaurantId,
            p_cancelled_at: cancelledAt
              ? new Date(cancelledAt * 1000).toISOString()
              : new Date().toISOString(),
            p_reason: cancellationReason,
            p_stripe_mode: event.livemode ? "live" : "test",
            p_metadata: {
              event_type: event.type,
              stripe_subscription_status: subscription.status,
              activation_job_id: metadata.activation_job_id || null,
              internal_invoice_id: metadata.internal_invoice_id || null,
            },
          },
        );

        if (cancellationError) {
          throw new Error(`restaurant_subscription_cancellation_rpc_failed:${cancellationError.message}`);
        }
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

    await markStripeWebhookEventSucceeded({ adminClient: supabaseAdmin, event, lockToken: eventLockToken });
  } catch (error) {
    log.error("event_processing_error", { eventType: event.type, message: error instanceof Error ? error.message : "unknown" });
    try {
      await markStripeWebhookEventFailed({
        adminClient: supabaseAdmin,
        event,
        error,
        log,
        lockToken: eventLockToken,
      });
    } catch {
      // Keep returning 500: Stripe will retry and the expired lease is
      // reclaimable even if recording this failure temporarily failed.
    }
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
