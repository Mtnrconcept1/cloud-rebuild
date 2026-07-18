import { HttpError } from "./auth.ts";
import {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
} from "./payment-attempts.ts";

export const TOK_PLATFORM_FEE_BPS = 990;
export const TOK_DEVELOPER_SHARE_BPS = 1000;
export const TOK_ORDER_DEVELOPER_SHARE_BPS = 100;
export const FAIR_GROWTH_PRICING_VERSION = "fair_growth_2026_07";
export const MAX_FAIR_GROWTH_PLATFORM_FEE_BPS = 990;

export const MARKETPLACE_CHECKOUT_KINDS = new Set([
  "order",
  "zero-attente",
  "chefs-table",
  "match-group",
]);

// Reduced marketplace rates are an entitlement, not merely a selected plan.
// Fail closed to Starter pricing whenever payment/activation is incomplete,
// delinquent or paused.
const ENTITLED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
]);

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type LoggerLike = {
  info?: (event: string, data?: Record<string, unknown>) => void;
  warn?: (event: string, data?: Record<string, unknown>) => void;
};

type MarketplaceMoneyBasis = {
  commissionableCents?: number;
  tipCents?: number;
  deliveryPassThroughCents?: number;
};

type FairGrowthPricingSnapshot = {
  platformFeeBps: number;
  pricingPlanId: string | null;
  pricingPlanSlug: string | null;
  pricingVersion: string;
  pricingRateSource: "subscription_snapshot" | "subscription_plan" | "runtime_default";
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

function toBasisPoints(
  value: unknown,
  label: string,
  maximum = 10000,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new HttpError(503, `FAIR_GROWTH_INVALID_${label.toUpperCase()}`);
  }
  return parsed;
}

