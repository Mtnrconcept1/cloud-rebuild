import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKABLE_ENTITY_TYPES = new Set(["restaurant", "dish", "collection", "ad"]);

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

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function getEnv(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function createAdminClient() {
  return createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function jsonResponse(
  payload: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    const input: AnalyticsPayload = await req.json();
    const kind = normalizeKind(input.kind);
    const adminClient = createAdminClient();
    const userId = await maybeResolveUserId(req);

    switch (kind) {
      case "event": {
        const entityId = normalizeText(input.entityId);
        const entityType = normalizeText(input.entityType);
        const eventName = normalizeText(input.eventName);

        if (!isUuid(entityId)) {
          console.error("[Analytics] Invalid entityId:", entityId, "Kind:", kind, "input:", JSON.stringify(input));
          throw new HttpError(400, `entityId invalide (UUID requis): ${entityId}`);
        }
        if (!entityType) {
          throw new HttpError(400, "entityType requis");
        }
        if (!eventName) {
          throw new HttpError(400, "eventName requis");
        }

        const { error } = await adminClient.from("event_store").insert({
          entity_id: entityId,
          entity_type: entityType,
          event_name: eventName,
          payload: {
            ...asObject(input.payload),
            user_id: userId,
          },
        });

        if (error) {
          throw new HttpError(500, error.message);
        }

        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      case "search": {
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

        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      case "impression": {
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

        return jsonResponse({ id: data?.id || null }, 200, corsHeaders);
      }

      case "click": {
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

        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      case "batch": {
        const items = asObject(input.payload)?.items;
        if (!Array.isArray(items)) {
          throw new HttpError(400, "Items array requis");
        }

        const events = [];
        const impressions = [];
        const clicks = [];
        const searches = [];

        for (const item of items) {
          const k = normalizeKind(item.kind);
          if (k === "event") {
            const eType = normalizeText(item.entityType);
            const eName = normalizeText(item.eventName);
            const eId = normalizeText(item.entityId);
            if (isUuid(eId) && eType && eName) {
              events.push({
                entity_id: eId,
                entity_type: eType,
                event_name: eName,
                payload: { ...asObject(item.payload), user_id: userId }
              });
            }
          } else if (k === "impression") {
            const eType = normalizeKind(item.entityType);
            const eId = normalizeText(item.entityId);
            if (TRACKABLE_ENTITY_TYPES.has(eType) && isUuid(eId)) {
              impressions.push({
                id: isUuid(item.impressionId) ? item.impressionId : undefined,
                user_id: userId,
                entity_type: eType,
                entity_id: eId,
                source: normalizeText(item.source) || null
              });
            }
          } else if (k === "click") {
             const eType = normalizeKind(item.entityType);
             const eId = normalizeText(item.entityId);
             if (TRACKABLE_ENTITY_TYPES.has(eType) && isUuid(eId)) {
               clicks.push({
                 user_id: userId,
                 entity_type: eType,
                 entity_id: eId,
                 impression_id: isUuid(item.impressionId) ? item.impressionId : null,
               });
             }
          } else if (k === "search") {
             const sq = normalizeText(item.searchQuery);
             if (sq) {
               searches.push({
                 user_id: userId,
                 search_query: sq,
                 results_count: asOptionalNumber(item.resultsCount),
                 location_lat: asOptionalNumber(item.locationLat),
                 location_lng: asOptionalNumber(item.locationLng),
               });
             }
          }
        }

        const promises = [];
        if (events.length > 0) promises.push(adminClient.from("event_store").insert(events));
        if (impressions.length > 0) promises.push(adminClient.from("impressions").insert(impressions));
        if (clicks.length > 0) promises.push(adminClient.from("clicks").insert(clicks));
        if (searches.length > 0) promises.push(adminClient.from("search_logs").insert(searches));

        await Promise.all(promises);

        return jsonResponse({ recorded: true }, 200, corsHeaders);
      }

      default:
        throw new HttpError(400, "Type de tracking invalide");
    }
  } catch (error) {
    console.error("track-analytics error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
