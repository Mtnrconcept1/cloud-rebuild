import { TOK_MARKETING_BRAND_VERSION, TOK_MARKETING_REFERENCES } from "./marketing-brand.ts";
import { parseMailingRecipientEmails, parseMailingSelections, type MailingImageMode } from "./marketing-mailing.ts";
import type { CampaignFormat, CampaignTemplateId } from "./marketing-campaign-options.ts";

/**
 * Plan contract for the marketing AI agent.
 *
 * Deliberately free of any Deno or provider dependency: this is the layer that
 * decides whether a generated plan is safe to persist, so it must be directly
 * exercisable by the test suite rather than only reachable through an Edge
 * function.
 */

/** Channels the marketing schema accepts, mirrored from the CHECK constraint. */
export const MARKETING_CHANNELS = [
  "tok_news",
  "in_app",
  "email",
  "push",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "telegram",
  "google_business",
  "website",
  "manual_call",
  "manual_email",
  "manual_visit",
] as const;

export type MarketingChannel = typeof MARKETING_CHANNELS[number];
export type MarketingPostFormat = "1:1" | "9:16" | "16:9";

/**
 * Legacy scalar selectors accepted by marketing_validate_audience_filter.
 * Mailing selections use the separately validated, allowlisted array contract.
 */
const AUDIENCE_KINDS = ["restaurant", "client", "mixed"] as const;
const CONTACT_TYPES = [
  "registered_user",
  "restaurant_prospect",
  "restaurant_lead",
  "manual",
] as const;

export const MAX_PLAN_ITEMS = 32;

export class MarketingPlanError extends Error {
  readonly reason: string;
  readonly details: Record<string, unknown>;

  constructor(reason: string, details: Record<string, unknown> = {}) {
    super(`Marketing plan rejected: ${reason}`);
    this.name = "MarketingPlanError";
    this.reason = reason;
    this.details = details;
  }
}

export type MarketingPlanItem = {
  title: string;
  channel: MarketingChannel;
  scheduled_at: string;
  audience_name: string;
  targeting: Record<string, unknown>;
  mailing_version?: "tok-mailing-v1";
  mailing_image_mode?: MailingImageMode;
  content: {
    subject: string | null;
    headline: string;
    body: string;
    call_to_action: string;
    hashtags: string[];
  };
  visual_prompt: string | null;
  visual_format?: CampaignFormat;
  post_index?: number;
  template_ids?: CampaignTemplateId[];
  primary_template_id?: CampaignTemplateId;
  channel_variants?: Array<{ channel: MarketingChannel; content: MarketingPlanItem["content"] }>;
  editorial?: { version: string; primary_template_id: CampaignTemplateId; destination_url: string; visual_family?: string; variation_id?: string };
};

export type MarketingPlan = {
  campaign: {
    name: string;
    objective: string;
    summary: string;
    channels: MarketingChannel[];
    starts_at: string;
    ends_at: string;
    audience_name: string;
    audience_definition: Record<string, unknown>;
  };
  items: MarketingPlanItem[];
};

function targetingSchema() {
  // Strict structured output requires every property to be listed as required,
  // so absent selectors are expressed as null and stripped before the payload
  // reaches Postgres, where only strings are accepted.
  return {
    type: "object",
    additionalProperties: false,
    required: ["audience_kind", "canton", "city", "category", "contact_type"],
    properties: {
      audience_kind: { type: "string", enum: [...AUDIENCE_KINDS] },
      canton: {
        type: ["string", "null"],
        description: "Two-letter Swiss canton code, or null for nationwide.",
      },
      city: { type: ["string", "null"] },
      category: { type: ["string", "null"] },
      contact_type: { type: ["string", "null"], enum: [...CONTACT_TYPES, null] },
    },
  };
}

