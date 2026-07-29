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
  | "view"
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
const SPONSORED_EVENT_QUEUE_KEY = "miamz-sponsored-event-queue-v1";
const SPONSORED_SOCIAL_EVENT_QUEUE_KEY = "miamz-sponsored-social-event-queue-v1";
const SPONSORED_DEFERRED_CONVERSION_QUEUE_KEY =
  "miamz-sponsored-deferred-conversion-queue-v1";
const ANALYTICS_VIEWER_KEY = "miamz-analytics-viewer-v1";
const SPONSORED_AUDIENCE_CACHE_MS = 5 * 60 * 1000;
const SPONSORED_SELECTION_TTL_MS = 15 * 60 * 1000;
const SPONSORED_DISPLAY_DEDUPE_TTL_MS = 1500;
const MAX_SPONSORED_DISPLAY_KEYS = 300;
const MAX_SPONSORED_QUEUED_EVENTS = 50;
const MAX_SPONSORED_EVENT_ATTEMPTS = 6;
const SPONSORED_EVENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SPONSORED_RETRY_BASE_MS = 1_000;
const SPONSORED_RETRY_MAX_MS = 60_000;
const ANALYTICS_AUTH_HYDRATION_TIMEOUT_MS = 3_000;
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
  pending?: boolean;
  queued?: boolean;
  reason?: string | null;
  touchToken?: string | null;
};

type SponsoredConversionType = "order" | "reservation" | "zero-attente";
type SponsoredJourneyType = "delivery" | "takeaway" | "reservation" | "zero-attente";

type SponsoredEventInput = {
  eventType: "impression" | "click" | "conversion";
  campaignId: string;
  restaurantId: string;
  source: string;
  conversionType?: SponsoredConversionType;
  entityId?: string | null;
  paymentMethod?: string | null;
  journeyType?: SponsoredJourneyType | null;
  eventId?: string | null;
  touchToken?: string | null;
  viewerId?: string | null;
  page?: string | null;
  actorUserId?: string | null;
  authIdentityPending?: boolean;
};

type QueuedSponsoredEvent = {
  id: string;
  input: SponsoredEventInput;
  queuedAt: number;
  attempts: number;
  nextAttemptAt: number;
};

export type SponsoredSocialEventType = "impression" | "click" | "cta_click";

export type SponsoredSocialAttribution = {
  campaignId?: string | null;
  restaurantId?: string | null;
  touchToken?: string | null;
};

export type SponsoredSocialTrackResult = {
  eventId?: string | null;
  trackingCallId?: string | null;
  campaignId?: string | null;
  restaurantId?: string | null;
  touchToken?: string | null;
  internalActor?: boolean;
  attributions?: SponsoredSocialAttribution[] | null;
  queued?: boolean;
  reason?: string | null;
};

type SponsoredSocialEventInput = {
  postId: string;
  eventType: SponsoredSocialEventType;
  metadata: Record<string, unknown>;
  trackingCallId: string;
  actorUserId: string | null;
  authIdentityPending: boolean;
};

type QueuedSponsoredSocialEvent = {
  id: string;
  input: SponsoredSocialEventInput;
  queuedAt: number;
  attempts: number;
  nextAttemptAt: number;
};

type DeferredSponsoredConversionInput = {
  eventId: string;
  restaurantId: string;
  conversionType: SponsoredConversionType;
  entityId: string;
  paymentMethod: string | null;
  journeyType: SponsoredJourneyType | null;
  actorUserId: string | null;
  authIdentityPending: boolean;
};

type QueuedDeferredSponsoredConversion = {
  id: string;
  input: DeferredSponsoredConversionInput;
  queuedAt: number;
};

let sponsoredAudienceSnapshotCache:
  | { userId: string; fetchedAt: number; snapshot: AudienceSnapshot }
  | null = null;
let audienceEstimateRpcUnavailable = false;
let audienceEstimateRpcWarned = false;
const sponsoredDisplayLedger = new Map<string, number>();
let runtimeAnalyticsViewerId: string | null = null;

