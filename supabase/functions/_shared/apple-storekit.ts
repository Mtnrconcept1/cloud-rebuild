import { Buffer } from "node:buffer";
import {
  AutoRenewStatus,
  Environment,
  SignedDataVerifier,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "npm:@apple/app-store-server-library@3.1.0";

import type { EdgeSupabaseClient } from "./auth.ts";

export const TOK_APPLE_BUNDLE_ID = "ch.thetok.app";
export const TOK_APPLE_APP_ID = 6799776439;
export const TOK_ONE_APPLE_MONTHLY_PRODUCT_ID = "ch.thetok.app.tokone.monthly";
export const TOK_ONE_APPLE_YEARLY_PRODUCT_ID = "ch.thetok.app.tokone.yearly";

const TOK_ONE_APPLE_PRODUCTS = new Map([
  [TOK_ONE_APPLE_MONTHLY_PRODUCT_ID, "monthly"],
  [TOK_ONE_APPLE_YEARLY_PRODUCT_ID, "yearly"],
]);

const APPLE_ROOT_CERTIFICATE_URLS = [
  "https://www.apple.com/appleca/AppleIncRootCertificate.cer",
  "https://www.apple.com/certificateauthority/AppleRootCA-G2.cer",
  "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer",
];

let rootCertificatePromise: Promise<Buffer[]> | null = null;

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`APPLE_STOREKIT_${field.toUpperCase()}_MISSING`);
  }
  return value.trim();
}

function normalizeTokOnePlanName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function isCanonicalTokOnePlanName(value: unknown) {
  const normalized = normalizeTokOnePlanName(value);
  return normalized === "tok one" || normalized === "miamz+";
}

function toIso(value: number | undefined, fallback: Date) {
  return new Date(
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : fallback.getTime(),
  ).toISOString();
}

function normalizeEnvironment(value: string | undefined) {
  return String(value || "").trim().toLowerCase() || "unknown";
}

async function loadAppleRootCertificates() {
  if (!rootCertificatePromise) {
    rootCertificatePromise = Promise.all(
      APPLE_ROOT_CERTIFICATE_URLS.map(async (url) => {
        const response = await fetch(url, { redirect: "follow" });
        if (!response.ok) {
          throw new Error(`APPLE_ROOT_CERTIFICATE_FETCH_FAILED:${response.status}`);
        }
        return Buffer.from(await response.arrayBuffer());
      }),
    );
  }
  return rootCertificatePromise;
}

async function createVerifier(environment: Environment) {
  const roots = await loadAppleRootCertificates();
  return new SignedDataVerifier(
    roots,
    true,
    environment,
    TOK_APPLE_BUNDLE_ID,
    environment === Environment.PRODUCTION ? TOK_APPLE_APP_ID : undefined,
  );
}

