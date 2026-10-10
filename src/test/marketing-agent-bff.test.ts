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


describe("campaign generation input consistency", () => {
  const brief = () => ({ action: "generate", objective: "Recruter des restaurateurs genevois", channels: ["facebook", "instagram"], startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), itemCount: 4 });
  it("rejects a past start before contacting the generator", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock); const res = recorder();
    await marketingAgentHandler(request({ ...brief(), startsAt: new Date(Date.now() - 86400000).toISOString() }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/functions/v1/"))).toBe(false);
  });
  it("accepts the reviewed conversion destination and campaign purpose", async () => {
    const fetchMock = upstream({ agentStatus: 403 }); vi.stubGlobal("fetch", fetchMock); const res = recorder();
    await marketingAgentHandler(request({ ...brief(), destinationUrl: "https://www.thetok.ch/restaurateurs/alternative-commission-couvert", purpose: "acquisition" }), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(res.value().error.code).toBe("ai_auth_unavailable");
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/functions/v1/ai-marketing-agent"));
    const init = (call as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toMatchObject({ purpose: "acquisition", destinationUrl: "https://www.thetok.ch/restaurateurs/alternative-commission-couvert" });
  });
  it("rejects internal-only recruitment before contacting the generator", async () => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock); const res = recorder();
    await marketingAgentHandler(request({ ...brief(), purpose: "acquisition", channels: ["in_app"] }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/functions/v1/"))).toBe(false);
  });
});


describe("generated campaign persistence gate", () => {
  it.each(["valid", "past", "audience", "count", "channel"])("validates the actual Edge bundle before a session-bound write: %s", async (scenario) => {
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const endsAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const targeting = { audience_kind: "restaurant", canton: "GE", contact_type: "restaurant_prospect" };
    const campaign = { name: "TOK Genève", objective: "Recruter", channels: ["facebook", "instagram"], starts_at: startsAt, ends_at: endsAt, audience_name: "Restaurants GE", audience_definition: targeting, content: { summary: "Comparer puis demander une démonstration." } };
    const items = campaign.channels.map((channel, index) => ({ title: `Comparaison ${index}`, channel, scheduled_at: startsAt, audience_name: "Restaurants GE", targeting: { ...targeting }, content: { subject: null, headline: `TOK ${index}`, body: `Comparez vos commissions ${index}.`, call_to_action: "Demander une démonstration", hashtags: [], visual_url: null } }));
    if (scenario === "past") items[0].scheduled_at = new Date(Date.now() - 86400000).toISOString();
    if (scenario === "audience") items[0].targeting.contact_type = "restaurant_lead";
    if (scenario === "count") items.pop();
    if (scenario === "channel") items[0].channel = "email";
    const base = upstream();
    const writes: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/functions/v1/ai-marketing-agent")) return json({ runId: "22222222-2222-4222-8222-222222222222", bundle: { campaign, items }, itemCount: 2, assetCount: 0, estimatedCostChf: 0.01 });
      if (url.endsWith("/rpc/service_execute_marketing_admin_operation")) {
        const args = JSON.parse(String(init?.body));
        if (args.p_operation === "admin_estimate_marketing_audience") return json({ estimated_at: new Date().toISOString(), channels: [{ channel: "facebook", delivery_mode: "public", eligible: 200 }] });
        writes.push(args);
        return json({ campaign: { id: "33333333-3333-4333-8333-333333333333", name: "TOK Genève" }, items: args.p_args.p_payload.items });
      }
      if (url.endsWith("/rpc/service_complete_marketing_ai_run")) return json({ ok: true });
      return base(input);
    });
    vi.stubGlobal("fetch", fetchMock); const res = recorder();
    await marketingAgentHandler(request({ action: "generate", objective: "Recruter", channels: ["facebook", "instagram"], startsAt, endsAt, itemCount: 2, purpose: "acquisition", destinationUrl: "https://www.thetok.ch/contact" }), res.response);
    expect(res.response.statusCode).toBe(scenario === "valid" ? 200 : 502);
    expect(writes).toHaveLength(scenario === "valid" ? 1 : 0);
    if (scenario === "valid") {
      expect(writes[0]).toMatchObject({ p_operation: "admin_create_marketing_campaign_bundle", p_sid_hash: expect.any(String), p_csrf_hash: expect.any(String) });
      expect(res.value().previews[0].content.call_to_action).toContain("https://www.thetok.ch/contact");
      expect(res.value().previews[0]).not.toHaveProperty("approval_status");
      expect(res.value().audienceEstimate.channels[0].eligibleContacts).toBeNull();
      expect(res.value().warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Instagram : visuel manquant/)]));
    } else {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_complete_marketing_ai_run"))).toBe(true);
    }
  });
});
