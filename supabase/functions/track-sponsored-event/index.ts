import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  HttpError,
  createAdminClient,
  jsonResponse,
} from "../_shared/auth.ts";
import {
  getCampaignEventUnitCost,
  getCampaignPricing,
  normalizeCampaignPricingStrategy,
} from "../_shared/campaign-pricing.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

const IMPRESSION_WINDOW_MS = 30 * 60 * 1000;
const CLICK_WINDOW_MS = 5 * 60 * 1000;
const CONVERSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const SPONSORED_EVENT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
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
  eventId?: string;
  eventSignature?: string;
  signedAt?: string;
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

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function signaturePayload(input: {
  campaignId: string;
  restaurantId: string;
  eventType: string;
  viewerId: string;
  eventId: string;
  conversionType: string;
  entityId: string;
  source: string;
  page: string;
  signedAt: string;
}) {
  return JSON.stringify({
    campaignId: input.campaignId,
    restaurantId: input.restaurantId,
    eventType: input.eventType,
    viewerId: input.viewerId,
    eventId: input.eventId || null,
    conversionType: input.conversionType || null,
    entityId: input.entityId || null,
    source: input.source || null,
    page: input.page || null,
    signedAt: input.signedAt,
  });
}

async function verifySponsoredEventSignature({
  signingSecret,
  eventSignature,
  signedAt,
  payload,
}: {
  signingSecret: string;
  eventSignature: string;
  signedAt: string;
  payload: string;
}) {
  if (!signingSecret) return true;
  if (!eventSignature || !signedAt) {
    throw new HttpError(401, "signature_required");
  }

  const signedAtMs = Date.parse(signedAt);
  if (!Number.isFinite(signedAtMs) || Math.abs(Date.now() - signedAtMs) > SPONSORED_EVENT_SIGNATURE_MAX_AGE_MS) {
    throw new HttpError(401, "signature_expired");
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(eventSignature),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
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
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("track-sponsored-event");

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
    const eventId = String(payload.eventId || "").trim();
    const eventSignature = String(payload.eventSignature || "").trim();
    const signedAt = String(payload.signedAt || "").trim();
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
    if (eventId && eventId.length < 8) {
      throw new HttpError(400, "eventId invalide");
    }
    if (eventType === "conversion" && conversionType && !VALID_CONVERSION_TYPES.has(conversionType)) {
      throw new HttpError(400, "Type de conversion invalide");
    }

    const adminClient = createAdminClient();
    const userId = await maybeResolveUserId(req);
    const limiter = createRateLimiter(adminClient, "track-sponsored-event");
    const clientIp = getClientIp(req) || "unknown";

    await limiter.consume(`ip:${clientIp}`, { maxRequests: 120, windowSeconds: 60 });
    await limiter.consume(`campaign:${campaignId}:event:${eventType}`, { maxRequests: 1000, windowSeconds: 60 });
    await limiter.consume(`viewer:${viewerId}:campaign:${campaignId}`, { maxRequests: 60, windowSeconds: 300 });
    if (eventType === "conversion") {
      await limiter.consume(`conversion:${viewerId}:campaign:${campaignId}`, { maxRequests: 10, windowSeconds: 3600 });
    }

    const { data: campaign, error: campaignError } = await adminClient
      .from("ad_campaigns")
      .select("id, restaurant_id, status, starts_at, ends_at, total_budget, spent, budget_daily, daily_spent, daily_spent_date, cpm_rate, cpc_rate, conversion_rate, pricing_strategy")
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

    const signingSecret = Deno.env.get("SPONSORED_EVENT_SIGNING_SECRET") || "";
    const signatureIsValid = await verifySponsoredEventSignature({
      signingSecret,
      eventSignature,
      signedAt,
      payload: signaturePayload({
        campaignId,
        restaurantId: campaign.restaurant_id,
        eventType,
        viewerId,
        eventId,
        conversionType,
        entityId,
        source,
        page,
        signedAt,
      }),
    });
    if (!signatureIsValid) {
      throw new HttpError(401, "signature_invalid");
    }

    const now = Date.now();
    const startsAt = campaign.starts_at ? Date.parse(String(campaign.starts_at)) : Number.NaN;
    const endsAt = campaign.ends_at ? Date.parse(String(campaign.ends_at)) : Number.NaN;
    const pricingStrategy = normalizeCampaignPricingStrategy(
      (campaign as Record<string, unknown>).pricing_strategy,
      "conversion",
    );
    const pricing = getCampaignPricing({
      cpmRate: Number(campaign.cpm_rate || 0),
      cpcRate: Number((campaign as Record<string, unknown>).cpc_rate || 0),
      conversionRate: Number((campaign as Record<string, unknown>).conversion_rate || 0),
    }, pricingStrategy);
    const totalBudget = Number(campaign.total_budget || 0);
    const spent = Number(campaign.spent || 0);
    const eventCost = getCampaignEventUnitCost(
      eventType as "impression" | "click" | "conversion",
      pricing,
      totalBudget > 0,
      pricingStrategy,
    );
    const exhausted = totalBudget > 0 && (spent + eventCost) > totalBudget;

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
        if ((dailySpent + eventCost) > budgetDaily) {
          return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "daily_budget_exhausted" }, 200, corsHeaders);
        }
      }
    } else if (["draft", "pending_payment", "cancelled"].includes(String(campaign.status || ""))) {
      return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "campaign_not_eligible" }, 200, corsHeaders);
    }

    const dedupeKey = eventId
      ? await sha256(JSON.stringify({
        campaignId,
        restaurantId: campaign.restaurant_id,
        eventType,
        eventId,
      }))
      : await sha256(JSON.stringify({
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
          event_id: eventId || null,
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
    log.error("track-sponsored-event error", { message: error instanceof Error ? error.message : "unknown" });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
});
