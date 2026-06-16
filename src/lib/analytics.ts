import { getSupabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AUDIENCE_CRITERIA,
  normalizeAudienceCriteria,
  normalizeAudienceToken,
  type AudienceCriteria,
  type AudienceSnapshot,
} from "@/lib/campaignTargeting";
import {
  campaignSupportsPlacement,
  getCampaignStrategyPlacementBoost,
  normalizeCampaignPlacementSelection,
  type CampaignPlacementOption,
} from "@/lib/campaignPricing";
import { isCampaignVisibleForViewer } from "@/lib/campaignVisibility";
import {
  estimateRestaurantCampaignAudience,
  listRestaurantCampaigns,
  saveRestaurantCampaign,
} from "@/lib/campaigns";
import {
  selectSponsoredCampaignPlacements,
  type WeightedCampaignRotationState,
} from "@/lib/sponsoredPlacement";
import {
  clearSponsoredAttributions,
  getValidSponsoredAttributions,
  rememberSponsoredAttribution,
} from "@/lib/sponsoredAttribution";

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

const SPONSORED_ROTATION_KEY = "miamz-sponsored-rotation-v1";
const SPONSORED_SELECTION_KEY = "miamz-sponsored-placement-selection-v1";
const ANALYTICS_VIEWER_KEY = "miamz-analytics-viewer-v1";
const SPONSORED_AUDIENCE_CACHE_MS = 5 * 60 * 1000;
const SPONSORED_SELECTION_TTL_MS = 15 * 60 * 1000;
const SPONSORED_DISPLAY_DEDUPE_TTL_MS = 1500;
const MAX_SPONSORED_DISPLAY_KEYS = 300;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SPONSORED_DISPLAY_TYPES = ["boost", "banner", "sponsored", "in_app", "push"];

const INVALID_ORDER_STATUSES = new Set(["cancelled", "refused", "payment_failed", "pending_payment"]);
const INVALID_RESERVATION_STATUSES = new Set(["cancelled", "refused"]);

type SponsoredRotationStore = Record<string, WeightedCampaignRotationState>;
type SponsoredPlacementSelectionMemory = Record<string, Record<string, Partial<Record<CampaignPlacementOption, {
  campaignId: string;
  selectedAt: number;
}>>>>;

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
const sponsoredDisplayLedger = new Map<string, number>();

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

function pruneSponsoredDisplayLedger(now = Date.now()) {
  for (const [key, timestamp] of sponsoredDisplayLedger.entries()) {
    if ((now - timestamp) > SPONSORED_DISPLAY_DEDUPE_TTL_MS) {
      sponsoredDisplayLedger.delete(key);
    }
  }

  if (sponsoredDisplayLedger.size <= MAX_SPONSORED_DISPLAY_KEYS) return;

  const oldestEntries = [...sponsoredDisplayLedger.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, sponsoredDisplayLedger.size - MAX_SPONSORED_DISPLAY_KEYS);

  oldestEntries.forEach(([key]) => sponsoredDisplayLedger.delete(key));
}

function createClientEventId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSponsoredImpressionEventId(placementKey: string) {
  const now = Date.now();
  pruneSponsoredDisplayLedger(now);
  const lastSeenAt = sponsoredDisplayLedger.get(placementKey);

  if (lastSeenAt && (now - lastSeenAt) < SPONSORED_DISPLAY_DEDUPE_TTL_MS) {
    return null;
  }

  sponsoredDisplayLedger.set(placementKey, now);
  return createClientEventId();
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

let sponsoredSelectionMemoryStore: SponsoredPlacementSelectionMemory = {};

function readSponsoredSelectionMemory(now = Date.now()): SponsoredPlacementSelectionMemory {
  const fallback = sponsoredSelectionMemoryStore;
  let parsed = fallback;

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SPONSORED_SELECTION_KEY);
      if (raw) {
        const candidate = JSON.parse(raw);
        if (candidate && typeof candidate === "object") parsed = candidate;
      }
    } catch {
      parsed = fallback;
    }
  }

  const pruned: SponsoredPlacementSelectionMemory = {};
  for (const [page, restaurants] of Object.entries(parsed || {})) {
    const nextRestaurants: Record<string, Partial<Record<CampaignPlacementOption, {
      campaignId: string;
      selectedAt: number;
    }>>> = {};
    for (const [restaurantId, placements] of Object.entries(restaurants || {})) {
      const nextPlacements: Partial<Record<CampaignPlacementOption, { campaignId: string; selectedAt: number }>> = {};
      for (const placement of ["banner", "restaurant_cards"] as CampaignPlacementOption[]) {
        const value = placements?.[placement];
        if (!value?.campaignId || !Number.isFinite(Number(value.selectedAt))) continue;
        if ((now - Number(value.selectedAt)) > SPONSORED_SELECTION_TTL_MS) continue;
        nextPlacements[placement] = {
          campaignId: String(value.campaignId),
          selectedAt: Number(value.selectedAt),
        };
      }
      if (Object.keys(nextPlacements).length > 0) {
        nextRestaurants[restaurantId] = nextPlacements;
      }
    }
    if (Object.keys(nextRestaurants).length > 0) {
      pruned[page] = nextRestaurants;
    }
  }

  sponsoredSelectionMemoryStore = pruned;
  return pruned;
}

