import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  HttpError,
  createAdminClient,
  jsonResponse,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IMPRESSION_WINDOW_MS = 30 * 60 * 1000;
const CLICK_WINDOW_MS = 5 * 60 * 1000;
const CONVERSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const VALID_EVENT_TYPES = new Set(["impression", "click", "conversion"]);
const VALID_CONVERSION_TYPES = new Set(["order", "reservation", "zero-attente"]);

type SponsoredEventPayload = {
  eventType?: string;
  campaignId?: string;
  restaurantId?: string;
  viewerId?: string;
  source?: string;
  page?: string;
  conversionType?: string;
  entityId?: string;
  paymentMethod?: string;
};

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  return forwardedFor.split(",")[0]?.trim() || "";
}

function getBucketKey(eventType: string, entityId: string) {
  if (eventType === "conversion" && entityId) return entityId;

  const now = Date.now();
  const windowMs = eventType === "impression"
    ? IMPRESSION_WINDOW_MS
    : eventType === "click"
      ? CLICK_WINDOW_MS
      : CONVERSION_WINDOW_MS;

  return `${eventType}:${Math.floor(now / windowMs)}`;
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

    const payload: SponsoredEventPayload = await req.json();
    const eventType = normalizeText(payload.eventType);
    const campaignId = String(payload.campaignId || "");
    const restaurantIdInput = String(payload.restaurantId || "");
    const viewerId = String(payload.viewerId || "");
    const source = String(payload.source || "");
    const page = String(payload.page || "");
    const entityId = String(payload.entityId || "");
    const paymentMethod = String(payload.paymentMethod || "");
    const conversionType = normalizeText(payload.conversionType);

    if (!VALID_EVENT_TYPES.has(eventType)) {
      throw new HttpError(400, "Type d'evenement invalide");
    }
    if (!campaignId) {
      throw new HttpError(400, "campaignId requis");
    }
    if (!viewerId || viewerId.length < 8) {
      throw new HttpError(400, "viewerId requis");
    }
    if (eventType === "conversion" && conversionType && !VALID_CONVERSION_TYPES.has(conversionType)) {
      throw new HttpError(400, "Type de conversion invalide");
    }

    const adminClient = createAdminClient();
    const userId = await maybeResolveUserId(req);

    const { data: campaign, error: campaignError } = await adminClient
      .from("ad_campaigns")
      .select("id, restaurant_id, status, starts_at, ends_at, total_budget, spent, budget_daily, daily_spent, daily_spent_date, cpm_rate")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) {
      throw new HttpError(500, campaignError.message);
    }
    if (!campaign) {
      throw new HttpError(404, "Campagne introuvable");
    }

    if (restaurantIdInput && restaurantIdInput !== campaign.restaurant_id) {
      throw new HttpError(400, "Restaurant de campagne invalide");
    }

    const now = Date.now();
    const startsAt = campaign.starts_at ? Date.parse(String(campaign.starts_at)) : Number.NaN;
    const endsAt = campaign.ends_at ? Date.parse(String(campaign.ends_at)) : Number.NaN;
    const exhausted = Number(campaign.total_budget || 0) > 0 &&
      Number(campaign.spent || 0) >= Number(campaign.total_budget || 0);

    if (eventType !== "conversion") {
      if (String(campaign.status || "") !== "active") {
        return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "inactive" }, 200, corsHeaders);
      }
      if (Number.isFinite(startsAt) && startsAt > now) {
        return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "not_started" }, 200, corsHeaders);
      }
      if (Number.isFinite(endsAt) && endsAt < now) {
        return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "expired" }, 200, corsHeaders);
      }
      if (exhausted) {
        return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "budget_exhausted" }, 200, corsHeaders);
      }
      const budgetDaily = Number(campaign.budget_daily || 0);
      if (budgetDaily > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const dailySpentDate = campaign.daily_spent_date ? String(campaign.daily_spent_date) : null;
        const dailySpent = (dailySpentDate === today) ? Number(campaign.daily_spent || 0) : 0;
        if (dailySpent >= budgetDaily) {
          return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "daily_budget_exhausted" }, 200, corsHeaders);
        }
      }
    } else if (["draft", "pending_payment", "cancelled"].includes(String(campaign.status || ""))) {
      return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "campaign_not_eligible" }, 200, corsHeaders);
    }

    const dedupeKey = await sha256(JSON.stringify({
      campaignId,
      restaurantId: campaign.restaurant_id,
      eventType,
      conversionType: conversionType || null,
      entityId: entityId || null,
      viewerId,
      userId,
      bucketKey: getBucketKey(eventType, entityId),
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
      source,
      page,
    }));

    const { data: recorded, error: recordError } = await adminClient.rpc(
      "record_ad_campaign_event",
      {
        p_campaign_id: campaignId,
        p_restaurant_id: campaign.restaurant_id,
        p_event_type: eventType,
        p_dedupe_key: dedupeKey,
        p_user_id: userId,
        p_source: source || null,
        p_page: page || null,
        p_conversion_type: eventType === "conversion" ? (conversionType || null) : null,
        p_payload: {
          viewer_id: viewerId,
          entity_id: entityId || null,
          payment_method: paymentMethod || null,
        },
      },
    );

    if (recordError) {
      throw new HttpError(500, recordError.message);
    }

    return jsonResponse(
      { recorded: Boolean(recorded), deduped: !recorded, ignored: false },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("track-sponsored-event error:", error);
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