export function getOrCreateAnalyticsViewerId() {
  if (typeof window === "undefined") return "server-render";
  if (runtimeAnalyticsViewerId) return runtimeAnalyticsViewerId;

  try {
    const existing = window.localStorage.getItem(ANALYTICS_VIEWER_KEY);
    if (existing) {
      runtimeAnalyticsViewerId = existing;
      return runtimeAnalyticsViewerId;
    }

    const created = createAnalyticsTrackingCallId();
    window.localStorage.setItem(ANALYTICS_VIEWER_KEY, created);
    runtimeAnalyticsViewerId = created;
    return runtimeAnalyticsViewerId;
  } catch {
    if (!runtimeAnalyticsViewerId) {
      runtimeAnalyticsViewerId = createAnalyticsTrackingCallId();
    }
    return runtimeAnalyticsViewerId;
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

export function createAnalyticsTrackingCallId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

function createClientEventId() {
  return createAnalyticsTrackingCallId();
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

// Auto-sync authentication state. Queue replays wait for this first snapshot so
// an authenticated event is never discarded or replayed as anonymous while the
// Supabase client is still hydrating its persisted session.
let analyticsAuthHydrated = false;
let analyticsAuthIdentityVerified = false;
let resolveAnalyticsAuthHydration: (() => void) | null = null;
let analyticsAuthHydrationTimer: number | null = null;
const analyticsAuthHydration = new Promise<void>((resolve) => {
  resolveAnalyticsAuthHydration = resolve;
});

function markAnalyticsAuthHydrated(identityVerified: boolean) {
  if (identityVerified) analyticsAuthIdentityVerified = true;
  if (!analyticsAuthHydrated) {
    analyticsAuthHydrated = true;
    resolveAnalyticsAuthHydration?.();
    resolveAnalyticsAuthHydration = null;
  }
  if (identityVerified && analyticsAuthHydrationTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(analyticsAuthHydrationTimer);
    analyticsAuthHydrationTimer = null;
  }
}

function hydrateAnalyticsAuth() {
  void getSupabase().auth.getSession()
    .then(({ data: { session } }) => {
      currentUserId = session?.user?.id || null;
      sponsoredAudienceSnapshotCache = null;
      markAnalyticsAuthHydrated(true);
      scheduleSponsoredQueueFlush(0);
      scheduleSponsoredSocialQueueFlush(0);
      scheduleDeferredSponsoredConversionFlush(0);
    })
    .catch(() => undefined);
}

if (typeof window !== "undefined") {
  analyticsAuthHydrationTimer = window.setTimeout(() => {
    analyticsAuthHydrationTimer = null;
    markAnalyticsAuthHydrated(false);
  }, ANALYTICS_AUTH_HYDRATION_TIMEOUT_MS);
}
hydrateAnalyticsAuth();

getSupabase().auth.onAuthStateChange((_event, session) => {
  currentUserId = session?.user?.id || null;
  sponsoredAudienceSnapshotCache = null;
  markAnalyticsAuthHydrated(true);
  scheduleSponsoredQueueFlush(0);
  scheduleSponsoredSocialQueueFlush(0);
  scheduleDeferredSponsoredConversionFlush(0);
});

export function setAnalyticsUser(userId: string | null) {
  currentUserId = userId;
  sponsoredAudienceSnapshotCache = null;
  if (analyticsAuthHydrated) {
    scheduleSponsoredQueueFlush(0);
    scheduleSponsoredSocialQueueFlush(0);
    scheduleDeferredSponsoredConversionFlush(0);
  }
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
let analyticsFlushTimer: number | null = null;

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
    const data = await queueAnalyticsEvent({
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

let sponsoredQueueFlushPromise: Promise<void> | null = null;
let sponsoredQueueTimer: number | null = null;
let sponsoredEventQueueMemory: QueuedSponsoredEvent[] = [];
let sponsoredQueueStorageAvailable: boolean | null = null;
const sponsoredEventInFlightIds = new Set<string>();

function getSponsoredQueueStorage() {
  if (typeof window === "undefined") return null;
  if (sponsoredQueueStorageAvailable === false) return null;
  try {
    const storage = window.localStorage;
    sponsoredQueueStorageAvailable = true;
    return storage;
  } catch {
    sponsoredQueueStorageAvailable = false;
    return null;
  }
}

function isSponsoredEventInput(value: unknown): value is SponsoredEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SponsoredEventInput>;
  return (
    ["impression", "click", "conversion"].includes(String(candidate.eventType || ""))
    && typeof candidate.campaignId === "string"
    && candidate.campaignId.length > 0
    && typeof candidate.restaurantId === "string"
    && candidate.restaurantId.length > 0
    && typeof candidate.source === "string"
  );
}

function readSponsoredEventQueue(): QueuedSponsoredEvent[] {
  const storage = getSponsoredQueueStorage();
  if (!storage) return sponsoredEventQueueMemory;

  let raw: string | null;
  try {
    raw = storage.getItem(SPONSORED_EVENT_QUEUE_KEY);
  } catch {
    sponsoredQueueStorageAvailable = false;
    return sponsoredEventQueueMemory;
  }

  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return sponsoredEventQueueMemory;

    sponsoredEventQueueMemory = parsed
      .filter((item): item is QueuedSponsoredEvent => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const candidate = item as Partial<QueuedSponsoredEvent>;
        return (
          typeof candidate.id === "string"
          && candidate.id.length > 0
          && isSponsoredEventInput(candidate.input)
          && Number.isFinite(candidate.queuedAt)
          && Number.isFinite(candidate.attempts)
          && Number.isFinite(candidate.nextAttemptAt)
        );
      })
      .slice(-MAX_SPONSORED_QUEUED_EVENTS);
    return sponsoredEventQueueMemory;
  } catch {
    // A malformed value can be overwritten on the next successful enqueue;
    // it does not mean that localStorage itself is unavailable.
    return sponsoredEventQueueMemory;
  }
}

function writeSponsoredEventQueue(queue: QueuedSponsoredEvent[]) {
  sponsoredEventQueueMemory = queue.slice(-MAX_SPONSORED_QUEUED_EVENTS);
  const storage = getSponsoredQueueStorage();
  if (!storage) return false;

  try {
    if (sponsoredEventQueueMemory.length === 0) {
      storage.removeItem(SPONSORED_EVENT_QUEUE_KEY);
      return true;
    }
    storage.setItem(
      SPONSORED_EVENT_QUEUE_KEY,
      JSON.stringify(sponsoredEventQueueMemory),
    );
    return true;
  } catch {
    sponsoredQueueStorageAvailable = false;
    return false;
  }
}

function getSponsoredRetryDelay(attempts: number) {
  const exponential = Math.min(
    SPONSORED_RETRY_MAX_MS,
    SPONSORED_RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)),
  );
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function isSponsoredTrackAccepted(result: SponsoredTrackResult) {
  return Boolean(result.recorded || result.deduped || result.pending);
}

function applySponsoredTrackResult(input: SponsoredEventInput, result: SponsoredTrackResult) {
  if (input.eventType === "click" && result.touchToken) {
    rememberSponsoredAttribution(input.campaignId, input.restaurantId, {
      touchToken: result.touchToken,
    });
  }

  if (input.eventType === "conversion" && isSponsoredTrackAccepted(result)) {
    clearSponsoredAttributions(input.restaurantId);
  }
}

async function invokeSponsoredEvent(input: SponsoredEventInput): Promise<SponsoredTrackResult> {
  const viewerId = input.viewerId || getOrCreateAnalyticsViewerId();
  const { data, error } = await getSupabase().functions.invoke("track-sponsored-event", {
    body: {
      eventType: input.eventType,
      campaignId: input.campaignId,
      restaurantId: input.restaurantId,
      viewerId,
      source: input.source,
      page: input.page || getTrackingPage(),
      conversionType: input.conversionType || null,
      entityId: input.entityId || null,
      paymentMethod: input.paymentMethod || null,
      journeyType: input.journeyType || null,
      eventId: input.eventId || null,
      touchToken: input.touchToken || null,
    },
  });

  if (error) throw error;

  return {
    recorded: Boolean(data?.recorded),
    deduped: Boolean(data?.deduped),
    ignored: Boolean(data?.ignored),
    pending: Boolean(data?.pending),
    reason: typeof data?.reason === "string" ? data.reason : null,
    touchToken: typeof data?.touchToken === "string" ? data.touchToken : null,
  };
}

function getSponsoredErrorStatus(error: unknown) {
  const candidate = error as {
    status?: unknown;
    context?: { status?: unknown } | null;
  } | null;
  const status = Number(candidate?.status ?? candidate?.context?.status);
  return Number.isFinite(status) ? status : null;
}

function isRetryableSponsoredError(error: unknown) {
  const status = getSponsoredErrorStatus(error);
  if (status === null || status === 0 || status === 408 || status === 429) return true;
  return status >= 500;
}

function scheduleSponsoredQueueFlush(delayMs = SPONSORED_RETRY_BASE_MS) {
  if (typeof window === "undefined") return;
  if (sponsoredQueueTimer !== null) window.clearTimeout(sponsoredQueueTimer);
  sponsoredQueueTimer = window.setTimeout(() => {
    sponsoredQueueTimer = null;
    void flushSponsoredEventQueue();
  }, Math.max(0, delayMs));
}

function enqueueSponsoredEvent(input: SponsoredEventInput) {
  const now = Date.now();
  const queue = readSponsoredEventQueue().filter(
    (item) => (now - item.queuedAt) <= SPONSORED_EVENT_MAX_AGE_MS,
  );
  const id = String(input.eventId || createClientEventId());
  const existing = queue.find((item) => item.id === id);

  if (!existing) {
    queue.push({
      id,
      input: { ...input, eventId: id },
      queuedAt: now,
      attempts: 0,
      nextAttemptAt: now + SPONSORED_RETRY_BASE_MS,
    });
  } else {
    existing.input = { ...input, eventId: id };
  }

  const persisted = writeSponsoredEventQueue(queue);
  scheduleSponsoredQueueFlush();
  return persisted;
}

function removeQueuedSponsoredEvent(eventId: string) {
  const queue = readSponsoredEventQueue().filter((item) => item.id !== eventId);
  writeSponsoredEventQueue(queue);
}

function hasQueuedSponsoredClick(campaignId: string, restaurantId: string) {
  return readSponsoredEventQueue().some((item) => (
    item.input.eventType === "click"
    && item.input.campaignId === campaignId
    && item.input.restaurantId === restaurantId
  ));
}

function hasQueuedSponsoredSocialClick(restaurantId: string) {
  return readSponsoredSocialEventQueue().some((item) => {
    if (item.input.eventType !== "click" && item.input.eventType !== "cta_click") {
      return false;
    }
    if (String(item.input.metadata.restaurantId || "") !== restaurantId) {
      return false;
    }
    return !item.input.actorUserId || item.input.actorUserId === currentUserId;
  });
}

function claimQueuedSponsoredSocialClicks(
  restaurantId: string,
  actorUserId: string | null,
) {
  if (!actorUserId) return;
  let changed = false;
  const queue = readSponsoredSocialEventQueue().map((item) => {
    if (
      item.input.actorUserId
      || (item.input.eventType !== "click" && item.input.eventType !== "cta_click")
      || String(item.input.metadata.restaurantId || "") !== restaurantId
    ) {
      return item;
    }
    changed = true;
    return {
      ...item,
      input: {
        ...item.input,
        actorUserId,
        authIdentityPending: false,
      },
    };
  });
  if (changed) writeSponsoredSocialEventQueue(queue);
}

function getQueuedConversionTouch(input: SponsoredEventInput) {
  if (input.eventType !== "conversion") return null;
  return getValidSponsoredAttributions(input.restaurantId)
    .find((attribution) => attribution.campaignId === input.campaignId)
    ?.touchToken || null;
}

async function flushSponsoredEventQueue() {
  if (sponsoredQueueFlushPromise) return sponsoredQueueFlushPromise;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!analyticsAuthHydrated || !analyticsAuthIdentityVerified) return;

  sponsoredQueueFlushPromise = (async () => {
    const now = Date.now();
    const snapshot = readSponsoredEventQueue();
    const updates = new Map<string, QueuedSponsoredEvent | null>();
    const claimedIds: string[] = [];

    try {
      for (const item of snapshot) {
        if (
          (now - item.queuedAt) > SPONSORED_EVENT_MAX_AGE_MS
          || item.attempts >= MAX_SPONSORED_EVENT_ATTEMPTS
        ) {
          updates.set(item.id, null);
          continue;
        }
        if (item.nextAttemptAt > now || sponsoredEventInFlightIds.has(item.id)) continue;
        let replayInput = item.input.authIdentityPending
          ? {
              ...item.input,
              actorUserId: currentUserId,
              authIdentityPending: false,
            }
          : item.input;
        const replayItem = replayInput === item.input ? item : { ...item, input: replayInput };
        if (replayInput.actorUserId && replayInput.actorUserId !== currentUserId) {
          // Keep the event for its original actor. A logout or account switch
          // must not replay it under another identity or consume retry attempts.
          updates.set(item.id, {
            ...replayItem,
            nextAttemptAt: Date.now() + SPONSORED_RETRY_MAX_MS,
          });
          continue;
        }

        try {
          if (replayInput.eventType === "conversion" && !replayInput.touchToken) {
            const refreshedAttribution = getValidSponsoredAttributions(replayInput.restaurantId)
              .find((attribution) => attribution.campaignId === replayInput.campaignId);
            if (refreshedAttribution?.touchToken) {
              replayInput = { ...replayInput, touchToken: refreshedAttribution.touchToken };
            } else if (
              hasQueuedSponsoredClick(replayInput.campaignId, replayInput.restaurantId)
              || hasQueuedSponsoredSocialClick(replayInput.restaurantId)
            ) {
              updates.set(item.id, {
                ...replayItem,
                nextAttemptAt: Date.now() + SPONSORED_RETRY_BASE_MS,
              });
              continue;
            }
          }

          sponsoredEventInFlightIds.add(item.id);
          claimedIds.push(item.id);
          const result = await invokeSponsoredEvent(replayInput);
          if (
            replayInput.eventType === "conversion"
            && result.reason === "missing_attribution_touch"
          ) {
            const refreshedTouchToken = getQueuedConversionTouch(replayInput);
            if (
              refreshedTouchToken
              || hasQueuedSponsoredSocialClick(replayInput.restaurantId)
            ) {
              updates.set(item.id, {
                ...replayItem,
                input: refreshedTouchToken
                  ? { ...replayInput, touchToken: refreshedTouchToken }
                  : replayInput,
                nextAttemptAt: Date.now() + SPONSORED_RETRY_BASE_MS,
              });
              continue;
            }
          }
          applySponsoredTrackResult(replayInput, result);
          updates.set(item.id, null);
        } catch (error) {
          if (!isRetryableSponsoredError(error)) {
            updates.set(item.id, null);
            continue;
          }
          const attempts = item.attempts + 1;
          updates.set(item.id, attempts >= MAX_SPONSORED_EVENT_ATTEMPTS
            ? null
            : {
                ...replayItem,
                attempts,
                nextAttemptAt: Date.now() + getSponsoredRetryDelay(attempts),
              });
        }
      }

      const current = new Map(readSponsoredEventQueue().map((item) => [item.id, item]));
      updates.forEach((item, id) => {
        if (item) current.set(id, item);
        else current.delete(id);
      });
      const nextQueue = [...current.values()]
        .filter((item) => (Date.now() - item.queuedAt) <= SPONSORED_EVENT_MAX_AGE_MS)
        .slice(-MAX_SPONSORED_QUEUED_EVENTS);
      writeSponsoredEventQueue(nextQueue);

      const nextAttemptAt = nextQueue.reduce(
        (minimum, item) => Math.min(minimum, item.nextAttemptAt),
        Number.POSITIVE_INFINITY,
      );
      if (Number.isFinite(nextAttemptAt)) {
        scheduleSponsoredQueueFlush(Math.max(250, nextAttemptAt - Date.now()));
      }
    } finally {
      claimedIds.forEach((id) => sponsoredEventInFlightIds.delete(id));
    }
  })().finally(() => {
    sponsoredQueueFlushPromise = null;
  });

  return sponsoredQueueFlushPromise;
}

async function trackSponsoredEvent(input: SponsoredEventInput): Promise<SponsoredTrackResult> {
  const authIdentityPending = input.actorUserId === undefined && !analyticsAuthIdentityVerified;
  let actorUserId = input.actorUserId ?? null;
  if (input.actorUserId === undefined && !authIdentityPending) {
    actorUserId = currentUserId;
  }
  const durableInput: SponsoredEventInput = {
    ...input,
    eventId: input.eventId || createClientEventId(),
    viewerId: input.viewerId || getOrCreateAnalyticsViewerId(),
    page: input.page || getTrackingPage(),
    actorUserId,
    authIdentityPending,
  };
  const eventId = String(durableInput.eventId);
  let persisted = enqueueSponsoredEvent(durableInput);

  await analyticsAuthHydration;

  if (!analyticsAuthIdentityVerified) {
    return {
      recorded: false,
      deduped: false,
      queued: persisted,
      reason: persisted ? "queued_until_auth_verified" : "durable_storage_unavailable",
    };
  }
  if (durableInput.authIdentityPending) {
    durableInput.actorUserId = currentUserId;
    durableInput.authIdentityPending = false;
    persisted = enqueueSponsoredEvent(durableInput);
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      recorded: false,
      deduped: false,
      queued: persisted,
      reason: persisted ? "queued_offline" : "durable_storage_unavailable",
    };
  }
  if (
    durableInput.eventType === "conversion"
    && !durableInput.touchToken
    && (
      hasQueuedSponsoredClick(durableInput.campaignId, durableInput.restaurantId)
      || hasQueuedSponsoredSocialClick(durableInput.restaurantId)
    )
  ) {
    return {
      recorded: false,
      deduped: false,
      queued: persisted,
      reason: persisted ? "queued_for_click_attribution" : "durable_storage_unavailable",
    };
  }
  if (sponsoredEventInFlightIds.has(eventId)) {
    return {
      recorded: false,
      deduped: false,
      queued: persisted,
      reason: persisted ? "already_in_flight" : "durable_storage_unavailable",
    };
  }

  sponsoredEventInFlightIds.add(eventId);
  try {
    const result = await invokeSponsoredEvent(durableInput);
    if (
      durableInput.eventType === "conversion"
      && result.reason === "missing_attribution_touch"
    ) {
      const refreshedTouchToken = getQueuedConversionTouch(durableInput);
      if (
        refreshedTouchToken
        || hasQueuedSponsoredSocialClick(durableInput.restaurantId)
      ) {
        if (refreshedTouchToken) {
          durableInput.touchToken = refreshedTouchToken;
          persisted = enqueueSponsoredEvent(durableInput);
        }
        return {
          recorded: false,
          deduped: false,
          queued: persisted,
          reason: persisted ? "queued_for_click_attribution" : "durable_storage_unavailable",
        };
      }
    }
    applySponsoredTrackResult(durableInput, result);
    removeQueuedSponsoredEvent(eventId);
    return result;
  } catch (error) {
    if (!isRetryableSponsoredError(error)) {
      removeQueuedSponsoredEvent(eventId);
      return {
        recorded: false,
        deduped: false,
        ignored: false,
        reason: `transport_${getSponsoredErrorStatus(error) || "terminal"}`,
      };
    }
    return {
      recorded: false,
      deduped: false,
      queued: persisted,
      reason: persisted ? "queued_for_retry" : "durable_storage_unavailable",
    };
  } finally {
    sponsoredEventInFlightIds.delete(eventId);
    scheduleSponsoredQueueFlush();
  }
}

