import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error {} }));
vi.mock("../../supabase/functions/_shared/ai-security.ts", () => ({
  AI_SECURITY_SYSTEM_PROMPT: "test",
  buildAiSecurityContext: () => ({ risk: { score: 0, labels: [] }, instruction: "test" }),
}));

describe("OpenAI required tool forwarding", () => {
  let createResponse: typeof import("../../supabase/functions/_shared/openai").createOpenAIResponse;
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "completed" }) });
  beforeAll(async () => {
    vi.stubGlobal("Deno", { env: { get: (name: string) => name === "OPENAI_API_KEY" ? "test-only-placeholder" : undefined } });
    vi.stubGlobal("fetch", fetchMock);
    createResponse = (await import("../../supabase/functions/_shared/openai")).createOpenAIResponse;
  });
  afterAll(() => { vi.unstubAllGlobals(); });
  it("requires hosted web search when explicitly selected", async () => {
    await createResponse({ input: [{ role: "user", content: "Restaurants Genève" }], tools: [{ type: "web_search" }], toolChoice: "required" });
    const body = JSON.parse(fetchMock.mock.lastCall![1].body);
    expect(body.tool_choice).toBe("required");
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });
  it("preserves existing calls that do not request a tool choice", async () => {
    await createResponse({ input: [{ role: "user", content: "Bonjour" }] });
    expect(JSON.parse(fetchMock.mock.lastCall![1].body)).not.toHaveProperty("tool_choice");
  });
});
