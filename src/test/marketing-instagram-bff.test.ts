import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingOrchestratorHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const csrf = "c".repeat(43);
const discover = { action: "instagram_discover", hashtags: ["genevefood"], usernames: [], days: 30 };
const request = (body: unknown = discover): MarketingApiRequest => ({ method: "POST", body, headers: {
  host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch", "sec-fetch-site": "same-origin",
  "content-type": "application/json", "x-tok-marketing-csrf": csrf,
  cookie: `__Host-tok_marketing_sid=${"s".repeat(43)}; __Host-tok_marketing_csrf=${csrf}`,
} });
function response() {
  let output = "";
  const res: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: (body) => { output = body || ""; } };
  return { res, value: () => JSON.parse(output) };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function upstream(options: { admin?: boolean; session?: boolean; quota?: boolean; status?: number } = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json(options.session === false ? null : { user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600000).toISOString() });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(options.admin === false ? [] : [{ user_id: actor }]);
    if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) return json({ allowed: options.quota !== false, retry_after_seconds: 60 });
    if (url.endsWith("/functions/v1/marketing-orchestrator")) return json({ kind: "discovery", posts: [], accounts: [] }, options.status ?? 200);
    throw new Error("Unexpected route");
  });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Instagram research BFF", () => {
  it("accepts a normalized read request only after admin and rate-limit checks", async () => {
    const fetchImpl = upstream(); vi.stubGlobal("fetch", fetchImpl);
    const { res, value } = response();
    await marketingOrchestratorHandler(request(discover), res);
    expect(res.statusCode).toBe(200);
    expect(value().kind).toBe("discovery");
    const edge = fetchImpl.mock.calls.find(([url]) => String(url).endsWith("/functions/v1/marketing-orchestrator"));
    expect(JSON.parse(String(edge![1]!.body))).toEqual(discover);
    expect(new Headers(edge![1]!.headers).get("x-marketing-actor-user-id")).toBe(actor);
    expect(fetchImpl.mock.calls.findIndex(([url]) => String(url).includes("service_consume_marketing_auth_attempt")))
      .toBeLessThan(fetchImpl.mock.calls.findIndex(([url]) => String(url).includes("/functions/v1/")));
  });
  it.each([{ ...discover, token: "secret" }, { ...discover, hashtags: ["a", "b", "c", "d"] }, { action: "instagram_comments", mediaId: "../me" }, { action: "instagram_reply", mediaId: "123456", text: "hello" }])("rejects malformed and send requests before touching upstream: %o", async (body) => {
    const fetchImpl = upstream(); vi.stubGlobal("fetch", fetchImpl);
    const { res } = response(); await marketingOrchestratorHandler(request(body), res);
    expect(res.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects a missing CSRF token", async () => {
    const fetchImpl = upstream(); vi.stubGlobal("fetch", fetchImpl);
    const req = request(); delete req.headers["x-tok-marketing-csrf"];
    const { res } = response(); await marketingOrchestratorHandler(req, res);
    expect(res.statusCode).toBe(403); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([{ admin: false }, { session: false }, { quota: false }])("never calls the Edge when a gate fails: %o", async (options) => {
    const fetchImpl = upstream(options); vi.stubGlobal("fetch", fetchImpl);
    const { res } = response(); await marketingOrchestratorHandler(request(), res);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/functions/v1/"))).toBe(false);
  });
  it("preserves provider rate limiting without invalidating the marketing session", async () => {
    vi.stubGlobal("fetch", upstream({ status: 429 }));
    const { res } = response(); await marketingOrchestratorHandler(request(), res);
    expect(res.statusCode).toBe(429);
    expect(res.setHeader).not.toHaveBeenCalledWith("Set-Cookie", expect.anything());
  });
});
