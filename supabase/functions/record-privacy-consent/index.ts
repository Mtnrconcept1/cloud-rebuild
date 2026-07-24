import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  HttpError,
  createAdminClient,
  jsonResponse,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONSENT_VERSION_PATTERN = /^[A-Za-z0-9._:-]{3,100}$/;
const ACTIONS = new Set(["accept_all", "reject_all", "save_preferences", "withdraw"]);
const SOURCES = new Set(["banner", "settings", "cookies_page", "mobile"]);
const MAX_BODY_BYTES = 8_192;

function normalizeText(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  return forwardedFor.split(",")[0]?.trim() || "";
}

async function hashIp(ip: string) {
  const salt = Deno.env.get("PRIVACY_CONSENT_IP_SALT")?.trim() || "";
  if (!ip || !salt) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${ip}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function maybeResolveUserId(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!token || token === anonKey || token === serviceRoleKey) return null;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await userClient.auth.getUser();
  return error ? null : data.user?.id || null;
}

function parseClientDate(value: unknown) {
  const text = normalizeText(value, 80);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new HttpError(400, "clientRecordedAt invalide");
  const now = Date.now();
  if (timestamp < now - (7 * 24 * 60 * 60 * 1000) || timestamp > now + (24 * 60 * 60 * 1000)) {
    throw new HttpError(400, "clientRecordedAt hors plage autorisée");
  }
  return new Date(timestamp).toISOString();
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("record-privacy-consent");
  const adminClient = createAdminClient();
  let userId: string | null = null;
  let recordId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) throw new HttpError(413, "Payload trop volumineux");

    let input: unknown;
    try {
      input = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "JSON invalide");
    }
    if (!isRecord(input)) throw new HttpError(400, "Payload invalide");

    recordId = normalizeText(input.recordId, 50);
    const anonymousId = normalizeText(input.anonymousId, 50);
    const consentVersion = normalizeText(input.consentVersion, 100);
    const action = normalizeText(input.action, 40);
    const source = normalizeText(input.source, 40);
    const locale = normalizeText(input.locale, 32) || null;
    const categories = isRecord(input.categories) ? input.categories : null;

    if (!UUID_PATTERN.test(recordId)) throw new HttpError(400, "recordId invalide");
    if (!UUID_PATTERN.test(anonymousId)) throw new HttpError(400, "anonymousId invalide");
    if (!CONSENT_VERSION_PATTERN.test(consentVersion)) throw new HttpError(400, "consentVersion invalide");
    if (!ACTIONS.has(action)) throw new HttpError(400, "action invalide");
    if (!SOURCES.has(source)) throw new HttpError(400, "source invalide");
    if (!categories || categories.necessary !== true) throw new HttpError(400, "La catégorie nécessaire doit rester active");

    for (const category of ["analytics", "marketing", "personalization", "geolocation"] as const) {
      if (typeof categories[category] !== "boolean") {
        throw new HttpError(400, `Catégorie ${category} invalide`);
      }
    }

    userId = await maybeResolveUserId(req);
    const ip = getClientIp(req);
    const limiter = createRateLimiter(adminClient, "record-privacy-consent");
    const ipSubject = `ip:${ip || "unknown"}`;
    await limiter.consume(ipSubject, { maxRequests: 60, windowSeconds: 3_600 });
    await limiter.consume(`anonymous:${anonymousId}`, { maxRequests: 30, windowSeconds: 3_600 });
    if (userId) await limiter.consume(`user:${userId}`, { maxRequests: 100, windowSeconds: 86_400 });

    const row = {
      id: recordId,
      user_id: userId,
      anonymous_id: anonymousId,
      consent_version: consentVersion,
      action,
      necessary: true,
      analytics: categories.analytics,
      marketing: categories.marketing,
      personalization: categories.personalization,
      geolocation: categories.geolocation,
      source,
      locale,
      client_recorded_at: parseClientDate(input.clientRecordedAt),
      user_agent: normalizeText(req.headers.get("user-agent"), 512) || null,
      ip_hash: await hashIp(ip),
      request_metadata: {
        origin: normalizeText(req.headers.get("origin"), 300) || null,
        referer_path: (() => {
          try {
            const referer = req.headers.get("referer");
            return referer ? new URL(referer).pathname.slice(0, 300) : null;
          } catch {
            return null;
          }
        })(),
      },
    };

    const { data: inserted, error: insertError } = await adminClient
      .from("privacy_consent_events")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true })
      .select("id, occurred_at")
      .maybeSingle();
    if (insertError) throw new HttpError(500, insertError.message);

    let stored = inserted;
    if (!stored) {
      const { data: existing, error: existingError } = await adminClient
        .from("privacy_consent_events")
        .select("id, occurred_at")
        .eq("id", recordId)
        .maybeSingle();
      if (existingError || !existing) throw new HttpError(500, existingError?.message || "Consentement introuvable après enregistrement");
      stored = existing;
    }

    await writeAuditLog({
      adminClient,
      actor: userId ? { userId, roles: [], isServiceRole: false, authMode: "user_jwt" } : null,
      request: req,
      functionName: "record-privacy-consent",
      action,
      status: "success",
      targetEntityType: "privacy_consent_event",
      targetEntityId: recordId,
      metadata: {
        consent_version: consentVersion,
        source,
        analytics: categories.analytics,
        marketing: categories.marketing,
        personalization: categories.personalization,
        geolocation: categories.geolocation,
      },
    });

    return jsonResponse({
      recorded: true,
      id: stored.id,
      occurredAt: stored.occurred_at,
    }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) log.error("record consent failed", { message });
    else log.warn("record consent rejected", { message });

    await writeAuditLog({
      adminClient,
      actor: userId ? { userId, roles: [], isServiceRole: false, authMode: "user_jwt" } : null,
      request: req,
      functionName: "record-privacy-consent",
      action: "record_consent_failure",
      status: "failure",
      targetEntityType: "privacy_consent_event",
      targetEntityId: recordId,
      errorMessage: message,
    });

    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