let sponsoredSocialQueueFlushPromise: Promise<void> | null = null;
let sponsoredSocialQueueTimer: number | null = null;
let sponsoredSocialEventQueueMemory: QueuedSponsoredSocialEvent[] = [];
const sponsoredSocialEventInFlightIds = new Set<string>();

function isSponsoredSocialEventInput(value: unknown): value is SponsoredSocialEventInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SponsoredSocialEventInput>;
  return (
    typeof candidate.postId === "string"
    && candidate.postId.length > 0
    && ["impression", "click", "cta_click"].includes(String(candidate.eventType || ""))
    && Boolean(candidate.metadata)
    && typeof candidate.metadata === "object"
    && !Array.isArray(candidate.metadata)
    && typeof candidate.trackingCallId === "string"
    && candidate.trackingCallId.length > 0
    && (candidate.actorUserId === null || typeof candidate.actorUserId === "string")
    && typeof candidate.authIdentityPending === "boolean"
  );
}

function readSponsoredSocialEventQueue(): QueuedSponsoredSocialEvent[] {
  const storage = getSponsoredQueueStorage();
  if (!storage) return sponsoredSocialEventQueueMemory;

  let raw: string | null;
  try {
    raw = storage.getItem(SPONSORED_SOCIAL_EVENT_QUEUE_KEY);
  } catch {
    sponsoredQueueStorageAvailable = false;
    return sponsoredSocialEventQueueMemory;
  }

  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return sponsoredSocialEventQueueMemory;

    sponsoredSocialEventQueueMemory = parsed
      .filter((item): item is QueuedSponsoredSocialEvent => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const candidate = item as Partial<QueuedSponsoredSocialEvent>;
        return (
          typeof candidate.id === "string"
          && candidate.id.length > 0
          && isSponsoredSocialEventInput(candidate.input)
          && Number.isFinite(candidate.queuedAt)
          && Number.isFinite(candidate.attempts)
          && Number.isFinite(candidate.nextAttemptAt)
        );
      })
      .slice(-MAX_SPONSORED_QUEUED_EVENTS);
    return sponsoredSocialEventQueueMemory;
  } catch {
    // Keep the runtime fallback and allow a later enqueue to repair the key.
    return sponsoredSocialEventQueueMemory;
  }
}