export function buildPlanSchema(allowedChannels: readonly string[]) {
  const channelEnum = allowedChannels.length > 0 ? [...allowedChannels] : [...MARKETING_CHANNELS];

  return {
    name: "tok_marketing_agent_plan",
    strict: true,
    description: "A marketing campaign with its calendar items, ready for human approval.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["campaign", "items"],
      properties: {
        campaign: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "objective",
            "summary",
            "channels",
            "starts_at",
            "ends_at",
            "audience_name",
            "audience_definition",
          ],
          properties: {
            name: { type: "string", description: "Short campaign name, max 160 characters." },
            objective: { type: "string" },
            summary: { type: "string", description: "Two or three sentences explaining the plan." },
            channels: {
              type: "array",
              items: { type: "string", enum: channelEnum },
              description: "Channels actually used by the items below.",
            },
            starts_at: { type: "string", description: "ISO 8601 timestamp." },
            ends_at: { type: "string", description: "ISO 8601 timestamp after starts_at." },
            audience_name: { type: "string" },
            audience_definition: targetingSchema(),
          },
        },
        items: {
          type: "array",
          description: `Between 1 and ${MAX_PLAN_ITEMS} calendar items.`,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "channel",
              "scheduled_at",
              "audience_name",
              "targeting",
              "content",
              "visual_prompt",
            ],
            properties: {
              title: { type: "string" },
              channel: { type: "string", enum: channelEnum },
              scheduled_at: { type: "string", description: "ISO 8601 timestamp." },
              audience_name: { type: "string" },
              targeting: targetingSchema(),
              content: {
                type: "object",
                additionalProperties: false,
                required: ["subject", "headline", "body", "call_to_action", "hashtags"],
                properties: {
                  subject: {
                    type: ["string", "null"],
                    description: "Email subject line; null for channels without one.",
                  },
                  headline: { type: "string" },
                  body: { type: "string" },
                  call_to_action: { type: "string" },
                  hashtags: { type: "array", items: { type: "string" } },
                },
              },
              visual_prompt: {
                type: ["string", "null"],
                description: "Image prompt when the channel benefits from a visual, otherwise null.",
              },
            },
          },
        },
      },
    },
  };
}

/** Guided posts have one editorial variant per network; image formats are expanded later. */
export function buildGuidedPlanSchema(allowedChannels: readonly string[], templateIds: readonly CampaignTemplateId[]) {
  const base = buildPlanSchema(allowedChannels);
  const item = base.schema.properties.items.items.properties;
  return { ...base, schema: { ...base.schema, properties: { ...base.schema.properties, items: {
    type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["title", "scheduled_at", "audience_name", "targeting", "visual_prompt", "primary_template_id", "channel_variants"],
      properties: {
        title: item.title, scheduled_at: item.scheduled_at, audience_name: item.audience_name,
        targeting: item.targeting, visual_prompt: { type: "string" },
        primary_template_id: { type: "string", enum: [...templateIds] },
        channel_variants: { type: "array", minItems: allowedChannels.length, maxItems: allowedChannels.length,
          items: { type: "object", additionalProperties: false, required: ["channel", "content"],
            properties: { channel: item.channel, content: item.content } } },
      },
    },
  } } } };
}

function isPlanRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reject missing/duplicate networks and unselected topics before generating paid assets. */
export function validateGuidedPlan(raw: unknown, channels: readonly string[], templateIds: readonly CampaignTemplateId[], postCount: number): MarketingPlan {
  if (!isPlanRecord(raw) || !isPlanRecord(raw.campaign) || !Array.isArray(raw.items)) throw new MarketingPlanError("not_an_object");
  if (raw.items.length !== postCount) throw new MarketingPlanError("item_count_mismatch");
  for (const field of ["name", "objective", "summary", "audience_name"]) {
    if (typeof raw.campaign[field] !== "string" || !(raw.campaign[field] as string).trim()) throw new MarketingPlanError("invalid_campaign_content");
  }
  const items = raw.items.map((item, index) => {
    if (!isPlanRecord(item) || typeof item.title !== "string" || typeof item.audience_name !== "string" ||
      typeof item.primary_template_id !== "string" || !templateIds.includes(item.primary_template_id as CampaignTemplateId)) throw new MarketingPlanError("invalid_primary_template", { index });
    if (typeof item.visual_prompt !== "string" || !item.visual_prompt.trim()) throw new MarketingPlanError("missing_visual_prompt", { index });
    if (!Array.isArray(item.channel_variants) || item.channel_variants.length !== channels.length) throw new MarketingPlanError("missing_channel_variants", { index });
    const seen = new Set<string>();
    const variants = item.channel_variants.map((variant) => {
      if (!isPlanRecord(variant) || typeof variant.channel !== "string" || !channels.includes(variant.channel) || seen.has(variant.channel)) throw new MarketingPlanError("invalid_channel_variants", { index });
      seen.add(variant.channel);
      const content = variant.content;
      if (!isPlanRecord(content) || ["headline", "body", "call_to_action"].some((key) => typeof content[key] !== "string" || (content[key] as string).length > 5000) ||
        !Array.isArray(content.hashtags) || content.hashtags.length > 20 || content.hashtags.some((tag) => typeof tag !== "string") ||
        !(content.subject === null || typeof content.subject === "string")) throw new MarketingPlanError("invalid_variant_content", { index });
      if (!(content.body as string).trim()) throw new MarketingPlanError("empty_item_body", { index });
      return { channel: variant.channel as MarketingChannel, content: content as MarketingPlanItem["content"] };
    });
    return { ...item, channel: variants[0].channel, content: variants[0].content, channel_variants: variants } as MarketingPlanItem;
  });
  if (postCount >= templateIds.length && templateIds.some((id) => !items.some((item) => item.primary_template_id === id))) {
    throw new MarketingPlanError("missing_selected_template");
  }
  return validatePlan({ campaign: { ...raw.campaign, channels: [...channels] } as MarketingPlan["campaign"], items }, channels);
}

/** Preserve scalar selectors and explicitly validated mailing arrays. */
export function stripEmptySelectors(filter: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === "selections") { cleaned.selections = parseMailingSelections(value); continue; }
    if (key === "recipient_emails") { cleaned.recipient_emails = parseMailingRecipientEmails(value); continue; }
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    cleaned[key] = trimmed;
  }
  return cleaned;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}

/**
 * A model answer that satisfies the JSON schema can still be unusable: an empty
 * item list, a channel the caller never allowed, an audience filter with no
 * effective selector. Rejecting it here keeps the failure legible instead of
 * surfacing as a Postgres exception several layers down, and stops a plan that
 * would target a wider audience than the operator asked for.
 */
export function validatePlan(plan: MarketingPlan, allowedChannels: readonly string[]): MarketingPlan {
  const allowed = new Set(allowedChannels);
  if (!plan || typeof plan !== "object") {
    throw new MarketingPlanError("not_an_object");
  }
  const campaign = plan.campaign;
  if (!campaign || !campaign.name?.trim()) {
    throw new MarketingPlanError("missing_campaign_name");
  }
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    throw new MarketingPlanError("no_items");
  }
  if (plan.items.length > MAX_PLAN_ITEMS) {
    throw new MarketingPlanError("too_many_items", { count: plan.items.length });
  }
  if (!isIsoTimestamp(campaign.starts_at) || !isIsoTimestamp(campaign.ends_at)) {
    throw new MarketingPlanError("invalid_campaign_window");
  }
  if (Object.keys(stripEmptySelectors(campaign.audience_definition || {})).length === 0) {
    throw new MarketingPlanError("empty_campaign_audience");
  }

  plan.items.forEach((item, index) => {
    if (!item?.title?.trim()) {
      throw new MarketingPlanError("missing_item_title", { index });
    }
    if (!allowed.has(item.channel)) {
      throw new MarketingPlanError("channel_not_allowed", { index, channel: item.channel });
    }
    if (!isIsoTimestamp(item.scheduled_at)) {
      throw new MarketingPlanError("invalid_item_schedule", { index });
    }
    if (Object.keys(stripEmptySelectors(item.targeting || {})).length === 0) {
      throw new MarketingPlanError("empty_item_targeting", { index });
    }
    if (!item.content?.body?.trim()) {
      throw new MarketingPlanError("empty_item_body", { index });
    }
  });

  const declared = new Set(campaign.channels || []);
  for (const item of plan.items) declared.add(item.channel);
  campaign.channels = [...declared] as MarketingChannel[];

  return plan;
}

