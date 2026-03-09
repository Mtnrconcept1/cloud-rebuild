import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEventType =
  | "page_view"
  | "search"
  | "menu_view"
  | "add_to_cart"
  | "order_completed"
  | "favorite_added"
  | "category_click"
  | "sponsored_impression"
  | "sponsored_click";

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

interface SponsoredAttribution {
  campaignId: string;
  clickedAt: string;
}

type SponsoredAttributionMap = Record<string, SponsoredAttribution>;

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

export function setAnalyticsUser(userId: string | null) {
  currentUserId = userId;
}

export async function trackEvent({
  eventType,
  eventData = {},
  restaurantId,
  cuisineType,
  city,
}: TrackEventParams) {
  if (!currentUserId) return;

  try {
    await supabase.from("user_analytics" as any).insert({
      user_id: currentUserId,
      event_type: eventType,
      event_data: eventData,
      restaurant_id: restaurantId || null,
      cuisine_type: cuisineType || null,
      city: city || null,
    });
  } catch (e) {
    // Silent fail — analytics should never break the app
  }
}

export async function trackSponsoredImpression(campaignId: string, restaurantId?: string) {
  try {
    await supabase.rpc("increment_ad_campaign_metric", {
      p_campaign_id: campaignId,
      p_metric: "impressions",
    });
  } catch {
    // Silent fail
  }
  if (currentUserId) {
    trackEvent({
      eventType: "sponsored_impression",
      eventData: { campaign_id: campaignId },
      restaurantId,
    });
  }
}

export async function trackSponsoredClick(campaignId: string, restaurantId: string) {
  rememberSponsoredAttribution(campaignId, restaurantId);

  try {
    await supabase.rpc("increment_ad_campaign_metric", {
      p_campaign_id: campaignId,
      p_metric: "click",
    });
  } catch {
    // Silent fail
  }
  if (currentUserId) {
    trackEvent({
      eventType: "sponsored_click",
      eventData: { campaign_id: campaignId },
      restaurantId,
    });
  }
}

export async function trackSponsoredConversion(restaurantId: string) {
  const campaignId = getValidSponsoredCampaignId(restaurantId);
  if (!campaignId) return false;

  try {
    await supabase.rpc("increment_ad_campaign_metric", {
      p_campaign_id: campaignId,
      p_metric: "conversion",
    });

    const attributions = readSponsoredAttributions();
    delete attributions[restaurantId];
    writeSponsoredAttributions(attributions);
    return true;
  } catch {
    return false;
  }
}

export interface AudienceCriteria {
  cuisines: string[];
  cities: string[];
  minOrders: number;
  maxDaysSinceOrder: number;
  minAvgBasket: number;
  favoritesOnly: boolean;
  restaurantId?: string;
}

export const DEFAULT_AUDIENCE_CRITERIA: AudienceCriteria = {
  cuisines: [],
  cities: [],
  minOrders: 0,
  maxDaysSinceOrder: 365,
  minAvgBasket: 0,
  favoritesOnly: false,
};

export async function getAudienceEstimate(
  criteria: AudienceCriteria
): Promise<number> {
  try {
    let query = supabase.from("profiles" as any).select("user_id", { count: "exact", head: true });

    if (criteria.cities.length > 0) {
      query = query.in("city", criteria.cities);
    }

    const { count } = await query;
    let estimate = count || 0;

    if (criteria.minOrders > 0) estimate = Math.floor(estimate * 0.6);
    if (criteria.minAvgBasket > 20) estimate = Math.floor(estimate * 0.4);
    if (criteria.cuisines.length > 0) estimate = Math.floor(estimate * 0.5);
    if (criteria.favoritesOnly) estimate = Math.floor(estimate * 0.15);
    if (criteria.maxDaysSinceOrder < 30) estimate = Math.floor(estimate * 0.7);

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
  const { data } = await supabase
    .from("ad_campaigns" as any)
    .select("*, restaurants(*)")
    .in("type", ["boost", "banner", "sponsored"])
    .eq("status", "active");

  const all = (data || []) as any[];
  return all.filter((c: any) => {
    const pages = c.target_pages;
    if (!pages) return true;
    if (Array.isArray(pages)) return pages.length === 0 || pages.includes(page);
    return true;
  });
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