function writeSponsoredSelectionMemory(store: SponsoredPlacementSelectionMemory) {
  sponsoredSelectionMemoryStore = store;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPONSORED_SELECTION_KEY, JSON.stringify(store));
  } catch {
    // Silent fail
  }
}

function getCampaignRestaurantId(campaign: any) {
  return String(campaign?.restaurant_id || campaign?.restaurants?.id || "");
}

function avoidCompanionPlacementDuplicates(
  campaigns: any[],
  page: string,
  placement: CampaignPlacementOption,
  memory: SponsoredPlacementSelectionMemory,
) {
  const companionPlacement: CampaignPlacementOption = placement === "banner" ? "restaurant_cards" : "banner";
  const selectedByRestaurant = memory[page] || {};

  return campaigns.filter((campaign) => {
    const restaurantId = getCampaignRestaurantId(campaign);
    if (!restaurantId) return true;
    const companionCampaignId = selectedByRestaurant[restaurantId]?.[companionPlacement]?.campaignId;
    if (!companionCampaignId || String(campaign.id) !== companionCampaignId) return true;

    return !campaigns.some((candidate) => (
      getCampaignRestaurantId(candidate) === restaurantId &&
      String(candidate.id) !== companionCampaignId
    ));
  });
}

function rememberPlacementSelections(
  campaigns: any[],
  page: string,
  placement: CampaignPlacementOption,
  memory: SponsoredPlacementSelectionMemory,
  now = Date.now(),
) {
  const nextMemory: SponsoredPlacementSelectionMemory = { ...memory };
  const pageMemory = { ...(nextMemory[page] || {}) };

  for (const campaign of campaigns) {
    const restaurantId = getCampaignRestaurantId(campaign);
    if (!restaurantId || !campaign?.id) continue;
    pageMemory[restaurantId] = {
      ...(pageMemory[restaurantId] || {}),
      [placement]: {
        campaignId: String(campaign.id),
        selectedAt: now,
      },
    };
  }

  nextMemory[page] = pageMemory;
  writeSponsoredSelectionMemory(nextMemory);
}

function selectPoolWeightedCampaigns(campaigns: any[], page: string, placement: CampaignPlacementOption): any[] {
  if (!campaigns || campaigns.length === 0) return [];

  const rotationStore = readSponsoredRotationStore();
  const selectionMemory = readSponsoredSelectionMemory();
  const placementCampaigns = campaigns.filter((campaign) => campaignSupportsPlacement(campaign, placement));
  const eligibleCampaigns = avoidCompanionPlacementDuplicates(placementCampaigns, page, placement, selectionMemory);
  const { campaigns: selectedCampaigns, store: nextRotationStore } = selectSponsoredCampaignPlacements(
    eligibleCampaigns,
    rotationStore,
    {
      page: `${page}:${placement}`,
      maxSlots: 3,
      getPlacementBoost: (campaign, placementPage) => getCampaignStrategyPlacementBoost(
        (campaign as Record<string, unknown>)?.pricing_strategy,
        String(placementPage).split(":")[0] || page,
      ),
    },
  );
  writeSponsoredRotationStore(nextRotationStore);
  rememberPlacementSelections(selectedCampaigns, page, placement, selectionMemory);

  return selectedCampaigns;
}

function isInvalidOrderStatus(status: unknown) {
  return INVALID_ORDER_STATUSES.has(String(status || "").toLowerCase());
}

function isInvalidReservationStatus(status: unknown) {
  return INVALID_RESERVATION_STATUSES.has(String(status || "").toLowerCase());
}

