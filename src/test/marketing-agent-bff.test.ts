import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingAgentHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const csrf = "c".repeat(43);
function request(body: Record<string, unknown>): MarketingApiRequest {
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

function upstream(options: { agentStatus?: number; quota?: boolean; role?: boolean; session?: boolean } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json(options.session === false ? null : {
      user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(options.role === false ? [] : [{ user_id: actor }]);
    if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) return json({ allowed: options.quota !== false, retry_after_seconds: 60 });
    if (url.endsWith("/functions/v1/ai-marketing-agent")) return json({ sources: [], searchedAt: "2026-10-09T00:00:00Z" }, options.agentStatus ?? 200);
    throw new Error("Unexpected upstream route");
  });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("marketing agent service boundary", () => {
  it.each([401, 403])("reports upstream %i as a service problem, not invalid input or expired browser session", async (agentStatus) => {
    vi.stubGlobal("fetch", upstream({ agentStatus }));
    const res = recorder();
    await marketingAgentHandler(request({ action: "list_runs" }), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(res.value().error.code).toBe("ai_auth_unavailable");
  });

  it("discovers with a server-verified actor, quota and opaque key on apikey only", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingAgentHandler(request({ action: "discover_sources", query: "Annuaires restaurants Genève" }), res.response);
    expect(res.response.statusCode).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/functions/v1/ai-marketing-agent"));
    const init = (call as unknown as [string, RequestInit])[1];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("apikey")).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.get("x-marketing-actor-user-id")).toBe(actor);
    expect(JSON.parse(String(init.body))).toEqual({ action: "discover_sources", query: "Annuaires restaurants Genève", limit: 5 });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_consume_marketing_auth_attempt"))).toBe(true);
  });

  it.each([
    { query: "short" }, { query: "x".repeat(1001) }, { query: "Restaurants Genève", limit: 11 },
    { query: "Restaurants Genève", limit: 1.5 }, { query: "Restaurants Genève", actorUserId: actor },
    { query: "Restaurants Genève", withoutAccountOnly: "true" },
  ])("rejects invalid discovery input without spending", async (payload) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingAgentHandler(request({ action: "discover_sources", ...payload }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/functions/v1/"))).toBe(true);
  });

  it.each([{ quota: false }, { session: false }, { role: false }])("blocks discovery when a server gate rejects the request: %o", async (options) => {
    const fetchMock = upstream(options); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingAgentHandler(request({ action: "discover_sources", query: "Restaurants Genève" }), res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/functions/v1/"))).toBe(true);
  });

  it("rejects missing CSRF before reaching upstream", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const req = request({ action: "discover_sources", query: "Restaurants Genève" });
    delete req.headers["x-tok-marketing-csrf"];
    const res = recorder(); await marketingAgentHandler(req, res.response);
    expect(res.response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the explicit without-account filter", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingAgentHandler(request({ action: "discover_sources", query: "Restaurants Genève", withoutAccountOnly: true }), res.response);
    expect(res.response.statusCode).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/functions/v1/ai-marketing-agent"));
    const init = (call as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toMatchObject({ withoutAccountOnly: true });
  });
});
