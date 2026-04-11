import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AUDIENCE_CRITERIA,
  matchesAudienceCriteria,
  normalizeAudienceCriteria,
  type AudienceCriteria,
  type AudienceSnapshot,
} from "@/lib/campaignTargeting";
import {
  estimateRestaurantCampaignAudience,
  listRestaurantCampaigns,
  saveRestaurantCampaign,
} from "@/lib/campaigns";
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
const ANALYTICS_VIEWER_KEY = "miamz-analytics-viewer-v1";
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
type SponsoredTrackResult = {
  recorded: boolean;
  deduped: boolean;
  ignored?: boolean;
};

let sponsoredAudienceSnapshotCache:
  | { userId: string; fetchedAt: number; snapshot: AudienceSnapshot }
  | null = null;
let audienceEstimateRpcUnavailable = false;
let audienceEstimateRpcWarned = false;

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

function getOrCreateAnalyticsViewerId() {
  if (typeof window === "undefined") return "server-render";

  try {
    const existing = window.localStorage.getItem(ANALYTICS_VIEWER_KEY);
    if (existing) return existing;

    const created = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ANALYTICS_VIEWER_KEY, created);
    return created;
  } catch {
    return "ephemeral-viewer";
  }
}

function getTrackingPage() {
  if (typeof window === "undefined") return "server";
  const pathname = window.location.pathname || "/";
  return pathname.replace(/^\/+/, "") || "home";
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

function computePacingFactor(campaign: any): number {
  const startsAt = campaign.starts_at ? Date.parse(String(campaign.starts_at)) : NaN;
  const endsAt = campaign.ends_at ? Date.parse(String(campaign.ends_at)) : NaN;
  const now = Date.now();

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return 1.0;
  }

  const totalDuration = endsAt - startsAt;
  const elapsed = Math.max(0, now - startsAt);
  const timeProgression = Math.min(1, elapsed / totalDuration);

  const totalBudget = Number(campaign.total_budget || 0);
  const spent = Number(campaign.spent || 0);
  if (totalBudget <= 0 || timeProgression === 0) return 1.0;

  const budgetProgression = spent / totalBudget;
  const ratio = budgetProgression / timeProgression;
  return Math.max(0.2, Math.min(3.0, 1 / Math.max(ratio, 0.01)));
}

function getRemainingBudget(campaign: any): number {
  const totalBudget = Number(campaign.total_budget || 0);
  const spent = Number(campaign.spent || 0);
  if (totalBudget <= 0) {
    return Math.max(Number(campaign.budget_daily || 0), 1);
  }
  return Math.max(0, totalBudget - spent);
}

