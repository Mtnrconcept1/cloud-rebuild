import { describe, expect, it } from "vitest";
import {
  buildPlanSchema,
  toBundlePayload,
  validatePlan,
  type MarketingPlan,
} from "../../supabase/functions/_shared/marketing-ai-plan";

const NOW = Date.parse("2026-10-10T17:32:18Z");
const START = "2026-10-11T09:00:00.000Z";
const END = "2026-10-25T17:00:00.000Z";
const URL = "https://www.thetok.ch/restaurateurs/alternative-commission-couvert";
const constraints = { now: NOW, startsAt: START, endsAt: END, itemCount: 4, requireConversion: true };

function sample(): MarketingPlan {
  const audience = { audience_kind: "restaurant", canton: "GE", contact_type: "restaurant_prospect" };
  return {
    campaign: {
      name: "Restaurateurs Genève — 5 CHF par table",
      objective: "Recruter des restaurateurs genevois",
      summary: "Comparer les modèles de commission, puis demander une présentation.",
      channels: ["facebook", "instagram"], starts_at: START, ends_at: END,
      audience_name: "Restaurateurs genevois", audience_definition: audience,
      strategy: {
        conversion_goal: "Demande de présentation via la page restaurateurs",
        measurement_plan: "Mesurer les visites UTM et les demandes réellement reçues, sans résultat garanti.",
        comparison_basis: "Comparer 5 CHF par table au tarif réel par couvert du contrat du restaurateur ; aucun tarif concurrent inventé.",
      },
    },
    items: ["Découverte", "Comparaison", "Objection", "Conversion"].map((stage, i) => ({
      title: stage, channel: i % 2 ? "instagram" : "facebook",
      scheduled_at: new Date(Date.parse(START) + i * 86400000).toISOString(),
      audience_name: "Restaurateurs genevois", targeting: { ...audience },
      content: {
        subject: null, headline: stage, body: `${stage} : 5 CHF par table ; comparer selon votre contrat.`,
        call_to_action: "Découvrir les conditions", destination_url: URL, hashtags: ["#RestaurantGeneve"],
      },
      visual_prompt: "Visuel TOK de comparaison par table, sans tarif concurrent inventé.",
    })),
  };
}

const check = (plan = sample(), channels = ["facebook", "instagram"]) => validatePlan(plan, channels, constraints);