export function slugifyCampaignName(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "campagne"
  );
}

/**
 * Convert a validated plan into the exact payload
 * admin_create_marketing_campaign_bundle expects. Nothing here sets a status:
 * the database forces every new calendar item to draft, which is what keeps an
 * automated plan from reaching a real contact unreviewed.
 */
export function toBundlePayload(
  plan: MarketingPlan,
  visuals: Map<number, string>,
  formats: Partial<Record<MarketingChannel, MarketingPostFormat>> = {},
): Record<string, unknown> {
  const campaignAudience = stripEmptySelectors(plan.campaign.audience_definition);
  return {
    campaign: {
      name: plan.campaign.name.slice(0, 160),
      objective: plan.campaign.objective.slice(0, 2000),
      channels: plan.campaign.channels,
      starts_at: plan.campaign.starts_at,
      ends_at: plan.campaign.ends_at,
      audience_name: plan.campaign.audience_name.slice(0, 160),
      audience_definition: campaignAudience,
      timezone: "Europe/Zurich",
      content: { summary: plan.campaign.summary, message: plan.campaign.summary },
      metadata: { generated_by: "ai-marketing-agent" },
    },
    items: plan.items.map((item, index) => ({
      title: item.title.slice(0, 200),
      channel: item.channel,
      item_type: "broadcast",
      scheduled_at: item.scheduled_at,
      timezone: "Europe/Zurich",
      audience_name: item.audience_name.slice(0, 160),
      // Meta posts are public broadcasts. Their editorial audience remains in
      // audience_name, while approval must use the campaign's exact selectors.
      // Keep recipient targeting unchanged for every other channel.
      targeting: item.channel === "instagram" || item.channel === "facebook"
        ? { ...campaignAudience }
        : stripEmptySelectors(item.targeting),
      content: {
        ...(item.mailing_version ? { mailing_version: item.mailing_version } : {}),
        ...(item.mailing_image_mode ? { image_mode: item.mailing_image_mode,
          visual_source: item.mailing_image_mode === "manual" ? "upload" : "generated" } : {}),
        subject: item.channel === "email" ? item.content.subject : null,
        headline: item.content.headline,
        body: item.content.body,
        call_to_action: item.content.call_to_action,
        hashtags: item.content.hashtags.slice(0, 12),
        visual_url: item.mailing_image_mode === "manual" ? null : visuals.get(index) || null,
        format: item.mailing_image_mode === "manual" ? null : item.visual_format || formats[item.channel] || null,
        visual_format: item.mailing_image_mode === "manual" ? null : item.visual_format || formats[item.channel] || null,
        visual_prompt: item.mailing_image_mode === "manual" ? null : item.visual_prompt,
        ...(item.visual_format ? { post_index: item.post_index, template_ids: item.template_ids } : {}),
        ...(item.editorial ? { editorial: item.editorial } : {}),
        visual_required: item.mailing_version === "tok-mailing-v1" || item.channel === "facebook" || item.channel === "instagram" || Boolean(item.visual_prompt),
        visual_status: item.mailing_image_mode === "manual" ? "pending_upload" : visuals.get(index) ? "ready"
          : item.channel === "facebook" || item.channel === "instagram" || item.visual_prompt
            ? "pending_generation" : "not_requested",
        ...(item.mailing_image_mode !== "manual" && visuals.has(index) ? {
          visual_brand_profile: TOK_MARKETING_BRAND_VERSION,
          visual_reference_ids: TOK_MARKETING_REFERENCES.map((reference) => reference.id),
        } : {}),
        generated_by: "ai-marketing-agent",
      },
    })),
  };
}
