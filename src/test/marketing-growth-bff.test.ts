import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingRpcHandler, sha256Hex, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";
const actor = "11111111-1111-4111-8111-111111111111", sid = "s".repeat(43), csrf = "c".repeat(43);
function req(operation: string, args: unknown): MarketingApiRequest { return { method: "POST", body: { operation, args }, headers: { host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch", "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: `__Host-tok_marketing_sid=${sid}; __Host-tok_marketing_csrf=${csrf}`, "x-tok-marketing-csrf": csrf } }; }
function recorder() { let body = ""; const response: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: (v) => { body = v || ""; } }; return { response, value: () => JSON.parse(body) }; }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function upstream(admin = true, failure = false) {
    return vi.fn(async (input: unknown, _init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/rpc/service_get_marketing_web_session"))
            return json({ user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600000).toISOString() });
        if (url.endsWith(`/admin/users/${actor}`))
            return json({ id: actor, email: "admin@example.org" });
        if (url.includes("/user_roles?"))
            return json(admin ? [{ user_id: actor }] : []);
        if (url.endsWith("/rpc/service_marketing_growth_operation"))
            return failure ? json({ code: "40001", message: "Growth article conflict", details: "SECRET" }, 500) : json({ ok: true });
        throw new Error("Unexpected upstream");
    });
}
beforeEach(() => { vi.stubEnv("SUPABASE_URL", "https://project.supabase.co"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32)); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("growth BFF", () => {
    it("rejects the Search Console read before contacting Windsor when the role is revoked", async () => {
        const mock = upstream(false);
        vi.stubGlobal("fetch", mock);
        const r = recorder();
        await marketingRpcHandler(req("admin_read_tok_search_console", {}), r.response);
        expect(r.response.statusCode).toBeGreaterThanOrEqual(400);
        expect(mock.mock.calls.some(([url]) => String(url).includes("/user_roles?"))).toBe(true);
        expect(mock.mock.calls.some(([url]) => String(url).includes("windsor.ai"))).toBe(false);
    });
    it("serves the private stored period after admin authentication if the key is missing", async () => {
        vi.stubEnv("WINDSOR_API_KEY", "");
        const base = upstream();
        vi.stubGlobal("fetch", (url: string, init: RequestInit) => String(url).includes("/marketing_search_console_report?")
          ? json([{ snapshot: { property: "sc-domain:thetok.ch", from: "2026-10-23", to: "2026-10-29",
            daily: [{ site: "thetok.ch", date: "2026-10-25", clicks: 3, impressions: 40 }], queries: [] } }]) : base(url, init));
        const r = recorder();
        await marketingRpcHandler(req("admin_read_tok_search_console", {}), r.response);
        expect(r.response.statusCode).toBe(200);
        expect(r.value()).toMatchObject({ source: "stored", observedDays: 1, totals: { clicks: 3, impressions: 40 } });
    });
    it("uses the Supabase Edge with the delegated actor and does not require a Vercel Windsor key", async () => {
        vi.stubEnv("WINDSOR_API_KEY","");
        const base=upstream();
        const mock=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
          if(String(input).endsWith("/functions/v1/ai-marketing-agent")){
            expect(JSON.parse(String(init?.body))).toEqual({action:"read_search_console"});
            expect(new Headers(init?.headers).get("x-marketing-actor-user-id")).toBe(actor);
            return json({property:"sc-domain:thetok.ch",opportunities:[],observedDays:7,totals:{clicks:31,impressions:5032}});
          }
          return base(input,init);
        });
        vi.stubGlobal("fetch",mock);const r=recorder();
        await marketingRpcHandler(req("admin_read_tok_search_console",{}),r.response);
        expect(r.response.statusCode).toBe(200);expect(r.value().source).toBe("windsor");
    });
    it("reports a provider account limit explicitly when no stored report is present",async()=>{
        const base=upstream();
        vi.stubGlobal("fetch",(input:string,init?:RequestInit)=>input.endsWith("/functions/v1/ai-marketing-agent")
          ? json({status:"windsor_account_limit"}) : input.includes("/marketing_search_console_report?") ? json([]) : base(input,init));
        const r=recorder(); await marketingRpcHandler(req("admin_read_tok_search_console",{}),r.response);
        expect(r.response.statusCode).toBe(503); expect(r.value().error.code).toBe("windsor_account_limit");
    });
    it("reports an unavailable live source without fabricating metrics", async () => {
        vi.stubEnv("WINDSOR_API_KEY", "");
        vi.stubGlobal("fetch", upstream());
        const r = recorder();
        await marketingRpcHandler(req("admin_read_tok_search_console", {}), r.response);
        expect(r.response.statusCode).toBe(503);
    });
    it("routes the fixed TOK operation through MFA/CSRF proof and revalidated admin", async () => {
        const mock = upstream();
        vi.stubGlobal("fetch", mock);
        const r = recorder();
        await marketingRpcHandler(req("admin_get_marketing_growth", { offset: 0, limit: 20 }), r.response);
        expect(r.response.statusCode).toBe(200);
        const call = mock.mock.calls.find(([url]) => String(url).endsWith("/rpc/service_marketing_growth_operation"));
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({ p_sid_hash: sha256Hex(sid), p_csrf_hash: sha256Hex(csrf), p_operation: "admin_get_marketing_growth", p_args: { offset: 0, limit: 20 } });
    });
    it.each([{ siteId: "other" }, { offset: -1 }, { limit: 500 }, { limit: "20" }, { articleId: "forged" }])("rejects invalid reads before upstream %o", async (args) => {
        const mock = vi.fn();
        vi.stubGlobal("fetch", mock);
        const r = recorder();
        await marketingRpcHandler(req("admin_get_marketing_growth", args), r.response);
        expect(r.response.statusCode).toBe(400);
        expect(mock).not.toHaveBeenCalled();
    });
    it.each(["session", "csrf", "origin", "role"])("preserves %s protection", async (missing) => {
        const mock = upstream(missing !== "role");
        vi.stubGlobal("fetch", mock);
        const request = req("admin_get_marketing_growth", {});
        if (missing === "session")
            request.headers.cookie = `__Host-tok_marketing_csrf=${csrf}`;
        if (missing === "csrf")
            request.headers["x-tok-marketing-csrf"] = "forged";
        if (missing === "origin")
            request.headers.origin = "https://evil.example";
        const r = recorder();
        await marketingRpcHandler(request, r.response);
        expect(r.response.statusCode).toBeGreaterThanOrEqual(400);
        expect(mock.mock.calls.some(([url]) => String(url).endsWith("/rpc/service_marketing_growth_operation"))).toBe(false);
    });
    it("reports stale revisions without leaking SQL", async () => { vi.stubGlobal("fetch", upstream(true, true)); const r = recorder(); await marketingRpcHandler(req("admin_get_marketing_growth", {}), r.response); expect(r.response.statusCode).toBe(409); expect(JSON.stringify(r.value())).not.toContain("SECRET"); });
    it.each(["service_claim_marketing_growth_job", "admin_publish_marketing_growth_article"])("does not expose %s", async (operation) => { const mock = vi.fn(); vi.stubGlobal("fetch", mock); const r = recorder(); await marketingRpcHandler(req(operation, {}), r.response); expect(r.response.statusCode).toBe(400); expect(mock).not.toHaveBeenCalled(); });
    it("rejects a changed document with unknown markup fields", async () => { const mock = vi.fn(); vi.stubGlobal("fetch", mock); const r = recorder(); await marketingRpcHandler(req("admin_save_marketing_growth_article", { slug: "mon-article", brief: "Un brief suffisamment long", document: { html: "<script>" } }), r.response); expect(r.response.statusCode).toBe(400); expect(mock).not.toHaveBeenCalled(); });
});
