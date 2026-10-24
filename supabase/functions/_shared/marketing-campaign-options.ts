import { MarketingPlanError, type MarketingChannel, type MarketingPlan } from "./marketing-ai-plan.ts";
import { TOK_MARKETING_VISUAL_FAMILIES } from "./marketing-brand.ts";
import { CAMPAIGN_TEMPLATE_LABELS } from "./marketing-campaign-templates.ts";
import { cleanGeneratedPublicText, isNearDuplicateEditorialCopy, normalizeEditorialSimilarityText, normalizeGeneratedEditorial, SOCIAL_EDITORIAL_CATALOG, SOCIAL_EDITORIAL_VERSION } from "./marketing-social-editorial.ts";
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

export type RecentSocialEditorial = {
  channel: string;
  title?: string;
  headline?: string;
  body: string;
};

/** Expand editorial posts deterministically; model output never chooses channels, ratio or cadence. */
export function applyCampaignOptions(plan: MarketingPlan, options: CampaignOptions, channels: readonly string[], startsAt: string, endsAt: string, audienceHint = "", recentSocialEditorial: readonly RecentSocialEditorial[] = []): MarketingPlan {
  if (plan.items.length !== options.postCount) throw new MarketingPlanError("item_count_mismatch");
  const slots = buildCampaignSlots(options, channels, startsAt);
  if (!Number.isFinite(Date.parse(endsAt)) || slots.some((slot) => Date.parse(slot.scheduledAt) > Date.parse(endsAt))) throw new CampaignOptionsError("campaign_window_too_short");
  for (const item of plan.items) if (!item.visual_prompt?.trim()) throw new MarketingPlanError("missing_visual_prompt");
  const seenBodiesByChannel = new Map<string, string[]>();
  const seenHeadlinesByChannel = new Map<string, Set<string>>();
  const seenVisualTitles = new Set<string>();
  for (const previous of recentSocialEditorial.slice(0, 120)) {
    if (!channels.includes(previous.channel)) continue;
    const bodyKey = normalizeEditorialSimilarityText(previous.body || "");
    if (bodyKey) seenBodiesByChannel.set(previous.channel, [...(seenBodiesByChannel.get(previous.channel) || []), bodyKey]);
    const headlineKey = normalizeEditorialSimilarityText(previous.headline || "");
    if (headlineKey) {
      const values = seenHeadlinesByChannel.get(previous.channel) || new Set<string>();
      values.add(headlineKey);
      seenHeadlinesByChannel.set(previous.channel, values);
    }
  }
  const posts = plan.items.map((item, postIndex) => {
    if (!item.channel_variants) return item; // Compatibility for pre-editorial plans; generation uses the strict guided validator.
    const template = item.primary_template_id;
    if (!template || !options.templateIds.includes(template)) throw new MarketingPlanError("invalid_primary_template");
    const title = cleanGeneratedPublicText(item.title, 200);
    const titleKey = normalizeEditorialSimilarityText(title);
    if (!titleKey) throw new MarketingPlanError("empty_editorial_content");
    if (seenVisualTitles.has(titleKey)) throw new MarketingPlanError("duplicate_editorial_title");
    seenVisualTitles.add(titleKey);

    const postBodies: string[] = [];
    const variants = channels.map((channel) => {
      const source = item.channel_variants!.filter((variant) => variant.channel === channel);
      if (source.length !== 1) throw new MarketingPlanError("invalid_channel_variants");
      const content = normalizeGeneratedEditorial(source[0].content, channel as MarketingChannel, template, audienceHint);
      const key = normalizeEditorialSimilarityText(content.body);
      const headlineKey = normalizeEditorialSimilarityText(content.headline);
      if (!key || !headlineKey) throw new MarketingPlanError("empty_editorial_content");

      const channelBodies = seenBodiesByChannel.get(channel) || [];
      if (postBodies.includes(key) || channelBodies.includes(key)) throw new MarketingPlanError("duplicate_editorial_copy");
      if (postBodies.some((body) => isNearDuplicateEditorialCopy(body, key)) || channelBodies.some((body) => isNearDuplicateEditorialCopy(body, key))) {
        throw new MarketingPlanError("near_duplicate_editorial_copy");
      }
      const channelHeadlines = seenHeadlinesByChannel.get(channel) || new Set<string>();
      if (channelHeadlines.has(headlineKey)) throw new MarketingPlanError("duplicate_editorial_headline");

      postBodies.push(key);
      channelBodies.push(key);
      channelHeadlines.add(headlineKey);
      seenBodiesByChannel.set(channel, channelBodies);
      seenHeadlinesByChannel.set(channel, channelHeadlines);
      return { channel: channel as MarketingChannel, content };
    });

    const scenePrompt = cleanGeneratedPublicText(item.visual_prompt!, 4000);
    if (!scenePrompt) throw new MarketingPlanError("missing_visual_prompt");
    const family = TOK_MARKETING_VISUAL_FAMILIES[postIndex % TOK_MARKETING_VISUAL_FAMILIES.length];
    const visualPrompt = [
      scenePrompt,
      `FAMILLE VISUELLE SERVEUR ${postIndex + 1} — ${family.id} : ${family.direction}`,
      family.requiresChef
        ? "Le chef TOK est obligatoire pour cette variation et doit rester strictement fidèle aux références maîtresses."
        : "Aucun chef ni mascotte dans cette variation, hors pictogramme intégré au logo TOK.",
      `Titre principal natif à intégrer exactement : ${JSON.stringify(title)}. Ne reprendre aucun autre headline de la campagne dans cette image.`,
      "Cette composition doit être visiblement différente des autres posts de la campagne : cadrage, masse couleur, sujet principal et rythme graphique propres à cette famille.",
    ].join("\n");
    return { ...item, title, visual_prompt: visualPrompt, channel_variants: variants,
      editorial: { version: SOCIAL_EDITORIAL_VERSION, primary_template_id: template, destination_url: SOCIAL_EDITORIAL_CATALOG[template].url,
        visual_family: family.id, variation_id: `guided:${postIndex + 1}:${template}:${family.id}` } };
  });
  return {
    campaign: { ...plan.campaign, channels: [...channels] as MarketingChannel[], starts_at: startsAt, ends_at: endsAt },
    items: slots.map((slot) => ({ ...posts[slot.postIndex], channel: slot.channel as MarketingChannel,
      scheduled_at: slot.scheduledAt, visual_format: slot.format, post_index: slot.postIndex,
      template_ids: [...options.templateIds], content: { ...(posts[slot.postIndex].channel_variants?.find((variant) => variant.channel === slot.channel)?.content || posts[slot.postIndex].content), subject: null },
    })),
  };
}