function writeSponsoredSocialEventQueue(queue: QueuedSponsoredSocialEvent[]) {
  sponsoredSocialEventQueueMemory = queue.slice(-MAX_SPONSORED_QUEUED_EVENTS);
  const storage = getSponsoredQueueStorage();
  if (!storage) return false;

  try {
    if (sponsoredSocialEventQueueMemory.length === 0) {
      storage.removeItem(SPONSORED_SOCIAL_EVENT_QUEUE_KEY);
      return true;
    }
    storage.setItem(
      SPONSORED_SOCIAL_EVENT_QUEUE_KEY,
      JSON.stringify(sponsoredSocialEventQueueMemory),
    );
    return true;
  } catch {
    sponsoredQueueStorageAvailable = false;
    return false;
  }
}

function scheduleSponsoredSocialQueueFlush(delayMs = SPONSORED_RETRY_BASE_MS) {
  if (typeof window === "undefined") return;
  if (sponsoredSocialQueueTimer !== null) window.clearTimeout(sponsoredSocialQueueTimer);
  sponsoredSocialQueueTimer = window.setTimeout(() => {
    sponsoredSocialQueueTimer = null;
    void flushSponsoredSocialEventQueue();
  }, Math.max(0, delayMs));
}

function enqueueSponsoredSocialEvent(input: SponsoredSocialEventInput) {
  const now = Date.now();
  const queue = readSponsoredSocialEventQueue().filter(
    (item) => (now - item.queuedAt) <= SPONSORED_EVENT_MAX_AGE_MS,
  );
  const existing = queue.find((item) => item.id === input.trackingCallId);
  if (!existing) {
    queue.push({
      id: input.trackingCallId,
      input,
      queuedAt: now,
      attempts: 0,
      nextAttemptAt: now + SPONSORED_RETRY_BASE_MS,
    });
  } else {
    existing.input = input;
  }

  const persisted = writeSponsoredSocialEventQueue(queue);
  scheduleSponsoredSocialQueueFlush();
  return persisted;
}

