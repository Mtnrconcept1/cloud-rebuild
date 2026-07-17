import { HttpError } from "./auth.ts";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
} from "./payment-attempts.ts";

export const TOK_PLATFORM_FEE_BPS = 1000;
export const TOK_DEVELOPER_SHARE_BPS = 1000;

export const MARKETPLACE_CHECKOUT_KINDS = new Set([
  "order",
  "zero-attente",
  "chefs-table",
  "match-group",
]);

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type LoggerLike = {
  info?: (event: string, data?: Record<string, unknown>) => void;
  warn?: (event: string, data?: Record<string, unknown>) => void;
};

function normalizeKind(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function toInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function toNullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function isFinanceExcludedDemo(input: {
  checkoutKind: unknown;
  metadata?: Record<string, unknown>;
}) {
  const metadata = input.metadata || {};
  return normalizeKind(input.checkoutKind) === "commercial-demo-order"
    || normalizeKind(metadata.demo_environment) === "commercial_demo"
    || normalizeKind(metadata.finance_routing_mode) === "demo_isolated"
    || String(metadata.no_financial_ledger || "").trim().toLowerCase() === "true";
}

export function calculateMarketplaceSplit(grossCents: number, platformFeeBps = TOK_PLATFORM_FEE_BPS) {
  const safeGrossCents = Math.max(0, toInteger(grossCents));
  const safePlatformFeeBps = Math.min(10000, Math.max(0, toInteger(platformFeeBps)));
  const platformFeeCents = Math.min(
    safeGrossCents,
    Math.round((safeGrossCents * safePlatformFeeBps) / 10000),
  );

  return {
    grossCents: safeGrossCents,
    platformFeeBps: safePlatformFeeBps,
    platformFeeCents,
    restaurantShareCents: safeGrossCents - platformFeeCents,
  };
}

export function calculateDeveloperRevenueSplit(
  tokOwnedRevenueCents: number,
  developerShareBps = TOK_DEVELOPER_SHARE_BPS,
) {
  const safeTokOwnedRevenueCents = Math.max(0, toInteger(tokOwnedRevenueCents));
  const safeDeveloperShareBps = Math.min(10000, Math.max(0, toInteger(developerShareBps)));
  const developerShareCents = Math.min(
    safeTokOwnedRevenueCents,
    Math.round((safeTokOwnedRevenueCents * safeDeveloperShareBps) / 10000),
  );

  return {
    developerShareBps: safeDeveloperShareBps,
    developerShareCents,
    tokNetRevenueCents: safeTokOwnedRevenueCents - developerShareCents,
  };
}

export function calculateOrderPaymentDistribution(
  grossCents: number,
  platformFeeBps = TOK_PLATFORM_FEE_BPS,
  developerShareBps = TOK_DEVELOPER_SHARE_BPS,
) {
  const marketplace = calculateMarketplaceSplit(grossCents, platformFeeBps);
  const developer = calculateDeveloperRevenueSplit(
    marketplace.platformFeeCents,
    developerShareBps,
  );

  return {
    ...marketplace,
    ...developer,
  };
}

export async function resolveMarketplaceRouting(input: {
  adminClient: SupabaseLike;
  checkoutKind: unknown;
  restaurantId: string;
  grossCents: number;
  stripeMode?: "live" | "test";
}) {
  const checkoutKind = normalizeKind(input.checkoutKind);
  const stripeMode = input.stripeMode || "live";
  if (!MARKETPLACE_CHECKOUT_KINDS.has(checkoutKind)) {
    const tokOwnedSplit = calculateMarketplaceSplit(input.grossCents, 10000);
    return {
      enabled: false,
      mode: "tok_owned" as const,
      destinationAccountId: null,
      ...tokOwnedSplit,
      ...calculateDeveloperRevenueSplit(
        tokOwnedSplit.platformFeeCents,
        TOK_DEVELOPER_SHARE_BPS,
      ),
    };
  }

  if (!input.restaurantId) {
    throw new HttpError(400, "Restaurant manquant pour la repartition du paiement.");
  }

  const { data: financeConfig, error: financeConfigError } = await input.adminClient
    .from("finance_runtime_config")
    .select("connect_routing_enabled, platform_fee_bps, developer_share_bps, reservation_fee_cents")
    .eq("config_key", "default")
    .maybeSingle();

  if (financeConfigError) {
    throw new HttpError(500, financeConfigError.message);
  }

  const distribution = calculateOrderPaymentDistribution(
    input.grossCents,
    Number(financeConfig?.platform_fee_bps ?? TOK_PLATFORM_FEE_BPS),
    Number(financeConfig?.developer_share_bps ?? TOK_DEVELOPER_SHARE_BPS),
  );

  if (!financeConfig?.connect_routing_enabled) {
    if (stripeMode === "live") {
      throw new HttpError(
        503,
        "MARKETPLACE_CONNECT_ROUTING_NOT_READY: le paiement en ligne est suspendu jusqu'a l'activation des virements Stripe Connect.",
      );
    }
    return {
      enabled: false,
      mode: "legacy_manual" as const,
      destinationAccountId: null,
      ...distribution,
    };
  }

  const { data: restaurant, error: restaurantError } = await input.adminClient
    .from("restaurants")
    .select("id, stripe_account_id, stripe_connect_details_submitted, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, stripe_connect_requirements_due")
    .eq("id", input.restaurantId)
    .maybeSingle();

  if (restaurantError) throw new HttpError(500, restaurantError.message);
  if (!restaurant) throw new HttpError(404, "Restaurant introuvable.");

  const requirementsDue = Array.isArray(restaurant.stripe_connect_requirements_due)
    ? restaurant.stripe_connect_requirements_due.filter(Boolean)
    : [];
  const ready = Boolean(
    restaurant.stripe_account_id
    && restaurant.stripe_connect_details_submitted
    && restaurant.stripe_connect_charges_enabled
    && restaurant.stripe_connect_payouts_enabled
    && requirementsDue.length === 0,
  );

  if (!ready) {
    throw new HttpError(
      409,
      "Le compte de paiement du restaurant doit terminer la verification Stripe avant de recevoir des commandes payees en ligne.",
    );
  }

  return {
    enabled: true,
    mode: "stripe_connect_destination" as const,
    destinationAccountId: String(restaurant.stripe_account_id),
    ...distribution,
  };
}

export async function recordCheckoutFinance(input: {
  adminClient: SupabaseLike;
  eventId: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  checkoutKind: string;
  restaurantId: string | null;
  grossCents: number;
  currency: string;
  livemode: boolean;
  metadata?: Record<string, unknown>;
  sourceType?: "stripe_checkout" | "stripe_invoice";
  log?: LoggerLike;
}) {
  if (input.grossCents <= 0) return;
  if (isFinanceExcludedDemo(input)) {
    input.log?.warn?.("commercial_demo_finance_write_blocked", {
      event_id: input.eventId,
      checkout_session_id: input.checkoutSessionId,
      checkout_kind: input.checkoutKind,
    });
    return;
  }

  const { error } = await input.adminClient.rpc("record_marketplace_checkout_ledger", {
    p_stripe_event_id: input.eventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_checkout_kind: normalizeKind(input.checkoutKind),
    p_restaurant_id: input.restaurantId || null,
    p_gross_cents: Math.max(0, toInteger(input.grossCents)),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_livemode: input.livemode,
    p_metadata: input.metadata || {},
    p_source_type: input.sourceType || "stripe_checkout",
  });

  if (error) throw new Error(error.message);

  const { error: feeError } = await input.adminClient.rpc("record_stripe_tax_fee_ledger", {
    p_stripe_event_id: input.eventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_tax_cents: toNullableInteger(input.metadata?.tax_cents),
    p_stripe_fee_cents: toNullableInteger(input.metadata?.stripe_fee_cents),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_metadata: input.metadata || {},
  });
  if (feeError) throw new Error(feeError.message);

  input.log?.info?.("marketplace_checkout_ledger_recorded", {
    event_id: input.eventId,
    checkout_session_id: input.checkoutSessionId,
    checkout_kind: input.checkoutKind,
    gross_cents: input.grossCents,
  });
}

/**
 * Record finance from an authenticated recovery path under the same durable
 * lease contract as a Stripe webhook. The synthetic event id is canonical per
 * Checkout Session, so browser recovery and scheduled reconciliation cannot
 * execute the accounting path twice.
 */
export async function recordReconciledCheckoutFinance(
  input: Omit<Parameters<typeof recordCheckoutFinance>[0], "eventId">,
) {
  const eventId = `internal:checkout-reconciliation:${input.checkoutSessionId}`;
  const claim = await claimStripeWebhookEvent({
    adminClient: input.adminClient,
    eventId,
    eventType: "internal.checkout.reconciliation",
    livemode: input.livemode,
  });

  if (claim.duplicate) return { recorded: false, duplicate: true };
  if (claim.inProgress || !claim.claimed || !claim.lockToken) {
    throw new Error("FINANCE_RECONCILIATION_IN_PROGRESS");
  }

  try {
    await recordCheckoutFinance({ ...input, eventId });
    await completeStripeWebhookEvent({
      adminClient: input.adminClient,
      eventId,
      lockToken: claim.lockToken,
      success: true,
    });
    return { recorded: true, duplicate: false };
  } catch (error) {
    try {
      await completeStripeWebhookEvent({
        adminClient: input.adminClient,
        eventId,
        lockToken: claim.lockToken,
        success: false,
        error: error instanceof Error ? error.message : "finance_reconciliation_failed",
      });
    } catch {
      // A lost completion lease remains retryable by the next reconciler.
    }
    throw error;
  }
}

export async function recordRefundFinance(input: {
  adminClient: SupabaseLike;
  eventId: string;
  paymentIntentId: string;
  refundSourceId: string;
  refundAmountCents: number;
  currency: string;
  metadata?: Record<string, unknown>;
  log?: LoggerLike;
}) {
  if (input.refundAmountCents <= 0) return;
  if (isFinanceExcludedDemo({
    checkoutKind: input.metadata?.checkout_kind,
    metadata: input.metadata,
  })) {
    input.log?.warn?.("commercial_demo_refund_finance_write_blocked", {
      event_id: input.eventId,
      payment_intent_id: input.paymentIntentId,
      refund_source_id: input.refundSourceId,
    });
    return;
  }

  const { data: demoOrder, error: demoOrderError } = await input.adminClient
    .from("commercial_demo_orders")
    .select("id")
    .eq("stripe_payment_intent_id", input.paymentIntentId)
    .maybeSingle();
  if (demoOrderError) throw new Error(demoOrderError.message);
  if (demoOrder) {
    input.log?.warn?.("commercial_demo_refund_finance_write_blocked", {
      event_id: input.eventId,
      payment_intent_id: input.paymentIntentId,
      refund_source_id: input.refundSourceId,
    });
    return;
  }

  const { error } = await input.adminClient.rpc("record_marketplace_refund_ledger", {
    p_stripe_event_id: input.eventId,
    p_payment_intent_id: input.paymentIntentId,
    p_refund_source_id: input.refundSourceId,
    p_refund_amount_cents: Math.max(0, toInteger(input.refundAmountCents)),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_metadata: input.metadata || {},
  });

  if (error) throw new Error(error.message);
  input.log?.info?.("marketplace_refund_ledger_recorded", {
    event_id: input.eventId,
    payment_intent_id: input.paymentIntentId,
    refund_amount_cents: input.refundAmountCents,
  });
}
