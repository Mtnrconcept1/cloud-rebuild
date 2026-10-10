import { describe, expect, it } from "vitest";
import {
  MarketingPlanError, validatePlan, toBundlePayload, type MarketingPlan,
} from "../../supabase/functions/_shared/marketing-ai-plan";

const NOW = Date.parse("2026-10-10T16:51:28Z");
const context = {
  now: NOW, startsAt: "2026-10-11T07:00:00Z", endsAt: "2026-10-25T17:00:00Z",
  itemCount: 1, destinationUrl: "https://www.thetok.ch/contact", purpose: "awareness" as const,
};
function plan(): MarketingPlan {
  return {
    campaign: {
      name: "Restaurants Genève", objective: "Présenter TOK", summary: "Comparer les modèles de commission.",
      channels: ["facebook"], starts_at: context.startsAt, ends_at: context.endsAt,
      audience_name: "Restaurateurs GE",
      audience_definition: { audience_kind: "restaurant", canton: "GE", contact_type: "restaurant_prospect" },
    },
    items: [{
      title: "Un prix par table", channel: "facebook", scheduled_at: "2026-10-11T09:00:00Z",
      audience_name: "Restaurateurs GE",
      targeting: { audience_kind: "restaurant", canton: "GE", contact_type: "restaurant_prospect" },
      content: { subject: null, headline: "Comparez vos commissions", body: "Le tarif est par table, pas par convive.", call_to_action: "Demander une comparaison", hashtags: ["TOK"] },
      visual_prompt: null,
    }],
  };
}

describe("campaign consistency regression: real 10 October audit", () => {
  it("rejects a campaign ending before it starts", () => {
    const value = plan(); value.campaign.ends_at = "2026-10-09T17:00:00Z";
    expect(() => validatePlan(value, ["facebook"])).toThrow(MarketingPlanError);
  });
  it.each(["2026-10-10T09:00:00Z", "2026-10-26T09:00:00Z"])("rejects an item outside its campaign: %s", (date) => {
    const value = plan(); value.items[0].scheduled_at = date;
    expect(() => validatePlan(value, ["facebook"])).toThrow(/item_outside_campaign/);
  });
  it.each(["2026-10-11", "2026-10-11T09:00:00", "2026-02-30T09:00:00Z"])("rejects non-explicit or impossible dates: %s", (date) => {
    const value = plan(); value.items[0].scheduled_at = date;
    expect(() => validatePlan(value, ["facebook"])).toThrow(/invalid_item_schedule/);
  });
  it("rejects a prospect-to-lead audience change before SQL approval", () => {
    const value = plan(); value.items[0].targeting.contact_type = "restaurant_lead";
    expect(() => validatePlan(value, ["facebook"])).toThrow(/audience_mismatch/);
  });
  it("does not silently broaden an item from GE to the entire country", () => {
    const value = plan(); delete value.items[0].targeting.canton;
    expect(() => validatePlan(value, ["facebook"])).toThrow(/audience_mismatch/);
  });
  it.each([
    { audience_kind: "unknown" }, { audience_kind: "restaurant", canton: "Geneve" },
    { audience_kind: "restaurant", contact_type: "invented" }, { unsupported: "GE" },
  ])("rejects invalid selectors before persistence: %o", (filter) => {
    const value = plan(); value.campaign.audience_definition = filter as Record<string, string>;
    value.items[0].targeting = filter as Record<string, string>;
    expect(() => validatePlan(value, ["facebook"])).toThrow(MarketingPlanError);
  });
  it("compares normalized selectors without depending on property order", () => {
    const value = plan(); value.items[0].targeting = { contact_type: "restaurant_prospect", canton: " GE ", audience_kind: "restaurant" };
    expect(validatePlan(value, ["facebook"]).items[0].targeting).toEqual(value.campaign.audience_definition);
  });
  it("rejects undeclared permission to use another channel in campaign metadata", () => {
    const value = plan(); value.campaign.channels.push("email");
    expect(() => validatePlan(value, ["facebook"])).toThrow(/channel_not_allowed/);
  });
  it("checks the requested item count instead of trusting the model", () => {
    expect(() => validatePlan(plan(), ["facebook"], { ...context, itemCount: 4 })).toThrow(/item_count_mismatch/);
  });
  it("checks the actual clock again after a slow generation", () => {
    expect(() => validatePlan(plan(), ["facebook"], { ...context, now: Date.parse("2026-10-11T09:01:00Z") })).toThrow(/schedule_in_past/);
  });
  it("does not let the model change the requested campaign window", () => {
    const value = plan(); value.campaign.ends_at = "2026-10-26T17:00:00Z";
    expect(() => validatePlan(value, ["facebook"], context)).toThrow(/campaign_window_mismatch/);
  });
  it("requires a real CTA rather than persisting an empty invitation", () => {
    const value = plan(); value.items[0].content.call_to_action = "";
    expect(() => validatePlan(value, ["facebook"])).toThrow(/missing_call_to_action/);
  });
  it("rejects duplicate content on the same channel", () => {
    const value = plan(); value.items.push({ ...value.items[0], title: "Rappel", scheduled_at: "2026-10-15T09:00:00Z" });
    expect(() => validatePlan(value, ["facebook"])).toThrow(/duplicate_item_content/);
  });
  it("rejects internal notifications for a new-restaurateur acquisition brief", () => {
    const value = plan(); value.campaign.channels = ["in_app"]; value.items[0].channel = "in_app";
    expect(() => validatePlan(value, ["in_app"], { ...context, purpose: "acquisition" })).toThrow(/acquisition_channel_invalid/);
  });
  it("keeps consent-bearing individual messages inside Zurich contact hours", () => {
    const value = plan(); value.items[0].channel = "email"; value.campaign.channels = ["email"];
    value.items[0].content.subject = "TOK"; value.items[0].scheduled_at = "2026-10-11T22:00:00Z";
    expect(() => validatePlan(value, ["email"])).toThrow(/outside_contact_hours/);
  });
  it("attaches the approved destination to both metadata and the actual published CTA", () => {
    const value = plan();
    const bundle = toBundlePayload(value, new Map(), context) as { items: Array<{ content: { call_to_action: string; cta_url: string } }>; campaign: { metadata: Record<string, unknown> } };
    expect(bundle.items[0].content.cta_url).toBe(context.destinationUrl);
    expect(bundle.items[0].content.call_to_action).toContain(context.destinationUrl);
    expect(bundle.campaign.metadata).toMatchObject({ ad_budget_chf: null, audience_size_estimate: null, cost_scope: "text_only" });
  });
  it.each(["https://evil.example/contact", "javascript:alert(1)", "https://user:secret@www.thetok.ch/contact", "https://www.thetok.ch/api/marketing/session"])("rejects unreviewed conversion destinations: %s", (destinationUrl) => {
    expect(() => toBundlePayload(plan(), new Map(), { ...context, destinationUrl })).toThrow(/destination_url_invalid/);
  });
});