function removeQueuedSponsoredSocialEvent(trackingCallId: string) {
  const queue = readSponsoredSocialEventQueue()
    .filter((item) => item.id !== trackingCallId);
  writeSponsoredSocialEventQueue(queue);
}

function applySponsoredSocialTrackResult(
  input: SponsoredSocialEventInput,
  result: SponsoredSocialTrackResult,
) {
  if (input.eventType === "impression") return;

  const fallbackRestaurantId = typeof input.metadata.restaurantId === "string"
    ? input.metadata.restaurantId
    : "";
  const attributions = Array.isArray(result.attributions) && result.attributions.length > 0
    ? result.attributions
    : [{
        campaignId: result.campaignId,
        restaurantId: result.restaurantId || fallbackRestaurantId,
        touchToken: result.touchToken,
      }];

  attributions.forEach((attribution) => {
    const campaignId = String(attribution.campaignId || "").trim();
    const restaurantId = String(attribution.restaurantId || fallbackRestaurantId).trim();
    if (!campaignId || !restaurantId) return;
    rememberSponsoredAttribution(campaignId, restaurantId, {
      touchToken: attribution.touchToken || null,
    });
  });
  scheduleSponsoredQueueFlush(0);
  scheduleDeferredSponsoredConversionFlush(0);
}

async function invokeSponsoredSocialEvent(
  input: SponsoredSocialEventInput,
): Promise<SponsoredSocialTrackResult> {
  const { data, error } = await (getSupabase().rpc as any)("record_social_feed_event_v2", {
    p_post_id: input.postId,
    p_event_type: input.eventType,
    p_metadata: input.metadata,
  });
  if (error) throw error;
  return (data || {}) as SponsoredSocialTrackResult;
}

