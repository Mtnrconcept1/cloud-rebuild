import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AUDIENCE_CRITERIA,
  matchesAudienceCriteria,
  normalizeAudienceCriteria,
  type AudienceCriteria,
  type AudienceSnapshot,
} from "@/lib/campaignTargeting";
import { pickWeightedCampaign, type WeightedCampaignRotationState } from "@/lib/sponsoredPlacement";

export type AnalyticsEventType =
  | "page_view"
  | "search"
  | "menu_view"
  | "add_to_cart"
  | "checkout_initiated"
  | "order_completed"
  | "favorite_added"
  | "favorite_removed"
  | "category_click"
  | "sponsored_impression"
  | "sponsored_click"
  | "sponsored_conversion"
  | "review_submitted";

interface TrackEventParams {
  eventType: AnalyticsEventType;
  eventData?: Record<string, any>;
  restaurantId?: string;
  cuisineType?: string;
  city?: string;
}

let currentUserId: string | null = null;

const SPONSORED_ATTRIBUTION_KEY = "miamz-sponsored-attribution-v1";
const SPONSORED_ATTRIBUTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SPONSORED_ROTATION_KEY = "miamz-sponsored-rotation-v1";
const SPONSORED_AUDIENCE_CACHE_MS = 5 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const INVALID_ORDER_STATUSES = new Set(["cancelled", "refused", "payment_failed"]);
const INVALID_RESERVATION_STATUSES = new Set(["cancelled", "refused"]);

type SponsoredRotationStore = Record<string, WeightedCampaignRotationState>;

interface SponsoredAttribution {
  campaignId: string;
  clickedAt: string;
}

type SponsoredAttributionMap = Record<string, SponsoredAttribution>;

let sponsoredAudienceSnapshotCache:
  | { userId: string; fetchedAt: number; snapshot: AudienceSnapshot }
  | null = null;

function readSponsoredAttributions(): SponsoredAttributionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SPONSORED_ATTRIBUTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSponsoredAttributions(attributions: SponsoredAttributionMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPONSORED_ATTRIBUTION_KEY, JSON.stringify(attributions));
  } catch {
    // Silent fail
  }
}

function rememberSponsoredAttribution(campaignId: string, restaurantId: string) {
  const attributions = readSponsoredAttributions();
  attributions[restaurantId] = {
    campaignId,
    clickedAt: new Date().toISOString(),
  };
  writeSponsoredAttributions(attributions);
}

function getValidSponsoredCampaignId(restaurantId: string): string | null {
  const attributions = readSponsoredAttributions();
  const attribution = attributions[restaurantId];
  if (!attribution?.campaignId || !attribution.clickedAt) return null;

  const clickedAtMs = Date.parse(attribution.clickedAt);
  if (!Number.isFinite(clickedAtMs) || (Date.now() - clickedAtMs) > SPONSORED_ATTRIBUTION_MAX_AGE_MS) {
    delete attributions[restaurantId];
    writeSponsoredAttributions(attributions);
    return null;
  }

  return attribution.campaignId;
}

let sponsoredRotationMemoryStore: SponsoredRotationStore = {};

function readSponsoredRotationStore(): SponsoredRotationStore {
  if (typeof window === "undefined") return sponsoredRotationMemoryStore;
  try {
    const raw = window.localStorage.getItem(SPONSORED_ROTATION_KEY);
    if (!raw) return sponsoredRotationMemoryStore;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return sponsoredRotationMemoryStore;
    sponsoredRotationMemoryStore = parsed;
    return parsed;
  } catch {
    return sponsoredRotationMemoryStore;
  }
}

function writeSponsoredRotationStore(store: SponsoredRotationStore) {
  sponsoredRotationMemoryStore = store;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPONSORED_ROTATION_KEY, JSON.stringify(store));
  } catch {
    // Silent fail
  }
}