function normalizeTextToken(value: unknown) {
  return normalizeAudienceToken(value);
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
      getSupabase().from("profiles" as any).select("city, gender").eq("user_id", currentUserId).maybeSingle(),
      getSupabase().from("favorites" as any).select("restaurant_id").eq("user_id", currentUserId),
      getSupabase().from("orders" as any).select("restaurant_id, total_amount, created_at, delivery_address, status").eq("user_id", currentUserId),
      getSupabase().from("reservations" as any).select("restaurant_id, created_at, status, feature, metadata, time, date").eq("user_id", currentUserId),
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
        getSupabase()
          .from("restaurant_cuisines")
          .select("restaurant_id, cuisine_id")
          .in("restaurant_id", interactedRestaurantIds),
        (getSupabase().from("cuisines") as any).select("id, name, slug, keywords"),
        (getSupabase().from("restaurants") as any).select("id, cuisine_type").in("id", interactedRestaurantIds),
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
      gender: (profileResponse.data as any)?.gender || null,
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
      gender: null,
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
getSupabase().auth.getSession().then(({ data: { session } }) => {
  currentUserId = session?.user?.id || null;
  sponsoredAudienceSnapshotCache = null;
});

getSupabase().auth.onAuthStateChange((_event, session) => {
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
const ANALYTICS_BATCH_FLUSH_MS = 1_500;
const ANALYTICS_DEDUPE_TTL_MS = 3_000;
const ANALYTICS_MAX_BATCH_SIZE = 20;

type QueuedAnalyticsEvent = {
  body: Record<string, unknown>;
  dedupeKey: string;
  resolve: (value: AnalyticsIngestResponse | null) => void;
};

const analyticsQueue: QueuedAnalyticsEvent[] = [];
const analyticsDedupeLedger = new Map<string, number>();
let analyticsFlushTimer: ReturnType<typeof setTimeout> | null = null;

async function invokeAnalyticsIngest(body: Record<string, unknown>): Promise<AnalyticsIngestResponse | null> {
  if (_analyticsTrackingDisabled) return null;

  try {
    const { data, error } = await getSupabase().functions.invoke("track-analytics", {
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

function pruneAnalyticsDedupeLedger(now = Date.now()) {
  for (const [key, timestamp] of analyticsDedupeLedger.entries()) {
    if ((now - timestamp) > ANALYTICS_DEDUPE_TTL_MS) {
      analyticsDedupeLedger.delete(key);
    }
  }
}

function buildAnalyticsDedupeKey(body: Record<string, unknown>) {
  return JSON.stringify({
    kind: body.kind || null,
    entityType: body.entityType || null,
    entityId: body.entityId || null,
    eventName: body.eventName || null,
    searchQuery: body.searchQuery || null,
    impressionId: body.impressionId || null,
    source: body.source || null,
  });
}

function scheduleAnalyticsFlush() {
  if (analyticsFlushTimer || typeof window === "undefined") return;
  analyticsFlushTimer = window.setTimeout(() => {
    analyticsFlushTimer = null;
    void flushAnalyticsQueue();
  }, ANALYTICS_BATCH_FLUSH_MS);
}

function canUseAnalyticsBeacon() {
  return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function";
}

export async function flushAnalyticsQueue() {
  const batch = analyticsQueue.splice(0, ANALYTICS_MAX_BATCH_SIZE);
  if (batch.length === 0) return;

  const result = await invokeAnalyticsIngest({
    kind: "batch",
    events: batch.map((item) => item.body),
  });
  batch.forEach((item) => item.resolve(result));

  if (analyticsQueue.length > 0) {
    scheduleAnalyticsFlush();
  }
}

export function queueAnalyticsEvent(body: Record<string, unknown>): Promise<AnalyticsIngestResponse | null> {
  if (_analyticsTrackingDisabled) return Promise.resolve(null);

  const now = Date.now();
  pruneAnalyticsDedupeLedger(now);
  const dedupeKey = buildAnalyticsDedupeKey(body);
  const lastQueuedAt = analyticsDedupeLedger.get(dedupeKey);
  if (lastQueuedAt && (now - lastQueuedAt) < ANALYTICS_DEDUPE_TTL_MS) {
    return Promise.resolve(null);
  }

  analyticsDedupeLedger.set(dedupeKey, now);

  return new Promise((resolve) => {
    analyticsQueue.push({ body, dedupeKey, resolve });
    if (analyticsQueue.length >= ANALYTICS_MAX_BATCH_SIZE) {
      void flushAnalyticsQueue();
      return;
    }
    scheduleAnalyticsFlush();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && canUseAnalyticsBeacon()) {
      void flushAnalyticsQueue();
    }
  });
}

export async function trackEvent({
  eventType,
  eventData = {},
  restaurantId,
}: TrackEventParams) {
  if (!restaurantId) return;

  try {
    await queueAnalyticsEvent({
      kind: "event",
      entityId: restaurantId,
      entityType: "restaurant",
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
    await queueAnalyticsEvent({
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
    await queueAnalyticsEvent({
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
  journeyType?: SponsoredJourneyType | null;
  eventId?: string | null;
  eventSignature?: string | null;
  signedAt?: string | null;
}): Promise<SponsoredTrackResult> {
  if (_sponsoredTrackingDisabled) return { recorded: false, deduped: false };

  try {
    const viewerId = getOrCreateAnalyticsViewerId();
    const { data, error } = await getSupabase().functions.invoke("track-sponsored-event", {
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
        journeyType: input.journeyType || null,
        eventId: input.eventId || null,
        eventSignature: input.eventSignature || null,
        signedAt: input.signedAt || null,
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
  source = "sponsored_impression",
  eventId?: string | null,
) {
  if (!restaurantId) return false;

  try {
    const result = await trackSponsoredEvent({
      eventType: "impression",
      campaignId,
      restaurantId,
      source,
      eventId: eventId || undefined,
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
  source = "sponsored_click",
  eventId?: string | null,
) {
  rememberSponsoredAttribution(campaignId, restaurantId);

  try {
    const result = await trackSponsoredEvent({
      eventType: "click",
      campaignId,
      restaurantId,
      source,
      eventId: eventId || createClientEventId(),
    });

    void trackClick("restaurant", restaurantId);
    return result.recorded || result.deduped || result.ignored || false;
  } catch {
    return false;
  }
}

export async function trackCheckoutEvent(orderId: string, eventType: string, payload: any = {}) {
  try {
    const { error } = await (getSupabase() as any).rpc("track_order_event", {
      p_order_id: orderId,
      p_event_type: eventType,
      p_payload: payload,
    });

    if (error) {
      console.warn("[analytics] checkout event tracking failed", error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn("[analytics] checkout event tracking failed", message);
  }
}

type SponsoredConversionType = "order" | "reservation" | "zero-attente";
type SponsoredJourneyType = "delivery" | "takeaway" | "reservation" | "zero-attente";

interface TrackSponsoredConversionOptions {
  conversionType?: SponsoredConversionType;
  entityId?: string | null;
  paymentMethod?: string | null;
  journeyType?: SponsoredJourneyType | null;
}

export async function trackSponsoredConversion(
  restaurantId: string,
  options?: TrackSponsoredConversionOptions
) {
  const attributions = getValidSponsoredAttributions(restaurantId);
  if (attributions.length === 0) return false;

  const results = await Promise.allSettled(
    attributions.map(async (attribution) => {
      const result = await trackSponsoredEvent({
        eventType: "conversion",
        campaignId: attribution.campaignId,
        restaurantId,
        source: "sponsored_conversion",
        conversionType: options?.conversionType || "order",
        entityId: options?.entityId || null,
        paymentMethod: options?.paymentMethod || null,
        journeyType: options?.journeyType || null,
      });

      return {
        campaignId: attribution.campaignId,
        accepted: result.recorded || result.deduped || result.ignored || false,
      };
    }),
  );

  const acceptedCampaignIds = results
    .filter((result): result is PromiseFulfilledResult<{ campaignId: string; accepted: boolean }> => result.status === "fulfilled")
    .filter((result) => result.value.accepted)
    .map((result) => result.value.campaignId);

  if (acceptedCampaignIds.length === 0) {
    return false;
  }

  clearSponsoredAttributions(restaurantId, acceptedCampaignIds);
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

export async function getActiveSponsoredRestaurants(
  page: string,
  placement: CampaignPlacementOption = "restaurant_cards",
) {
  const [campaignResponse, audienceSnapshot] = await Promise.all([
    getSupabase()
      .from("ad_campaigns" as any)
      .select("*, restaurants(*)")
      .in("type", SPONSORED_DISPLAY_TYPES)
      .eq("status", "active"),
    getCurrentAudienceSnapshot(),
  ]);

  const all = (campaignResponse.data || []) as any[];
  const activeCampaigns = all.filter((campaign: any) => isCampaignVisibleForViewer(campaign, {
    page,
    audienceSnapshot,
    viewerUserId: currentUserId,
  }));

  return selectPoolWeightedCampaigns(activeCampaigns, page, placement);
}

export async function createCampaign(campaign: {
  restaurant_id: string;
  type: "boost" | "email" | "push" | "in_app";
  pricing_strategy?: "visibility" | "traffic" | "conversion";
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
  const campaignChannels = campaign.channels && typeof campaign.channels === "object" && !Array.isArray(campaign.channels)
    ? campaign.channels
    : {};
  const { data, error } = await saveRestaurantCampaign(campaign.restaurant_id, {
    ...campaign,
    target_pages: campaign.target_pages || [],
    target_criteria: campaign.target_criteria || {},
    channels: {
      ...campaignChannels,
      ...normalizeCampaignPlacementSelection(campaignChannels, campaign.type),
    },
    status: campaign.scheduled_at ? "scheduled" : "active",
  });

  return { data, error };
}

export async function updateCampaignStatus(campaignId: string, status: string) {
  const { error } = await getSupabase()
    .from("ad_campaigns" as any)
    .update({ status })
    .eq("id", campaignId);
  return { error };
}

export async function getCampaignStats(restaurantId: string) {
  const { data: campaigns } = await getSupabase()
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
