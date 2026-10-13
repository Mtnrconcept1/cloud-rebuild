import { MarketingPlanError, type MarketingChannel, type MarketingPlan } from "./marketing-ai-plan.ts";
import { CAMPAIGN_TEMPLATE_LABELS } from "./marketing-campaign-templates.ts";
import {
  buildCampaignSlots,
  CampaignOptionsError,
  parseCampaignOptions as parseCampaignRequest,
  type CampaignOptions,
} from "./marketing-campaign-request.ts";

export { CAMPAIGN_TEMPLATES, CAMPAIGN_TEMPLATE_LABELS, type CampaignTemplateId } from "./marketing-campaign-templates.ts";
export {
  CAMPAIGN_FORMAT_SIZES,
  CAMPAIGN_CADENCE_DAYS,
  GUIDED_CAMPAIGN_CHANNELS,
  MAX_CAMPAIGN_VARIANTS,
  MAX_CAMPAIGN_VISUALS,
  CampaignOptionsError,
  campaignOptionCounts,
  buildCampaignSlots,
  type CampaignFormat,
  type CampaignOptions,
} from "./marketing-campaign-request.ts";

/** Deno/application wrapper retains the existing API and its canonical template allowlist. */
export function parseCampaignOptions(value: unknown, channels: readonly string[]): CampaignOptions | undefined {
  return parseCampaignRequest(value, channels, Object.keys(CAMPAIGN_TEMPLATE_LABELS));
}

/** Expand editorial posts deterministically; model output never chooses channels, ratio or cadence. */
export function applyCampaignOptions(plan: MarketingPlan, options: CampaignOptions, channels: readonly string[], startsAt: string, endsAt: string): MarketingPlan {
  if (plan.items.length !== options.postCount) throw new MarketingPlanError("item_count_mismatch");
  const slots = buildCampaignSlots(options, channels, startsAt);
  if (!Number.isFinite(Date.parse(endsAt)) || slots.some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt))) throw new CampaignOptionsError("campaign_window_too_short");
  for (const item of plan.items) if (!item.visual_prompt?.trim()) throw new MarketingPlanError("missing_visual_prompt");
  return {
    campaign: { ...plan.campaign, channels: [...channels] as MarketingChannel[], starts_at: startsAt, ends_at: endsAt },
    items: slots.map((slot) => ({ ...plan.items[slot.postIndex], channel: slot.channel as MarketingChannel,
      scheduled_at: slot.scheduledAt, visual_format: slot.format, post_index: slot.postIndex,
      template_ids: [...options.templateIds], content: { ...plan.items[slot.postIndex].content, subject: null },
    })),
  };
}