function toOptionalBasisPoints(
  value: unknown,
  label: string,
  maximum = 10000,
) {
  if (value === null || value === undefined || value === "") return null;
  return toBasisPoints(value, label, maximum);
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

export function calculateMarketplaceSplit(
  grossCents: number,
  platformFeeBps = TOK_PLATFORM_FEE_BPS,
  basis: MarketplaceMoneyBasis = {},
) {
  const safeGrossCents = Math.max(0, toInteger(grossCents));
  const safePlatformFeeBps = Math.min(10000, Math.max(0, toInteger(platformFeeBps)));
  const tipCents = Math.max(0, toInteger(basis.tipCents));
  const deliveryPassThroughCents = Math.max(0, toInteger(basis.deliveryPassThroughCents));
  const commissionableCents = basis.commissionableCents === undefined
    ? safeGrossCents - tipCents - deliveryPassThroughCents
    : Math.max(0, toInteger(basis.commissionableCents));

  if (commissionableCents + tipCents + deliveryPassThroughCents > safeGrossCents) {
    throw new Error("INVALID_MARKETPLACE_MONEY_BASIS");
  }

  const otherNonCommissionableCents = safeGrossCents
    - commissionableCents
    - tipCents
    - deliveryPassThroughCents;
  const platformFeeCents = Math.min(
    commissionableCents,
    Math.round((commissionableCents * safePlatformFeeBps) / 10000),
  );
  const restaurantShareCents = commissionableCents
    - platformFeeCents
    + tipCents
    + otherNonCommissionableCents;
  const stripeApplicationFeeCents = platformFeeCents + deliveryPassThroughCents;

  return {
    grossCents: safeGrossCents,
    commissionableCents,
    tipCents,
    deliveryPassThroughCents,
    otherNonCommissionableCents,
    platformFeeBps: safePlatformFeeBps,
    platformFeeCents,
    restaurantShareCents,
    restaurantTransferCents: safeGrossCents - stripeApplicationFeeCents,
    stripeApplicationFeeCents,
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
  basis: MarketplaceMoneyBasis = {},
) {
  const marketplace = calculateMarketplaceSplit(grossCents, platformFeeBps, basis);
  const developerShareCents = Math.min(
    marketplace.platformFeeCents,
    Math.round(
      (marketplace.commissionableCents * TOK_ORDER_DEVELOPER_SHARE_BPS) / 10000,
    ),
  );

  return {
    ...marketplace,
    developerOrderBps: TOK_ORDER_DEVELOPER_SHARE_BPS,
    developerShareBps: TOK_ORDER_DEVELOPER_SHARE_BPS,
    developerShareCents,
    tokNetRevenueCents: marketplace.platformFeeCents - developerShareCents,
  };
}

async function resolveFairGrowthPricingSnapshot(input: {
  adminClient: SupabaseLike;
  restaurantId: string;
  financeConfig: Record<string, unknown> | null;
}): Promise<FairGrowthPricingSnapshot> {
  const { data: subscription, error: subscriptionError } = await input.adminClient
    .from("restaurant_ai_subscriptions")
    .select(
      "restaurant_subscription_plan_id, plan, status, marketplace_commission_bps_snapshot, developer_order_bps_snapshot, pricing_version_snapshot",
    )
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle();

  if (subscriptionError) {
    throw new HttpError(500, subscriptionError.message);
  }

  if (subscription && ENTITLED_SUBSCRIPTION_STATUSES.has(String(subscription.status || ""))) {
    const snapshotRate = toOptionalBasisPoints(
      subscription.marketplace_commission_bps_snapshot,
      "subscription_marketplace_commission_bps_snapshot",
      MAX_FAIR_GROWTH_PLATFORM_FEE_BPS,
    );
    const snapshotDeveloperRate = toOptionalBasisPoints(
      subscription.developer_order_bps_snapshot,
      "subscription_developer_order_bps_snapshot",
      TOK_ORDER_DEVELOPER_SHARE_BPS,
    );
    if (
      snapshotDeveloperRate !== null
      && snapshotDeveloperRate !== TOK_ORDER_DEVELOPER_SHARE_BPS
    ) {
      throw new HttpError(503, "FAIR_GROWTH_DEVELOPER_ORDER_RATE_MISMATCH");
    }
    if (snapshotRate !== null) {
      return {
        platformFeeBps: snapshotRate,
        pricingPlanId: String(subscription.restaurant_subscription_plan_id || "") || null,
        pricingPlanSlug: String(subscription.plan || "") || null,
        pricingVersion: String(
          subscription.pricing_version_snapshot || FAIR_GROWTH_PRICING_VERSION,
        ),
        pricingRateSource: "subscription_snapshot",
      };
    }

    const planId = String(subscription.restaurant_subscription_plan_id || "");
    const planSlug = String(subscription.plan || "");
    if (planId || planSlug) {
      let planQuery = input.adminClient
        .from("restaurant_subscription_plans")
        .select("id, slug, marketplace_commission_bps, developer_order_bps, pricing_version");
      planQuery = planId ? planQuery.eq("id", planId) : planQuery.eq("slug", planSlug);
      const { data: plan, error: planError } = await planQuery.maybeSingle();
      if (planError) throw new HttpError(500, planError.message);
      if (plan) {
        const planDeveloperRate = toBasisPoints(
          plan.developer_order_bps,
          "plan_developer_order_bps",
          TOK_ORDER_DEVELOPER_SHARE_BPS,
        );
        if (planDeveloperRate !== TOK_ORDER_DEVELOPER_SHARE_BPS) {
          throw new HttpError(503, "FAIR_GROWTH_DEVELOPER_ORDER_RATE_MISMATCH");
        }
        return {
          platformFeeBps: toBasisPoints(
            plan.marketplace_commission_bps,
            "plan_marketplace_commission_bps",
            MAX_FAIR_GROWTH_PLATFORM_FEE_BPS,
          ),
          pricingPlanId: String(plan.id || "") || null,
          pricingPlanSlug: String(plan.slug || "") || null,
          pricingVersion: String(plan.pricing_version || FAIR_GROWTH_PRICING_VERSION),
          pricingRateSource: "subscription_plan",
        };
      }
    }
  }

  const configMetadata = input.financeConfig?.metadata
    && typeof input.financeConfig.metadata === "object"
    && !Array.isArray(input.financeConfig.metadata)
    ? input.financeConfig.metadata as Record<string, unknown>
    : {};

  return {
    platformFeeBps: toBasisPoints(
      input.financeConfig?.platform_fee_bps ?? TOK_PLATFORM_FEE_BPS,
      "runtime_platform_fee_bps",
      MAX_FAIR_GROWTH_PLATFORM_FEE_BPS,
    ),
    pricingPlanId: null,
    pricingPlanSlug: null,
    pricingVersion: String(configMetadata.pricing_version || FAIR_GROWTH_PRICING_VERSION),
    pricingRateSource: "runtime_default",
  };
}

export async function resolveMarketplaceRouting(input: {
  adminClient: SupabaseLike;
  checkoutKind: unknown;
  restaurantId: string;
  grossCents: number;
  commissionableCents?: number;
  tipCents?: number;
  deliveryPassThroughCents?: number;
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
      pricingPlanId: null,
      pricingPlanSlug: null,
      pricingVersion: FAIR_GROWTH_PRICING_VERSION,
      pricingRateSource: "runtime_default" as const,
      developerOrderBps: null,
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
    .select("connect_routing_enabled, platform_fee_bps, developer_share_bps, reservation_fee_cents, metadata")
    .eq("config_key", "default")
    .maybeSingle();

  if (financeConfigError) {
    throw new HttpError(500, financeConfigError.message);
  }

  const pricingSnapshot = await resolveFairGrowthPricingSnapshot({
    adminClient: input.adminClient,
    restaurantId: input.restaurantId,
    financeConfig: financeConfig as Record<string, unknown> | null,
  });
  const distribution = calculateOrderPaymentDistribution(
    input.grossCents,
    pricingSnapshot.platformFeeBps,
    {
      commissionableCents: input.commissionableCents,
      tipCents: input.tipCents,
      deliveryPassThroughCents: input.deliveryPassThroughCents,
    },
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
      ...pricingSnapshot,
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
    ...pricingSnapshot,
    ...distribution,
  };
}

const SEALED_FINANCE_FIELDS = [
  "finance_snapshot_version",
  "finance_routing_mode",
  "gross_amount_cents",
  "commissionable_cents",
  "tip_cents",
  "delivery_pass_through_cents",
  "platform_fee_bps",
  "platform_fee_amount_cents",
  "stripe_application_fee_amount_cents",
  "restaurant_share_amount_cents",
  "restaurant_transfer_amount_cents",
  "developer_order_bps",
  "developer_share_bps",
  "developer_share_amount_cents",
  "tok_net_amount_cents",
  "pricing_plan_id",
  "pricing_plan_slug",
  "pricing_version",
  "pricing_rate_source",
] as const;

const MATCH_GROUP_RATE_SNAPSHOT_FIELDS = [
  "finance_snapshot_version",
  "finance_routing_mode",
  "platform_fee_bps",
  "developer_order_bps",
  "pricing_plan_id",
  "pricing_plan_slug",
  "pricing_version",
  "pricing_rate_source",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireMetadataInteger(
  metadata: Record<string, unknown>,
  field: string,
) {
  const raw = String(metadata[field] ?? "").trim();
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`MARKETPLACE_FINANCE_SNAPSHOT_INVALID_${field.toUpperCase()}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`MARKETPLACE_FINANCE_SNAPSHOT_INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function assertSameSnapshotFields(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  fields: readonly string[],
) {
  for (const field of fields) {
    if (String(actual[field] ?? "") !== String(expected[field] ?? "")) {
      throw new Error(`MARKETPLACE_FINANCE_SNAPSHOT_MISMATCH_${field.toUpperCase()}`);
    }
  }
}

async function assertSealedMarketplaceFinanceSnapshot(input: {
  adminClient: SupabaseLike;
  checkoutKind: string;
  checkoutSessionId: string;
  restaurantId: string | null;
  grossCents: number;
  currency: string;
  livemode: boolean;
  metadata: Record<string, unknown>;
}) {
  if (!MARKETPLACE_CHECKOUT_KINDS.has(input.checkoutKind)) {
    return input.metadata;
  }

  const metadata = input.metadata;
  if (String(metadata.finance_snapshot_version || "") !== "fair_growth_v1") {
    throw new Error("MARKETPLACE_FINANCE_SNAPSHOT_VERSION_MISSING");
  }

  const grossCents = requireMetadataInteger(metadata, "gross_amount_cents");
  const commissionableCents = requireMetadataInteger(metadata, "commissionable_cents");
  const tipCents = requireMetadataInteger(metadata, "tip_cents");
  const deliveryPassThroughCents = requireMetadataInteger(
    metadata,
    "delivery_pass_through_cents",
  );
  const platformFeeBps = requireMetadataInteger(metadata, "platform_fee_bps");
  const developerOrderBps = requireMetadataInteger(metadata, "developer_order_bps");

  if (
    grossCents !== Math.max(0, toInteger(input.grossCents))
    || String(input.currency || "").toUpperCase() !== "CHF"
    || platformFeeBps > MAX_FAIR_GROWTH_PLATFORM_FEE_BPS
    || developerOrderBps !== TOK_ORDER_DEVELOPER_SHARE_BPS
    || String(metadata.developer_share_bps || "") !== String(TOK_ORDER_DEVELOPER_SHARE_BPS)
    || !String(metadata.pricing_version || "").trim()
  ) {
    throw new Error("MARKETPLACE_FINANCE_SNAPSHOT_INTEGRITY_MISMATCH");
  }

  const expectedDistribution = calculateOrderPaymentDistribution(
    grossCents,
    platformFeeBps,
    { commissionableCents, tipCents, deliveryPassThroughCents },
  );
  const expectedAmounts: Record<string, number> = {
    platform_fee_amount_cents: expectedDistribution.platformFeeCents,
    stripe_application_fee_amount_cents:
      expectedDistribution.stripeApplicationFeeCents,
    restaurant_share_amount_cents: expectedDistribution.restaurantShareCents,
    restaurant_transfer_amount_cents: expectedDistribution.restaurantTransferCents,
    developer_share_amount_cents: expectedDistribution.developerShareCents,
    tok_net_amount_cents: expectedDistribution.tokNetRevenueCents,
  };
  for (const [field, expected] of Object.entries(expectedAmounts)) {
    if (requireMetadataInteger(metadata, field) !== expected) {
      throw new Error(`MARKETPLACE_FINANCE_SNAPSHOT_AMOUNT_MISMATCH_${field.toUpperCase()}`);
    }
  }

  if (input.checkoutKind === "match-group") {
    const memberOrderId = String(metadata.group_member_order_id || "");
    if (!memberOrderId) throw new Error("MATCH_GROUP_FINANCE_SNAPSHOT_ID_MISSING");
    const { data: memberOrder, error: memberOrderError } = await input.adminClient
      .from("group_member_orders")
      .select("id, restaurant_id, stripe_checkout_session_id, metadata")
      .eq("id", memberOrderId)
      .maybeSingle();
    if (memberOrderError) throw new Error(memberOrderError.message);
    if (
      !memberOrder
      || String(memberOrder.restaurant_id || "") !== String(input.restaurantId || "")
      || String(memberOrder.stripe_checkout_session_id || "") !== input.checkoutSessionId
      || !isRecord(memberOrder.metadata)
    ) {
      throw new Error("MATCH_GROUP_FINANCE_SNAPSHOT_IDENTITY_MISMATCH");
    }
    assertSameSnapshotFields(
      metadata,
      memberOrder.metadata,
      MATCH_GROUP_RATE_SNAPSHOT_FIELDS,
    );
    return metadata;
  }

  const paymentAttemptId = String(metadata.payment_attempt_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentAttemptId)) {
    throw new Error("MARKETPLACE_FINANCE_PAYMENT_ATTEMPT_MISSING");
  }
  const { data: attempt, error: attemptError } = await input.adminClient
    .from("payment_attempts")
    .select(
      "id, restaurant_id, kind, mode, amount_cents, currency, stripe_checkout_session_id, request_snapshot",
    )
    .eq("id", paymentAttemptId)
    .maybeSingle();
  if (attemptError) throw new Error(attemptError.message);

  const requestSnapshot = isRecord(attempt?.request_snapshot)
    ? attempt.request_snapshot
    : null;
  const sessionParams = requestSnapshot && isRecord(requestSnapshot.session_params)
    ? requestSnapshot.session_params
    : null;
  const sealedMetadata = sessionParams && isRecord(sessionParams.metadata)
    ? sessionParams.metadata
    : null;
  if (
    !attempt
    || attempt.kind !== input.checkoutKind
    || attempt.mode !== (input.livemode ? "live" : "test")
    || Number(attempt.amount_cents) !== grossCents
    || String(attempt.currency || "").toUpperCase() !== "CHF"
    || String(attempt.restaurant_id || "") !== String(input.restaurantId || "")
    || String(attempt.stripe_checkout_session_id || "") !== input.checkoutSessionId
    || !sealedMetadata
  ) {
    throw new Error("MARKETPLACE_FINANCE_PAYMENT_ATTEMPT_IDENTITY_MISMATCH");
  }

  assertSameSnapshotFields(metadata, sealedMetadata, SEALED_FINANCE_FIELDS);
  return metadata;
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

  const verifiedMetadata = await assertSealedMarketplaceFinanceSnapshot({
    adminClient: input.adminClient,
    checkoutKind: normalizeKind(input.checkoutKind),
    checkoutSessionId: input.checkoutSessionId,
    restaurantId: input.restaurantId,
    grossCents: input.grossCents,
    currency: input.currency,
    livemode: input.livemode,
    metadata: input.metadata || {},
  });

  const { error } = await input.adminClient.rpc("record_marketplace_checkout_ledger", {
    p_stripe_event_id: input.eventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_checkout_kind: normalizeKind(input.checkoutKind),
    p_restaurant_id: input.restaurantId || null,
    p_gross_cents: Math.max(0, toInteger(input.grossCents)),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_livemode: input.livemode,
    p_metadata: verifiedMetadata,
    p_source_type: input.sourceType || "stripe_checkout",
  });

  if (error) throw new Error(error.message);

  const { error: feeError } = await input.adminClient.rpc("record_stripe_tax_fee_ledger", {
    p_stripe_event_id: input.eventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_tax_cents: toNullableInteger(verifiedMetadata.tax_cents),
    p_stripe_fee_cents: toNullableInteger(verifiedMetadata.stripe_fee_cents),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_metadata: verifiedMetadata,
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
