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
import {
  buildCorsHeaders,
  handleCorsPreflight,
  isRequestOriginAllowed,
} from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";

const IMPRESSION_WINDOW_MS = 30 * 60 * 1000;
const CLICK_WINDOW_MS = 5 * 60 * 1000;
const CONVERSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_SOURCE_LENGTH = 128;
const MAX_PAGE_LENGTH = 128;
const MAX_PAYMENT_METHOD_LENGTH = 32;
const VALID_EVENT_TYPES = new Set(["impression", "click", "conversion"]);
const VALID_CONVERSION_TYPES = new Set(["order", "reservation", "zero-attente"]);
const VALID_JOURNEY_TYPES = new Set(["delivery", "takeaway", "reservation", "zero-attente"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHOD_PATTERN = /^[a-z0-9_-]*$/;

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
  journeyType?: string;
  eventId?: string;
  touchToken?: string;
};

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function canonicalUuid(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getClientIp(req: Request) {
  const trustedProxyIp = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip");
  if (trustedProxyIp?.trim()) return trustedProxyIp.trim();

  const forwardedFor = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwardedFor.at(-1) || "";
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

async function readJsonBody(req: Request): Promise<SponsoredEventPayload> {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    throw new HttpError(413, "request_body_too_large");
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new HttpError(413, "request_body_too_large");
  }

  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    return parsed as SponsoredEventPayload;
  } catch {
    throw new HttpError(400, "invalid_json_body");
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
  if (error || !data?.user) {
    throw new HttpError(401, "invalid_authentication");
  }
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
    if (!isRequestOriginAllowed(req)) {
      throw new HttpError(403, "origin_not_allowed");
    }

    const payload = await readJsonBody(req);
    const eventType = normalizeText(payload.eventType);
    const campaignId = canonicalUuid(payload.campaignId);
    const restaurantIdInput = canonicalUuid(payload.restaurantId);
    const viewerId = String(payload.viewerId || "").trim();
    const source = String(payload.source || "").trim();
    const page = String(payload.page || "").trim();
    const entityId = canonicalUuid(payload.entityId);
    const paymentMethod = normalizeText(payload.paymentMethod);
    const journeyType = normalizeText(payload.journeyType);
    const eventId = canonicalUuid(payload.eventId);
    const touchToken = canonicalUuid(payload.touchToken);
    const conversionType = normalizeText(payload.conversionType);

    if (!VALID_EVENT_TYPES.has(eventType)) {
      throw new HttpError(400, "Type d'evenement invalide");
    }
    if (!UUID_PATTERN.test(campaignId)) {
      throw new HttpError(400, "campaignId invalide");
    }
    if (restaurantIdInput && !UUID_PATTERN.test(restaurantIdInput)) {
      throw new HttpError(400, "restaurantId invalide");
    }
    if (!viewerId || viewerId.length < 8 || viewerId.length > 256) {
      throw new HttpError(400, "viewerId requis");
    }
    if (eventId && !UUID_PATTERN.test(eventId)) {
      throw new HttpError(400, "eventId invalide");
    }
    if (source.length > MAX_SOURCE_LENGTH || page.length > MAX_PAGE_LENGTH) {
      throw new HttpError(400, "source ou page invalide");
    }
    if (
      paymentMethod.length > MAX_PAYMENT_METHOD_LENGTH
      || !PAYMENT_METHOD_PATTERN.test(paymentMethod)
    ) {
      throw new HttpError(400, "paymentMethod invalide");
    }
    if (touchToken && !UUID_PATTERN.test(touchToken)) {
      throw new HttpError(400, "touchToken invalide");
    }
    if (eventType === "conversion") {
      if (!VALID_CONVERSION_TYPES.has(conversionType)) {
        throw new HttpError(400, "Type de conversion invalide");
      }
      if (!UUID_PATTERN.test(entityId)) {
        throw new HttpError(400, "entityId invalide");
      }
    } else if (entityId) {
      throw new HttpError(400, "entityId reserve aux conversions");
    }
    if (journeyType && !VALID_JOURNEY_TYPES.has(journeyType)) {
      throw new HttpError(400, "Parcours de conversion invalide");
    }

    const adminClient = createAdminClient();
    const userId = await maybeResolveUserId(req);
    if (eventType === "conversion" && !userId) {
      throw new HttpError(401, "conversion_authentication_required");
    }
    const limiter = createRateLimiter(adminClient, "track-sponsored-event");
    const clientIp = getClientIp(req) || "unknown";
    if (!userId && clientIp === "unknown") {
      throw new HttpError(503, "anonymous_client_identity_unavailable");
    }
    const userAgent = (req.headers.get("user-agent") || "unknown").slice(0, 512);
    const serverFingerprint = userId
      ? `user:${userId}`
      : clientIp !== "unknown"
        ? `client:${await sha256(`${clientIp}|${userAgent}`)}`
        : `viewer:${viewerId}`;

    await limiter.consume(`ip:${clientIp}`, { maxRequests: 120, windowSeconds: 60 });
    await limiter.consume(`campaign:${campaignId}:event:${eventType}`, { maxRequests: 1000, windowSeconds: 60 });
    await limiter.consume(`viewer:${viewerId}:campaign:${campaignId}`, { maxRequests: 60, windowSeconds: 300 });
    await limiter.consume(
      `fingerprint:${serverFingerprint}:campaign:${campaignId}`,
      { maxRequests: 60, windowSeconds: 300 },
    );
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

    const now = Date.now();
    const startsAt = campaign.starts_at ? Date.parse(String(campaign.starts_at)) : Number.NaN;
    const endsAt = campaign.ends_at ? Date.parse(String(campaign.ends_at)) : Number.NaN;
    const pricingStrategy = normalizeCampaignPricingStrategy(
      (campaign as Record<string, unknown>).pricing_strategy,
      "conversion",
    );
    const pricing = getCampaignPricing({
      cpmRate: Math.max(0, Number(campaign.cpm_rate || 0)),
      cpcRate: Math.max(0, Number((campaign as Record<string, unknown>).cpc_rate || 0)),
      conversionRate: Math.max(0, Number((campaign as Record<string, unknown>).conversion_rate || 0)),
    }, pricingStrategy);
    const totalBudget = Math.max(0, Number(campaign.total_budget || 0));
    const spent = Math.max(0, Number(campaign.spent || 0));
    const eventMatchesPricingStrategy = (
      (pricingStrategy === "visibility" && eventType === "impression")
      || (pricingStrategy === "traffic" && eventType === "click")
      || (pricingStrategy === "conversion" && eventType === "conversion")
    );
    const eventCost = getCampaignEventUnitCost(
      eventType as "impression" | "click" | "conversion",
      pricing,
      totalBudget > 0 && eventMatchesPricingStrategy,
      pricingStrategy,
    );
    const exhausted = totalBudget > 0 && (spent + eventCost) > totalBudget;

    let dedupeKey: string;
    if (eventType === "conversion" && entityId) {
      dedupeKey = await sha256(`actualites|${campaignId}|${conversionType || "conversion"}|${entityId}`);
    } else {
      // Browser-generated event ids are useful for transport idempotence but
      // cannot be trusted for billing. Paid delivery is deduplicated against a
      // server-derived client fingerprint and time window, so rotating an
      // eventId or viewerId cannot drain a campaign budget.
      dedupeKey = await sha256(JSON.stringify({
        campaignId,
        restaurantId: campaign.restaurant_id,
        eventType,
        serverFingerprint,
        bucketKey: getBucketKey(eventType, entityId),
      }));
    }

    const { data: isInternalActor, error: internalActorError } = await adminClient.rpc(
      "is_restaurant_internal_actor",
      {
        p_user_id: userId,
        p_restaurant_id: campaign.restaurant_id,
      },
    );
    if (internalActorError) {
      throw new HttpError(500, internalActorError.message);
    }
    if (isInternalActor) {
      const internalDedupeKey = eventId
        ? await sha256(JSON.stringify({
            campaignId,
            restaurantId: campaign.restaurant_id,
            eventType,
            eventId,
          }))
        : dedupeKey;
      const { error: internalEventError } = await adminClient
        .from("ad_campaign_internal_test_events")
        .upsert({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          event_type: eventType,
          conversion_type: eventType === "conversion" ? (conversionType || null) : null,
          actor_user_id: userId,
          dedupe_key: internalDedupeKey,
          source: source || null,
          page: page || null,
          payload: {
            viewer_id: viewerId,
            entity_id: entityId || null,
            payment_method: paymentMethod || null,
            journey_type: journeyType || null,
            event_id: eventId || null,
          },
        }, {
          onConflict: "campaign_id,event_type,dedupe_key",
          ignoreDuplicates: true,
        });
      if (internalEventError) {
        throw new HttpError(500, internalEventError.message);
      }
      return jsonResponse({
        recorded: false,
        deduped: false,
        ignored: true,
        reason: "internal_actor",
        testRecorded: true,
      }, 200, corsHeaders);
    }

    let existingTransportEvent: { id?: string | null } | null = null;
    if (eventId && eventType !== "conversion") {
      const { data, error } = await adminClient
        .from("ad_campaign_events")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("event_type", eventType)
        .contains("payload", { event_id: eventId })
        .limit(1)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message);
      existingTransportEvent = data;
    }

    let resultingTouchToken: string | null = null;
    const touchDedupeKey = eventType === "click"
      ? await sha256(`sponsored-touch|${campaignId}|${eventId || dedupeKey}`)
      : null;
    const getOrCreateClickTouch = async () => {
      if (eventType !== "click") return null;
      if (resultingTouchToken) return resultingTouchToken;

      const { data: insertedTouch, error: touchInsertError } = await adminClient
        .from("ad_campaign_attribution_touches")
        .upsert({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          user_id: userId,
          viewer_id: viewerId,
          tracking_call_id: eventId || null,
          dedupe_key: touchDedupeKey || dedupeKey,
          claimed_by_user_id: userId,
          claimed_at: userId ? new Date().toISOString() : null,
          status: userId ? "claimed" : "active",
          source: source || null,
          page: page || null,
          metadata: {
            event_id: eventId || null,
            billing_dedupe_key: dedupeKey,
          },
          expires_at: new Date(Date.now() + CONVERSION_WINDOW_MS).toISOString(),
        }, {
          onConflict: "campaign_id,dedupe_key",
          ignoreDuplicates: true,
        })
        .select("id,user_id,viewer_id,status")
        .maybeSingle();
      if (touchInsertError) throw new HttpError(500, touchInsertError.message);

      let touch = insertedTouch;
      if (!touch?.id) {
        const { data: existingTouch, error: existingTouchError } = await adminClient
          .from("ad_campaign_attribution_touches")
          .select("id,user_id,viewer_id,status")
          .eq("campaign_id", campaignId)
          .eq("dedupe_key", touchDedupeKey || dedupeKey)
          .maybeSingle();
        if (existingTouchError) throw new HttpError(500, existingTouchError.message);
        touch = existingTouch;
      }
      if (!touch?.id) return null;

      if (
        (touch.user_id && touch.user_id !== userId)
        || (!touch.user_id && !userId && touch.viewer_id !== viewerId)
      ) {
        throw new HttpError(403, "sponsored_touch_identity_conflict");
      }
      if (!touch.user_id && userId) {
        const { error: claimError } = await adminClient
          .from("ad_campaign_attribution_touches")
          .update({
            user_id: userId,
            claimed_by_user_id: userId,
            claimed_at: new Date().toISOString(),
            status: touch.status === "active" ? "claimed" : touch.status,
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", touch.id)
          .is("user_id", null);
        if (claimError) throw new HttpError(500, claimError.message);
      }

      resultingTouchToken = touch.id;
      return resultingTouchToken;
    };

    if (existingTransportEvent?.id) {
      if (eventType === "click") {
        resultingTouchToken = await getOrCreateClickTouch();
      }
      return jsonResponse({
        recorded: false,
        deduped: true,
        ignored: false,
        pending: false,
        reason: null,
        touchToken: resultingTouchToken,
      }, 200, corsHeaders);
    }

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
        return jsonResponse({
          recorded: false,
          deduped: false,
          ignored: true,
          reason: "budget_exhausted",
        }, 200, corsHeaders);
      }
      const budgetDaily = Math.max(0, Number(campaign.budget_daily || 0));
      if (budgetDaily > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const dailySpentDate = campaign.daily_spent_date ? String(campaign.daily_spent_date) : null;
        const dailySpent = (dailySpentDate === today)
          ? Math.max(0, Number(campaign.daily_spent || 0))
          : 0;
        if ((dailySpent + eventCost) > budgetDaily) {
          return jsonResponse({
            recorded: false,
            deduped: false,
            ignored: true,
            reason: "daily_budget_exhausted",
          }, 200, corsHeaders);
        }
      }
    } else if (["draft", "pending_payment", "cancelled"].includes(String(campaign.status || ""))) {
      return jsonResponse({ recorded: false, deduped: false, ignored: true, reason: "campaign_not_eligible" }, 200, corsHeaders);
    }

    if (eventType === "conversion" && touchToken) {
      const { data: touch, error: touchError } = await adminClient
        .from("ad_campaign_attribution_touches")
        .select("id,campaign_id,restaurant_id,user_id,viewer_id,expires_at")
        .eq("id", touchToken)
        .maybeSingle();
      if (touchError) {
        throw new HttpError(500, touchError.message);
      }
      const touchExpiresAt = touch?.expires_at ? Date.parse(String(touch.expires_at)) : Number.NaN;
      const touchIsValid = Boolean(
        touch
        && touch.campaign_id === campaignId
        && touch.restaurant_id === campaign.restaurant_id
        && (
          touch.user_id
            ? Boolean(userId && touch.user_id === userId)
            : touch.viewer_id === viewerId
        )
        && Number.isFinite(touchExpiresAt)
        && touchExpiresAt >= Date.now()
      );
      if (!touchIsValid) {
        return jsonResponse({
          recorded: false,
          deduped: false,
          ignored: true,
          reason: "invalid_or_expired_touch",
        }, 200, corsHeaders);
      }
    } else if (eventType === "conversion") {
      const attributionCutoff = new Date(Date.now() - CONVERSION_WINDOW_MS).toISOString();
      let hasRecentClick = false;

      if (userId) {
        const { data: userClick, error: userClickError } = await adminClient
          .from("ad_campaign_events")
          .select("id")
          .eq("campaign_id", campaignId)
          .eq("restaurant_id", campaign.restaurant_id)
          .eq("event_type", "click")
          .eq("user_id", userId)
          .gte("occurred_at", attributionCutoff)
          .limit(1)
          .maybeSingle();
        if (userClickError) throw new HttpError(500, userClickError.message);
        hasRecentClick = Boolean(userClick);
      }

      if (!hasRecentClick) {
        const { data: viewerClick, error: viewerClickError } = await adminClient
          .from("ad_campaign_events")
          .select("id")
          .eq("campaign_id", campaignId)
          .eq("restaurant_id", campaign.restaurant_id)
          .eq("event_type", "click")
          .contains("payload", { viewer_id: viewerId })
          .gte("occurred_at", attributionCutoff)
          .limit(1)
          .maybeSingle();
        if (viewerClickError) throw new HttpError(500, viewerClickError.message);
        hasRecentClick = Boolean(viewerClick);
      }

      if (!hasRecentClick) {
        return jsonResponse({
          recorded: false,
          deduped: false,
          ignored: true,
          reason: "missing_attribution_touch",
        }, 200, corsHeaders);
      }
    }

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
          journey_type: journeyType || null,
          event_id: eventId || null,
          touch_token: touchToken || null,
        },
      },
    );

    if (recordError) {
      throw new HttpError(500, recordError.message);
    }

    const [
      { data: existingEvent, error: existingEventError },
      { data: existingTransport, error: existingTransportError },
      { data: pendingConversion, error: pendingError },
    ] = await Promise.all([
      adminClient
        .from("ad_campaign_events")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("event_type", eventType)
        .eq("dedupe_key", dedupeKey)
        .maybeSingle(),
      eventId && eventType !== "conversion"
        ? adminClient
            .from("ad_campaign_events")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("event_type", eventType)
            .contains("payload", { event_id: eventId })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      eventType === "conversion" && entityId
        ? adminClient
            .from("ad_campaign_pending_conversions")
            .select("id,status")
            .eq("campaign_id", campaignId)
            .eq("conversion_type", conversionType || "")
            .eq("entity_id", entityId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (existingEventError) throw new HttpError(500, existingEventError.message);
    if (existingTransportError) throw new HttpError(500, existingTransportError.message);
    if (pendingError) throw new HttpError(500, pendingError.message);

    const acceptedEvent = existingEvent || existingTransport;
    const pending = pendingConversion?.status === "pending";
    const duplicate = !recorded && Boolean(acceptedEvent || pendingConversion);

    if (eventType === "click" && (recorded || acceptedEvent)) {
      resultingTouchToken = await getOrCreateClickTouch();
    }

    if (eventType === "conversion" && touchToken && (recorded || acceptedEvent || pendingConversion)) {
      const { error: touchUpdateError } = await adminClient
        .from("ad_campaign_attribution_touches")
        .update({
          last_used_at: new Date().toISOString(),
          ...(userId ? { user_id: userId } : {}),
        })
        .eq("id", touchToken);
      if (touchUpdateError) throw new HttpError(500, touchUpdateError.message);
    }

    return jsonResponse(
      {
        recorded: Boolean(recorded && acceptedEvent),
        deduped: duplicate,
        pending,
        ignored: !recorded && !duplicate && !pending,
        reason: !recorded && !duplicate && !pending ? "rejected_by_campaign_guard" : null,
        touchToken: resultingTouchToken,
      },
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
