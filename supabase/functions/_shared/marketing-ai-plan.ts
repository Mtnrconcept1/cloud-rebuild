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

/**
 * Audience selectors accepted by marketing_validate_audience_filter. The
 * validator rejects any other key and any non-string value, so this list is the
 * contract and not a suggestion.
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
  targeting: Record<string, string>;
  content: {
    subject: string | null;
    headline: string;
    body: string;
    call_to_action: string;
    hashtags: string[];
  };
  visual_prompt: string | null;
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
    audience_definition: Record<string, string>;
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

/** Postgres accepts only string values in an audience filter. */
export function stripEmptySelectors(filter: Record<string, unknown>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(filter || {})) {
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
): Record<string, unknown> {
  return {
    campaign: {
      name: plan.campaign.name.slice(0, 160),
      objective: plan.campaign.objective.slice(0, 2000),
      channels: plan.campaign.channels,
      starts_at: plan.campaign.starts_at,
      ends_at: plan.campaign.ends_at,
      audience_name: plan.campaign.audience_name.slice(0, 160),
      audience_definition: stripEmptySelectors(plan.campaign.audience_definition),
      timezone: "Europe/Zurich",
      content: { summary: plan.campaign.summary },
      metadata: { generated_by: "ai-marketing-agent" },
    },
    items: plan.items.map((item, index) => ({
      title: item.title.slice(0, 200),
      channel: item.channel,
      item_type: "broadcast",
      scheduled_at: item.scheduled_at,
      timezone: "Europe/Zurich",
      audience_name: item.audience_name.slice(0, 160),
      targeting: stripEmptySelectors(item.targeting),
      content: {
        subject: item.channel === "email" ? item.content.subject : null,
        headline: item.content.headline,
        body: item.content.body,
        call_to_action: item.content.call_to_action,
        hashtags: item.content.hashtags.slice(0, 12),
        visual_url: visuals.get(index) || null,
        generated_by: "ai-marketing-agent",
      },
    })),
  };
}
