import type Stripe from "npm:stripe@18.5.0";

import { HttpError } from "./auth.ts";

type JsonRecord = Record<string, unknown>;

export type PaymentAttemptMode = "live" | "test";
export type PaymentAttemptState =
  | "pending"
  | "session_bound"
  | "finalized"
  | "cancelled"
  | "failed"
  | "expired";

export type AcquiredPaymentAttempt = {
  attemptId: string;
  operationKey: string;
  state: PaymentAttemptState;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  sessionExpiresAt: string | null;
  stripeIdempotencyKey: string;
  amountCents: number;
  currency: string;
  generation: number;
  requestFingerprint: string | null;
  requestSnapshot: JsonRecord | null;
  reused: boolean;
  leaseAcquired: boolean;
};

export type ClaimedStripeWebhookEvent = {
  claimed: boolean;
  duplicate: boolean;
  inProgress: boolean;
  eventId: string;
  processingStatus: string;
  lockToken: string | null;
  lockedUntil: string | null;
  attemptCount: number;
};

export type PaymentAttemptRow = {
  id: string;
  operation_key: string;
  owner_user_id: string;
  restaurant_id: string | null;
  kind: string;
  mode: PaymentAttemptMode;
  state: PaymentAttemptState;
  amount_cents: number | null;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  session_expires_at: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  metadata?: JsonRecord | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`PAYMENT_ATTEMPT_RPC_INVALID_${field.toUpperCase()}`);
  return normalized;
}

function nullableString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function requireClientPaymentAttemptId(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new HttpError(400, "payment_attempt_id UUID stable requis");
  }
  return normalized;
}

export function readStripeObjectId(value: string | { id?: string | null } | null | undefined) {
  if (typeof value === "string") return value;
  return nullableString(value?.id);
}

