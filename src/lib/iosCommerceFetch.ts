import { Capacitor, registerPlugin } from "@capacitor/core";

export const TOK_ONE_IOS_MONTHLY_PRODUCT_ID = "ch.thetok.app.tokone.monthly";
export const TOK_ONE_IOS_YEARLY_PRODUCT_ID = "ch.thetok.app.tokone.yearly";

const IOS_STRIPE_FORBIDDEN_CHECKOUT_KINDS = new Set([
  "restaurant-onboarding",
  "restaurant-subscription-upgrade",
  "restaurant-credit-pack",
  "campaign",
  "launch-pack",
]);

type NativePurchaseStatus = "purchased" | "cancelled" | "pending" | "error";

type NativePurchaseResult = {
  status: NativePurchaseStatus;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  jwsRepresentation?: string;
  message?: string;
};

type TokStoreKitPlugin = {
  purchase(options: { productId: string; appAccountToken: string }): Promise<NativePurchaseResult>;
  finishTransaction(options: { transactionId: string }): Promise<{ finished: boolean }>;
  currentEntitlements(options: { productIds: string[] }): Promise<{
    transactions: Array<NativePurchaseResult>;
  }>;
  restorePurchases(options: { productIds: string[] }): Promise<{
    transactions: Array<NativePurchaseResult>;
  }>;
};