function isRetryableSponsoredSocialError(error: unknown) {
  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
    status?: unknown;
    context?: { status?: unknown } | null;
  } | null;
  const text = [
    candidate?.code,
    candidate?.message,
    candidate?.details,
    candidate?.hint,
  ].filter(Boolean).join(" ").toLowerCase();
  if (
    ["22023", "23505", "42501", "42883"].includes(String(candidate?.code || ""))
    || text.includes("post introuvable")
    || text.includes("schema cache")
    || text.includes("permission denied")
    || text.includes("forbidden")
    || text.includes("social_tracking_call_id_conflict")
    || text.includes("invalid_social_tracking")
  ) {
    return false;
  }

  const status = Number(candidate?.status ?? candidate?.context?.status);
  if (
    !Number.isFinite(status)
    || status === 0
    || status === 401
    || status === 408
    || status === 429
  ) return true;
  return status >= 500;
}

async function flushSponsoredSocialEventQueue() {
  if (sponsoredSocialQueueFlushPromise) return sponsoredSocialQueueFlushPromise;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!analyticsAuthHydrated || !analyticsAuthIdentityVerified) return;

  sponsoredSocialQueueFlushPromise = (async () => {
    const now = Date.now();
    const snapshot = readSponsoredSocialEventQueue();
    const updates = new Map<string, QueuedSponsoredSocialEvent | null>();
    const claimedIds: string[] = [];

    try {
      for (const item of snapshot) {
        if (
          (now - item.queuedAt) > SPONSORED_EVENT_MAX_AGE_MS
          || item.attempts >= MAX_SPONSORED_EVENT_ATTEMPTS
        ) {
          updates.set(item.id, null);
          continue;
        }
        if (item.nextAttemptAt > now || sponsoredSocialEventInFlightIds.has(item.id)) continue;

        const replayInput = item.input.authIdentityPending
          ? {
              ...item.input,
              actorUserId: currentUserId,
              authIdentityPending: false,
            }
          : item.input;
        const replayItem = replayInput === item.input ? item : { ...item, input: replayInput };
        if (replayInput.actorUserId && replayInput.actorUserId !== currentUserId) {
          updates.set(item.id, {
            ...replayItem,
            nextAttemptAt: Date.now() + SPONSORED_RETRY_MAX_MS,
          });
          continue;
        }

        sponsoredSocialEventInFlightIds.add(item.id);
        claimedIds.push(item.id);
        try {
          const result = await invokeSponsoredSocialEvent(replayInput);
          applySponsoredSocialTrackResult(replayInput, result);
          updates.set(item.id, null);
        } catch (error) {
          if (!isRetryableSponsoredSocialError(error)) {
            updates.set(item.id, null);
            continue;
          }
          const attempts = item.attempts + 1;
          updates.set(item.id, attempts >= MAX_SPONSORED_EVENT_ATTEMPTS
            ? null
            : {
                ...replayItem,
                attempts,
                nextAttemptAt: Date.now() + getSponsoredRetryDelay(attempts),
              });
        }
      }

      const current = new Map(readSponsoredSocialEventQueue().map((item) => [item.id, item]));
      updates.forEach((item, id) => {
        if (item) current.set(id, item);
        else current.delete(id);
      });
      const nextQueue = [...current.values()]
        .filter((item) => (Date.now() - item.queuedAt) <= SPONSORED_EVENT_MAX_AGE_MS)
        .slice(-MAX_SPONSORED_QUEUED_EVENTS);
      writeSponsoredSocialEventQueue(nextQueue);
      scheduleDeferredSponsoredConversionFlush(0);

      const nextAttemptAt = nextQueue.reduce(
        (minimum, item) => Math.min(minimum, item.nextAttemptAt),
        Number.POSITIVE_INFINITY,
      );
      if (Number.isFinite(nextAttemptAt)) {
        scheduleSponsoredSocialQueueFlush(Math.max(250, nextAttemptAt - Date.now()));
      }
    } finally {
      claimedIds.forEach((id) => sponsoredSocialEventInFlightIds.delete(id));
    }
  })().finally(() => {
    sponsoredSocialQueueFlushPromise = null;
  });

  return sponsoredSocialQueueFlushPromise;
}

let deferredSponsoredConversionFlushPromise: Promise<void> | null = null;
let deferredSponsoredConversionTimer: number | null = null;
let deferredSponsoredConversionMemory: QueuedDeferredSponsoredConversion[] = [];

function isDeferredSponsoredConversionInput(
  value: unknown,
): value is DeferredSponsoredConversionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<DeferredSponsoredConversionInput>;
  return (
    typeof candidate.eventId === "string"
    && candidate.eventId.length > 0
    && typeof candidate.restaurantId === "string"
    && candidate.restaurantId.length > 0
    && ["order", "reservation", "zero-attente"].includes(
      String(candidate.conversionType || ""),
    )
    && typeof candidate.entityId === "string"
    && candidate.entityId.length > 0
    && (candidate.paymentMethod === null || typeof candidate.paymentMethod === "string")
    && (candidate.journeyType === null || [
      "delivery",
      "takeaway",
      "reservation",
      "zero-attente",
    ].includes(String(candidate.journeyType || "")))
    && (candidate.actorUserId === null || typeof candidate.actorUserId === "string")
    && typeof candidate.authIdentityPending === "boolean"
  );
}

function readDeferredSponsoredConversionQueue(): QueuedDeferredSponsoredConversion[] {
  const storage = getSponsoredQueueStorage();
  if (!storage) return deferredSponsoredConversionMemory;

  try {
    const parsed = JSON.parse(
      storage.getItem(SPONSORED_DEFERRED_CONVERSION_QUEUE_KEY) || "[]",
    );
    if (!Array.isArray(parsed)) return deferredSponsoredConversionMemory;
    deferredSponsoredConversionMemory = parsed
      .filter((item): item is QueuedDeferredSponsoredConversion => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const candidate = item as Partial<QueuedDeferredSponsoredConversion>;
        return (
          typeof candidate.id === "string"
          && candidate.id.length > 0
          && isDeferredSponsoredConversionInput(candidate.input)
          && Number.isFinite(candidate.queuedAt)
        );
      })
      .slice(-MAX_SPONSORED_QUEUED_EVENTS);
    return deferredSponsoredConversionMemory;
  } catch {
    return deferredSponsoredConversionMemory;
  }
}

