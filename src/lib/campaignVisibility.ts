import {
  DEFAULT_AUDIENCE_CRITERIA,
  scoreAudienceCriteria,
  type AudienceSnapshot,
} from "@/lib/campaignTargeting";
import { isPrivacyCategoryAllowed } from "@/lib/privacyConsentState";

type CampaignRestaurantRelation = {
  id?: string | null;
  owner_id?: string | null;
} | null | undefined;

export interface CampaignVisibilityCandidate {
  restaurant_id?: string | null;
  restaurants?: CampaignRestaurantRelation;
  target_pages?: unknown;
  target_criteria?: unknown;
  starts_at?: string | null;
  ends_at?: string | null;
  total_budget?: number | string | null;
  spent?: number | string | null;
  budget_daily?: number | string | null;
  daily_spent?: number | string | null;
  daily_spent_date?: string | null;
}

interface CampaignVisibilityOptions {
  page: string;
  audienceSnapshot: AudienceSnapshot | null;
  viewerUserId?: string | null;
  now?: number;
}

function isCampaignOwnerPreview(campaign: CampaignVisibilityCandidate, viewerUserId?: string | null) {
  if (!viewerUserId) return false;
  return String(campaign?.restaurants?.owner_id || "") === viewerUserId;
}

function normalizeTargetPages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((page) => String(page || "").trim()).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((page) => String(page || "").trim()).filter(Boolean);
    }
  } catch {
    // Fall back to comma-separated values for legacy payloads.
  }

  return trimmed.split(",").map((page) => page.trim()).filter(Boolean);
}

export function isCampaignVisibleForViewer(
  campaign: CampaignVisibilityCandidate,
  {
    page,
    audienceSnapshot,
    viewerUserId = null,
    now = Date.now(),
  }: CampaignVisibilityOptions,
) {
  if (campaign.starts_at) {
    const startsAt = Date.parse(String(campaign.starts_at));
    if (Number.isFinite(startsAt) && startsAt > now) return false;
  }

  if (campaign.ends_at) {
    const endsAt = Date.parse(String(campaign.ends_at));
    if (Number.isFinite(endsAt) && endsAt < now) return false;
  }

  if (Number(campaign.total_budget || 0) > 0 && Number(campaign.spent || 0) >= Number(campaign.total_budget || 0)) {
    return false;
  }

  if (Number(campaign.budget_daily || 0) > 0) {
    const today = new Date(now).toISOString().slice(0, 10);
    const dailySpent = (String(campaign.daily_spent_date || "") === today)
      ? Number(campaign.daily_spent || 0)
      : 0;
    if (dailySpent >= Number(campaign.budget_daily)) return false;
  }

  const pages = normalizeTargetPages(campaign.target_pages);
  if (pages.length > 0 && !pages.includes(page)) {
    return false;
  }

  if (isCampaignOwnerPreview(campaign, viewerUserId)) {
    return true;
  }

  const effectiveAudienceSnapshot = isPrivacyCategoryAllowed("personalization")
    ? audienceSnapshot
    : null;

  if (!effectiveAudienceSnapshot) {
    return true;
  }

  const restaurantId = campaign?.restaurant_id || campaign?.restaurants?.id || null;
  return scoreAudienceCriteria(
    campaign?.target_criteria || DEFAULT_AUDIENCE_CRITERIA,
    effectiveAudienceSnapshot,
    restaurantId,
  ).score > 0;
}