const TokStoreKit = registerPlugin<TokStoreKitPlugin>("TokStoreKit");

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeCheckoutKind(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isIosNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function isIosStripeCheckoutForbidden(checkoutKind: unknown) {
  return IOS_STRIPE_FORBIDDEN_CHECKOUT_KINDS.has(normalizeCheckoutKind(checkoutKind));
}

export function getTokOneIosProductId(billingPeriod: unknown) {
  return String(billingPeriod || "monthly").toLowerCase() === "yearly"
    ? TOK_ONE_IOS_YEARLY_PRODUCT_ID
    : TOK_ONE_IOS_MONTHLY_PRODUCT_ID;
}

function toRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function readJsonBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === "string") {
    try {
      return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (input instanceof Request) {
    try {
      return (await input.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

function getCheckoutMetadata(payload: Record<string, unknown>) {
  const metadata = payload.order_metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function readCheckoutString(
  payload: Record<string, unknown>,
  key: string,
  fallback: string | null = null,
) {
  const direct = payload[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = getCheckoutMetadata(payload)[key];
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return fallback;
}

function readBearerSubject(headers: Headers) {
  const authorization = headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice("bearer ".length).trim();
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return null;

  try {
    const padded = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
    const payload = JSON.parse(globalThis.atob(padded)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
}

function buildReturnUrl(status: "success" | "cancelled", paymentAttemptId: string | null) {
  const fallback = "https://www.thetok.ch/tok-one";
  let url: URL;

  try {
    url = new URL("/tok-one", globalThis.location?.href || fallback);
  } catch {
    url = new URL(fallback);
  }

  url.searchParams.set("status", status);
  if (paymentAttemptId) url.searchParams.set("payment_attempt_id", paymentAttemptId);
  return url.toString();
}

function buildFunctionUrl(createCheckoutUrl: string, functionName: string) {
  const url = new URL(createCheckoutUrl);
  const marker = "/functions/v1/";
  const index = url.pathname.indexOf(marker);
  if (index < 0) throw new Error("Supabase Functions URL invalide.");
  url.pathname = `${url.pathname.slice(0, index)}${marker}${functionName}`;
  url.search = "";
  return url.toString();
}

async function syncAppleTransaction(
  baseFetch: typeof fetch,
  createCheckoutUrl: string,
  headers: Headers,
  payload: Record<string, unknown>,
  purchase: NativePurchaseResult,
) {
  if (!purchase.jwsRepresentation || !purchase.transactionId) {
    throw new Error("La transaction Apple ne contient pas de preuve signée exploitable.");
  }

  const planId = readCheckoutString(payload, "plan_id");
  const billingPeriod = readCheckoutString(payload, "billing_period", "monthly");
  const paymentAttemptId = readCheckoutString(payload, "payment_attempt_id");

  if (!planId) {
    throw new Error("La formule Tok One est absente du paiement Apple.");
  }

  const syncResponse = await baseFetch(buildFunctionUrl(createCheckoutUrl, "sync-apple-storekit"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      signed_transaction: purchase.jwsRepresentation,
      plan_id: planId,
      billing_period: billingPeriod,
      payment_attempt_id: paymentAttemptId,
      source: "ios_storekit_purchase",
    }),
  });

  if (!syncResponse.ok) {
    const body = await syncResponse.text().catch(() => "");
    throw new Error(body || `Synchronisation Apple refusée (${syncResponse.status}).`);
  }

  await TokStoreKit.finishTransaction({ transactionId: purchase.transactionId });
}

async function handleTokOnePurchase(
  baseFetch: typeof fetch,
  createCheckoutUrl: string,
  headers: Headers,
  payload: Record<string, unknown>,
) {
  const userId = readBearerSubject(headers);
  const paymentAttemptId = readCheckoutString(payload, "payment_attempt_id");
  const planId = readCheckoutString(payload, "plan_id");
  const billingPeriod = readCheckoutString(payload, "billing_period", "monthly");

  if (!userId) {
    return jsonResponse({ error: "Session utilisateur requise pour l’achat Tok One." }, 401);
  }

  if (!planId) {
    return jsonResponse({ error: "Formule Tok One invalide." }, 400);
  }

  const productId = getTokOneIosProductId(billingPeriod);
  let purchase: NativePurchaseResult;

  try {
    purchase = await TokStoreKit.purchase({
      productId,
      appAccountToken: userId,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "StoreKit indisponible.",
      error_code: "IOS_STOREKIT_UNAVAILABLE",
    }, 503);
  }

  if (purchase.status === "cancelled") {
    return jsonResponse({
      payment_attempt_id: paymentAttemptId,
      sessionId: purchase.transactionId || null,
      state: "cancelled",
      payment_status: "cancelled",
      retryable: false,
      // The native purchase never created a server-side Stripe payment attempt.
      // Omit the attempt from the return URL so the Tok One page does not call
      // cancel-payment-attempt for an object that cannot exist.
      url: buildReturnUrl("cancelled", null),
    });
  }

  if (purchase.status === "pending") {
    return jsonResponse({
      error: "L’achat Apple est en attente de validation.",
      error_code: "IOS_STOREKIT_PENDING",
      payment_attempt_id: paymentAttemptId,
      retryable: false,
    }, 400);
  }

  if (purchase.status !== "purchased") {
    return jsonResponse({
      error: purchase.message || "L’achat Apple n’a pas pu être finalisé.",
      error_code: "IOS_STOREKIT_PURCHASE_FAILED",
      payment_attempt_id: paymentAttemptId,
    }, 400);
  }

  try {
    await syncAppleTransaction(baseFetch, createCheckoutUrl, headers, payload, purchase);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Synchronisation Apple impossible.",
      error_code: "IOS_STOREKIT_SERVER_SYNC_FAILED",
      payment_attempt_id: paymentAttemptId,
      retryable: true,
    }, 503);
  }

  return jsonResponse({
    payment_attempt_id: paymentAttemptId,
    sessionId: `apple:${purchase.transactionId}`,
    state: "succeeded",
    payment_status: "paid",
    retryable: false,
    url: buildReturnUrl("success", paymentAttemptId),
  });
}

export function createIosCommerceAwareFetch(
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isIosNativeRuntime()) return baseFetch(input, init);

    const requestUrl = toRequestUrl(input);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(requestUrl);
    } catch {
      return baseFetch(input, init);
    }

    if (!parsedUrl.pathname.endsWith("/functions/v1/create-checkout")) {
      return baseFetch(input, init);
    }

    const payload = await readJsonBody(input, init);
    if (!payload) return baseFetch(input, init);

    const checkoutKind = normalizeCheckoutKind(
      payload.checkout_kind || getCheckoutMetadata(payload).checkout_kind,
    );

    if (checkoutKind === "tok-one") {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined),
      );
      headers.set("Content-Type", "application/json");
      return handleTokOnePurchase(baseFetch, requestUrl, headers, payload);
    }

    if (isIosStripeCheckoutForbidden(checkoutKind)) {
      return jsonResponse({
        error: "Cette opération d’abonnement ou de promotion numérique n’est pas proposée dans l’app iOS.",
        error_code: "IOS_EXTERNAL_DIGITAL_CHECKOUT_BLOCKED",
        retryable: false,
      }, 403);
    }

    return baseFetch(input, init);
  }) as typeof fetch;
}

export async function restoreTokOneIosPurchases(options: {
  userId: string;
  sync: (signedTransaction: string) => Promise<void>;
}) {
  if (!isIosNativeRuntime()) return { restored: 0 };

  const result = await TokStoreKit.restorePurchases({
    productIds: [TOK_ONE_IOS_MONTHLY_PRODUCT_ID, TOK_ONE_IOS_YEARLY_PRODUCT_ID],
  });

  let restored = 0;
  for (const transaction of result.transactions || []) {
    if (!transaction.jwsRepresentation) continue;
    await options.sync(transaction.jwsRepresentation);
    if (transaction.transactionId) {
      await TokStoreKit.finishTransaction({ transactionId: transaction.transactionId });
    }
    restored += 1;
  }

  return { restored };
}