function selectBudgetWeightedCampaignsForPage(campaigns: any[], page: string) {
  const rotationStore = readSponsoredRotationStore();
  const groupedCampaigns = new Map<string, any[]>();
  const passthroughCampaigns: any[] = [];

  (campaigns || []).forEach((campaign: any) => {
    const restaurantId = String(campaign?.restaurant_id || campaign?.restaurants?.id || "");
    if (!restaurantId) {
      passthroughCampaigns.push(campaign);
      return;
    }
    if (!groupedCampaigns.has(restaurantId)) groupedCampaigns.set(restaurantId, []);
    groupedCampaigns.get(restaurantId)!.push(campaign);
  });

  const selectedCampaigns: any[] = [];

  groupedCampaigns.forEach((restaurantCampaigns, restaurantId) => {
    if (restaurantCampaigns.length === 1) {
      selectedCampaigns.push(restaurantCampaigns[0]);
      return;
    }

    const stateKey = `${page}:${restaurantId}`;
    const cleanedState = rotationStore[stateKey] || { counts: {}, lastShownOrder: {}, sequence: 0 };
    const activeCampaignIds = new Set(
      restaurantCampaigns
        .map((campaign) => campaign?.id)
        .filter((campaignId): campaignId is string => !!campaignId)
        .map(String),
    );

    cleanedState.counts = Object.fromEntries(
      Object.entries(cleanedState.counts || {}).filter(([campaignId]) => activeCampaignIds.has(campaignId))
    );
    cleanedState.lastShownOrder = Object.fromEntries(
      Object.entries(cleanedState.lastShownOrder || {}).filter(([campaignId]) => activeCampaignIds.has(campaignId))
    );

    const { campaign, state } = pickWeightedCampaign(restaurantCampaigns, cleanedState);
    rotationStore[stateKey] = state;
    if (campaign) selectedCampaigns.push(campaign);
  });

  writeSponsoredRotationStore(rotationStore);
  return [...selectedCampaigns, ...passthroughCampaigns];
}

function isInvalidOrderStatus(status: unknown) {
  return INVALID_ORDER_STATUSES.has(String(status || "").toLowerCase());
}

function isInvalidReservationStatus(status: unknown) {
  return INVALID_RESERVATION_STATUSES.has(String(status || "").toLowerCase());
}

