import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingOrchestratorHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const csrf = "c".repeat(43);
const edgePath = "/functions/v1/marketing-orchestrator";
function request(body: Record<string, unknown> = { action: "check_meta" }): MarketingApiRequest {
  return { method: "POST", body, headers: {
    host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch",
    "sec-fetch-site": "same-origin", "content-type": "application/json",
    cookie: `__Host-tok_marketing_sid=${"s".repeat(43)}; __Host-tok_marketing_csrf=${csrf}`,
    "x-tok-marketing-csrf": csrf,
  } };
}
function recorder() {
  let body = "";
  const response: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: (value) => { body = value || ""; } };
  return { response, value: () => JSON.parse(body) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function upstream(options: { status?: number; quota?: boolean; session?: boolean; role?: boolean } = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json(options.session === false ? null : {
      user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(options.role === false ? [] : [{ user_id: actor }]);
    if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) return json({ allowed: options.quota !== false, retry_after_seconds: 60 });
    if (url.endsWith(edgePath)) return json({ accounts: [{ channel: "facebook", status: "blocked_configuration", reason: "Accès non confirmé" }] }, options.status ?? 200);
    throw new Error("Unexpected test upstream route");
  });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Meta health BFF boundary", () => {
  it("forwards only the health action, with a verified delegated actor and opaque apikey", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingOrchestratorHandler(request(), res.response);
    expect(res.response.statusCode).toBe(200);
    expect(res.value().accounts[0].status).toBe("blocked_configuration");
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(edgePath));
    expect(call).toBeDefined();
    const init = call![1]!;
    expect(JSON.parse(String(init.body))).toEqual({ action: "check_meta" });
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-marketing-actor-user-id")).toBe(actor);
    const quotaIndex = fetchMock.mock.calls.findIndex(([url]) => String(url).includes("service_consume_marketing_auth_attempt"));
    const edgeIndex = fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith(edgePath));
    expect(quotaIndex).toBeGreaterThanOrEqual(0);
    expect(quotaIndex).toBeLessThan(edgeIndex);
  });

  it("rejects a missing CSRF proof before any downstream call", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const req = request(); delete req.headers["x-tok-marketing-csrf"];
    const res = recorder(); await marketingOrchestratorHandler(req, res.response);
    expect(res.response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns quota 429 without calling Meta orchestration", async () => {
    const fetchMock = upstream({ quota: false }); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingOrchestratorHandler(request(), res.response);
    expect(res.response.statusCode).toBe(429);
    expect(res.value().error.code).toBe("rate_limited");
    expect(res.response.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(edgePath))).toBe(false);
  });

  it.each([{ limit: 1 }, { actorUserId: actor }, { token: "browser-token" }])("rejects extra fields %o before authentication or provider calls", async (extra) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingOrchestratorHandler(request({ action: "check_meta", ...extra }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("maps upstream %i to service unavailable, preserving the browser session", async (status) => {
    vi.stubGlobal("fetch", upstream({ status }));
    const res = recorder(); await marketingOrchestratorHandler(request(), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(res.value().error.code).toBe("service_unavailable");
    expect(res.response.setHeader).not.toHaveBeenCalledWith("Set-Cookie", expect.anything());
  });

  it.each([{ session: false }, { role: false }])("does not call orchestration when an identity gate fails: %o", async (options) => {
    const fetchMock = upstream(options); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingOrchestratorHandler(request(), res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(edgePath))).toBe(false);
  });
});
