import { marketingLoginReturnTarget } from "@/marketing/useMarketingUrlState";

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
  agent: "/api/marketing/agent",
  launch: "/api/marketing/launch",
} as const;

const MAX_MARKETING_REQUEST_BYTES = 256_000;
const MAX_MAILING_IMAGE_REQUEST_BYTES = 4 * 1024 * 1024 + 4096;
const MAX_MARKETING_RESPONSE_BYTES = 2_000_000;
const MARKETING_REQUEST_TIMEOUT_MS = 20_000;
const MAX_MARKETING_REQUEST_TIMEOUT_MS = 130_000;
const MARKETING_LOGIN_PATH = "/marketing/login";

type MarketingBffRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  requireCsrf?: boolean;
  redirectOnUnauthorized?: boolean;
  signal?: AbortSignal;
  /**
   * Per-request budget. The default suits a database round trip; the AI agent
   * runs a reasoning pass and several image generations and needs far longer,
   * so it raises this rather than every call waiting on the slowest one.
   */
  timeoutMs?: number;
};

export class MarketingBffError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = "MarketingBffError";
    this.status = status;
    this.code = code && PUBLIC_ERROR_CODES.has(code) ? code : undefined;
  }
}

const MARKETING_OPERATION_ERRORS: Record<string, { status: number; message: string }> = {
  backlink_source_not_allowed: { status:403, message:"Vérifiez les conditions et les règles robots du domaine, puis autorisez la cible avant la lecture." },
  search_console_unavailable: { status: 503, message: "Aucun relevé serveur disponible. Importez le fichier Search Console privé ou réessayez après son actualisation." },
  instagram_access_required: { status: 403,
    message: "Vérifiez les autorisations Instagram. Les commentaires de publications tierces doivent être consultés dans Instagram." },
  instagram_research_unavailable: { status: 503,
    message: "La veille Instagram est indisponible. Vérifiez la connexion et les autorisations Meta." },
  marketing_daily_runtime_unavailable: { status: 503,
    message: "Le service de génération quotidienne doit être activé avant de démarrer cette série." },
  marketing_daily_scheduler_unavailable: { status: 503,
    message: "La planification quotidienne doit être configurée avant de démarrer cette série." },
  marketing_campaign_approval_required: { status: 400,
    message: "Approuvez d’abord la campagne dans l’onglet Campagnes, puis approuvez et planifiez cet élément." },
  marketing_schedule_too_soon: { status: 400,
    message: "Choisissez une date de diffusion située au moins deux minutes dans le futur." },
  marketing_schedule_quiet_hours: { status: 400,
    message: "Planifiez cet envoi entre 08:00 et 20:00, heure de Zurich." },
  marketing_channel_unavailable: { status: 400,
    message: "Le canal de diffusion n’est pas prêt. Vérifiez sa connexion dans l’onglet Intégrations." },
  marketing_audience_empty: { status: 400,
    message: "Aucun destinataire éligible ne correspond à cet envoi. Vérifiez l’audience et les autorisations de contact." },
  marketing_audience_mismatch: { status: 400,
    message: "L’audience de cet élément diffère de celle de la campagne approuvée. Corrigez le ciblage avant de réessayer." },
  marketing_content_required: { status: 400,
    message: "Complétez et relisez le contenu de cet élément avant de l’approuver." },
  marketing_campaign_incomplete: { status: 400,
    message: "Complétez l’objectif, le contenu, l’audience et les canaux de la campagne avant de l’approuver." },
  marketing_approval_reason_required: { status: 400,
    message: "Indiquez un motif de validation suffisamment détaillé avant d’approuver." },
  marketing_item_terminal: { status: 400,
    message: "Cet élément est déjà terminé ou annulé. Actualisez le calendrier pour consulter son état." },
  marketing_campaign_unavailable: { status: 400,
    message: "Cette campagne est en pause, terminée, annulée ou en échec. Vérifiez son état dans l’onglet Campagnes." },
  marketing_edit_conflict: { status: 409,
    message: "Cet élément a été modifié depuis son ouverture. Actualisez les données avant de réessayer." },
  marketing_record_not_found: { status: 404,
    message: "Cet élément n’existe plus. Actualisez les données pour retrouver les éléments disponibles." },
  marketing_outreach_review_required: { status: 400,
    message: "Vérifiez que la proposition est en attente de validation et résolvez les alertes avant de l’approuver." },
  marketing_outreach_target_unavailable: { status: 400,
    message: "Validez la cible de prospection avant d’approuver ce message." },
  marketing_outreach_draft_immutable: { status: 400,
    message: "Ce message de prospection est déjà approuvé. Actualisez les données pour consulter sa version validée." },
  instagram_story_manual_required: { status: 400,
    message: "Le visuel Instagram 9:16 est prévu pour une Story manuelle. Exportez-le ou choisissez un format du fil avant de planifier l’envoi automatique." },
};

