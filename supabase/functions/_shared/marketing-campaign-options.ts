import { MarketingPlanError, type MarketingChannel, type MarketingPlan } from "./marketing-ai-plan.ts";
import { CAMPAIGN_TEMPLATE_LABELS } from "./marketing-campaign-templates.ts";
import { cleanGeneratedPublicText, normalizeGeneratedEditorial, SOCIAL_EDITORIAL_CATALOG, SOCIAL_EDITORIAL_VERSION } from "./marketing-social-editorial.ts";
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
export function applyCampaignOptions(plan: MarketingPlan, options: CampaignOptions, channels: readonly string[], startsAt: string, endsAt: string, audienceHint = ""): MarketingPlan {
  if (plan.items.length !== options.postCount) throw new MarketingPlanError("item_count_mismatch");
  const slots = buildCampaignSlots(options, channels, startsAt);
  if (!Number.isFinite(Date.parse(endsAt)) || slots.some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt))) throw new CampaignOptionsError("campaign_window_too_short");
  for (const item of plan.items) if (!item.visual_prompt?.trim()) throw new MarketingPlanError("missing_visual_prompt");
  const seenByChannel = new Map<string, Set<string>>();
  const posts = plan.items.map((item) => {
    if (!item.channel_variants) return item; // Compatibility for pre-editorial plans; generation uses the strict guided validator.
    const template = item.primary_template_id;
    if (!template || !options.templateIds.includes(template)) throw new MarketingPlanError("invalid_primary_template");
    const seenBodies = new Set<string>();
    const variants = channels.map((channel) => {
      const source = item.channel_variants!.filter((variant) => variant.channel === channel);
      if (source.length !== 1) throw new MarketingPlanError("invalid_channel_variants");
      const content = normalizeGeneratedEditorial(source[0].content, channel as MarketingChannel, template, audienceHint);
      const key = cleanGeneratedPublicText(content.body).toLocaleLowerCase("fr-CH").replace(/\s+/gu, " ").trim();
      if (!key || !content.headline) throw new MarketingPlanError("empty_editorial_content");
      const channelBodies = seenByChannel.get(channel) || new Set<string>();
      if (seenBodies.has(key) || channelBodies.has(key)) throw new MarketingPlanError("duplicate_editorial_copy");
      seenBodies.add(key); channelBodies.add(key); seenByChannel.set(channel, channelBodies);
      return { channel: channel as MarketingChannel, content };
    });
    const visualPrompt = cleanGeneratedPublicText(item.visual_prompt!, 4000);
    if (!visualPrompt) throw new MarketingPlanError("missing_visual_prompt");
    return { ...item, title: cleanGeneratedPublicText(item.title, 200), visual_prompt: visualPrompt, channel_variants: variants,
      editorial: { version: SOCIAL_EDITORIAL_VERSION, primary_template_id: template, destination_url: SOCIAL_EDITORIAL_CATALOG[template].url } };
  });
  return {
    campaign: { ...plan.campaign, channels: [...channels] as MarketingChannel[], starts_at: startsAt, ends_at: endsAt },
    items: slots.map((slot) => ({ ...posts[slot.postIndex], channel: slot.channel as MarketingChannel,
      scheduled_at: slot.scheduledAt, visual_format: slot.format, post_index: slot.postIndex,
      template_ids: [...options.templateIds], content: { ...(posts[slot.postIndex].channel_variants?.find((variant) => variant.channel === slot.channel)?.content || posts[slot.postIndex].content), subject: null },
    })),
  };
}