export async function verifyAppleSignedTransaction(signedTransaction: string) {
  const signed = requireString(signedTransaction, "signed_transaction");
  const attempts: Environment[] = [Environment.PRODUCTION, Environment.SANDBOX];
  let lastError: unknown = null;

  for (const environment of attempts) {
    try {
      const verifier = await createVerifier(environment);
      const transaction = await verifier.verifyAndDecodeTransaction(signed);
      return { transaction, environment };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("APPLE_STOREKIT_TRANSACTION_VERIFICATION_FAILED");
}

export async function verifyAppleSignedNotification(signedPayload: string) {
  const signed = requireString(signedPayload, "signed_payload");
  const attempts: Environment[] = [Environment.PRODUCTION, Environment.SANDBOX];
  let lastError: unknown = null;

  for (const environment of attempts) {
    try {
      const verifier = await createVerifier(environment);
      const notification = await verifier.verifyAndDecodeNotification(signed);
      return { notification, environment, verifier };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("APPLE_STOREKIT_NOTIFICATION_VERIFICATION_FAILED");
}

export function assertTokOneAppleTransaction(transaction: JWSTransactionDecodedPayload) {
  const productId = requireString(transaction.productId, "product_id");
  const billingPeriod = TOK_ONE_APPLE_PRODUCTS.get(productId);
  if (!billingPeriod) {
    throw new Error(`APPLE_STOREKIT_UNEXPECTED_PRODUCT:${productId}`);
  }
  if (transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
    throw new Error(`APPLE_STOREKIT_UNEXPECTED_TYPE:${String(transaction.type || "unknown")}`);
  }

  const userId = requireString(transaction.appAccountToken, "app_account_token").toLowerCase();
  const transactionId = requireString(transaction.transactionId, "transaction_id");
  const originalTransactionId = requireString(
    transaction.originalTransactionId,
    "original_transaction_id",
  );
  const expiresDate = transaction.expiresDate;
  if (typeof expiresDate !== "number" || !Number.isFinite(expiresDate) || expiresDate <= 0) {
    throw new Error("APPLE_STOREKIT_EXPIRATION_MISSING");
  }

  return {
    productId,
    billingPeriod,
    userId,
    transactionId,
    originalTransactionId,
    expiresDate,
  };
}

async function getCanonicalTokOnePlan(
  adminClient: EdgeSupabaseClient,
  requestedPlanId?: string | null,
) {
  if (requestedPlanId) {
    const { data: requestedPlan, error: requestedPlanError } = await adminClient
      .from("user_subscription_plans")
      .select("id, name, status")
      .eq("id", requestedPlanId)
      .maybeSingle();

    if (requestedPlanError) throw requestedPlanError;
    if (
      !requestedPlan ||
      String(requestedPlan.status || "").toLowerCase() !== "active" ||
      !isCanonicalTokOnePlanName(requestedPlan.name)
    ) {
      throw new Error("APPLE_STOREKIT_PLAN_INACTIVE_OR_UNKNOWN");
    }
    return requestedPlan;
  }

  // App Store Server Notifications can race ahead of the client-side purchase
  // sync. Resolve the canonical active Tok One plan from authoritative data so
  // a renewal/refund notification never depends on a row already existing.
  const { data: activePlans, error: activePlansError } = await adminClient
    .from("user_subscription_plans")
    .select("id, name, status")
    .eq("status", "active")
    .limit(50);

  if (activePlansError) throw activePlansError;
  const matchingPlans = (activePlans || []).filter((plan: { name?: unknown }) =>
    isCanonicalTokOnePlanName(plan.name)
  );
  if (matchingPlans.length !== 1) {
    throw new Error(`APPLE_STOREKIT_CANONICAL_PLAN_COUNT:${matchingPlans.length}`);
  }
  return matchingPlans[0];
}

async function resolvePlanId(
  adminClient: EdgeSupabaseClient,
  requestedPlanId: string | null | undefined,
  originalTransactionId: string,
) {
  const { data: existing, error: existingError } = await adminClient
    .from("tok_one_subscriptions")
    .select("id, plan_id")
    .eq("apple_original_transaction_id", originalTransactionId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.plan_id) {
    if (requestedPlanId && requestedPlanId !== existing.plan_id) {
      throw new Error("APPLE_STOREKIT_PLAN_MISMATCH");
    }
    return { planId: String(existing.plan_id), existingId: String(existing.id) };
  }

  const plan = await getCanonicalTokOnePlan(adminClient, requestedPlanId);
  return { planId: String(plan.id), existingId: null };
}

export async function persistAppleTokOneTransaction(input: {
  adminClient: EdgeSupabaseClient;
  transaction: JWSTransactionDecodedPayload;
  requestedPlanId?: string | null;
  renewalInfo?: JWSRenewalInfoDecodedPayload | null;
}) {
  const transactionIdentity = assertTokOneAppleTransaction(input.transaction);
  const { planId, existingId } = await resolvePlanId(
    input.adminClient,
    input.requestedPlanId,
    transactionIdentity.originalTransactionId,
  );

  const now = new Date();
  const revoked = typeof input.transaction.revocationDate === "number";
  const expired = transactionIdentity.expiresDate <= now.getTime();
  const status = revoked ? "cancelled" : expired ? "expired" : "active";
  const cancelAtPeriodEnd = input.renewalInfo?.autoRenewStatus === AutoRenewStatus.OFF;

  const payload = {
    user_id: transactionIdentity.userId,
    plan_id: planId,
    status,
    current_period_start: toIso(input.transaction.purchaseDate, now),
    current_period_end: toIso(transactionIdentity.expiresDate, now),
    cancel_at_period_end: Boolean(cancelAtPeriodEnd),
    stripe_subscription_id: null,
    stripe_checkout_session_id: null,
    // Existing client entitlement queries intentionally select stripe_mode=live.
    // Keep that compatibility marker while billing_provider identifies Apple.
    stripe_mode: "live",
    billing_provider: "apple",
    apple_product_id: transactionIdentity.productId,
    apple_transaction_id: transactionIdentity.transactionId,
    apple_original_transaction_id: transactionIdentity.originalTransactionId,
    apple_environment: normalizeEnvironment(input.transaction.environment),
    apple_app_account_token: transactionIdentity.userId,
    apple_signed_at: toIso(input.transaction.signedDate, now),
    updated_at: now.toISOString(),
  };

  let query;
  if (existingId) {
    query = input.adminClient
      .from("tok_one_subscriptions")
      .update(payload)
      .eq("id", existingId);
  } else {
    query = input.adminClient
      .from("tok_one_subscriptions")
      .insert(payload);
  }

  const { data, error } = await query
    .select(
      "id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_mode, billing_provider, apple_product_id, apple_transaction_id, apple_original_transaction_id, apple_environment",
    )
    .single();

  if (error) {
    // Client sync and the Apple server notification may race. If the unique
    // original transaction was inserted between the lookup and insert, retry
    // as an update instead of failing a valid purchase.
    if (!existingId && String(error.code || "") === "23505") {
      const { data: racedRow, error: raceReadError } = await input.adminClient
        .from("tok_one_subscriptions")
        .select("id")
        .eq("apple_original_transaction_id", transactionIdentity.originalTransactionId)
        .single();
      if (raceReadError) throw raceReadError;

      const { data: updated, error: updateError } = await input.adminClient
        .from("tok_one_subscriptions")
        .update(payload)
        .eq("id", racedRow.id)
        .select(
          "id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_mode, billing_provider, apple_product_id, apple_transaction_id, apple_original_transaction_id, apple_environment",
        )
        .single();
      if (updateError) throw updateError;
      return { updated: true, reason: "race_recovered", transactionIdentity, row: updated };
    }
    throw error;
  }

  return { updated: true, reason: existingId ? "updated" : "inserted", transactionIdentity, row: data };
}

export async function decodeNotificationTransaction(input: {
  notification: ResponseBodyV2DecodedPayload;
  verifier: SignedDataVerifier;
}) {
  const signedTransaction = input.notification.data?.signedTransactionInfo;
  if (!signedTransaction) return null;
  return input.verifier.verifyAndDecodeTransaction(signedTransaction);
}

export async function decodeNotificationRenewalInfo(input: {
  notification: ResponseBodyV2DecodedPayload;
  verifier: SignedDataVerifier;
}) {
  const signedRenewalInfo = input.notification.data?.signedRenewalInfo;
  if (!signedRenewalInfo) return null;
  return input.verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo);
}