describe("untrusted plan metadata", () => {
  it("does not silently drop a requested network", () => {
    const value = plan(); value.items.push({ ...value.items[0], title: "Autre angle", content: { ...value.items[0].content, body: "Un autre argument." } });
    expect(() => validatePlan(value, ["facebook", "instagram"], { ...context, itemCount: 2 })).toThrow(/requested_channel_missing/);
  });
  it("rejects an invalid strategy rather than passing it to the review screen", () => {
    const value = plan(); value.campaign.strategy = { sequence: "Comparer", conversion_goal: "Une démo", measurement_plan: "Formulaire", assumptions: "not-an-array" } as unknown as NonNullable<MarketingPlan["campaign"]["strategy"]>;
    expect(() => validatePlan(value, ["facebook"])).toThrow(/invalid_strategy/);
  });
  it("requires an item audience label before bundle conversion", () => {
    const value = plan(); value.items[0].audience_name = "";
    expect(() => validatePlan(value, ["facebook"])).toThrow(/invalid_item_audience/);
  });
});


describe("final social caption and reviewed destination", () => {
  it("rejects an Instagram caption exceeding the limit after adding the destination", () => {
    const value = plan(); value.campaign.channels = ["instagram"]; value.items[0].channel = "instagram";
    value.items[0].content.body = "x".repeat(2120);
    expect(() => validatePlan(value, ["instagram"], context)).toThrow(/social_caption_invalid/);
  });
  it("keeps CTA destination insertion idempotent and strips mixed-case model URLs", () => {
    const value = plan(); value.items[0].content.call_to_action = "Comparer HTTPS://invented.example/deal";
    const bundle = toBundlePayload(value, new Map(), context) as { items: Array<{ content: { call_to_action: string } }> };
    expect(bundle.items[0].content.call_to_action).not.toContain("invented.example");
    expect(bundle.items[0].content.call_to_action).toContain(context.destinationUrl);
  });
});
