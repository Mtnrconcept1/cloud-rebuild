import { buildMetaCaption } from "./meta-publishing.ts";
import type { MarketingPlan } from "./marketing-ai-plan.ts";

export type MarketingCampaignPurpose = "awareness" | "acquisition" | "retention";
export type MarketingPlanContext = {
  now: number;
  startsAt: string;
  endsAt: string;
  itemCount: number;
  destinationUrl?: string;
  purpose?: MarketingCampaignPurpose;
};
export const MARKETING_GENERATION_LEAD_MS = 5 * 60_000;
export const MARKETING_APPROVAL_LEAD_MS = 2 * 60_000;
export const MARKETING_DESTINATIONS = [
  "/contact", "/restaurateurs/geneve", "/restaurateurs/alternative-commission-couvert",
  "/restaurateurs/google-business", "/packs-restaurateur", "/",
] as const;
const PUBLIC_CHANNELS = new Set(["tok_news", "instagram", "facebook", "linkedin", "tiktok", "youtube", "telegram", "google_business", "website"]);
const SELECTORS = new Set(["audience_kind", "canton", "city", "category", "contact_type"]);
const CONTACT_TYPES = new Set(["registered_user", "restaurant_prospect", "restaurant_lead", "manual"]);
const KINDS = new Set(["restaurant", "client", "mixed"]);
const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23" });

export class MarketingPlanError extends Error {
  constructor(readonly reason: string, readonly details: Record<string, unknown> = {}) {
    super(`Marketing plan rejected: ${reason}`);
    this.name = "MarketingPlanError";
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

/** Reject timezone-less values and dates silently rolled over by Date.parse. */
export function isMarketingTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return month >= 1 && month <= 12 && day >= 1
    && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
    && hour < 24 && minute < 60 && second < 60;
}

export function normalizeMarketingDestination(value: unknown = "https://www.thetok.ch/contact") {
  if (typeof value !== "string" || value.length > 200) throw new MarketingPlanError("destination_url_invalid");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new MarketingPlanError("destination_url_invalid"); }
  if (url.protocol !== "https:" || !["thetok.ch", "www.thetok.ch"].includes(url.hostname)
    || url.port || url.username || url.password || url.search || url.hash
    || !MARKETING_DESTINATIONS.some((path) => path === url.pathname)) {
    throw new MarketingPlanError("destination_url_invalid");
  }
  url.hostname = "www.thetok.ch";
  return url.toString();
}

/** Keep the complete reviewed URL inside the existing email CTA limit. */
export function buildMarketingCallToAction(label: string, destinationUrl?: string) {
  const destination = normalizeMarketingDestination(destinationUrl);
  const action = label.split(/https?:\/\//i)[0].trim() || "Découvrir TOK";
  return action.slice(0, 198 - destination.length) + "\n\n" + destination;
}

export function normalizeMarketingPurpose(value: unknown): MarketingCampaignPurpose {
  if (value === undefined) return "awareness";
  if (value === "awareness" || value === "acquisition" || value === "retention") return value;
  throw new MarketingPlanError("purpose_invalid");
}

export function validateMarketingWindow(startsAt: string, endsAt: string, now = Date.now()) {
  if (!isMarketingTimestamp(startsAt) || !isMarketingTimestamp(endsAt) || Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new MarketingPlanError("invalid_campaign_window");
  }
  if (!Number.isFinite(now) || Date.parse(startsAt) < now + MARKETING_GENERATION_LEAD_MS) {
    throw new MarketingPlanError("schedule_in_past");
  }
}

function audience(value: unknown, emptyReason: string) {
  if (!record(value)) throw new MarketingPlanError(emptyReason);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SELECTORS.has(key)) throw new MarketingPlanError("invalid_audience_selector");
    if (entry === null || entry === undefined || entry === "") continue;
    if (typeof entry !== "string" || entry.length > 160) throw new MarketingPlanError("invalid_audience_selector");
    const cleaned = entry.trim();
    if (cleaned) result[key] = key === "canton" ? cleaned.toUpperCase() : cleaned;
  }
  if (!Object.keys(result).length) throw new MarketingPlanError(emptyReason);
  if ((result.audience_kind && !KINDS.has(result.audience_kind))
    || (result.contact_type && !CONTACT_TYPES.has(result.contact_type))
    || (result.canton && !/^[A-Z]{2}$/.test(result.canton))) throw new MarketingPlanError("invalid_audience_selector");
  return result;
}

