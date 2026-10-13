import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingPlan } from "../../supabase/functions/_shared/marketing-ai-plan";
const { provider } = vi.hoisted(() => ({ provider: vi.fn() }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error {
  constructor(public status: number, message: string) { super(message); }
} }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({
  createOpenAIResponse: provider, parseStructuredOutput: (value: unknown) => value,
  selectTokAiModel: () => "configured-strategy-model", extractUsage: () => ({ input_tokens: 10, output_tokens: 20 }), estimateOpenAITextCostChf: () => 0.01,
}));
import { generateMarketingPlan } from "../../supabase/functions/_shared/marketing-ai";
const context = { objective: "Présenter le studio marketing", allowedChannels: ["instagram", "email"], connectedChannels: ["instagram"], audienceHint: "Genève",
  startsAt: "2027-02-01T08:00:00Z", endsAt: "2027-02-04T08:00:00Z", itemCount: 2, locale: "fr-CH" };
function plan(): MarketingPlan {
  const content = { subject: "Sujet", headline: "Préparer vos visuels", body: "Présentez votre restaurant @partenaire https://www.thetok.ch/auth #viral.", call_to_action: "Voir https://www.thetok.ch/zero-attente", hashtags: ["#MarketingRestaurant", "#viral", "#fyp"] };
  return { campaign: { name: "Studio TOK", objective: context.objective, summary: "Découvrir le studio.", channels: ["instagram", "email"], starts_at: context.startsAt, ends_at: context.endsAt, audience_name: "Restaurants", audience_definition: { audience_kind: "restaurant" } },
    items: ["instagram", "email"].map((channel) => ({ title: "Studio marketing", channel: channel as "instagram" | "email", scheduled_at: context.startsAt, audience_name: "Restaurants", targeting: { audience_kind: "restaurant" }, content: { ...content, hashtags: [...content.hashtags] }, visual_prompt: "Chef TOK @fake https://evil.test" })) };
}
beforeEach(() => provider.mockReset());
describe("marketing provider editorial integration", () => {
  it("normalizes newly generated advanced social posts while preserving non-social content and the legacy schema", async () => {
    const source = plan(); provider.mockResolvedValue(source);
    const result = await generateMarketingPlan(context);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0].jsonSchema.schema.properties.items.items.properties).toHaveProperty("content");
    expect(result.plan.items[0].content.call_to_action).toBe("À consulter : https://www.thetok.ch/");
    expect(result.plan.items[0].content.body).not.toMatch(/@partenaire|\/auth|#viral/);
    expect(result.plan.items[0].content.hashtags).toHaveLength(3);
    expect(result.plan.items[0].visual_prompt).not.toMatch(/@fake|evil/);
    expect(result.plan.items[1]).toEqual(source.items[1]);
    expect(source.items[0].content.body).toContain("@partenaire");
  });
  it("preserves only an exact verified public destination for an unclassified free brief", async () => {
    const source = plan(); source.items = [source.items[0]]; source.items[0].title = "Une sortie";
    source.items[0].content.headline = "Profitez de votre soirée"; source.items[0].content.body = "Découvrez une nouvelle adresse.";
    source.items[0].content.call_to_action = "Découvrir https://www.thetok.ch/anti-gaspi";
    provider.mockResolvedValue(source);
    const result = await generateMarketingPlan({ ...context, objective: "Inviter à découvrir", allowedChannels: ["instagram"], itemCount: 1 });
    expect(result.plan.items[0].content.call_to_action).toBe("À consulter : https://www.thetok.ch/anti-gaspi");
    source.items[0].content.call_to_action = "Découvrir https://www.thetok.ch/anti-gaspi?redirect=https://evil.test";
    expect((await generateMarketingPlan({ ...context, objective: "Inviter à découvrir", allowedChannels: ["instagram"], itemCount: 1 })).plan.items[0].content.call_to_action).toBe("À consulter : https://www.thetok.ch/");
  });
  it("requests one guided structured response with all channel variants and expands only formats", async () => {
    const source = plan();
    const base = source.items[0];
    provider.mockResolvedValue({ campaign: source.campaign, items: [{ ...base, primary_template_id: "studio_marketing", channel_variants: [
      { channel: "instagram", content: { ...base.content, body: "Un visuel pour raconter votre cuisine." } },
      { channel: "facebook", content: { ...base.content, body: "Préparez les contenus de votre restaurant." } },
    ] }] });
    const result = await generateMarketingPlan({ ...context, itemCount: 1, allowedChannels: ["instagram", "facebook"], campaignOptions: {
      templateIds: ["studio_marketing"], postCount: 1, cadence: "daily", formatsByChannel: { instagram: ["1:1", "4:5"], facebook: ["1:1"] },
    } });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0].maxOutputTokens).toBe(12000);
    expect(provider.mock.calls[0][0].jsonSchema.schema.properties.items.items.properties).toHaveProperty("channel_variants");
    expect(result.plan.items).toHaveLength(3);
    expect(result.plan.items[0].content).toEqual(result.plan.items[1].content);
    expect(result.plan.items[2].content.body).not.toBe(result.plan.items[0].content.body);
  });
  it("chooses each free post's specific feature before the global multi-topic brief", async () => {
    const source = plan(); source.items[1].channel = "instagram";
    source.items[0].title = "Zéro attente";
    source.items[0].content.headline = "Vos réservations Zéro attente";
    source.items[0].content.body = "Préparez votre arrivée au restaurant.";
    source.items[1].title = "Studio marketing";
    provider.mockResolvedValue(source);
    const result = await generateMarketingPlan({ ...context, objective: "Zéro attente et Studio marketing", allowedChannels: ["instagram"] });
    expect(result.plan.items[0].content.call_to_action).toContain("https://www.thetok.ch/zero-attente");
    expect(result.plan.items[0].content.hashtags).toContain("#ZeroAttente");
    expect(result.plan.items[1].content.call_to_action).toBe("À consulter : https://www.thetok.ch/");
    expect(result.plan.items[1].content.hashtags).toContain("#MarketingRestaurant");
  });
  it("surfaces invalid guided output as a provider failure without another paid call", async () => {
    provider.mockResolvedValue(plan());
    await expect(generateMarketingPlan({ ...context, campaignOptions: { templateIds: ["studio_marketing"], postCount: 2, cadence: "daily", formatsByChannel: { instagram: ["1:1"] } } })).rejects.toMatchObject({ status: 502, message: "ai_invalid_plan" });
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
