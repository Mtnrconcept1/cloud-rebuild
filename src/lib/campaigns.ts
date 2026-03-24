import type { AudienceCriteria } from "@/lib/campaignTargeting";
import { invokeSupabaseFunction } from "@/lib/session";

type CampaignPortalResult<T> = {
  data: T | null;
  error: Error | null;
};

async function invokeCampaignPortal<T>(body: Record<string, unknown>): Promise<CampaignPortalResult<T>> {
  const { data, error } = await invokeSupabaseFunction<T>("campaign-portal", { body });
  return {
    data: data ?? null,
    error: error instanceof Error ? error : null,
  };
}

export async function listRestaurantCampaigns(restaurantId: string) {
  const { data, error } = await invokeCampaignPortal<{ campaigns?: any[] }>({
    action: "list",
    restaurantId,
  });

  return {
    data: data?.campaigns || [],
    error,
  };
}

export async function saveRestaurantCampaign(restaurantId: string, payload: Record<string, unknown>, campaignId?: string) {
  const { data, error } = await invokeCampaignPortal<{ campaign?: any }>({
    action: "save",
    restaurantId,
    campaignId: campaignId || null,
    payload,
  });

  return {
    data: data?.campaign || null,
    error,
  };
}

export async function setRestaurantCampaignStatus(restaurantId: string, campaignId: string, status: string) {
  const { data, error } = await invokeCampaignPortal<{ campaign?: any }>({
    action: "update_status",
    restaurantId,
    campaignId,
    status,
  });

  return {
    data: data?.campaign || null,
    error,
  };
}

export async function deleteRestaurantCampaign(restaurantId: string, campaignId: string) {
  const { data, error } = await invokeCampaignPortal<{ deleted?: boolean }>({
    action: "delete",
    restaurantId,
    campaignId,
  });

  return {
    data: Boolean(data?.deleted),
    error,
  };
}

export async function estimateRestaurantCampaignAudience(restaurantId: string, criteria: AudienceCriteria) {
  const { data, error } = await invokeCampaignPortal<{
    estimate?: number;
    unavailable?: boolean;
    reason?: string | null;
  }>({
    action: "estimate_audience",
    restaurantId,
    criteria,
  });

  return {
    data: Math.max(Number(data?.estimate) || 0, 0),
    unavailable: Boolean(data?.unavailable),
    reason: data?.reason || null,
    error,
  };
}
