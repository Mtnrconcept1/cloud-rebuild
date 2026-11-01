import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const environment = vi.hoisted(() => ({ mode: "scheduler_secret", rpc: vi.fn(), generate: vi.fn() }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error {
        status = 401;
    } }));
vi.mock("../../supabase/functions/_shared/marketing-service-auth.ts", () => ({ authenticateMarketingRequest: async () => ({ authMode: environment.mode, isServiceRole: environment.mode === "service_role", adminClient: { rpc: environment.rpc } }) }));
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({ createOpenAIResponse: vi.fn(), parseStructuredOutput: vi.fn() }));
vi.mock("../../supabase/functions/_shared/marketing-growth/worker.ts", () => ({ runGrowthGeneration: environment.generate }));
let handler: (r: Request) => Promise<Response>;
beforeEach(async () => { vi.resetModules(); environment.mode = "scheduler_secret"; environment.rpc.mockReset().mockResolvedValue({ data: null, error: null }); environment.generate.mockReset().mockResolvedValue({ status: "blocked", reason: "provider_cost_ceiling_missing" }); vi.stubGlobal("Deno", { env: { get: () => undefined }, serve: (fn: typeof handler) => { handler = fn; } }); await import("../../supabase/functions/marketing-growth-worker/index"); });
afterEach(() => vi.unstubAllGlobals());
describe("editorial worker service boundary", () => {
    it("denies user JWTs before database or provider work", async () => { environment.mode = "user_jwt"; const r = await handler(new Request("https://edge.example", { method: "POST", body: "{}" })); expect(r.status).toBe(403); expect(environment.rpc).not.toHaveBeenCalled(); expect(environment.generate).not.toHaveBeenCalled(); });
    it("denies browser-origin service requests", async () => { const r = await handler(new Request("https://edge.example", { method: "POST", headers: { origin: "https://marketing.thetok.ch" }, body: "{}" })); expect(r.status).toBe(403); expect(environment.rpc).not.toHaveBeenCalled(); });
    it("rejects arbitrary site/job selectors", async () => { const r = await handler(new Request("https://edge.example", { method: "POST", body: '{"site":"other"}' })); expect(r.status).toBe(400); expect(environment.rpc).not.toHaveBeenCalled(); });
    it("expires leases even when provider credentials are absent, then persists the block", async () => { const r = await handler(new Request("https://edge.example", { method: "POST", body: "{}" })); expect(r.status).toBe(200); expect(environment.rpc.mock.calls[0]).toEqual(["service_expire_marketing_growth_jobs", {}]); expect(environment.rpc.mock.calls[1]).toEqual(["service_note_marketing_growth_block", { p_reason: "provider_cost_ceiling_missing" }]); });
    it("stops provider work if housekeeping is unavailable", async () => { environment.rpc.mockResolvedValue({ data: null, error: { message: "private" } }); const r = await handler(new Request("https://edge.example", { method: "POST", body: "{}" })); expect(r.status).toBe(503); expect(environment.generate).not.toHaveBeenCalled(); expect(await r.text()).not.toContain("private"); });
});