describe("observed Geneva campaign regressions", () => {
  it("accepts a coherent four-item Facebook/Instagram campaign", () => {
    expect(check().items).toHaveLength(4);
  });
  it("rejects an inverted campaign window", () => {
    const plan = sample(); plan.campaign.ends_at = "2026-10-09T09:00:00Z";
    expect(() => check(plan)).toThrow(/invalid_campaign_window/);
  });
  it("rejects a schedule outside its campaign", () => {
    const plan = sample(); plan.items[0].scheduled_at = "2026-10-26T09:00:00Z";
    expect(() => check(plan)).toThrow(/item_outside_campaign_window/);
  });
  it("rejects the real regression: a morning post generated that evening", () => {
    const plan = sample(); plan.campaign.starts_at = "2026-10-10T07:00:00Z";
    plan.items[0].scheduled_at = "2026-10-10T09:00:00Z";
    expect(() => validatePlan(plan, ["facebook", "instagram"], { ...constraints, startsAt: plan.campaign.starts_at }))
      .toThrow(/schedule_in_past/);
  });
  it("rejects a model that moves the requested window", () => {
    const plan = sample(); plan.campaign.ends_at = "2026-10-26T17:00:00Z";
    expect(() => check(plan)).toThrow(/campaign_outside_requested_window/);
  });
  it("rejects a model that omits a requested item", () => {
    const plan = sample(); plan.items.pop();
    expect(() => check(plan)).toThrow(/item_count_mismatch/);
  });
  it("does not retain a disallowed declared channel", () => {
    const plan = sample(); plan.campaign.channels.push("email");
    expect(() => check(plan)).toThrow(/channel_not_allowed/);
  });
  it("requires every explicitly selected channel in the new plan", () => {
    expect(() => check(sample(), ["facebook", "instagram", "linkedin"])).toThrow(/requested_channel_missing/);
  });
  it("rejects restaurant_lead under a restaurant_prospect campaign", () => {
    const plan = sample(); plan.items[1].targeting.contact_type = "restaurant_lead";
    expect(() => check(plan)).toThrow(/audience_mismatch/);
  });
  it("compares normalized selector values rather than property order", () => {
    const plan = sample(); plan.items[0].targeting = {
      contact_type: "restaurant_prospect", canton: "GE", audience_kind: " restaurant ",
    };
    expect(check(plan).items[0].targeting).toEqual(plan.campaign.audience_definition);
  });
  it("rejects unknown audience keys rather than letting SQL fail later", () => {
    const plan = sample(); plan.campaign.audience_definition.radius = "50";
    expect(() => check(plan)).toThrow(/invalid_audience_selector/);
  });
  it("rejects malformed selectors instead of silently broadening the audience", () => {
    const plan = sample(); plan.items[0].targeting.canton = 42 as unknown as string;
    expect(() => check(plan)).toThrow(/invalid_audience_selector/);
  });
  it("rejects an explicit prospect audience for an internal notification", () => {
    const plan = sample(); plan.items[0].channel = "in_app";
    plan.campaign.channels.push("in_app");
    expect(() => check(plan, ["facebook", "instagram", "in_app"])).toThrow(/unreachable_internal_audience/);
  });
  it("rejects repeated copy on the same channel", () => {
    const plan = sample(); plan.items[2].content.body = plan.items[0].content.body;
    expect(() => check(plan)).toThrow(/duplicate_channel_content/);
  });
  it("keeps identical copy valid across different social channels", () => {
    const plan = sample(); plan.items[1].content.body = plan.items[0].content.body;
    expect(check(plan).items).toHaveLength(4);
  });
  it.each(["javascript:alert(1)", "https://127.0.0.1/admin", "https://www.thetok.ch.evil.test/", "https://admin.thetok.ch/", "https://www.thetok.ch/not-a-real-landing"])("rejects an unsafe or invented destination: %s", (url) => {
    const plan = sample(); plan.items[0].content.destination_url = url;
    expect(() => check(plan)).toThrow(/invalid_destination_url/);
  });
  it("requires an actionable destination in newly generated content", () => {
    const plan = sample(); delete plan.items[0].content.destination_url;
    expect(() => check(plan)).toThrow(/missing_destination_url/);
  });
  it("requires a real conversion and measurement plan", () => {
    const plan = sample(); delete plan.campaign.strategy;
    expect(() => check(plan)).toThrow(/missing_campaign_strategy/);
  });
  it("does not impose a current-time rule when reading historical plans", () => {
    const plan = sample();
    expect(validatePlan(plan, ["facebook", "instagram"]).campaign.name).toBe(plan.campaign.name);
  });
});

describe("conversion and truthful readiness in persisted drafts", () => {
  it("requires strategy and destination in structured model output", () => {
    const schema = JSON.stringify(buildPlanSchema(["facebook", "instagram"]));
    expect(schema).toContain('"destination_url"');
    expect(schema).toContain('"measurement_plan"');
  });
  it("keeps the real destination usable for social captions and internal links", () => {
    const bundle = toBundlePayload(check(), new Map()) as {
      campaign: { content: { strategy: unknown }; metadata: { audience_estimated: boolean } };
      items: Array<{ item_type: string; status?: string; content: { url: string; call_to_action: string; media_status: string } }>;
    };
    const target = new globalThis.URL(bundle.items[0].content.url);
    expect(target.pathname).toBe("/restaurateurs/alternative-commission-couvert");
    expect(target.searchParams.get("utm_source")).toBe("facebook");
    expect(target.searchParams.get("utm_campaign")).toContain("restaurateurs-geneve");
    expect(bundle.items[0].content.call_to_action).toContain(bundle.items[0].content.url);
    expect(bundle.items[0].item_type).toBe("publication");
    expect(bundle.items[0].status).toBeUndefined();
    expect(bundle.items[1].content.media_status).toBe("missing_required");
    expect(bundle.campaign.metadata.audience_estimated).toBe(false);
    expect(bundle.campaign.content.strategy).toBeDefined();
  });
});

it("validates the final Instagram caption including the generated destination", () => {
  const plan = sample();
  plan.items[1].content.body = "x".repeat(2180);
  expect(() => check(plan)).toThrow(/content_too_long/);
});
