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
export const MARKETING_PLAN_LEAD_MS = 10 * 60_000;
export const MARKETING_APPROVAL_LEAD_MS = 2 * 60_000;
export type MarketingPlanConstraints = {
  now: number; startsAt: string; endsAt: string; itemCount: number; requireConversion?: boolean;
};
export type MarketingCampaignStrategy = {
  conversion_goal: string; measurement_plan: string; comparison_basis: string;
};

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
    destination_url?: string;
    hashtags: string[];
  };
  visual_prompt: string | null;
};

export type MarketingPlan = {
  campaign: {
    name: string;
    objective: string;
    summary: string;
    strategy?: MarketingCampaignStrategy;
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
            "strategy",
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
            strategy: {
              type: "object", additionalProperties: false,
              required: ["conversion_goal", "measurement_plan", "comparison_basis"],
              properties: {
                conversion_goal: { type: "string" },
                measurement_plan: { type: "string" },
                comparison_basis: { type: "string" },
              },
            },
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
                required: ["subject", "headline", "body", "call_to_action", "destination_url", "hashtags"],
                properties: {
                  subject: {
                    type: ["string", "null"],
                    description: "Email subject line; null for channels without one.",
                  },
                  headline: { type: "string" },
                  body: { type: "string" },
                  call_to_action: { type: "string" },
                  destination_url: { type: "string", description: "Public HTTPS TOK conversion page, selected from the routes given in the brief." },
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
export function validatePlan(plan: MarketingPlan, allowedChannels: readonly string[], constraints?: MarketingPlanConstraints): MarketingPlan {
  const allowed = new Set(allowedChannels);
  if (!plan || typeof plan !== "object") {
    throw new MarketingPlanError("not_an_object");
  }
  if (constraints && plan.items?.length !== constraints.itemCount) throw new MarketingPlanError("item_count_mismatch");
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
  if (!isIsoTimestamp(campaign.starts_at) || !isIsoTimestamp(campaign.ends_at) || Date.parse(campaign.ends_at) <= Date.parse(campaign.starts_at)) {
    throw new MarketingPlanError("invalid_campaign_window");
  }
  if (Object.keys(stripEmptySelectors(campaign.audience_definition || {})).length === 0) {
    throw new MarketingPlanError("empty_campaign_audience");
  }

  if (constraints) {
    if (!Number.isFinite(constraints.now) || Date.parse(campaign.starts_at) < constraints.now + MARKETING_APPROVAL_LEAD_MS) throw new MarketingPlanError("schedule_in_past");
    if (Date.parse(campaign.starts_at) < Date.parse(constraints.startsAt) || Date.parse(campaign.ends_at) > Date.parse(constraints.endsAt)) throw new MarketingPlanError("campaign_outside_requested_window");
  }
  campaign.audience_definition = normalizedAudience(campaign.audience_definition, "empty_campaign_audience");
  if (constraints?.requireConversion && (!campaign.strategy || ["conversion_goal", "measurement_plan", "comparison_basis"].some((key) => {
    const value = campaign.strategy?.[key as keyof MarketingCampaignStrategy];
    return typeof value !== "string" || !value.trim() || value.length > 2000;
  }))) throw new MarketingPlanError("missing_campaign_strategy");
  const copies = new Set<string>();
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
    const scheduled = Date.parse(item.scheduled_at);
    if (scheduled < Date.parse(campaign.starts_at) || scheduled > Date.parse(campaign.ends_at)) throw new MarketingPlanError("item_outside_campaign_window", { index });
    if (constraints && scheduled < constraints.now + MARKETING_APPROVAL_LEAD_MS) throw new MarketingPlanError("schedule_in_past", { index });
    if (Object.keys(stripEmptySelectors(item.targeting || {})).length === 0) {
      throw new MarketingPlanError("empty_item_targeting", { index });
    }
    item.targeting = normalizedAudience(item.targeting, "empty_item_targeting");
    if (JSON.stringify(item.targeting) !== JSON.stringify(campaign.audience_definition)) {
      throw new MarketingPlanError("audience_mismatch", { index });
    }
    if (constraints?.requireConversion || item.content?.destination_url) normalizeMarketingDestination(item.content?.destination_url);
    if (constraints && typeof item.content?.body === "string") {
      const key = item.channel + ":" + item.content.body.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      if (copies.has(key)) throw new MarketingPlanError("duplicate_channel_content", { index });
      copies.add(key);
    }
    if (constraints && (item.channel === "in_app" || item.channel === "push")) {
      const kind = item.targeting.contact_type;
      if (kind === "restaurant_prospect" || kind === "restaurant_lead") throw new MarketingPlanError("unreachable_internal_audience", { index });
    }
    if (typeof item.content?.body !== "string" || typeof item.content.headline !== "string"
      || typeof item.content.call_to_action !== "string" || !Array.isArray(item.content.hashtags)
      || item.content.hashtags.some((tag) => typeof tag !== "string")) throw new MarketingPlanError("invalid_item_content", { index });
    const caption = [item.content.headline, item.content.body, item.content.call_to_action,
      destinationForItem(plan, item, index), item.content.hashtags.join(" ")].filter(Boolean).join("\n\n");
    if (caption.length > (item.channel === "instagram" ? 2200 : 50000)) throw new MarketingPlanError("content_too_long", { index });
    if (!item.content?.body?.trim()) {
      throw new MarketingPlanError("empty_item_body", { index });
    }
  });

  if ((campaign.channels || []).some((channel) => !allowed.has(channel))) throw new MarketingPlanError("channel_not_allowed");
  if (constraints && allowedChannels.some((channel) => !plan.items.some((item) => item.channel === channel))) throw new MarketingPlanError("requested_channel_missing");
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
      content: { summary: plan.campaign.summary, strategy: plan.campaign.strategy || null },
      metadata: { generated_by: "ai-marketing-agent", audience_estimated: false, ad_budget_status: "not_configured" },
    },
    items: plan.items.map((item, index) => ({
      title: item.title.slice(0, 200),
      channel: item.channel,
      item_type: ["facebook", "instagram", "linkedin", "tok_news", "website"].includes(item.channel) ? "publication" : "broadcast",
      scheduled_at: item.scheduled_at,
      timezone: "Europe/Zurich",
      audience_name: item.audience_name.slice(0, 160),
      targeting: stripEmptySelectors(item.targeting),
      content: {
        subject: item.channel === "email" ? item.content.subject : null,
        headline: item.content.headline,
        body: item.content.body,
        call_to_action: [item.content.call_to_action, destinationForItem(plan, item, index)].filter(Boolean).join("\n"),
        url: destinationForItem(plan, item, index) || null,
        hashtags: item.content.hashtags.slice(0, 12),
        visual_url: visuals.get(index) || null,
        media_status: visuals.has(index) ? "generated" : item.channel === "instagram" ? "missing_required" : "not_generated",
        generated_by: "ai-marketing-agent",
      },
    })),
  };
}

