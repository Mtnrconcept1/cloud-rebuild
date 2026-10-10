import { validateMarketingPlan, normalizeMarketingDestination, buildMarketingCallToAction, type MarketingPlanContext } from "./marketing-campaign-validation.ts";
export { MarketingPlanError } from "./marketing-campaign-validation.ts";

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

export type MarketingPlanItem = {
  stage?: "awareness" | "comparison" | "objection" | "conversion";
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

export type MarketingStrategy = {
  sequence: string;
  conversion_goal: string;
  measurement_plan: string;
  assumptions: string[];
};

export type MarketingPlan = {
  campaign: {
    name: string;
    objective: string;
    summary: string;
    strategy?: MarketingStrategy;
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
              required: ["sequence", "conversion_goal", "measurement_plan", "assumptions"],
              properties: {
                sequence: { type: "string", description: "Explain the progression, with distinct angles rather than repeated copy." },
                conversion_goal: { type: "string", description: "The action to measure on the approved landing page; never a guaranteed result." },
                measurement_plan: { type: "string", description: "KPIs and how to verify them; disclose missing tracking and do not invent estimates." },
                assumptions: { type: "array", items: { type: "string" }, description: "Unverified prices, audience reach, budget or distribution prerequisites needing human review." },
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
              "stage",
              "channel",
              "scheduled_at",
              "audience_name",
              "targeting",
              "content",
              "visual_prompt",
            ],
            properties: {
              title: { type: "string" },
              stage: { type: "string", enum: ["awareness", "comparison", "objection", "conversion"] },
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

/** Validate untrusted model output before it can become a draft. */
export function validatePlan(plan: MarketingPlan, allowedChannels: readonly string[], context?: MarketingPlanContext): MarketingPlan {
  return validateMarketingPlan(plan, allowedChannels, context);
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
  context?: Pick<MarketingPlanContext, "destinationUrl" | "purpose">,
): Record<string, unknown> {
  const destination = normalizeMarketingDestination(context?.destinationUrl);
  const warnings = marketingPlanWarnings(plan, visuals);
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
      content: { summary: plan.campaign.summary, ...(plan.campaign.strategy ? { strategy: plan.campaign.strategy } : {}) },
      metadata: {
        generated_by: "ai-marketing-agent", destination_url: destination,
        purpose: context?.purpose || "awareness", ad_budget_chf: null,
        audience_size_estimate: null, cost_scope: "text_only", review_warnings: warnings,
      },
    },
    items: plan.items.map((item, index) => ({
      title: item.title.slice(0, 200),
      channel: item.channel,
      item_type: ["facebook", "instagram"].includes(item.channel) ? "publication" : "broadcast",
      scheduled_at: item.scheduled_at,
      timezone: "Europe/Zurich",
      audience_name: item.audience_name.slice(0, 160),
      targeting: stripEmptySelectors(item.targeting),
      content: {
        subject: item.channel === "email" ? item.content.subject : null,
        headline: item.content.headline,
        body: item.content.body,
        // The destination is reviewed by the operator, never invented by the model.
        // Keep the complete link inside the existing email adapter's 200-char limit.
        call_to_action: buildMarketingCallToAction(item.content.call_to_action, destination),
        cta_url: destination,
        stage: item.stage || null,
        visual_prompt: item.visual_prompt || null,
        hashtags: item.content.hashtags.slice(0, 12),
        visual_url: visuals.get(index) || null,
        generated_by: "ai-marketing-agent",
      },
    })),
  };
}

/** Unknown reach/cost is not zero; public posting does not apply CRM targeting. */
export function marketingPlanWarnings(plan: MarketingPlan, visuals: Map<number, string>): string[] {
  const warnings = [
    "Le filtre décrit la cible souhaitée. Les décomptes de contacts éligibles sont affichés séparément ; ils ne mesurent pas la portée publique.",
    "Coût IA : texte uniquement ; images et diffusion non incluses. Budget publicitaire non défini.",
    "Comparaisons tarifaires : vérifier les sources et conditions, y compris les abonnements, avant diffusion.",
  ];
  if (plan.items.some((item) => ["facebook", "instagram"].includes(item.channel))) {
    warnings.push("Publication organique : le filtre Genève ne crée pas de ciblage publicitaire Meta. Aucune publicité payante n'est créée.");
  }
  if (plan.items.some((item) => ["in_app", "push"].includes(item.channel))) {
    warnings.push("Notifications internes : seuls les utilisateurs déjà joignables dans TOK peuvent être contactés, après contrôle d'éligibilité.");
  }
  plan.items.forEach((item, index) => {
    if (item.channel === "instagram" && !visuals.has(index)) warnings.push("Instagram : visuel manquant, à ajouter avant approbation (" + item.title.slice(0, 100) + ").");
    else if (item.visual_prompt && !visuals.has(index)) warnings.push("Visuel non généré : " + item.title.slice(0, 100) + ". Le brief visuel est conservé dans le brouillon.");
  });
  return warnings;
}

/** Recheck the Edge response with a fresh clock before the BFF persists anything. */
export function validateGeneratedCampaignBundle(value: unknown, allowedChannels: readonly string[], context: MarketingPlanContext & { mediaOrigin?: string }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid campaign bundle");
  const raw = value as Record<string, unknown>;
  const campaign = raw.campaign as MarketingPlan["campaign"] & { content?: { summary?: string; strategy?: MarketingStrategy } };
  if (!campaign || !Array.isArray(raw.items)) throw new Error("Invalid campaign bundle");
  const proposed = {
    campaign: { ...campaign, summary: campaign.content?.summary || campaign.summary, strategy: campaign.content?.strategy || campaign.strategy },
    items: raw.items.map((item) => ({ ...item, stage: item.content?.stage || item.stage, visual_prompt: item.content?.visual_prompt || null })),
  } as MarketingPlan;
  const plan = validatePlan(proposed, allowedChannels, context);
  const visuals = new Map<number, string>();
  raw.items.forEach((item, index) => {
    const visual = item.content?.visual_url;
    if (!visual) return;
    const url = new URL(visual);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || (context.mediaOrigin ? url.origin !== context.mediaOrigin : !url.hostname.endsWith(".supabase.co"))
      || !url.pathname.startsWith("/storage/v1/object/public/social-post-media/marketing-ai/")) throw new Error("Invalid campaign visual");
    visuals.set(index, url.toString());
  });
  return toBundlePayload(plan, visuals, context);
}