function normalizeTextToken(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function deriveServiceMoment(value: unknown) {
  const normalized = normalizeTextToken(value);
  if (!normalized) return null;
  if (normalized.includes("week")) return "weekend" as const;
  if (normalized === "lunch" || normalized === "midi") return "lunch" as const;
  if (normalized === "dinner" || normalized === "soir") return "dinner" as const;
  return null;
}

function deriveTimeServiceMoment(timeValue: unknown) {
  const raw = String(timeValue || "");
  const hour = Number(raw.split(":")[0]);
  if (!Number.isFinite(hour)) return null;
  return hour < 15 ? "lunch" : "dinner";
}

async function getCurrentAudienceSnapshot(): Promise<AudienceSnapshot | null> {
  if (!currentUserId) return null;

  if (
    sponsoredAudienceSnapshotCache &&
    sponsoredAudienceSnapshotCache.userId === currentUserId &&
    (Date.now() - sponsoredAudienceSnapshotCache.fetchedAt) < SPONSORED_AUDIENCE_CACHE_MS
  ) {
    return sponsoredAudienceSnapshotCache.snapshot;
  }

  try {
    const [profileResponse, favoritesResponse, ordersResponse, reservationsResponse] = await Promise.all([
      supabase.from("profiles" as any).select("city").eq("user_id", currentUserId).maybeSingle(),
      supabase.from("favorites" as any).select("restaurant_id").eq("user_id", currentUserId),
      supabase.from("orders" as any).select("restaurant_id, total_amount, created_at, delivery_address, status").eq("user_id", currentUserId),
      supabase.from("reservations" as any).select("restaurant_id, created_at, status, feature, metadata, time, date").eq("user_id", currentUserId),
    ]);

    const validOrders = ((ordersResponse.data || []) as any[]).filter((order) => !isInvalidOrderStatus(order?.status));
    const validReservations = ((reservationsResponse.data || []) as any[]).filter((reservation) => !isInvalidReservationStatus(reservation?.status));
    const favoriteRestaurantIds = ((favoritesResponse.data || []) as any[])
      .map((row: any) => String(row?.restaurant_id || ""))
      .filter(Boolean);

    const interactedRestaurantIds = Array.from(new Set([
      ...favoriteRestaurantIds,
      ...validOrders.map((order: any) => String(order?.restaurant_id || "")).filter(Boolean),
      ...validReservations.map((reservation: any) => String(reservation?.restaurant_id || "")).filter(Boolean),
    ]));

    let cuisineSignals: string[] = [];
    if (interactedRestaurantIds.length > 0) {
      const [restaurantCuisinesResponse, cuisinesResponse, restaurantsResponse] = await Promise.all([
        supabase
          .from("restaurant_cuisines")
          .select("restaurant_id, cuisine_id")
          .in("restaurant_id", interactedRestaurantIds),
        (supabase.from("cuisines") as any).select("id, name, slug, keywords"),
        (supabase.from("restaurants") as any).select("id, cuisine_type").in("id", interactedRestaurantIds),
      ]);

      const cuisineMap = new Map<string, string[]>();
      ((cuisinesResponse.data || []) as any[]).forEach((cuisine: any) => {
        const tokens = [
          cuisine?.name,
          cuisine?.slug,
          ...(Array.isArray(cuisine?.keywords) ? cuisine.keywords : []),
        ].map(normalizeTextToken).filter(Boolean);
        cuisineMap.set(String(cuisine?.id || ""), tokens);
      });

      cuisineSignals = Array.from(new Set([
        ...((restaurantCuisinesResponse.data || []) as any[]).flatMap((row: any) => cuisineMap.get(String(row?.cuisine_id || "")) || []),
        ...((restaurantsResponse.data || []) as any[])
          .flatMap((restaurant: any) => String(restaurant?.cuisine_type || "").split(","))
          .map(normalizeTextToken)
          .filter(Boolean),
      ]));
    }

    const journeyTypes = new Set<"delivery" | "takeaway" | "reservation" | "zero_attente">();
    const serviceMoments = new Set<"lunch" | "dinner" | "weekend">();
    const activityDates: number[] = [];

    validOrders.forEach((order: any) => {
      journeyTypes.add(order?.delivery_address ? "delivery" : "takeaway");
      const timestamp = Date.parse(String(order?.created_at || ""));
      if (Number.isFinite(timestamp)) {
        activityDates.push(timestamp);
        const weekday = new Date(timestamp).getDay();
        if (weekday === 0 || weekday === 6) serviceMoments.add("weekend");
      }
    });

    validReservations.forEach((reservation: any) => {
      const feature = normalizeTextToken(reservation?.feature || reservation?.metadata?.feature);
      journeyTypes.add(feature === "zero-attente" || feature === "zero_attente" ? "zero_attente" : "reservation");

      const explicitService = deriveServiceMoment(reservation?.metadata?.service);
      const fallbackService = explicitService || deriveTimeServiceMoment(reservation?.time);
      if (fallbackService) serviceMoments.add(fallbackService);

      const dateValue = reservation?.date ? `${reservation.date}T${reservation?.time || "12:00:00"}` : reservation?.created_at;
      const timestamp = Date.parse(String(dateValue || ""));
      if (Number.isFinite(timestamp)) {
        activityDates.push(timestamp);
        const weekday = new Date(timestamp).getDay();
        if (weekday === 0 || weekday === 6) serviceMoments.add("weekend");
      }
    });

    const totalOrderAmount = validOrders.reduce((sum: number, order: any) => sum + (Number(order?.total_amount) || 0), 0);
    const avgBasket = validOrders.length > 0 ? totalOrderAmount / validOrders.length : 0;
    const lastActivityAt = activityDates.length > 0 ? Math.max(...activityDates) : null;
    const daysSinceLastActivity = lastActivityAt ? Math.max(0, Math.floor((Date.now() - lastActivityAt) / MS_PER_DAY)) : null;

    const snapshot: AudienceSnapshot = {
      city: (profileResponse.data as any)?.city || null,
      favoriteRestaurantIds,
      interactionCount: validOrders.length + validReservations.length,
      avgBasket,
      daysSinceLastActivity,
      cuisineSignals,
      journeyTypes: Array.from(journeyTypes),
      serviceMoments: Array.from(serviceMoments),
    };

    sponsoredAudienceSnapshotCache = {
      userId: currentUserId,
      fetchedAt: Date.now(),
      snapshot,
    };
    return snapshot;
  } catch {
    return {
      city: null,
      favoriteRestaurantIds: [],
      interactionCount: 0,
      avgBasket: 0,
      daysSinceLastActivity: null,
      cuisineSignals: [],
      journeyTypes: [],
      serviceMoments: [],
    };
  }
}

// Auto-sync authentication state
supabase.auth.getSession().then(({ data: { session } }) => {
  currentUserId = session?.user?.id || null;
  sponsoredAudienceSnapshotCache = null;
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentUserId = session?.user?.id || null;
  sponsoredAudienceSnapshotCache = null;
});

export function setAnalyticsUser(userId: string | null) {
  currentUserId = userId;
  sponsoredAudienceSnapshotCache = null;
}

export async function trackEvent({
  eventType,
  eventData = {},
  restaurantId,
}: TrackEventParams) {
  try {
    await supabase.from("event_store").insert({
      entity_id: (restaurantId || currentUserId || "anonymous") as any,
      entity_type: restaurantId ? "restaurant" : "user",
      event_name: eventType,
      payload: { ...eventData, user_id: currentUserId },
    });
  } catch (e) {
    // Silent fail
  }
}

export async function trackSearch(
  query: string,
  resultsCount: number,
  location?: { lat: number; lng: number }
) {
  try {
    await supabase.from("search_logs").insert({
      user_id: currentUserId,
      search_query: query,
      results_count: resultsCount,
      location_lat: location?.lat,
      location_lng: location?.lng,
    });
  } catch (e) {
    // Silent fail
  }
}

export async function trackImpression(
  entityType: "restaurant" | "dish" | "collection" | "ad",
  entityId: string,
  source?: string
) {
  try {
    const payload = {
      user_id: currentUserId,
      entity_type: entityType,
      entity_id: entityId,
      source: source,
    };

    if (!currentUserId) {
      // Anonymous users don't have SELECT permission, so just insert without select
      await supabase.from("impressions").insert(payload);
      return null;
    }

    const { data } = await supabase.from("impressions").insert(payload).select("id").single();
    return data?.id;
  } catch (e) {
    return null;
  }
}

export async function trackClick(
  entityType: "restaurant" | "dish" | "collection" | "ad",
  entityId: string,
  impressionId?: string
) {
  try {
    await supabase.from("clicks").insert({
      user_id: currentUserId,
      entity_type: entityType,
      entity_id: entityId,
      impression_id: impressionId,
    });
  } catch (e) {
    // Silent fail
  }
}

export async function trackSponsoredImpression(campaignId: string, restaurantId?: string) {
  try {
    // 1. Increment the legacy metric via RPC
    await supabase.rpc("increment_ad_campaign_metric", {
      p_campaign_id: campaignId,
      p_metric: "impressions",
    });

    // 2. Log in the new impressions table
    await trackImpression("ad", campaignId, "sponsored_banner");

    // 3. Log the restaurant impression if available
    if (restaurantId) {
      await trackImpression("restaurant", restaurantId, "sponsored_banner");
    }
  } catch {
    // Silently fail
  }
}

export async function trackSponsoredClick(campaignId: string, restaurantId: string) {
  rememberSponsoredAttribution(campaignId, restaurantId);

  try {
    // 1. Increment the legacy metric via RPC
    await supabase.rpc("increment_ad_campaign_metric", {
      p_campaign_id: campaignId,
      p_metric: "clicks",
    });

    // 2. Log in the new clicks table
    await trackClick("ad", campaignId);

    // 3. Log the restaurant click
    await trackClick("restaurant", restaurantId);
  } catch {
    // Silently fail
  }
}

export async function trackCheckoutEvent(orderId: string, eventType: string, payload: any = {}) {
  try {
    await supabase.from("order_events").insert({
      order_id: orderId,
      event_type: eventType,
      payload: payload,
    });
  } catch (e) {
    // Silent fail
  }
}

type SponsoredConversionType = "order" | "reservation" | "zero-attente";

interface TrackSponsoredConversionOptions {
  conversionType?: SponsoredConversionType;
  entityId?: string | null;
  paymentMethod?: string | null;
}

export async function trackSponsoredConversion(
  restaurantId: string,
  options?: TrackSponsoredConversionOptions
) {
  const campaignId = getValidSponsoredCampaignId(restaurantId);
  if (!campaignId) return false;

  try {
    const { error } = await supabase.rpc("increment_ad_campaign_metric" as any, {
      p_campaign_id: campaignId,
      p_metric: "conversions",
    });
    if (error) {
      console.warn("[analytics] conversion error:", error.message);
      return false;
    }
  } catch {
    return false;
  }

  const attributions = readSponsoredAttributions();
  delete attributions[restaurantId];
  writeSponsoredAttributions(attributions);

  // Keep a typed conversion trail for campaign analysis and debugging.
  await trackEvent({
    eventType: "sponsored_conversion",
    restaurantId,
    eventData: {
      campaign_id: campaignId,
      conversion_type: options?.conversionType || "order",
      entity_id: options?.entityId || null,
      payment_method: options?.paymentMethod || null,
    },
  });

  return true;
}

export type { AudienceCriteria } from "@/lib/campaignTargeting";
export { DEFAULT_AUDIENCE_CRITERIA } from "@/lib/campaignTargeting";

export async function getAudienceEstimate(
  criteria: AudienceCriteria
): Promise<number> {
  try {
    const normalized = normalizeAudienceCriteria(criteria);
    let query = supabase.from("profiles" as any).select("user_id", { count: "exact", head: true });

    if (normalized.cities.length > 0) {
      query = query.in("city", normalized.cities);
    }

    const { count } = await query;
    let estimate = count || 0;

    if (normalized.customerSegment === "new") estimate = Math.floor(estimate * 0.45);
    if (normalized.customerSegment === "returning") estimate = Math.floor(estimate * 0.7);
    if (normalized.customerSegment === "loyal") estimate = Math.floor(estimate * 0.25);
    if (normalized.customerSegment === "inactive") estimate = Math.floor(estimate * 0.2);
    if (normalized.minOrders > 0) estimate = Math.floor(estimate * (normalized.minOrders >= 5 ? 0.35 : 0.6));
    if (normalized.minAvgBasket > 20) estimate = Math.floor(estimate * (normalized.minAvgBasket >= 50 ? 0.3 : 0.55));
    if (normalized.cuisines.length > 0) estimate = Math.floor(estimate * Math.max(0.2, 0.65 - (normalized.cuisines.length - 1) * 0.08));
    if (normalized.favoritesOnly) estimate = Math.floor(estimate * 0.15);
    if (normalized.maxDaysSinceOrder < 90) estimate = Math.floor(estimate * (normalized.maxDaysSinceOrder <= 30 ? 0.45 : 0.7));
    if (normalized.journeyTypes.length > 0) estimate = Math.floor(estimate * Math.max(0.25, 0.75 - (normalized.journeyTypes.length - 1) * 0.1));
    if (normalized.serviceMoments.length > 0) estimate = Math.floor(estimate * Math.max(0.4, 0.8 - (normalized.serviceMoments.length - 1) * 0.15));

    return Math.max(estimate, 0);
  } catch {
    return 0;
  }
}

export async function getRestaurantCampaigns(restaurantId: string) {
  const { data } = await supabase
    .from("ad_campaigns" as any)
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });
  return (data || []) as any[];
}

