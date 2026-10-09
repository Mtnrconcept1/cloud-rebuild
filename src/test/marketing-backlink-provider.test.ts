import { beforeEach, describe, expect, it, vi } from "vitest";
const { provider, parse } = vi.hoisted(() => ({ provider: vi.fn(), parse: vi.fn() }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error {
  constructor(public status: number, message: string) { super(message); }
} }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({ createOpenAIResponse: provider, parseStructuredOutput: parse, selectTokAiModel: () => "configured-strategy-model" }));
import { discoverBacklinkSources } from "../../supabase/functions/_shared/marketing-backlink-discovery";

describe("backlink discovery provider contract", () => {
  beforeEach(() => { provider.mockReset(); parse.mockReset(); });
  it("validates inputs before incurring provider work", async () => {
    await expect(discoverBacklinkSources("court")).rejects.toMatchObject({ status: 400 });
    await expect(discoverBacklinkSources("Restaurants Genève", 11)).rejects.toMatchObject({ status: 400 });
    await expect(discoverBacklinkSources("Restaurants Genève", "5")).rejects.toMatchObject({ status: 400 });
    await expect(discoverBacklinkSources("Restaurants Genève", 5, "true")).rejects.toMatchObject({ status: 400 });
    expect(provider).not.toHaveBeenCalled();
  });
  it("requests search evidence and returns only supported links", async () => {
    const source = { title: "Genève", url: "https://food.ch/article", kind: "press", rationale: "Presse locale" };
    provider.mockResolvedValue({ status: "completed", output: [{ type: "web_search_call", status: "completed", action: { sources: [source] } }] });
    parse.mockReturnValue({ sources: [source, { ...source, url: "https://invented.ch/" }] });
    const result = await discoverBacklinkSources("Restaurants Genève");
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ include: ["web_search_call.action.sources"], tools: [{ type: "web_search", search_context_size: "low" }], toolChoice: "required", timeoutMs: 55_000 }));
    expect(result.sources).toMatchObject([{ ...source, domain: "food.ch", accountRequirement: "unknown" }]);
    expect(Number.isFinite(Date.parse(result.searchedAt))).toBe(true);
  });
  it("refuses incomplete responses instead of suggesting partial output", async () => {
    provider.mockResolvedValue({ status: "incomplete" });
    await expect(discoverBacklinkSources("Restaurants Genève")).rejects.toMatchObject({ status: 502, message: "discovery_invalid_response" });
    expect(parse).not.toHaveBeenCalled();
  });
  it("propagates provider unavailability without manufacturing suggestions", async () => {
    provider.mockRejectedValue(new Error("ai_service_unavailable"));
    await expect(discoverBacklinkSources("Restaurants Genève")).rejects.toThrow("ai_service_unavailable");
  });
});
