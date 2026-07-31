import { HttpError, type EdgeSupabaseClient } from "./auth.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeText(value: unknown, maxLength = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeMultilineText(value: unknown, maxLength = 4000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

export function maybeUuid(value: unknown) {
  const normalized = sanitizeText(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export function clampNumber(value: unknown, min: number, max: number, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeStringArray(value: unknown, limit = 20, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((entry) => sanitizeText(entry, maxLength).toLowerCase())
      .filter(Boolean),
  )).slice(0, limit);
}

export function createIdempotencyKey(prefix: string, provided?: unknown) {
  const explicit = sanitizeText(provided, 160);
  if (explicit) return explicit;
  return `${prefix}:${crypto.randomUUID()}`;
}

export async function getLatestConsent(
  adminClient: EdgeSupabaseClient,
  userId: string,
) {
  const { data, error } = await adminClient
    .from("consent_receipts")
    .select("consent_version, personalization, marketing, analytics, geolocation, recorded_at")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(503, "consent_check_unavailable");
  }

  return data || null;
}

export async function requirePersonalizationConsent(
  adminClient: EdgeSupabaseClient,
  userId: string,
) {
  const consent = await getLatestConsent(adminClient, userId);
  if (!consent?.personalization) {
    throw new HttpError(409, "personalization_consent_required", {
      consent_version: consent?.consent_version || null,
      consent_recorded_at: consent?.recorded_at || null,
    });
  }
  return consent;
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 500);
  return "internal_error";
}

export function jsonObject(value: unknown) {
  return isRecord(value) ? value : {};
}
