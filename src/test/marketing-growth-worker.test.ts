import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGrowthGeneration } from "../../supabase/functions/_shared/marketing-growth/worker";
const profile = { name: "TOK", positioning: "Réservation", audience: "Clients", voice: "Français", facts: "Réservations selon disponibilité.", approvedUrls: ["https://www.thetok.ch/"] };
const document = () => ({ title: "Réservation à Genève", description: "Un guide pour réserver une table.", summary: "Préparez votre visite.", language: "fr-CH", sections: [{ heading: "Préparer", paragraphs: ["Consultez TOK."], sourceIds: ["tok"] }], faq: [], links: [], sources: [{ id: "tok", url: "https://www.thetok.ch/", title: "TOK", checkedAt: "2026-11-01T08:00:00.000Z" }] });
const id = "11111111-1111-4111-8111-111111111111", token = "22222222-2222-4222-8222-222222222222";
function fixture(status = "running", finishError = false) { const calls: {
    name: string;
    args: Record<string, unknown>;
}[] = []; return { calls, client: { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return name.includes("claim") ? { data: status === "running" ? { status, id, leaseToken: token, model: "gpt-4.1-mini-2025-04-14", profile, profileApprovedAt: "2026-11-01T08:00:00.000Z", brief: "Expliquer la réservation" } : { status }, error: null } : { data: { status: "succeeded" }, error: finishError ? { message: "private database details" } : null }; } } }; }
const config = (generate = async () => document()) => ({ providerReady: true, model: "gpt-4.1-mini-2025-04-14", maxCostMicros: 200000, generate });
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-01T08:00:00.000Z")); });
afterEach(() => vi.useRealTimers());
describe("growth durable generation", () => {
    it("does not call a provider without credentials or a bounded cost ceiling", async () => { let generated = 0; for (const c of [{ ...config(), providerReady: false }, { ...config(), maxCostMicros: null }]) {
        const f = fixture();
        const r = await runGrowthGeneration(f.client, { ...c, generate: async () => { generated++; return document(); } });
        expect(r.status).toBe("blocked");
        expect(f.calls).toHaveLength(0);
    } expect(generated).toBe(0); });
    it.each(["idle", "paused", "blocked", "cancelled"])("does no generation when claim returns %s", async (status) => { const f = fixture(status); let generated = 0; expect((await runGrowthGeneration(f.client, config(async () => { generated++; return document(); }))).status).toBe(status); expect(generated).toBe(0); });
    it("rejects unknown models and under-reserved calls", async () => { for (const c of [{ ...config(), model: "unpriced-model" }, { ...config(), maxCostMicros: 1 }]) {
        const f = fixture();
        const r = await runGrowthGeneration(f.client, c);
        expect(r.status).toBe("blocked");
        expect(f.calls).toHaveLength(0);
    } });
    it("reserves via claim before the single provider call, then persists using the lease", async () => { const f = fixture(); let generated = 0; const r = await runGrowthGeneration(f.client, config(async () => { expect(f.calls[0].name).toBe("service_claim_marketing_growth_job"); generated++; return document(); })); expect(r.status).toBe("succeeded"); expect(generated).toBe(1); expect(f.calls[1].args).toMatchObject({ p_job_id: id, p_lease_token: token, p_document: document() }); });
    it("keeps ambiguous paid failures for reconciliation without retry", async () => { const f = fixture(); let generated = 0; await runGrowthGeneration(f.client, config(async () => { generated++; throw new Error("secret provider error"); })); expect(generated).toBe(1); expect(f.calls[1].args).toMatchObject({ p_document: null, p_error_code: "provider_outcome_unknown" }); });
    it("rejects invented sources before storing a generated document", async () => { const f = fixture(); const d = document(); d.sources[0].url = "https://blog.thetok.ch/invented"; await runGrowthGeneration(f.client, config(async () => d)); expect(f.calls[1].args).toMatchObject({ p_document: null, p_error_code: "generated_document_invalid" }); });
    it("does not resend or fabricate success if completion loses its lease", async () => { const f = fixture("running", true); const r = await runGrowthGeneration(f.client, config()); expect(r.status).toBe("reconcile"); expect(f.calls).toHaveLength(2); expect(JSON.stringify(r)).not.toContain("private"); });
});
