export const MARKETING_CSRF_COOKIE_NAME = "__Host-tok_marketing_csrf";
export const MARKETING_CSRF_HEADER_NAME = "x-tok-marketing-csrf";
export const MARKETING_SESSION_EXPIRED_EVENT = "tok:marketing-session-expired";

export const MARKETING_BFF_ENDPOINTS = {
  session: "/api/marketing/session",
  login: "/api/marketing/login",
  mfaEnroll: "/api/marketing/mfa/enroll",
  mfaVerify: "/api/marketing/mfa/verify",
  logout: "/api/marketing/logout",
  rpc: "/api/marketing/rpc",
  orchestrator: "/api/marketing/orchestrator",
} as const;

const MAX_MARKETING_REQUEST_BYTES = 256_000;
const MAX_MARKETING_RESPONSE_BYTES = 2_000_000;
const MARKETING_REQUEST_TIMEOUT_MS = 20_000;
const MARKETING_LOGIN_PATH = "/marketing/login";

type MarketingBffRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  requireCsrf?: boolean;
  redirectOnUnauthorized?: boolean;
  signal?: AbortSignal;
};

export class MarketingBffError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "MarketingBffError";
    this.status = status;
  }
}

function publicErrorMessage(status: number) {
  if (status === 400) return "La demande n’a pas pu être traitée.";
  if (status === 401) return "Votre session marketing a expiré.";
  if (status === 403) return "Cette action n’est pas autorisée.";
  if (status === 409) return "Les données ont changé. Actualisez avant de réessayer.";
  if (status === 413) return "La demande dépasse la taille autorisée.";
  if (status === 429) return "Trop de tentatives. Patientez avant de réessayer.";
  return "Le service marketing est momentanément indisponible.";
}

function isSafeMarketingApiPath(path: string) {
  return /^\/api\/marketing(?:\/[A-Za-z0-9_-]+)*$/.test(path);
}

export function isMarketingTotpCode(value: string) {
  return /^\d{6}$/.test(value.trim());
}

export function readMarketingCsrfToken(cookieSource?: string) {
  const source = cookieSource
    ?? (typeof document !== "undefined" ? document.cookie : "");

  for (const item of source.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== MARKETING_CSRF_COOKIE_NAME) continue;

    try {
      const token = decodeURIComponent(item.slice(separator + 1)).trim();
      return token.length >= 16 && token.length <= 512 && !/[\s;]/.test(token)
        ? token
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function readBoundedJson(response: Response) {
  if (response.status === 204 || response.status === 205) return undefined;

  const contentType = response.headers.get("content-type") || "";
  if (!/\bjson\b/i.test(contentType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new MarketingBffError("Réponse marketing invalide.", 502);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MARKETING_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new MarketingBffError("Réponse marketing trop volumineuse.", 502);
  }

  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let serialized = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_MARKETING_RESPONSE_BYTES) {
        await reader.cancel();
        throw new MarketingBffError("Réponse marketing trop volumineuse.", 502);
      }
      serialized += decoder.decode(value, { stream: true });
    }
    serialized += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  if (!serialized.trim()) return undefined;
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new MarketingBffError("Réponse marketing invalide.", 502);
  }
}

function redirectToMarketingLogin() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MARKETING_SESSION_EXPIRED_EVENT));
  if (window.location.pathname !== MARKETING_LOGIN_PATH) {
    window.location.replace(MARKETING_LOGIN_PATH);
  }
}

export async function marketingBffRequest<T>(
  path: string,
  options: MarketingBffRequestOptions = {},
): Promise<T> {
  if (!isSafeMarketingApiPath(path)) {
    throw new MarketingBffError("Destination marketing invalide.");
  }

  const method = options.method || (options.body === undefined ? "GET" : "POST");
  const requireCsrf = options.requireCsrf ?? method !== "GET";
  const csrfToken = requireCsrf ? readMarketingCsrfToken() : null;
  if (requireCsrf && !csrfToken) {
    throw new MarketingBffError("Session de sécurité indisponible.", 403);
  }

  const serializedBody = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (serializedBody && new TextEncoder().encode(serializedBody).byteLength > MAX_MARKETING_REQUEST_BYTES) {
    throw new MarketingBffError("La demande dépasse la taille autorisée.", 413);
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), MARKETING_REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (serializedBody !== undefined) headers["Content-Type"] = "application/json";
    if (csrfToken) headers[MARKETING_CSRF_HEADER_NAME] = csrfToken;

    const response = await fetch(path, {
      method,
      body: serializedBody,
      credentials: "include",
      cache: "no-store",
      headers,
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    if (response.status === 401 && options.redirectOnUnauthorized !== false) {
      await response.body?.cancel().catch(() => undefined);
      redirectToMarketingLogin();
      throw new MarketingBffError(publicErrorMessage(401), 401);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new MarketingBffError(publicErrorMessage(response.status), response.status);
    }

    return await readBoundedJson(response) as T;
  } catch (error) {
    if (error instanceof MarketingBffError) throw error;
    if (controller.signal.aborted) {
      throw new MarketingBffError("Le service marketing ne répond pas dans le délai prévu.", 408);
    }
    throw new MarketingBffError("Le service marketing est momentanément indisponible.", 503);
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