/** Pure, shared validation: the Edge and the persistence boundary use the same rules. */
export function validateMarketingPlan(plan: MarketingPlan, allowedChannels: readonly string[], context?: MarketingPlanContext): MarketingPlan {
  if (!record(plan)) throw new MarketingPlanError("not_an_object");
  const campaign = plan.campaign;
  if (!record(campaign) || !text(campaign.name, 160)) throw new MarketingPlanError("missing_campaign_name");
  if (!text(campaign.objective, 2000) || !text(campaign.summary, 6000) || !text(campaign.audience_name, 160)) throw new MarketingPlanError("invalid_campaign_content");
  if (!Array.isArray(plan.items) || !plan.items.length) throw new MarketingPlanError("no_items");
  if (plan.items.length > 32) throw new MarketingPlanError("too_many_items");
  if (!isMarketingTimestamp(campaign.starts_at) || !isMarketingTimestamp(campaign.ends_at)
    || Date.parse(campaign.ends_at) <= Date.parse(campaign.starts_at)) throw new MarketingPlanError("invalid_campaign_window");
  if (campaign.strategy !== undefined && campaign.strategy !== null) {
    const strategy = campaign.strategy;
    if (!record(strategy) || !text(strategy.sequence, 3000) || !text(strategy.conversion_goal, 1000)
      || !text(strategy.measurement_plan, 3000) || !Array.isArray(strategy.assumptions)
      || strategy.assumptions.length > 20 || strategy.assumptions.some((entry) => !text(entry, 1000))) throw new MarketingPlanError("invalid_strategy");
  }
  const canonicalAudience = audience(campaign.audience_definition, "empty_campaign_audience");
  const allowed = new Set(allowedChannels);
  if (!Array.isArray(campaign.channels) || campaign.channels.some((channel) => !allowed.has(channel))) throw new MarketingPlanError("channel_not_allowed");
  if (context) {
    if (plan.items.length !== context.itemCount) throw new MarketingPlanError("item_count_mismatch");
    if (Date.parse(campaign.starts_at) !== Date.parse(context.startsAt) || Date.parse(campaign.ends_at) !== Date.parse(context.endsAt)) throw new MarketingPlanError("campaign_window_mismatch");
    if (!Number.isFinite(context.now) || Date.parse(campaign.starts_at) < context.now + MARKETING_APPROVAL_LEAD_MS) throw new MarketingPlanError("schedule_in_past");
    normalizeMarketingDestination(context.destinationUrl);
  }
  const duplicates = new Set<string>();
  const items = plan.items.map((item, index) => {
    if (!record(item) || !text(item.title, 200)) throw new MarketingPlanError("missing_item_title", { index });
    if (!allowed.has(item.channel)) throw new MarketingPlanError("channel_not_allowed", { index });
    if (!text(item.audience_name, 160)) throw new MarketingPlanError("invalid_item_audience", { index });
    if (item.stage != null && !["awareness", "comparison", "objection", "conversion"].includes(item.stage)) throw new MarketingPlanError("invalid_item_stage", { index });
    if (item.visual_prompt != null && !text(item.visual_prompt, 4000)) throw new MarketingPlanError("invalid_visual_prompt", { index });
    if (!isMarketingTimestamp(item.scheduled_at)) throw new MarketingPlanError("invalid_item_schedule", { index });
    const scheduled = Date.parse(item.scheduled_at);
    if (scheduled < Date.parse(campaign.starts_at) || scheduled > Date.parse(campaign.ends_at)) throw new MarketingPlanError("item_outside_campaign", { index });
    if (context && scheduled < context.now + MARKETING_APPROVAL_LEAD_MS) throw new MarketingPlanError("schedule_in_past", { index });
    const targeting = audience(item.targeting, "empty_item_targeting");
    if (Object.keys(targeting).length !== Object.keys(canonicalAudience).length
      || Object.keys(canonicalAudience).some((key) => targeting[key] !== canonicalAudience[key])) throw new MarketingPlanError("audience_mismatch", { index });
    if (context?.purpose === "acquisition" && ["in_app", "push"].includes(item.channel)) throw new MarketingPlanError("acquisition_channel_invalid", { index });
    if (!PUBLIC_CHANNELS.has(item.channel)) {
      const hour = Number(hourFormatter.format(new Date(scheduled)));
      if (hour < 8 || hour >= 20) throw new MarketingPlanError("outside_contact_hours", { index });
    }
    if (!record(item.content) || !text(item.content.body, 20000)) throw new MarketingPlanError("empty_item_body", { index });
    if (!text(item.content.headline, 200)) throw new MarketingPlanError("missing_item_headline", { index });
    if (!text(item.content.call_to_action, 200)) throw new MarketingPlanError("missing_call_to_action", { index });
    if (!Array.isArray(item.content.hashtags) || item.content.hashtags.length > 30 || item.content.hashtags.some((tag) => !text(tag, 100))) throw new MarketingPlanError("invalid_hashtags", { index });
    if (item.channel === "facebook" || item.channel === "instagram") {
      try {
        buildMetaCaption({ ...item.content, hashtags: item.content.hashtags.slice(0, 12),
          call_to_action: buildMarketingCallToAction(item.content.call_to_action, context?.destinationUrl) }, item.channel);
      } catch { throw new MarketingPlanError("social_caption_invalid", { index }); }
    }
    if (item.channel === "email" && !text(item.content.subject, 200)) throw new MarketingPlanError("missing_email_subject", { index });
    const key = [item.channel, item.content.headline, item.content.body].join("|").toLocaleLowerCase().replace(/\s+/g, " ");
    if (duplicates.has(key)) throw new MarketingPlanError("duplicate_item_content", { index });
    duplicates.add(key);
    return { ...item, scheduled_at: new Date(scheduled).toISOString(), targeting };
  });
  if (context && allowedChannels.some((channel) => !items.some((item) => item.channel === channel))) throw new MarketingPlanError("requested_channel_missing");
  return { ...plan, campaign: { ...campaign, audience_definition: canonicalAudience, channels: [...new Set(items.map((item) => item.channel))] }, items };
}