function selectPoolWeightedCampaigns(campaigns: any[], page: string): any[] {
  if (!campaigns || campaigns.length === 0) return [];
  if (campaigns.length === 1) return campaigns;

  const pool = campaigns.map((c) => ({
    campaign: c,
    budgetRestant: getRemainingBudget(c),
    pacingFactor: computePacingFactor(c),
  }));

  const sumBudgetRestant = pool.reduce((s, p) => s + p.budgetRestant, 0);
  if (sumBudgetRestant <= 0) return [];

  const weighted = pool.map((p) => ({
    ...p,
    scoreFinal: (p.budgetRestant / sumBudgetRestant) * p.pacingFactor,
  }));

  const totalScore = weighted.reduce((s, w) => s + w.scoreFinal, 0) || 1;

  const campaignsWithWeight = weighted.map((w) => ({
    ...w.campaign,
    __poolWeight: w.scoreFinal / totalScore,
  }));

  const rotationStore = readSponsoredRotationStore();
  const stateKey = `pool:${page}`;
  const state = rotationStore[stateKey] || { counts: {}, lastShownOrder: {}, sequence: 0 };

  const activeIds = new Set(campaignsWithWeight.map((c) => String(c.id)));
  state.counts = Object.fromEntries(
    Object.entries(state.counts || {}).filter(([id]) => activeIds.has(id))
  );
  state.lastShownOrder = Object.fromEntries(
    Object.entries(state.lastShownOrder || {}).filter(([id]) => activeIds.has(id))
  );

  const { campaign, state: newState } = pickWeightedCampaign(campaignsWithWeight, state);
  rotationStore[stateKey] = newState;
  writeSponsoredRotationStore(rotationStore);

  return campaign ? [campaign] : [];
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

type AnalyticsIngestResponse = {
  id?: string;
};

let _analyticsTrackingDisabled = false;

async function invokeAnalyticsIngest(body: Record<string, unknown>): Promise<AnalyticsIngestResponse | null> {
  if (_analyticsTrackingDisabled) return null;

  try {
    const { data, error } = await supabase.functions.invoke("track-analytics", {
      body,
    });

    if (error) {
      _analyticsTrackingDisabled = true;
      return null;
    }

    return (data as AnalyticsIngestResponse | null) ?? null;
  } catch {
    _analyticsTrackingDisabled = true;
    return null;
  }
}

export async function trackEvent({
  eventType,
  eventData = {},
  restaurantId,
}: TrackEventParams) {
  const entityId = restaurantId || currentUserId;
  if (!entityId) return;

  try {
    await invokeAnalyticsIngest({
      kind: "event",
      entityId,
      entityType: restaurantId ? "restaurant" : "user",
      eventName: eventType,
      payload: eventData,
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
    await invokeAnalyticsIngest({
      kind: "search",
      searchQuery: query,
      resultsCount,
      locationLat: location?.lat,
      locationLng: location?.lng,
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
    const data = await invokeAnalyticsIngest({
      kind: "impression",
      entityType,
      entityId,
      source: source || null,
    });
    return data?.id || null;
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
    await invokeAnalyticsIngest({
      kind: "click",
      entityType,
      entityId,
      impressionId: impressionId || null,
    });
  } catch (e) {
    // Silent fail
  }
}

let _sponsoredTrackingDisabled = false;

async function trackSponsoredEvent(input: {
  eventType: "impression" | "click" | "conversion";
  campaignId: string;
  restaurantId: string;
  source: string;
  conversionType?: SponsoredConversionType;
  entityId?: string | null;
  paymentMethod?: string | null;
}): Promise<SponsoredTrackResult> {
  if (_sponsoredTrackingDisabled) return { recorded: false, deduped: false };

  try {
    const viewerId = getOrCreateAnalyticsViewerId();
    const { data, error } = await supabase.functions.invoke("track-sponsored-event", {
      body: {
        eventType: input.eventType,
        campaignId: input.campaignId,
        restaurantId: input.restaurantId,
        viewerId,
        source: input.source,
        page: getTrackingPage(),
        conversionType: input.conversionType || null,
        entityId: input.entityId || null,
        paymentMethod: input.paymentMethod || null,
      },
    });

    if (error) {
      _sponsoredTrackingDisabled = true;
      return { recorded: false, deduped: false };
    }

    return {
      recorded: Boolean(data?.recorded),
      deduped: Boolean(data?.deduped),
      ignored: Boolean(data?.ignored),
    };
  } catch {
    _sponsoredTrackingDisabled = true;
    return { recorded: false, deduped: false };
  }
}

export async function trackSponsoredImpression(
  campaignId: string,
  restaurantId?: string,
  source = "sponsored_impression"
) {
  if (!restaurantId) return false;

  try {
    const result = await trackSponsoredEvent({
      eventType: "impression",
      campaignId,
      restaurantId,
      source,
    });

    void trackImpression("restaurant", restaurantId, source);
    return result.recorded || result.deduped || result.ignored || false;
  } catch {
    return false;
  }
}

export async function trackSponsoredClick(
  campaignId: string,
  restaurantId: string,
  source = "sponsored_click"
) {
  rememberSponsoredAttribution(campaignId, restaurantId);

  try {
    const result = await trackSponsoredEvent({
      eventType: "click",
      campaignId,
      restaurantId,
      source,
    });

    void trackClick("restaurant", restaurantId);
    return result.recorded || result.deduped || result.ignored || false;
  } catch {
    return false;
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

  const result = await trackSponsoredEvent({
    eventType: "conversion",
    campaignId,
    restaurantId,
    source: "sponsored_conversion",
    conversionType: options?.conversionType || "order",
    entityId: options?.entityId || null,
    paymentMethod: options?.paymentMethod || null,
  });

  if (!result.recorded && !result.deduped && !result.ignored) {
    return false;
  }

  const attributions = readSponsoredAttributions();
  delete attributions[restaurantId];
  writeSponsoredAttributions(attributions);

  return true;
}

export type { AudienceCriteria } from "@/lib/campaignTargeting";
export { DEFAULT_AUDIENCE_CRITERIA } from "@/lib/campaignTargeting";

export async function getAudienceEstimate(
  criteria: AudienceCriteria
): Promise<number> {
  try {
    const normalized = normalizeAudienceCriteria(criteria);
    if (!normalized.restaurantId) return 0;
    if (audienceEstimateRpcUnavailable) return 0;

    const { data, error, unavailable } = await estimateRestaurantCampaignAudience(normalized.restaurantId, normalized);

    if (error) {
      const portalError = error as Error & {
        code?: string;
        details?: string;
        hint?: string;
      };
      const errorText = [
        portalError.code,
        portalError.message,
        portalError.details,
        portalError.hint,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        String(portalError.code || "").toUpperCase() === "PGRST202" ||
        (errorText.includes("estimate_campaign_audience") &&
          (errorText.includes("schema cache") || errorText.includes("could not find the function")))
      ) {
        audienceEstimateRpcUnavailable = true;
        if (!audienceEstimateRpcWarned) {
          audienceEstimateRpcWarned = true;
          console.warn("[analytics] estimate_campaign_audience is unavailable in this Supabase deployment.");
        }
        return 0;
      }

      console.warn("[analytics] audience estimate error:", error.message);
      return 0;
    }

    if (unavailable) {
      audienceEstimateRpcUnavailable = true;
      return 0;
    }

    return Math.max(Number(data) || 0, 0);
  } catch {
    return 0;
  }
}

export async function getRestaurantCampaigns(restaurantId: string) {
  const { data } = await listRestaurantCampaigns(restaurantId);
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

    if (Number(c.budget_daily || 0) > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const dailySpent = (String(c.daily_spent_date || "") === today)
        ? Number(c.daily_spent || 0) : 0;
      if (dailySpent >= Number(c.budget_daily)) return false;
    }

    const pages = c.target_pages;
    if (!pages) return true;
    if (Array.isArray(pages)) return pages.length === 0 || pages.includes(page);
    return true;
  }).filter((campaign: any) => {
    const restaurantId = campaign?.restaurant_id || campaign?.restaurants?.id || null;
    return matchesAudienceCriteria(campaign?.target_criteria || DEFAULT_AUDIENCE_CRITERIA, audienceSnapshot, restaurantId);
  });

  return selectPoolWeightedCampaigns(activeCampaigns, page);
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
  const { data, error } = await saveRestaurantCampaign(campaign.restaurant_id, {
    ...campaign,
    target_pages: campaign.target_pages || [],
    target_criteria: campaign.target_criteria || {},
    channels: campaign.channels || {},
    status: campaign.scheduled_at ? "scheduled" : "active",
  });

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