export async function getActiveSponsoredRestaurants(page: string) {
  const [campaignResponse, audienceSnapshot] = await Promise.all([
    supabase
    .from("ad_campaigns" as any)
    .select("*, restaurants(*)")
    .in("type", ["boost", "banner", "sponsored"])
      .eq("status", "active"),
    getCurrentAudienceSnapshot(),
  ]);

  const all = (campaignResponse.data || []) as any[];
  const now = Date.now();
  const activeCampaigns = all.filter((c: any) => {
    if (c.starts_at) {
      const startsAt = Date.parse(String(c.starts_at));
      if (Number.isFinite(startsAt) && startsAt > now) return false;
    }
    if (c.ends_at) {
      const endsAt = Date.parse(String(c.ends_at));
      if (Number.isFinite(endsAt) && endsAt < now) return false;
    }
    if (Number(c.total_budget || 0) > 0 && Number(c.spent || 0) >= Number(c.total_budget || 0)) return false;

    const pages = c.target_pages;
    if (!pages) return true;
    if (Array.isArray(pages)) return pages.length === 0 || pages.includes(page);
    return true;
  }).filter((campaign: any) => {
    const restaurantId = campaign?.restaurant_id || campaign?.restaurants?.id || null;
    return matchesAudienceCriteria(campaign?.target_criteria || DEFAULT_AUDIENCE_CRITERIA, audienceSnapshot, restaurantId);
  });

  return selectBudgetWeightedCampaignsForPage(activeCampaigns, page);
}