export async function acquirePaymentAttempt(input: {
  adminClient: any;
  operationKey: string;
  ownerUserId: string;
  restaurantId?: string | null;
  kind: string;
  mode: PaymentAttemptMode;
  amountCents: number;
  currency?: string;
  leaseSeconds?: number;
  metadata?: JsonRecord;
}): Promise<AcquiredPaymentAttempt> {
  const { data, error } = await input.adminClient.rpc("acquire_payment_attempt", {
    p_operation_key: input.operationKey,
    p_owner_user_id: input.ownerUserId,
    p_restaurant_id: input.restaurantId || null,
    p_kind: input.kind,
    p_mode: input.mode,
    p_amount_cents: Math.max(0, Math.round(input.amountCents)),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_lease_seconds: Math.max(30, Math.min(300, Math.round(input.leaseSeconds || 120))),
    p_metadata: input.metadata || {},
  });

  if (error) throw new HttpError(409, `PAYMENT_ATTEMPT_ACQUIRE_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("PAYMENT_ATTEMPT_ACQUIRE_INVALID_RESPONSE");

  const attemptId = requiredString(data.attempt_id, "attempt_id");
  const stripeIdempotencyKey = requiredString(
    data.stripe_idempotency_key || `checkout:${attemptId}:${Number(data.generation || 1)}`,
    "stripe_idempotency_key",
  );

  return {
    attemptId,
    operationKey: requiredString(data.operation_key || input.operationKey, "operation_key"),
    state: requiredString(data.state, "state") as PaymentAttemptState,
    leaseToken: nullableString(data.lease_token),
    leaseExpiresAt: nullableString(data.lease_expires_at),
    stripeCheckoutSessionId: nullableString(data.stripe_checkout_session_id),
    stripePaymentIntentId: nullableString(data.stripe_payment_intent_id),
    stripeSubscriptionId: nullableString(data.stripe_subscription_id),
    sessionExpiresAt: nullableString(data.session_expires_at),
    stripeIdempotencyKey,
    amountCents: Math.max(0, Number(data.amount_cents ?? input.amountCents)),
    currency: String(data.currency || input.currency || "CHF").toUpperCase(),
    generation: Math.max(1, Number(data.generation || 1)),
    requestFingerprint: nullableString(data.request_fingerprint),
    requestSnapshot: isRecord(data.request_snapshot) ? data.request_snapshot : null,
    reused: data.reused === true,
    leaseAcquired: data.lease_acquired === true,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export async function fingerprintPaymentAttemptRequest(snapshot: JsonRecord) {
  const encoded = new TextEncoder().encode(JSON.stringify(canonicalize(snapshot)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sealPaymentAttemptRequest(input: {
  adminClient: any;
  attemptId: string;
  leaseToken: string;
  fingerprint: string;
  requestSnapshot: JsonRecord;
}) {
  const { data, error } = await input.adminClient.rpc("seal_payment_attempt_request", {
    p_attempt_id: input.attemptId,
    p_lease_token: input.leaseToken,
    p_fingerprint: input.fingerprint,
    p_request_snapshot: input.requestSnapshot,
  });
  if (error) throw new Error(`PAYMENT_ATTEMPT_SEAL_FAILED:${error.message}`);
  if (!isRecord(data) || !isRecord(data.request_snapshot)) {
    throw new Error("PAYMENT_ATTEMPT_SEAL_INVALID_RESPONSE");
  }
  return {
    fingerprint: requiredString(data.fingerprint || data.request_fingerprint, "fingerprint"),
    requestSnapshot: data.request_snapshot,
    reused: data.reused === true,
  };
}

export async function bindPaymentAttemptStripe(input: {
  adminClient: any;
  attemptId: string;
  leaseToken: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  subscriptionId?: string | null;
  sessionExpiresAt?: string | null;
  metadata?: JsonRecord;
}) {
  const { data, error } = await input.adminClient.rpc("bind_payment_attempt_stripe", {
    p_attempt_id: input.attemptId,
    p_lease_token: input.leaseToken,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId || null,
    p_subscription_id: input.subscriptionId || null,
    p_session_expires_at: input.sessionExpiresAt || null,
    p_metadata: input.metadata || {},
  });
  if (error) throw new Error(`PAYMENT_ATTEMPT_BIND_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("PAYMENT_ATTEMPT_BIND_INVALID_RESPONSE");
  return data;
}

export async function failPaymentAttempt(input: {
  adminClient: any;
  attemptId: string;
  leaseToken: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
}) {
  const { data, error } = await input.adminClient.rpc("fail_payment_attempt", {
    p_attempt_id: input.attemptId,
    p_lease_token: input.leaseToken,
    p_error_code: input.errorCode || null,
    p_error_message: input.errorMessage || null,
    p_retryable: input.retryable !== false,
  });
  if (error) throw new Error(`PAYMENT_ATTEMPT_FAIL_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("PAYMENT_ATTEMPT_FAIL_INVALID_RESPONSE");
  return data;
}

/**
 * Advance the generation only after Stripe has confirmed that a known
 * Checkout Session can no longer be paid. Never use this for a network/5xx
 * ambiguity during sessions.create: that case must retry the same generation
 * and the same Stripe idempotency key.
 */
export async function abandonPaymentAttemptSession(input: {
  adminClient: any;
  attemptId: string;
  sessionId: string;
  reason: string;
  leaseToken?: string | null;
}) {
  const { data, error } = await input.adminClient.rpc("abandon_payment_attempt_session", {
    p_attempt_id: input.attemptId,
    p_session_id: input.sessionId,
    p_reason: input.reason,
    p_lease_token: input.leaseToken || null,
  });
  if (error) throw new Error(`PAYMENT_ATTEMPT_ABANDON_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("PAYMENT_ATTEMPT_ABANDON_INVALID_RESPONSE");
  return data;
}

export async function cancelPaymentAttempt(input: {
  adminClient: any;
  attemptId: string;
  reason?: string | null;
  expectedSessionId?: string | null;
}) {
  const { data, error } = await input.adminClient.rpc("cancel_payment_attempt", {
    p_attempt_id: input.attemptId,
    p_reason: input.reason || null,
    p_expected_session_id: input.expectedSessionId || null,
  });
  if (error) throw new Error(`PAYMENT_ATTEMPT_CANCEL_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("PAYMENT_ATTEMPT_CANCEL_INVALID_RESPONSE");
  return data;
}

export async function finalizePaymentAttempt(input: {
  adminClient: any;
  attemptId?: string | null;
  operationKey?: string | null;
  stripeEventId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  subscriptionId?: string | null;
  livemode: boolean;
  amountCents?: number | null;
  currency?: string | null;
  metadata?: JsonRecord;
}) {
  const { data, error } = await input.adminClient.rpc("finalize_payment_attempt", {
    p_attempt_id: input.attemptId || null,
    p_operation_key: input.operationKey || null,
    p_stripe_event_id: input.stripeEventId || null,
    p_checkout_session_id: input.checkoutSessionId || null,
    p_payment_intent_id: input.paymentIntentId || null,
    p_subscription_id: input.subscriptionId || null,
    p_livemode: input.livemode,
    p_amount_cents: input.amountCents == null ? null : Math.max(0, Math.round(input.amountCents)),
    p_currency: String(input.currency || "CHF").toUpperCase(),
    p_metadata: input.metadata || {},
  });
  if (error) throw new Error(`PAYMENT_ATTEMPT_FINALIZE_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("PAYMENT_ATTEMPT_FINALIZE_INVALID_RESPONSE");
  return data;
}

export async function claimStripeWebhookEvent(input: {
  adminClient: any;
  eventId: string;
  eventType: string;
  livemode: boolean;
  leaseSeconds?: number;
}): Promise<ClaimedStripeWebhookEvent> {
  const { data, error } = await input.adminClient.rpc("claim_stripe_webhook_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_livemode: input.livemode,
    p_lease_seconds: Math.max(30, Math.min(300, Math.round(input.leaseSeconds || 120))),
  });
  if (error) throw new Error(`STRIPE_WEBHOOK_CLAIM_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("STRIPE_WEBHOOK_CLAIM_INVALID_RESPONSE");

  return {
    claimed: data.claimed === true,
    duplicate: data.duplicate === true,
    inProgress: data.in_progress === true,
    eventId: requiredString(data.event_id || input.eventId, "event_id"),
    processingStatus: String(data.processing_status || ""),
    lockToken: nullableString(data.lock_token),
    lockedUntil: nullableString(data.locked_until),
    attemptCount: Math.max(0, Number(data.attempt_count || 0)),
  };
}

export async function completeStripeWebhookEvent(input: {
  adminClient: any;
  eventId: string;
  lockToken: string;
  success: boolean;
  error?: string | null;
}) {
  const { data, error } = await input.adminClient.rpc("complete_stripe_webhook_event", {
    p_event_id: input.eventId,
    p_lock_token: input.lockToken,
    p_success: input.success,
    p_error: input.error || null,
  });
  if (error) throw new Error(`STRIPE_WEBHOOK_COMPLETE_FAILED:${error.message}`);
  if (!isRecord(data)) throw new Error("STRIPE_WEBHOOK_COMPLETE_INVALID_RESPONSE");
  return data;
}

export function assertCheckoutSessionIntegrity(input: {
  session: Stripe.Checkout.Session;
  livemode: boolean;
  expectedAmountCents?: number | null;
  expectedCurrency?: string | null;
}) {
  const metadata = input.session.metadata || {};
  const metadataMode = String(metadata.stripe_mode || "").trim().toLowerCase();
  const actualMode = input.livemode ? "live" : "test";
  if (metadataMode && metadataMode !== actualMode) {
    throw new Error(`STRIPE_MODE_MISMATCH:${metadataMode}:${actualMode}`);
  }

  const sessionLivemode = (input.session as Stripe.Checkout.Session & { livemode?: boolean }).livemode;
  if (typeof sessionLivemode === "boolean" && sessionLivemode !== input.livemode) {
    throw new Error("STRIPE_SESSION_EVENT_MODE_MISMATCH");
  }

  const expectedAmount = input.expectedAmountCents
    ?? (metadata.authoritative_total_cents ? Number(metadata.authoritative_total_cents) : null)
    ?? (metadata.authoritative_total ? Math.round(Number(metadata.authoritative_total) * 100) : null);
  const trialSubscriptionCheckout = input.session.mode === "subscription"
    && Number(input.session.amount_total || 0) === 0
    && Number(expectedAmount || 0) > 0;
  if (!trialSubscriptionCheckout && expectedAmount != null && Number.isFinite(expectedAmount)) {
    if (input.session.amount_total == null || Number(input.session.amount_total) !== Math.round(expectedAmount)) {
      throw new Error(`STRIPE_AMOUNT_MISMATCH:${input.session.amount_total ?? "null"}:${Math.round(expectedAmount)}`);
    }
  }

  const expectedCurrency = String(input.expectedCurrency || metadata.authoritative_currency || "CHF").toLowerCase();
  const actualCurrency = String(input.session.currency || "").toLowerCase();
  if (!actualCurrency || actualCurrency !== expectedCurrency) {
    throw new Error(`STRIPE_CURRENCY_MISMATCH:${actualCurrency || "null"}:${expectedCurrency}`);
  }

  if (metadata.payment_attempt_version === "2") {
    requiredString(metadata.payment_attempt_id, "payment_attempt_id");
    requiredString(metadata.operation_key, "operation_key");
  }
}

export async function findOwnedPaymentAttempt(input: {
  adminClient: any;
  clientPaymentAttemptId: string;
  ownerUserId: string;
}): Promise<PaymentAttemptRow> {
  const { data, error } = await input.adminClient
    .from("payment_attempts")
    .select("id, operation_key, owner_user_id, restaurant_id, kind, mode, state, amount_cents, currency, stripe_checkout_session_id, stripe_payment_intent_id, stripe_subscription_id, session_expires_at, last_error_code, last_error_message, metadata")
    .eq("operation_key", input.clientPaymentAttemptId)
    .eq("owner_user_id", input.ownerUserId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Tentative de paiement introuvable");
  return data as PaymentAttemptRow;
}
