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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKABLE_ENTITY_TYPES = new Set(["restaurant", "dish", "collection", "ad"]);
const TRACKABLE_EVENT_NAMES_BY_ENTITY = new Map<string, Set<string>>([
  ["restaurant", new Set(["view", "favorite", "unfavorite", "share", "call", "directions", "menu_open", "gallery_open", "order_start", "add_to_cart", "checkout_initiated", "order_completed", "reservation_start"])],
  ["dish", new Set(["view", "add_to_cart", "remove_from_cart", "customize", "share"])],
  ["collection", new Set(["view", "click", "filter", "sort"])],
  ["ad", new Set(["impression", "click", "cta_click", "dismiss"])],
]);
const ALLOWED_EVENT_PAYLOAD_KEYS = new Set([
  "source",
  "surface",
  "section",
  "position",
  "restaurant_id",
  "dish_id",
  "collection_id",
  "ad_id",
  "campaign_id",
  "query",
  "city",
  "cuisine",
  "device",
  "locale",
  "variant",
  "total",
  "payment_method",
  "journey_type",
]);
const MAX_EVENT_PAYLOAD_KEYS = 12;
const MAX_EVENT_PAYLOAD_BYTES = 2_048;
const MAX_EVENT_PAYLOAD_STRING_LENGTH = 160;
const MAX_BATCH_EVENTS = 20;

type AnalyticsPayload = {
  kind?: string;
  entityId?: string;
  entityType?: string;
  eventName?: string;
  payload?: Record<string, unknown>;
  searchQuery?: string;
  resultsCount?: number;
  locationLat?: number | null;
  locationLng?: number | null;
  source?: string | null;
  impressionId?: string | null;
};

