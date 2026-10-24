import { MarketingPlanError, type MarketingChannel, type MarketingPlan } from "./marketing-ai-plan.ts";
import { CAMPAIGN_TEMPLATE_LABELS } from "./marketing-campaign-templates.ts";
import { cleanGeneratedPublicText, normalizeGeneratedEditorial, SOCIAL_EDITORIAL_CATALOG, SOCIAL_EDITORIAL_VERSION } from "./marketing-social-editorial.ts";
import {
  MARKETING_MAX_COPY_SIMILARITY,
  TOK_MARKETING_CREATIVE_VERSION,
  assignTokCreativeDirections,
  buildTokCreativeDirectionPrompt,
  marketingCopyNoveltyScore,
  marketingCopySimilarity,
  type MarketingRecentSocialPost,
} from "./marketing-creative-direction.ts";
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

export function parseCampaignOptions(value: unknown, channels: readonly string[]): CampaignOptions | undefined {
  return parseCampaignRequest(value, channels, Object.keys(CAMPAIGN_TEMPLATE_LABELS));
}

export function applyCampaignOptions(
  plan: MarketingPlan,
  options: CampaignOptions,
  channels: readonly string[],
  startsAt: string,
  endsAt: string,
  audienceHint = "",
  recentPosts: readonly MarketingRecentSocialPost[] = [],
): MarketingPlan {
  if (plan.items.length !== options.postCount) throw new MarketingPlanError("item_count_mismatch");
  const slots = buildCampaignSlots(options, channels, startsAt);
  if (!Number.isFinite(Date.parse(endsAt)) || slots.some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt))) {
    throw new CampaignOptionsError("campaign_window_too_short");
  }
  for (const item of plan.items) if (!item.visual_prompt?.trim()) throw new MarketingPlanError("missing_visual_prompt");

  const directions = assignTokCreativeDirections(plan.items.length, recentPosts, plan.campaign.name + "|" + startsAt);
  const seenByChannel = new Map<string, Set<string>>();
  const currentPosts: MarketingRecentSocialPost[] = [];

  const posts = plan.items.map((item, postIndex) => {
    if (!item.channel_variants) return item;
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
      seenBodies.add(key);
      channelBodies.add(key);
      seenByChannel.set(channel, channelBodies);
      return { channel: channel as MarketingChannel, content };
    });

    const canonical = variants.find((variant) => variant.channel === "instagram") || variants[0];
    const comparisonHistory = [...recentPosts, ...currentPosts];
    const maximumSimilarity = comparisonHistory.reduce(
      (maximum, historical) => Math.max(maximum, marketingCopySimilarity(canonical.content, historical)),
      0,
    );
    if (maximumSimilarity >= MARKETING_MAX_COPY_SIMILARITY) {
      throw new MarketingPlanError("duplicate_editorial_semantic", {
        index: postIndex,
        similarity: Number(maximumSimilarity.toFixed(3)),
      });
    }

    const subjectBrief = cleanGeneratedPublicText(item.visual_prompt!, 4000);
    if (!subjectBrief) throw new MarketingPlanError("missing_visual_prompt");
    const direction = directions[postIndex];
    const visualPrompt = buildTokCreativeDirectionPrompt({
      direction,
      headline: canonical.content.headline,
      subjectBrief,
    });
    const noveltyScore = marketingCopyNoveltyScore(canonical.content, comparisonHistory);

    currentPosts.push({
      channel: canonical.channel,
      headline: canonical.content.headline,
      body: canonical.content.body,
      visualPrompt,
      creativeDirectionId: direction.id,
      primaryTemplateId: template,
    });

    return {
      ...item,
      title: cleanGeneratedPublicText(item.title, 200),
      visual_prompt: visualPrompt,
      channel_variants: variants,
      editorial: {
        version: SOCIAL_EDITORIAL_VERSION,
        primary_template_id: template,
        destination_url: SOCIAL_EDITORIAL_CATALOG[template].url,
        creative_direction_id: direction.id,
        creative_direction_version: TOK_MARKETING_CREATIVE_VERSION,
        text_novelty_score: Number(noveltyScore.toFixed(3)),
      },
    };
  });

  return {
    campaign: { ...plan.campaign, channels: [...channels] as MarketingChannel[], starts_at: startsAt, ends_at: endsAt },
    items: slots.map((slot) => ({
      ...posts[slot.postIndex],
      channel: slot.channel as MarketingChannel,
      scheduled_at: slot.scheduledAt,
      visual_format: slot.format,
      post_index: slot.postIndex,
      template_ids: [...options.templateIds],
      content: {
        ...(posts[slot.postIndex].channel_variants?.find((variant) => variant.channel === slot.channel)?.content || posts[slot.postIndex].content),
        subject: null,
      },
    })),
  };
}
