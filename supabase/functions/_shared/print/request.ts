/**
 * Cloudprinter transport contract, retry policy and failure taxonomy.
 *
 * This module deliberately imports nothing. The retry loop and the error
 * classification decide whether an incident is reported as a provider outage
 * or as a TheTok misconfiguration, and that decision has already been
 * misdiagnosed twice from the audit log alone. Keeping it dependency-free lets
 * the rules be unit tested for real instead of asserted by grepping the
 * provider source.
 *
 * The transport receives an already-serialised body: credentials are resolved
 * by the caller before the retry loop, so a configuration fault
 * (CLOUDPRINTER_NOT_CONFIGURED, CLOUDPRINTER_DISABLED) can never be caught
 * here, retried three times and re-reported as "Cloudprinter unavailable".
 */

export type CloudprinterTransportResponse = {
  status: number;
  text: string;
};

export type CloudprinterTransport = (
  path: string,
  body: string,
) => Promise<CloudprinterTransportResponse>;

export type CloudprinterRequestOptions = {
  expected: number[];
  notFound?: number[];
  safeRetry?: boolean;
  ambiguousOnFailure?: boolean;
};

export const SAFE_RETRY_DELAYS_MS = [250, 750];

/** Network failure codes that mean "we never learned the outcome in time". */
const TIMEOUT_TRANSPORT_CODES = new Set([
  "aborterror",
  "esockettimedout",
  "etimedout",
  "timeouterror",
  "err_response_timeout",
]);

export class CloudprinterError extends Error {
  status: number | null;
  retryable: boolean;
  ambiguous: boolean;
  code: string;
  /** Safe network diagnostic (`enotfound`, `etimedout`, …). Never a payload. */
  transportCode: string | null;

  constructor(input: {
    code: string;
    message: string;
    status?: number | null;
    retryable?: boolean;
    ambiguous?: boolean;
    transportCode?: string | null;
  }) {
    super(input.message);
    this.name = "CloudprinterError";
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable === true;
    this.ambiguous = input.ambiguous === true;
    this.transportCode = input.transportCode ?? null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts a bounded, non-sensitive identifier for a transport failure so an
 * outage can be told apart from a DNS or TLS fault without logging the request.
 */
export function cloudprinterNetworkErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = asText((error as { code?: unknown }).code);
    if (/^[A-Za-z0-9_]{2,64}$/.test(code)) return code.toLowerCase();
    const name = asText((error as { name?: unknown }).name);
    if (/^[A-Za-z0-9_]{2,64}$/.test(name)) return name.toLowerCase();
  }
  return "unknown";
}

/** Serialises a Cloudprinter payload with its API key. Never logged. */
export function cloudprinterRequestBody(payload: Record<string, unknown>, apiKey: string) {
  return JSON.stringify({ apikey: apiKey, ...payload });
}

export function parseCloudprinterBody(status: number, text: string): unknown | null {
  if (status === 204 || !text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw_text: text.slice(0, 300) };
  }
}

function safeNestedProviderText(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 5)) {
      const candidate = safeNestedProviderText(entry, depth + 1);
      if (candidate) return candidate;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["message", "description", "detail", "reason", "error", "errors"]) {
    if (!(key in record)) continue;
    const candidate = safeNestedProviderText(record[key], depth + 1);
    if (candidate) return candidate;
  }
  return "";
}

export function safeProviderMessage(status: number, body: unknown) {
  const candidate = safeNestedProviderText(body);
  return candidate
    ? candidate.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 300)
    : `Cloudprinter HTTP ${status}`;
}

/**
 * Runs one Cloudprinter call under the safe-retry policy.
 *
 * Only the transport call happens inside the guarded block, so every error
 * this throws is a genuine provider or network failure.
 */
export async function requestCloudprinter(input: {
  transport: CloudprinterTransport;
  path: string;
  body: string;
  options: CloudprinterRequestOptions;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}): Promise<unknown | null> {
  const { options } = input;
  const delays = input.retryDelaysMs ?? SAFE_RETRY_DELAYS_MS;
  const sleep = input.sleep ?? defaultSleep;
  const attempts = options.safeRetry ? delays.length + 1 : 1;
  let lastError: CloudprinterError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let failure: CloudprinterError;

    try {
      const response = await input.transport(input.path, input.body);
      const status = Number(response.status) || 0;
      const body = parseCloudprinterBody(status, response.text);
      if (options.notFound?.includes(status)) return null;
      if (options.expected.includes(status)) return body;

      const retryable = status === 429 || status >= 500 || status === 0;
      failure = new CloudprinterError({
        code: status > 0 ? `cloudprinter_http_${status}` : "cloudprinter_invalid_response",
        message: status > 0 ? safeProviderMessage(status, body) : "Cloudprinter unavailable",
        status: status > 0 ? status : null,
        retryable,
        ambiguous: Boolean(options.ambiguousOnFailure && retryable),
      });
    } catch (error) {
      const transportCode = cloudprinterNetworkErrorCode(error);
      const timedOut = TIMEOUT_TRANSPORT_CODES.has(transportCode);
      failure = new CloudprinterError({
        code: timedOut ? "cloudprinter_timeout" : "cloudprinter_unreachable",
        message: timedOut ? "Cloudprinter timeout" : "Cloudprinter unavailable",
        retryable: true,
        ambiguous: options.ambiguousOnFailure === true,
        transportCode,
      });
    }

    if (!options.safeRetry || !failure.retryable || attempt >= attempts - 1) throw failure;
    lastError = failure;
    await sleep(delays[attempt]);
  }

  throw lastError ?? new CloudprinterError({
    code: "cloudprinter_unknown",
    message: "Cloudprinter unavailable",
    retryable: true,
  });
}