function normalizedAudience(raw: Record<string, unknown>, emptyReason: string) {
  const keys = new Set(["audience_kind", "canton", "city", "category", "contact_type"]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new MarketingPlanError(emptyReason);
  for (const [key, value] of Object.entries(raw)) {
    if (!keys.has(key) || (value !== null && typeof value !== "string")) {
      throw new MarketingPlanError("invalid_audience_selector", { key });
    }
  }
  const audience = stripEmptySelectors(raw);
  if (!Object.keys(audience).length) throw new MarketingPlanError(emptyReason);
  if ((audience.audience_kind && !(AUDIENCE_KINDS as readonly string[]).includes(audience.audience_kind))
    || (audience.contact_type && !(CONTACT_TYPES as readonly string[]).includes(audience.contact_type))
    || (audience.canton && !/^[A-Z]{2}$/.test(audience.canton))) {
    throw new MarketingPlanError("invalid_audience_selector");
  }
  return Object.fromEntries(Object.entries(audience).sort(([a], [b]) => a.localeCompare(b)));
}

/** Existing public routes only; never invent a conversion endpoint. */
export const MARKETING_DESTINATION_PATHS = [
  "/contact", "/recherche", "/restaurateurs/geneve", "/restaurateurs/alternative-commission-couvert",
] as const;

export function normalizeMarketingDestination(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new MarketingPlanError("missing_destination_url");
  let url: URL;
  try { url = new URL(value); } catch { throw new MarketingPlanError("invalid_destination_url"); }
  if (!["https://thetok.ch", "https://www.thetok.ch"].includes(url.origin)
    || !url.href.startsWith(url.origin + "/")
    || !(MARKETING_DESTINATION_PATHS as readonly string[]).includes(url.pathname.replace(/\/$/, ""))) {
    throw new MarketingPlanError("invalid_destination_url");
  }
  url.search = "";
  url.hash = "";
  url.hostname = "www.thetok.ch";
  return url.toString();
}

function destinationForItem(plan: MarketingPlan, item: MarketingPlanItem, index: number) {
  if (!item.content.destination_url) return "";
  const url = new URL(normalizeMarketingDestination(item.content.destination_url));
  url.searchParams.set("utm_source", item.channel);
  url.searchParams.set("utm_medium", ["facebook", "instagram", "linkedin"].includes(item.channel) ? "organic_social" : item.channel);
  url.searchParams.set("utm_campaign", slugifyCampaignName(plan.campaign.name));
  url.searchParams.set("utm_content", String(index + 1));
  return url.toString();
}

/** Stale dates must be rejected before requesting a paid generation. */
export function validateGenerationWindow(startsAt: string, endsAt: string, now = Date.now()) {
  if (!isIsoTimestamp(startsAt) || !isIsoTimestamp(endsAt) || Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new MarketingPlanError("invalid_campaign_window");
  }
  if (!Number.isFinite(now) || Date.parse(startsAt) < now + MARKETING_PLAN_LEAD_MS) {
    throw new MarketingPlanError("schedule_in_past");
  }
}
