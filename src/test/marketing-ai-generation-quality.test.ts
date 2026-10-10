import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error {} }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({
  createOpenAIResponse: vi.fn(), estimateOpenAITextCostChf: vi.fn(), extractUsage: vi.fn(),
  parseStructuredOutput: vi.fn(), selectTokAiModel: vi.fn(),
}));
import { buildSystemPrompt, generateCampaignVisual } from "../../supabase/functions/_shared/marketing-ai";
const context = { objective: "Recruter à Genève, 5 CHF par table plutôt que par couvert", audienceHint: "restaurateurs genevois", allowedChannels: ["facebook", "instagram"], connectedChannels: ["facebook", "instagram"], startsAt: "2026-10-11T09:00:00Z", endsAt: "2026-10-25T17:00:00Z", itemCount: 4, locale: "fr-CH" };
afterEach(() => vi.unstubAllGlobals());
it("requires a conversion route, identical targeting and truthful competitive comparisons", () => {
  const prompt = buildSystemPrompt(context);
  expect(prompt).toContain("alternative-commission-couvert");
  expect(prompt).toContain("strictement identique");
  expect(prompt).toContain("contrat");
  expect(prompt).toContain("portée");
});
describe("marketing native JPEG generation", () => {
  it("requests JPEG and uploads it with the correct MIME type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: btoa(String.fromCharCode(255,216,255,224,0,1,255,217)) }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({ upload, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media.example/${path}` } }) }) } };
    const url = await generateCampaignVisual(client, { prompt: "TOK Genève", campaignSlug: "geneve", index: 0, apiKey: "test-only" });
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(payload.output_format).toBe("jpeg");
    expect(url).toMatch(/\.jpg$/);
    expect((upload.mock.calls[0] as unknown as [string, Uint8Array, Record<string, unknown>])[2]).toMatchObject({ contentType: "image/jpeg" });
  });
  it("does not upload a non-JPEG response or pretend generation succeeded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: btoa("not an image") }] }))));
    const upload = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: "https://media.example/image" } }) }) } };
    expect(await generateCampaignVisual(client, { prompt: "TOK", campaignSlug: "tok", index: 0, apiKey: "test-only" })).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