function writeDeferredSponsoredConversionQueue(
  queue: QueuedDeferredSponsoredConversion[],
) {
  deferredSponsoredConversionMemory = queue.slice(-MAX_SPONSORED_QUEUED_EVENTS);
  const storage = getSponsoredQueueStorage();
  if (!storage) return false;

  try {
    if (deferredSponsoredConversionMemory.length === 0) {
      storage.removeItem(SPONSORED_DEFERRED_CONVERSION_QUEUE_KEY);
      return true;
    }
    storage.setItem(
      SPONSORED_DEFERRED_CONVERSION_QUEUE_KEY,
      JSON.stringify(deferredSponsoredConversionMemory),
    );
    return true;
  } catch {
    sponsoredQueueStorageAvailable = false;
    return false;
  }
}

function scheduleDeferredSponsoredConversionFlush(
  delayMs = SPONSORED_RETRY_BASE_MS,
) {
  if (typeof window === "undefined") return;
  if (deferredSponsoredConversionTimer !== null) {
    window.clearTimeout(deferredSponsoredConversionTimer);
  }
  deferredSponsoredConversionTimer = window.setTimeout(() => {
    deferredSponsoredConversionTimer = null;
    void flushDeferredSponsoredConversionQueue();
  }, Math.max(0, delayMs));
}

function enqueueDeferredSponsoredConversion(
  input: DeferredSponsoredConversionInput,
) {
  const now = Date.now();
  const id = [
    input.restaurantId,
    input.conversionType,
    input.entityId,
  ].join(":");
  const queue = readDeferredSponsoredConversionQueue()
    .filter((item) => (now - item.queuedAt) <= SPONSORED_EVENT_MAX_AGE_MS);
  const existing = queue.find((item) => item.id === id);
  if (existing) {
    existing.input = {
      ...input,
      eventId: existing.input.eventId,
    };
  } else {
    queue.push({ id, input, queuedAt: now });
  }
  const persisted = writeDeferredSponsoredConversionQueue(queue);
  scheduleDeferredSponsoredConversionFlush();
  return persisted;
}

async function flushDeferredSponsoredConversionQueue() {
  if (deferredSponsoredConversionFlushPromise) {
    return deferredSponsoredConversionFlushPromise;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (!analyticsAuthHydrated || !analyticsAuthIdentityVerified) return;

  deferredSponsoredConversionFlushPromise = (async () => {
    const snapshot = readDeferredSponsoredConversionQueue();
    const completedIds = new Set<string>();
    const identityUpdates = new Map<string, QueuedDeferredSponsoredConversion>();

    for (const item of snapshot) {
      if ((Date.now() - item.queuedAt) > SPONSORED_EVENT_MAX_AGE_MS) {
        completedIds.add(item.id);
        continue;
      }

      const replayInput = item.input.authIdentityPending
        ? {
            ...item.input,
            actorUserId: currentUserId,
            authIdentityPending: false,
          }
        : item.input;
      if (replayInput !== item.input) {
        identityUpdates.set(item.id, { ...item, input: replayInput });
      }
      if (
        replayInput.actorUserId
        && replayInput.actorUserId !== currentUserId
      ) {
        continue;
      }
      claimQueuedSponsoredSocialClicks(
        replayInput.restaurantId,
        replayInput.actorUserId,
      );
      if (hasQueuedSponsoredSocialClick(replayInput.restaurantId)) continue;

      const attributions = getValidSponsoredAttributions(
        replayInput.restaurantId,
      );
      if (attributions.length === 0) {
        // The social call completed without an eligible paid campaign.
        completedIds.add(item.id);
        continue;
      }

      let handedOff = false;
      for (const attribution of attributions) {
        const result = await trackSponsoredEvent({
          eventType: "conversion",
          campaignId: attribution.campaignId,
          restaurantId: replayInput.restaurantId,
          source: "sponsored_conversion",
          conversionType: replayInput.conversionType,
          entityId: replayInput.entityId,
          paymentMethod: replayInput.paymentMethod,
          journeyType: replayInput.journeyType,
          touchToken: attribution.touchToken || null,
          eventId: replayInput.eventId,
          actorUserId: replayInput.actorUserId,
        });
        if (result.queued || isSponsoredTrackAccepted(result)) {
          handedOff = true;
          break;
        }
      }
      // Every attribution was terminal, or a generic durable event now owns
      // the retry. In both cases this restaurant-level placeholder is done.
      completedIds.add(item.id);
      if (handedOff) scheduleSponsoredQueueFlush(0);
    }

    const current = new Map(
      readDeferredSponsoredConversionQueue().map((item) => [item.id, item]),
    );
    identityUpdates.forEach((item, id) => current.set(id, item));
    completedIds.forEach((id) => current.delete(id));
    const nextQueue = [...current.values()]
      .filter((item) => (
        (Date.now() - item.queuedAt) <= SPONSORED_EVENT_MAX_AGE_MS
      ))
      .slice(-MAX_SPONSORED_QUEUED_EVENTS);
    writeDeferredSponsoredConversionQueue(nextQueue);

    if (nextQueue.length > 0) {
      scheduleDeferredSponsoredConversionFlush(SPONSORED_RETRY_MAX_MS);
    }
  })()
    .catch(() => {
      scheduleDeferredSponsoredConversionFlush(SPONSORED_RETRY_MAX_MS);
    })
    .finally(() => {
      deferredSponsoredConversionFlushPromise = null;
    });

  return deferredSponsoredConversionFlushPromise;
}

export async function recordSponsoredSocialFeedEvent({
  postId,
  eventType,
  metadata = {},
  trackingCallId,
}: {
  postId: string;
  eventType: SponsoredSocialEventType;
  metadata?: Record<string, unknown>;
  trackingCallId?: string | null;
}): Promise<SponsoredSocialTrackResult> {
  let requestedTrackingCallId = "";
  if (typeof trackingCallId === "string") {
    requestedTrackingCallId = trackingCallId.trim();
  } else if (typeof metadata.trackingCallId === "string") {
    requestedTrackingCallId = metadata.trackingCallId.trim();
  }
  const stableTrackingCallId = requestedTrackingCallId || createAnalyticsTrackingCallId();
  const authIdentityPending = !analyticsAuthIdentityVerified;
  const input: SponsoredSocialEventInput = {
    postId,
    eventType,
    trackingCallId: stableTrackingCallId,
    actorUserId: authIdentityPending ? null : currentUserId,
    authIdentityPending,
    metadata: {
      ...metadata,
      eventId: stableTrackingCallId,
      trackingCallId: stableTrackingCallId,
      viewerId: typeof metadata.viewerId === "string" && metadata.viewerId
        ? metadata.viewerId
        : getOrCreateAnalyticsViewerId(),
    },
  };
  let persisted = enqueueSponsoredSocialEvent(input);

  await analyticsAuthHydration;

  if (!analyticsAuthIdentityVerified) {
    return {
      trackingCallId: stableTrackingCallId,
      queued: persisted,
      reason: persisted ? "queued_until_auth_verified" : "durable_storage_unavailable",
    };
  }
  if (input.authIdentityPending) {
    input.actorUserId = currentUserId;
    input.authIdentityPending = false;
    persisted = enqueueSponsoredSocialEvent(input);
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      trackingCallId: stableTrackingCallId,
      queued: persisted,
      reason: persisted ? "queued_offline" : "durable_storage_unavailable",
    };
  }
  if (sponsoredSocialEventInFlightIds.has(stableTrackingCallId)) {
    return {
      trackingCallId: stableTrackingCallId,
      queued: persisted,
      reason: persisted ? "already_in_flight" : "durable_storage_unavailable",
    };
  }

  sponsoredSocialEventInFlightIds.add(stableTrackingCallId);
  try {
    const result = await invokeSponsoredSocialEvent(input);
    applySponsoredSocialTrackResult(input, result);
    removeQueuedSponsoredSocialEvent(stableTrackingCallId);
    return {
      ...result,
      trackingCallId: result.trackingCallId || stableTrackingCallId,
      queued: false,
    };
  } catch (error) {
    if (!isRetryableSponsoredSocialError(error)) {
      removeQueuedSponsoredSocialEvent(stableTrackingCallId);
      return {
        trackingCallId: stableTrackingCallId,
        queued: false,
        reason: "terminal_tracking_error",
      };
    }

    return {
      trackingCallId: stableTrackingCallId,
      queued: persisted,
      reason: persisted ? "queued_for_retry" : "durable_storage_unavailable",
    };
  } finally {
    sponsoredSocialEventInFlightIds.delete(stableTrackingCallId);
    scheduleSponsoredSocialQueueFlush();
    scheduleDeferredSponsoredConversionFlush(0);
  }
}