type AnalyticsBatchPayload = AnalyticsPayload & {
  events?: AnalyticsPayload[];
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeKind(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function asOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sanitizeEventPayload(value: unknown) {
  const input = asObject(value);
  const output: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (Object.keys(output).length >= MAX_EVENT_PAYLOAD_KEYS) break;
    if (!ALLOWED_EVENT_PAYLOAD_KEYS.has(key)) continue;

    if (typeof rawValue === "string") {
      output[key] = rawValue.trim().slice(0, MAX_EVENT_PAYLOAD_STRING_LENGTH);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      output[key] = rawValue;
    } else if (typeof rawValue === "boolean" || rawValue === null) {
      output[key] = rawValue;
    }
  }

  const encoded = JSON.stringify(output);
  if (encoded.length > MAX_EVENT_PAYLOAD_BYTES) {
    throw new HttpError(400, "payload trop volumineux");
  }

  return output;
}

function isAllowedEvent(entityType: string, eventName: string) {
  return Boolean(TRACKABLE_EVENT_NAMES_BY_ENTITY.get(entityType)?.has(eventName));
}

function buildBatchEventDedupeKey(input: AnalyticsPayload) {
  return JSON.stringify({
    kind: normalizeKind(input.kind),
    entityType: normalizeKind(input.entityType),
    entityId: normalizeText(input.entityId),
    eventName: normalizeKind(input.eventName),
    searchQuery: normalizeText(input.searchQuery),
    impressionId: normalizeText(input.impressionId),
    source: normalizeText(input.source),
  });
}

function dedupeBatchEvents(events: AnalyticsPayload[]) {
  const seen = new Set<string>();
  const deduped: AnalyticsPayload[] = [];

  for (const event of events.slice(0, MAX_BATCH_EVENTS)) {
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const dedupeKey = buildBatchEventDedupeKey(event);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push(event);
  }

  return deduped;
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  return forwardedFor.split(",")[0]?.trim() || "unknown";
}

async function maybeResolveUserId(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!token || token === anonKey || token === serviceRoleKey) return null;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

async function auditRejectedEvent({
  adminClient,
  req,
  userId,
  entityType,
  eventName,
  errorMessage,
}: {
  adminClient: ReturnType<typeof createAdminClient>;
  req: Request;
  userId: string | null;
  entityType: string;
  eventName: string;
  errorMessage: string;
}) {
  await writeAuditLog({
    adminClient,
    actor: userId
      ? { userId, roles: [], isServiceRole: false, authMode: "user_jwt" }
      : null,
    request: req,
    functionName: "track-analytics",
    action: "reject_public_analytics_event",
    status: "failure",
    targetEntityType: "analytics_event",
    errorMessage,
    metadata: {
      entity_type: entityType || "missing",
      event_name: eventName || "missing",
    },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("track-analytics");
  const adminClient = createAdminClient();
  let userId: string | null = null;
  let kind = "";
  let rejectedEventType = "";
  let rejectedEventName = "";

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    const input: AnalyticsBatchPayload = await req.json();
    kind = normalizeKind(input.kind);
    userId = await maybeResolveUserId(req);
    const limiter = createRateLimiter(adminClient, "track-analytics");
    const ipSubject = `ip:${getClientIp(req)}`;

    await limiter.consume(ipSubject, { maxRequests: 240, windowSeconds: 60 });
    await limiter.consume(`${ipSubject}:kind:${kind || "unknown"}`, { maxRequests: 120, windowSeconds: 60 });
    if (userId) {
      await limiter.consume(`user:${userId}`, { maxRequests: 600, windowSeconds: 300 });
    }

    const recordEvent = async (input: AnalyticsPayload) => {
      const entityId = normalizeText(input.entityId);
      const entityType = normalizeKind(input.entityType);
      const eventName = normalizeKind(input.eventName);
      rejectedEventType = entityType;
      rejectedEventName = eventName;

      if (!isUuid(entityId)) {
        throw new HttpError(400, "entityId invalide");
      }
      if (!TRACKABLE_ENTITY_TYPES.has(entityType)) {
        throw new HttpError(400, "entityType invalide");
      }
      if (!isAllowedEvent(entityType, eventName)) {
        throw new HttpError(400, "eventName invalide");
      }
      const safePayload = sanitizeEventPayload(input.payload);

      const { error } = await adminClient.from("event_store").insert({
        entity_id: entityId,
        entity_type: entityType,
        event_name: eventName,
        payload: {
          ...safePayload,
          user_id: userId,
        },
      });

      if (error) {
        throw new HttpError(500, error.message);
      }
    };

    const recordSearch = async (input: AnalyticsPayload) => {
      const searchQuery = normalizeText(input.searchQuery);
      if (!searchQuery) {
        throw new HttpError(400, "searchQuery requis");
      }

      const { error } = await adminClient.from("search_logs").insert({
        user_id: userId,
        search_query: searchQuery,
        results_count: asOptionalNumber(input.resultsCount),
        location_lat: asOptionalNumber(input.locationLat),
        location_lng: asOptionalNumber(input.locationLng),
      });

      if (error) {
        throw new HttpError(500, error.message);
      }
    };

    const recordClick = async (input: AnalyticsPayload) => {
      const entityType = normalizeKind(input.entityType);
      const entityId = normalizeText(input.entityId);
      const impressionId = normalizeText(input.impressionId);

      if (!TRACKABLE_ENTITY_TYPES.has(entityType)) {
        throw new HttpError(400, "entityType invalide");
      }
      if (!isUuid(entityId)) {
        throw new HttpError(400, "entityId invalide");
      }

      const { error } = await adminClient.from("clicks").insert({
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        impression_id: isUuid(impressionId) ? impressionId : null,
      });

      if (error) {
        throw new HttpError(500, error.message);
      }
    };

    const recordImpression = async (input: AnalyticsPayload) => {
      const entityType = normalizeKind(input.entityType);
      const entityId = normalizeText(input.entityId);

      if (!TRACKABLE_ENTITY_TYPES.has(entityType)) {
        throw new HttpError(400, "entityType invalide");
      }
      if (!isUuid(entityId)) {
        throw new HttpError(400, "entityId invalide");
      }

      const { data, error } = await adminClient.from("impressions").insert({
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        source: normalizeText(input.source) || null,
      }).select("id").single();

      if (error) {
        throw new HttpError(500, error.message);
      }

      return data?.id || null;
    };

    switch (kind) {
      case "batch": {
        if (!Array.isArray(input.events)) {
          throw new HttpError(400, "events requis");
        }
        if (input.events.length > MAX_BATCH_EVENTS) {
          throw new HttpError(400, "batch trop volumineux");
        }

        const events = dedupeBatchEvents(input.events);
        let recordedCount = 0;

        for (const event of events) {
          const eventKind = normalizeKind(event.kind);
          if (eventKind === "event") {
            await recordEvent(event);
          } else if (eventKind === "search") {
            await recordSearch(event);
          } else if (eventKind === "click") {
            await recordClick(event);
          } else if (eventKind === "impression") {
            await recordImpression(event);
          } else {
            throw new HttpError(400, "Type de tracking invalide");
          }
          recordedCount += 1;
        }

        return jsonResponse({
          recorded: true,
          count: recordedCount,
          deduped: input.events.length - events.length,
        }, 200, corsHeaders);
      }

      case "event": {
        await recordEvent(input);
        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      case "search": {
        await recordSearch(input);
        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      case "impression": {
        const id = await recordImpression(input);
        return jsonResponse({ id }, 200, corsHeaders);
      }

      case "click": {
        await recordClick(input);
        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      default:
        throw new HttpError(400, "Type de tracking invalide");
    }
  } catch (error) {
    const isClientRejection = error instanceof HttpError && error.status >= 400 && error.status < 500;
    const logMessage = error instanceof Error ? error.message : "unknown";
    if (isClientRejection) {
      log.warn("track-analytics rejected", { message: logMessage });
    } else {
      log.error("track-analytics error", { message: logMessage });
    }

    if ((kind === "event" || kind === "batch") && isClientRejection && (rejectedEventType || rejectedEventName)) {
      await auditRejectedEvent({
        adminClient,
        req,
        userId,
        entityType: rejectedEventType,
        eventName: rejectedEventName,
        errorMessage: error.message,
      });
    }
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
