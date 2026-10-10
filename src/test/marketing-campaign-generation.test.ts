import { afterEach, describe, expect, it, vi } from "vitest";
const { response, parsed } = vi.hoisted(() => ({ response: vi.fn(), parsed: vi.fn() }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({
  createOpenAIResponse: response, parseStructuredOutput: parsed,
  selectTokAiModel: () => "test-model", extractUsage: () => ({ input_tokens: 10, output_tokens: 20 }), estimateOpenAITextCostChf: () => 0.01,
}));
import { generateCampaignVisual, generateMarketingPlan } from "../../supabase/functions/_shared/marketing-ai";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("campaign generation contract", () => {
  it("asks for a conversion strategy, consistent audience and a qualified comparison", async () => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 7 * 86400000).toISOString();
    parsed.mockReturnValue({ campaign: { name: "TOK", objective: "Recruter", summary: "Deux approches", channels: ["facebook"], starts_at: startsAt, ends_at: endsAt, audience_name: "Restaurants", audience_definition: { audience_kind: "restaurant", canton: "GE" } }, items: [{ title: "Comparer", channel: "facebook", scheduled_at: startsAt, audience_name: "Restaurants", targeting: { audience_kind: "restaurant", canton: "GE" }, content: { headline: "TOK", body: "Comparez la commission", call_to_action: "Comparer", subject: null, hashtags: [] }, visual_prompt: null }] });
    response.mockResolvedValue({});
    await generateMarketingPlan({ objective: "Recruter des restaurateurs genevois à 5 CHF par table", allowedChannels: ["facebook"], connectedChannels: ["facebook"], audienceHint: "Restaurants GE", startsAt, endsAt, itemCount: 1, locale: "fr-CH", destinationUrl: "https://www.thetok.ch/contact", purpose: "acquisition" });
    const input = response.mock.calls.at(-1)?.[0];
    const prompt = input.input.map((entry: { content: string }) => entry.content).join("\n");
    expect(prompt).toContain("strictement identiques");
    expect(prompt).toContain("abonnement");
    expect(prompt).toContain("conversion");
    expect(prompt).toContain("https://www.thetok.ch/contact");
    expect(prompt).toContain("organique");
  });
  it("requests JPEG and stores actual JPEG bytes with consistent metadata", async () => {
    const jpeg = btoa(String.fromCharCode(255, 216, 255, 224, 0, 16, 255, 217));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: jpeg }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storage = { from: vi.fn().mockReturnValue({ upload, getPublicUrl: () => ({ data: { publicUrl: "https://project.supabase.co/asset.jpg" } }) }) };
    const result = await generateCampaignVisual({ storage }, { prompt: "Une table de restaurant", campaignSlug: "tok", index: 0, apiKey: "test-only-key" });
    expect(result).toContain("asset.jpg");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ output_format: "jpeg" });
    expect(upload.mock.calls[0][0]).toMatch(/\.jpg$/);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("does not upload a payload that is not a JPEG", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: btoa("not-an-image") }] }))));
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storage = { from: vi.fn().mockReturnValue({ upload, getPublicUrl: () => ({ data: { publicUrl: "https://project.supabase.co/invalid" } }) }) };
    expect(await generateCampaignVisual({ storage }, { prompt: "Table", campaignSlug: "tok", index: 0, apiKey: "test-only-key" })).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