if (typeof window !== "undefined") {
  const trackingWindow = window as Window & {
    __miamzSponsoredQueueListenersBound?: boolean;
    __miamzSponsoredQueueFlush?: () => void;
    __miamzSponsoredSocialQueueFlush?: () => void;
    __miamzSponsoredDeferredConversionQueueFlush?: () => void;
  };
  trackingWindow.__miamzSponsoredQueueFlush = () => {
    void flushSponsoredEventQueue();
    void flushSponsoredSocialEventQueue();
    void flushDeferredSponsoredConversionQueue();
  };
  trackingWindow.__miamzSponsoredSocialQueueFlush = () => void flushSponsoredSocialEventQueue();
  trackingWindow.__miamzSponsoredDeferredConversionQueueFlush =
    () => void flushDeferredSponsoredConversionQueue();
  if (!trackingWindow.__miamzSponsoredQueueListenersBound) {
    trackingWindow.addEventListener("online", () => trackingWindow.__miamzSponsoredQueueFlush?.());
    trackingWindow.addEventListener("pageshow", () => trackingWindow.__miamzSponsoredQueueFlush?.());
    trackingWindow.__miamzSponsoredQueueListenersBound = true;
  }
  scheduleSponsoredQueueFlush(250);
  scheduleSponsoredSocialQueueFlush(250);
  scheduleDeferredSponsoredConversionFlush(250);
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
    return isSponsoredTrackAccepted(result) || result.ignored || false;
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
  try {
    const result = await trackSponsoredEvent({
      eventType: "click",
      campaignId,
      restaurantId,
      source,
      eventId: eventId || createClientEventId(),
    });

    if (
      isSponsoredTrackAccepted(result)
      || result.queued
      || result.reason === "internal_actor"
      || Boolean(result.touchToken)
    ) {
      rememberSponsoredAttribution(campaignId, restaurantId, {
        touchToken: result.touchToken || null,
      });
    }
    void trackClick("restaurant", restaurantId);
    return isSponsoredTrackAccepted(result);
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
  if (
    hasQueuedSponsoredSocialClick(restaurantId)
    && options?.entityId
  ) {
    const authIdentityPending = !analyticsAuthIdentityVerified;
    if (!authIdentityPending) {
      claimQueuedSponsoredSocialClicks(restaurantId, currentUserId);
    }
    enqueueDeferredSponsoredConversion({
      eventId: createClientEventId(),
      restaurantId,
      conversionType: options.conversionType || "order",
      entityId: options.entityId,
      paymentMethod: options.paymentMethod || null,
      journeyType: options.journeyType || null,
      actorUserId: authIdentityPending ? null : currentUserId,
      authIdentityPending,
    });
    return false;
  }

  const attributions = getValidSponsoredAttributions(restaurantId);
  if (attributions.length === 0) return false;

  for (const attribution of attributions) {
    try {
      const result = await trackSponsoredEvent({
        eventType: "conversion",
        campaignId: attribution.campaignId,
        restaurantId,
        source: "sponsored_conversion",
        conversionType: options?.conversionType || "order",
        entityId: options?.entityId || null,
        paymentMethod: options?.paymentMethod || null,
        journeyType: options?.journeyType || null,
        touchToken: attribution.touchToken || null,
      });

      if (result.queued) return false;
      if (isSponsoredTrackAccepted(result)) {
        clearSponsoredAttributions(restaurantId);
        return true;
      }
    } catch {
      // Try the next valid touch only after a terminal rejection.
    }
  }

  return false;
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
