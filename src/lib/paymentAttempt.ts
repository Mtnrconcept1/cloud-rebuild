export const PAYMENT_ATTEMPT_QUERY_PARAM = "payment_attempt_id";

const PAYMENT_ATTEMPT_STORAGE_PREFIX = "tok-payment-attempt:v1:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaymentAttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredPaymentAttempt = {
  id: string;
  operationKey: string | null;
  createdAt: number;
  redirectedAt?: number | null;
};

export type PaymentAttemptState =
  | "idle"
  | "submitting"
  | "checking"
  | "redirecting"
  | "cancelling"
  | "succeeded"
  | "cancelled"
  | "failed";

export type PaymentAttemptEvent =
  | { type: "submit" }
  | { type: "uncertain" }
  | { type: "redirect" }
  | { type: "settled" }
  | { type: "cancel" }
  | { type: "cancelled" }
  | { type: "fail" }
  | { type: "reset" };

export type CheckoutSessionResolution = {
  paymentAttemptId: string;
  sessionId: string | null;
  url: string | null;
  state: string | null;
  paymentStatus: string | null;
  retryable: boolean;
  reused: boolean;
};

type CheckoutRecoveryOptions = {
  paymentAttemptId: string;
  create: () => Promise<unknown>;
  getStatus: () => Promise<unknown>;
  timeoutMs?: number;
  pollAttempts?: number;
  pollDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

type PaymentAttemptStatusOptions = Omit<CheckoutRecoveryOptions, "create" | "timeoutMs">;

export class PaymentAttemptIndeterminateError extends Error {
  readonly paymentAttemptId: string;

  constructor(paymentAttemptId: string) {
    super(
      "La demande de paiement a peut-être été reçue. Aucun nouveau débit ne sera créé : relancez la vérification avec le même bouton.",
    );
    this.name = "PaymentAttemptIndeterminateError";
    this.paymentAttemptId = paymentAttemptId;
  }
}

class CheckoutRequestTimeoutError extends Error {
  constructor() {
    super("checkout_request_timeout");
    this.name = "CheckoutRequestTimeoutError";
  }
}

function getDefaultStorage(): PaymentAttemptStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKey(scope: string) {
  return `${PAYMENT_ATTEMPT_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function readStoredAttempt(scope: string, storage: PaymentAttemptStorage | null): StoredPaymentAttempt | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPaymentAttempt>;
    const id = normalizePaymentAttemptId(parsed.id);
    if (!id) return null;
    return {
      id,
      operationKey: typeof parsed.operationKey === "string" ? parsed.operationKey : null,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      redirectedAt: typeof parsed.redirectedAt === "number" ? parsed.redirectedAt : null,
    };
  } catch {
    return null;
  }
}

function writeStoredAttempt(
  scope: string,
  record: StoredPaymentAttempt,
  storage: PaymentAttemptStorage | null,
) {
  if (!storage) return;
  try {
    storage.setItem(storageKey(scope), JSON.stringify(record));
  } catch {
    // A blocked storage must not block checkout. The opaque id also travels in the return URL.
  }
}

function createSecureUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Générateur sécurisé indisponible pour initialiser le paiement.");
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) result[key] = canonicalize(child);
        return result;
      }, {});
  }
  return value;
}

function hashText(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeResponse(input: unknown, fallbackAttemptId: string): CheckoutSessionResolution {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const paymentAttemptId = normalizePaymentAttemptId(
    value.payment_attempt_id ?? value.server_payment_attempt_id ?? fallbackAttemptId,
  ) ?? fallbackAttemptId;
  const rawSessionId = value.sessionId ?? value.session_id;
  const rawUrl = value.url;
  const rawState = value.state ?? value.status;
  const rawPaymentStatus = value.payment_status;

  return {
    paymentAttemptId,
    sessionId: typeof rawSessionId === "string" && rawSessionId.trim() ? rawSessionId.trim() : null,
    url: typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : null,
    state: typeof rawState === "string" && rawState.trim() ? rawState.trim().toLowerCase() : null,
    paymentStatus: typeof rawPaymentStatus === "string" && rawPaymentStatus.trim()
      ? rawPaymentStatus.trim().toLowerCase()
      : null,
    retryable: value.retryable !== false,
    reused: value.reused === true,
  };
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const directStatus = "status" in error ? (error as { status?: unknown }).status : null;
  if (typeof directStatus === "number") return directStatus;
  const context = "context" in error ? (error as { context?: unknown }).context : null;
  if (context && typeof context === "object" && "status" in context) {
    const contextStatus = (context as { status?: unknown }).status;
    return typeof contextStatus === "number" ? contextStatus : null;
  }
  return null;
}

export function isPaymentAttemptRecoverableError(error: unknown) {
  if (error instanceof CheckoutRequestTimeoutError || error instanceof TypeError) return true;
  const status = getErrorStatus(error);
  if (status === null) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new CheckoutRequestTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

const defaultSleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export function normalizePaymentAttemptId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function createPaymentAttemptOperationKey(value: unknown) {
  const serialized = JSON.stringify(canonicalize(value)) ?? "null";
  return [
    hashText(serialized, 0x811c9dc5),
    hashText(serialized, 0x9e3779b9),
    hashText(serialized, 0x85ebca6b),
    hashText(serialized, 0xc2b2ae35),
  ].join("");
}

export function derivePaymentAttemptUuid(paymentAttemptId: string, discriminator: string | number) {
  const normalized = normalizePaymentAttemptId(paymentAttemptId);
  if (!normalized) throw new Error("Identifiant de tentative de paiement invalide.");
  const operationKey = createPaymentAttemptOperationKey(`${normalized}:${discriminator}`);
  const variant = ((parseInt(operationKey[16], 16) & 0x3) | 0x8).toString(16);
  return `${operationKey.slice(0, 8)}-${operationKey.slice(8, 12)}-4${operationKey.slice(13, 16)}-${variant}${operationKey.slice(17, 20)}-${operationKey.slice(20, 32)}`;
}

export function buildPaymentAttemptReference(prefix: string, paymentAttemptId: string) {
  const normalized = normalizePaymentAttemptId(paymentAttemptId);
  if (!normalized) throw new Error("Identifiant de tentative de paiement invalide.");
  return `${prefix}-${normalized.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function getOrCreatePaymentAttemptId(
  scope: string,
  operationKey: string,
  options: { storage?: PaymentAttemptStorage | null; candidateId?: string | null } = {},
) {
  const storage = options.storage === undefined ? getDefaultStorage() : options.storage;
  const existing = readStoredAttempt(scope, storage);
  if (existing?.operationKey === operationKey) return existing.id;

  const id = normalizePaymentAttemptId(options.candidateId) ?? createSecureUuid();
  writeStoredAttempt(scope, { id, operationKey, createdAt: Date.now() }, storage);
  return id;
}

export function rememberPaymentAttemptId(
  scope: string,
  paymentAttemptId: string,
  storage: PaymentAttemptStorage | null = getDefaultStorage(),
) {
  const id = normalizePaymentAttemptId(paymentAttemptId);
  if (!id) return null;
  const existing = readStoredAttempt(scope, storage);
  writeStoredAttempt(scope, {
    id,
    operationKey: existing?.id === id ? existing.operationKey : null,
    createdAt: existing?.id === id ? existing.createdAt : Date.now(),
    redirectedAt: existing?.id === id ? existing.redirectedAt : null,
  }, storage);
  return id;
}

export function readPaymentAttemptId(
  scope: string,
  storage: PaymentAttemptStorage | null = getDefaultStorage(),
) {
  return readStoredAttempt(scope, storage)?.id ?? null;
}

export function markPaymentAttemptRedirected(
  scope: string,
  paymentAttemptId: string,
  storage: PaymentAttemptStorage | null = getDefaultStorage(),
) {
  const id = normalizePaymentAttemptId(paymentAttemptId);
  const existing = readStoredAttempt(scope, storage);
  if (!id || !existing || existing.id !== id) return false;
  writeStoredAttempt(scope, { ...existing, redirectedAt: Date.now() }, storage);
  return true;
}

export function readRedirectedPaymentAttemptId(
  scope: string,
  storage: PaymentAttemptStorage | null = getDefaultStorage(),
) {
  const existing = readStoredAttempt(scope, storage);
  return existing?.redirectedAt ? existing.id : null;
}

export function shouldCancelPaymentAttemptAfterNavigation(
  navigationType: string | null,
  pageWasRestored: boolean,
  search: string,
) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("status") === "success" || params.get("status") === "cancelled") return false;
  return pageWasRestored || navigationType === "back_forward";
}

export function clearPaymentAttemptId(
  scope: string,
  expectedId?: string | null,
  storage: PaymentAttemptStorage | null = getDefaultStorage(),
) {
  if (!storage) return false;
  const existing = readStoredAttempt(scope, storage);
  const normalizedExpected = expectedId ? normalizePaymentAttemptId(expectedId) : null;
  if (!existing || (normalizedExpected && existing.id !== normalizedExpected)) return false;
  try {
    storage.removeItem(storageKey(scope));
    return true;
  } catch {
    return false;
  }
}

export function appendPaymentAttemptToUrl(url: string, paymentAttemptId: string) {
  const id = normalizePaymentAttemptId(paymentAttemptId);
  if (!id) throw new Error("Identifiant de tentative de paiement invalide.");
  const parsed = new URL(url);
  parsed.searchParams.set(PAYMENT_ATTEMPT_QUERY_PARAM, id);
  return parsed.toString();
}

export function paymentAttemptReducer(state: PaymentAttemptState, event: PaymentAttemptEvent): PaymentAttemptState {
  switch (event.type) {
    case "submit":
      return state === "succeeded" || state === "cancelling" ? state : "submitting";
    case "uncertain":
      return state === "submitting" ? "checking" : state;
    case "redirect":
      return state === "submitting" || state === "checking" ? "redirecting" : state;
    case "settled":
      return "succeeded";
    case "cancel":
      return state === "succeeded" ? state : "cancelling";
    case "cancelled":
      return state === "cancelling" ? "cancelled" : state;
    case "fail":
      return state === "succeeded" ? state : "failed";
    case "reset":
      return "idle";
    default:
      return state;
  }
}

export function isPaymentAttemptTerminal(resolution: CheckoutSessionResolution) {
  return ["completed", "succeeded", "paid", "cancelled", "canceled", "expired", "failed"]
    .includes(resolution.state ?? "")
    || ["paid", "succeeded", "captured", "cancelled", "canceled", "failed"]
      .includes(resolution.paymentStatus ?? "")
    || resolution.retryable === false;
}

export async function resolvePaymentAttemptStatus({
  paymentAttemptId,
  getStatus,
  pollAttempts = 5,
  pollDelayMs = 900,
  sleep = defaultSleep,
}: PaymentAttemptStatusOptions) {
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    try {
      const resolution = normalizeResponse(await getStatus(), paymentAttemptId);
      if (resolution.url || resolution.sessionId || isPaymentAttemptTerminal(resolution)) {
        return resolution;
      }
    } catch {
      // A status endpoint can briefly lag behind the checkout creation transaction.
    }

    if (attempt < pollAttempts - 1) await sleep(pollDelayMs);
  }

  return null;
}

export async function createCheckoutWithRecovery({
  paymentAttemptId,
  create,
  getStatus,
  timeoutMs = 15_000,
  pollAttempts = 5,
  pollDelayMs = 900,
  sleep = defaultSleep,
}: CheckoutRecoveryOptions) {
  const id = normalizePaymentAttemptId(paymentAttemptId);
  if (!id) throw new Error("Identifiant de tentative de paiement invalide.");

  try {
    const created = normalizeResponse(await withTimeout(create(), timeoutMs), id);
    if (created.url || created.sessionId || isPaymentAttemptTerminal(created)) return created;
  } catch (error) {
    if (!isPaymentAttemptRecoverableError(error)) throw error;
  }

  const recovered = await resolvePaymentAttemptStatus({
    paymentAttemptId: id,
    getStatus,
    pollAttempts,
    pollDelayMs,
    sleep,
  });
  if (recovered) return recovered;

  throw new PaymentAttemptIndeterminateError(id);
}

export function isPaymentAttemptIndeterminateError(error: unknown): error is PaymentAttemptIndeterminateError {
  return error instanceof PaymentAttemptIndeterminateError;
}