export async function createCampaign(campaign: {
  restaurant_id: string;
  type: "boost" | "email" | "push" | "in_app";
  title: string;
  body: string;
  image_url?: string;
  target_pages?: string[];
  target_criteria?: AudienceCriteria;
  budget_daily?: number;
  total_budget?: number;
  channels?: Record<string, boolean>;
  scheduled_at?: string | null;
  starts_at?: string;
  ends_at?: string;
}) {
  const { data, error } = await supabase.from("ad_campaigns" as any).insert({
    ...campaign,
    target_pages: campaign.target_pages || [],
    target_criteria: campaign.target_criteria || {},
    channels: campaign.channels || {},
    status: campaign.scheduled_at ? "scheduled" : "active",
    impressions: 0,
    clicks: 0,
    conversions: 0,
    spent: 0,
  }).select().single();

  return { data, error };
}

export async function updateCampaignStatus(campaignId: string, status: string) {
  const { error } = await supabase
    .from("ad_campaigns" as any)
    .update({ status })
    .eq("id", campaignId);
  return { error };
}

export async function getCampaignStats(restaurantId: string) {
  const { data: campaigns } = await supabase
    .from("ad_campaigns" as any)
    .select("*")
    .eq("restaurant_id", restaurantId);

  const all = (campaigns || []) as any[];
  const active = all.filter((c: any) => c.status === "active");
  const totalSpent = all.reduce((s: number, c: any) => s + (c.spent || 0), 0);
  const totalImpressions = all.reduce((s: number, c: any) => s + (c.impressions || 0), 0);
  const totalClicks = all.reduce((s: number, c: any) => s + (c.clicks || 0), 0);
  const totalConversions = all.reduce((s: number, c: any) => s + (c.conversions || 0), 0);

  return {
    totalCampaigns: all.length,
    activeCampaigns: active.length,
    totalSpent,
    totalImpressions,
    totalClicks,
    totalConversions,
    ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0",
    conversionRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0",
    campaigns: all,
  };
}