const PUBLIC_ERROR_CODES = new Set([
  "authentication_required", "authentication_failed", "mfa_failed",
  "marketing_visual_required", "marketing_readiness_unavailable",
  "configuration_unavailable", "service_unavailable", "mfa_setup_unavailable",
  "ai_auth_unavailable", "discovery_unavailable", "discovery_invalid_response",
  "mailing_image_invalid", "mailing_image_conflict", "mailing_image_upload_failed",
  "social_image_invalid", "social_image_conflict", "social_image_upload_failed",
  "mailing_recipients_invalid", "mailing_recipients_unavailable",
  ...Object.keys(MARKETING_OPERATION_ERRORS),
]);

function publicErrorMessage(status: number, code?: string) {
  if (code && Object.prototype.hasOwnProperty.call(MARKETING_OPERATION_ERRORS, code)) {
    const known = MARKETING_OPERATION_ERRORS[code];
    if (known.status === status) return known.message;
  }
  if (status === 400 && code === "mailing_image_invalid") {
    return "Choisissez une image JPG ou PNG valide de 3 Mo maximum pour cet e-mail.";
  }
  if (status === 409 && code === "mailing_image_conflict") {
    return "Cet e-mail ou sa campagne a changé ou a été approuvé. Actualisez avant de réimporter l’image.";
  }
  if (status === 503 && code === "mailing_image_upload_failed") {
    return "L’image n’a pas pu être enregistrée. Réessayez l’import de cet e-mail.";
  }
  if (status === 400 && code === "social_image_invalid") return "Choisissez une image JPG ou PNG valide de 3 Mo maximum.";
  if (status === 409 && code === "social_image_conflict") return "La publication ou sa campagne a changé. Actualisez avant de réimporter l’image.";
  if (status === 503 && code === "social_image_upload_failed") return "L’image n’a pas pu être enregistrée. Réessayez l’import.";
  if (status === 400 && code === "mailing_recipients_invalid") {
    return "Vérifiez la liste : de 1 à 500 adresses e-mail valides sont acceptées.";
  }
  if (status === 503 && code === "mailing_recipients_unavailable") {
    return "Les destinataires n’ont pas pu être vérifiés. Réessayez leur enregistrement.";
  }
  if (status === 400 && code === "marketing_visual_required") {
    return "Ajoutez un visuel HTTPS valide à chaque publication illustrée avant de l’approuver.";
  }
  if (status === 503 && code === "marketing_readiness_unavailable") {
    return "La vérification des visuels est indisponible. Réessayez avant d’approuver.";
  }
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
  const wasLogin = window.location.pathname === MARKETING_LOGIN_PATH;
  const returnTo = marketingLoginReturnTarget(`${window.location.pathname}${window.location.search || ""}`);
  window.dispatchEvent(new Event(MARKETING_SESSION_EXPIRED_EVENT));
  if (!wasLogin) {
    window.location.replace(returnTo === "/marketing" ? MARKETING_LOGIN_PATH : `${MARKETING_LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`);
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
  const isMailingImageUpload = method === "POST" && path === MARKETING_BFF_ENDPOINTS.agent
    && options.body !== null && typeof options.body === "object" && !Array.isArray(options.body)
    && "action" in options.body && ["upload_mailing_image", "upload_social_image"].includes(String(options.body.action));
  const maxRequestBytes = isMailingImageUpload ? MAX_MAILING_IMAGE_REQUEST_BYTES : MAX_MARKETING_REQUEST_BYTES;
  if (serializedBody && new TextEncoder().encode(serializedBody).byteLength > maxRequestBytes) {
    throw new MarketingBffError("La demande dépasse la taille autorisée.", 413);
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const budgetMs = Math.min(
    MAX_MARKETING_REQUEST_TIMEOUT_MS,
    Math.max(1_000, options.timeoutMs ?? MARKETING_REQUEST_TIMEOUT_MS),
  );
  const timeout = window.setTimeout(() => controller.abort(), budgetMs);

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
      // Only expose known machine codes, never arbitrary upstream messages.
      const payload = await readBoundedJson(response).catch(() => undefined);
      const candidate = payload && typeof payload === "object" && "error" in payload
        ? payload.error : undefined;
      const code = candidate && typeof candidate === "object" && "code" in candidate
        && typeof candidate.code === "string" ? candidate.code : undefined;
      throw new MarketingBffError(publicErrorMessage(response.status, code), response.status, code);
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
