import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingPlan } from "../../supabase/functions/_shared/marketing-ai-plan";
import type { MailingOptions } from "../../supabase/functions/_shared/marketing-mailing";
import { applyMailingOptions } from "../../supabase/functions/_shared/marketing-mailing-plan";

const spies = vi.hoisted(() => ({ generate: vi.fn(), image: vi.fn(), allocate: vi.fn(), authenticate: vi.fn(), audit: vi.fn(), rpc: vi.fn() }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  authenticateRequest: vi.fn(), createAdminClient: vi.fn(), requireRole: vi.fn(), writeAuditLog: spies.audit,
  jsonResponse: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
}));
vi.mock("../../supabase/functions/_shared/marketing-service-auth.ts", () => ({ authenticateMarketingRequest: spies.authenticate }));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({ buildCorsHeaders: () => ({}), handleCorsPreflight: () => null }));
vi.mock("../../supabase/functions/_shared/logging.ts", () => ({ makeLogger: () => ({ error: vi.fn() }) }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({ OPENAI_API_KEY: "test-local-only", createOpenAIResponse: vi.fn(), parseStructuredOutput: vi.fn(), selectTokAiModel: vi.fn() }));
vi.mock("../../supabase/functions/_shared/marketing-backlink-discovery.ts", () => ({ discoverBacklinkSources: vi.fn() }));
vi.mock("../../supabase/functions/_shared/marketing-ai.ts", async () => ({
  ...await vi.importActual("../../supabase/functions/_shared/marketing-ai-plan.ts"), generateMarketingPlan: spies.generate, generateCampaignVisual: spies.image,
}));
vi.mock("../../supabase/functions/_shared/marketing-visual-allocation.ts", () => ({ allocateMarketingVisuals: spies.allocate }));

let handler: (request: Request) => Promise<Response>;
const startsAt = "2035-02-01T08:00:00Z";
const endsAt = "2035-02-20T08:00:00Z";
function generatedPlan(options: MailingOptions): MarketingPlan {
  const source: MarketingPlan = { campaign: { name: "Campagne TOK", objective: "Découvrir TOK", summary: "Une séquence complète", channels: ["email"],
    starts_at: startsAt, ends_at: endsAt, audience_name: "Tous", audience_definition: { audience_kind: "restaurant" } },
  items: Array.from({ length: options.emailCount }, (_, i) => ({ title: `E-mail ${i + 1}`, channel: "email", scheduled_at: startsAt, audience_name: "Tous",
    targeting: { audience_kind: "restaurant" }, content: { subject: `Objet ${i + 1}`, headline: `Bénéfice ${i + 1}`, body: `Contenu ${i + 1}`,
      call_to_action: "Découvrir TOK", hashtags: [] }, visual_prompt: "Une scène TOK" })) };
  return applyMailingOptions(source, options, startsAt, endsAt);
}
beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (callback: typeof handler) => { handler = callback; } });
  await import("../../supabase/functions/ai-marketing-agent/index.ts");
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(async () => {
  vi.clearAllMocks();
  spies.rpc.mockResolvedValue({ data: "00000000-0000-4000-8000-000000000001", error: null });
  const client = { rpc: spies.rpc, from: () => ({ select: () => ({ eq: async () => ({ data: [{ channel: "email" }], error: null }) }) }) };
  spies.authenticate.mockResolvedValue({ authMode: "service_role", userId: "00000000-0000-4000-8000-000000000002", roles: ["admin"], isAdmin: true, adminClient: client });
  spies.generate.mockImplementation(async ({ mailingOptions }: { mailingOptions: MailingOptions }) => ({ plan: generatedPlan(mailingOptions), model: "test", usage: {}, estimatedCostChf: 0 }));
  const actual = await vi.importActual<typeof import("../../supabase/functions/_shared/marketing-visual-allocation")>("../../supabase/functions/_shared/marketing-visual-allocation.ts");
  spies.allocate.mockImplementation(actual.allocateMarketingVisuals);
  spies.image.mockResolvedValue("https://assets.example/campaign.jpg");
});
async function generate(emailCount: number, imageMode: "manual" | "generated") {
  return handler(new Request("https://example.test/functions/v1/ai-marketing-agent", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "generate", objective: "Présenter TOK", channels: ["email"], startsAt, endsAt, itemCount: emailCount,
      mailingOptions: { selections: {}, recipientEmails: ["choisi@example.ch"], emailCount, cadence: "daily", imageMode } }) }));
}
describe("mailing Edge generation boundary", () => {
  it.each([1, 4, 12])("generates %i manual drafts without invoking either image allocator or provider", async (count) => {
    const response = await generate(count, "manual");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(spies.generate).toHaveBeenCalledTimes(1);
    expect(spies.allocate).not.toHaveBeenCalled(); expect(spies.image).not.toHaveBeenCalled();
    expect(result).toMatchObject({ itemCount: count, assetCount: 0, pendingUploadCount: count, missingVisualCount: 0, warnings: [] });
    for (const item of result.bundle.items) {
      expect(item.content).toMatchObject({ visual_status: "pending_upload", visual_url: null, visual_source: "upload" });
      expect(item.targeting).toEqual({ audience_kind: "mixed", recipient_emails: ["choisi@example.ch"] });
      expect(item).not.toHaveProperty("approval_status");
    }
  });
  it("generates one common image with the texts for generated mode", async () => {
    const response = await generate(4, "generated");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(spies.allocate).toHaveBeenCalledTimes(1); expect(spies.image).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ assetCount: 1, pendingUploadCount: 0, missingVisualCount: 0 });
    expect(result.bundle.items.every((item: { content: { visual_url: string } }) => item.content.visual_url === "https://assets.example/campaign.jpg")).toBe(true);
  });
  it("keeps generated-image failures visible without discarding the copy", async () => {
    spies.image.mockRejectedValue(new Error("provider failure"));
    const response = await generate(4, "generated");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ itemCount: 4, assetCount: 0, missingVisualCount: 4, warnings: ["visual_generation_incomplete"] });
    expect(result.bundle.items[0].content).toMatchObject({ subject: "Objet 1", visual_status: "pending_generation" });
  });
  it("rejects an explicit empty recipient list before the provider is invoked", async () => {
    const response = await handler(new Request("https://example.test/functions/v1/ai-marketing-agent", { method: "POST", body: JSON.stringify({
      action: "generate", objective: "Présenter TOK", channels: ["email"], startsAt, endsAt, itemCount: 1,
      mailingOptions: { selections: {}, recipientEmails: [], emailCount: 1, cadence: "daily", imageMode: "manual" },
    }) }));
    expect(response.status).toBe(400); expect(spies.generate).not.toHaveBeenCalled();
  });
});
