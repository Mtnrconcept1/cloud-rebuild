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
  it.each([true,false])("reads partner HTML only after a checked domain is authorized (%s)",async allowed=>{
    const base=upstream(); const mock=vi.fn(async(input:string|URL|Request)=>{
      if(String(input).endsWith("/rpc/service_execute_marketing_outreach_operation")) return json({targets:allowed ? [{domain:"partner.example",status:"allowlisted",robots_checked_at:"2026-10-23",terms_checked_at:"2026-10-23"}] : []});
      return base(input);
    });
    vi.stubGlobal("fetch",mock);const res=recorder();
    await marketingAgentHandler(request({action:"read_backlink_page",source:"https://partner.example/story"}),res.response);
    expect(res.response.statusCode).toBe(allowed ? 200 : 403);
    expect(mock.mock.calls.some(([url])=>String(url).includes("/functions/v1/"))).toBe(allowed);
  });
  const mailingRequest = () => ({ action: "generate", objective: "Quatre e-mails pour les pizzerias", channels: ["email"],
    startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 29 * 86400000).toISOString(), itemCount: 4,
    mailingOptions: { selections: { city: ["Genève"], category: ["Pizzeria"] }, emailCount: 4, cadence: "weekly" } });
  it.each([
    { emailCount: 13 }, { cadence: "hourly" }, { selections: { city: [] } }, { selections: { has_consent: ["true"] } },
  ])("rejects invalid mailing choices before paid generation: %o", async (patch) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const body = mailingRequest(); const res = recorder();
    await marketingAgentHandler(request({ ...body, mailingOptions: { ...body.mailingOptions, ...patch } }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/functions/v1/"))).toBe(true);
  });
  it("binds persisted targeting and weekly dates to the reviewed operator choices", async () => {
    const base = upstream();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/functions/v1/ai-marketing-agent")) return json({ bundle: { campaign: { audience_definition: { audience_kind: "mixed" } }, items: Array.from({ length: 4 }, () => ({ channel: "email", targeting: { audience_kind: "mixed" }, scheduled_at: "1999-01-01", content: { mailing_version: "tok-mailing-v1" } })) } });
      if (url.endsWith("/rpc/service_execute_marketing_admin_operation")) return json({ campaign: { id: actor }, items: [] });
      return base(input);
    });
    vi.stubGlobal("fetch", fetchMock); const body = mailingRequest(); const res = recorder();
    await marketingAgentHandler(request(body), res.response);
    expect(res.response.statusCode).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("service_execute_marketing_admin_operation"));
    const payload = JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).p_args.p_payload;
    expect(payload.campaign.audience_definition).toEqual({ audience_kind: "restaurant", selections: body.mailingOptions.selections });
    expect(payload.items.every((item: { targeting: unknown }) => JSON.stringify(item.targeting) === JSON.stringify(payload.campaign.audience_definition))).toBe(true);
    expect(payload.items[0].scheduled_at).toBe(body.startsAt);
  });
  it.each(["mailing_facets", "interpret_mailing"].flatMap((action) => ["session", "role", "csrf"].map((gate) => ({ action, gate }))))("keeps mailing actions behind their security gates: %o", async ({ action, gate }) => {
    const fetchMock = upstream(gate === "csrf" ? {} : { [gate]: false }); vi.stubGlobal("fetch", fetchMock);
    const req = request(action === "mailing_facets" ? { action, field: "city" } : { action, prompt: "Pizzerias Genève" });
    if (gate === "csrf") delete req.headers["x-tok-marketing-csrf"];
    const res = recorder(); await marketingAgentHandler(req, res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_marketing_mailing_facets") || String(url).includes("functions/v1"))).toBe(false);
  });
  it("bounds facet requests and never exposes arbitrary contact fields", async () => {
    const base = upstream(); const fetchMock = vi.fn(async (input: string | URL | Request) => String(input).endsWith("/rpc/service_marketing_mailing_facets") ? json({ items: [{ value: "Genève", count: 3 }], next: null }) : base(input));
    vi.stubGlobal("fetch", fetchMock); const res = recorder();
    await marketingAgentHandler(request({ action: "mailing_facets", field: "city" }), res.response);
    expect(res.response.statusCode).toBe(200); expect(res.value().items[0].value).toBe("Genève");
    const rejected = recorder(); await marketingAgentHandler(request({ action: "mailing_facets", field: "email" }), rejected.response);
    expect(rejected.response.statusCode).toBe(400);
  });
  it.each([{ query: 1 }, { query: "x".repeat(101) }, { after: {} }, { after: "x".repeat(241) }])("rejects malformed facet cursors and searches: %o", async (patch) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingAgentHandler(request({ action: "mailing_facets", field: "city", ...patch }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_marketing_mailing_facets"))).toBe(false);
  });
  it("enforces the interpretation quota before contacting the AI provider", async () => {
    const fetchMock = upstream({ quota: false }); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingAgentHandler(request({ action: "interpret_mailing", prompt: "Pizzerias Genève" }), res.response);
    expect(res.response.statusCode).toBe(429);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("functions/v1"))).toBe(false);
  });
  const campaignOptions = { templateIds: ["zero_attente"], postCount: 2, cadence: "daily", formatsByChannel: { instagram: ["1:1"] } };
  const guidedRequest = () => ({ action: "generate", objective: "Faire découvrir les fonctionnalités TOK", audienceHint: "", channels: ["instagram"],
    startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 4 * 86400000).toISOString(), itemCount: 2, campaignOptions });

  it.each([
    { ...campaignOptions, postCount: 1.5 }, { ...campaignOptions, postCount: 12 },
    { ...campaignOptions, templateIds: ["unknown"] }, { ...campaignOptions, formatsByChannel: { instagram: ["20:1"] } },
    { ...campaignOptions, formatsByChannel: { facebook: ["1:1"] } }, { ...campaignOptions, approved: true },
  ])("rejects unsafe guided options before generation: %o", async (options) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingAgentHandler(request({ ...guidedRequest(), campaignOptions: options }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/functions/v1/"))).toBe(true);
  });

  it.each([
    { instagram: "4:3" },
    { unknown: "1:1" },
    "1:1",
  ])("rejects an unsupported network format before image generation: %o", async (formats) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingAgentHandler(request({
      action: "generate",
      objective: "Promouvoir les offres anti-gaspi confirmées à Genève.",
      audienceHint: "Clients à Genève",
      channels: ["instagram"],
      formats,
      startsAt: "2026-10-14T07:00:00.000Z",
      endsAt: "2026-10-20T16:00:00.000Z",
      itemCount: 3,
    }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/functions/v1/"))).toBe(true);
  });

  it.each([
    { guided: true, formats: undefined },
    { guided: false, formats: { instagram: "9:16" } },
    { guided: true, formats: { instagram: "9:16" } },
  ])("forwards validated templates and/or network formats and saves draft visuals: %o", async ({ guided, formats }) => {
    const base = upstream();
    const content = { body: "Bonjour", visual_url: "https://example.org/visual.png" };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/functions/v1/ai-marketing-agent")) return json({ bundle: { campaign: { status: "draft" }, items: [{ content }] }, missingVisualCount: 1 });
      if (url.endsWith("/rpc/service_execute_marketing_admin_operation")) return json({ campaign: { id: actor }, items: [{ id: actor, content }] });
      return base(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    const { campaignOptions: guidedOptions, ...baseRequest } = guidedRequest();
    await marketingAgentHandler(request({ ...baseRequest, ...(guided ? { campaignOptions: guidedOptions } : {}), ...(formats ? { formats } : {}) }), res.response);
    expect(res.response.statusCode).toBe(200);
    expect(res.value().items[0].content).toEqual(content);
    expect(res.value().warnings[0]).toMatch(/attendent encore leur visuel/);
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/functions/v1/"));
    const forwarded = JSON.parse(String((call as unknown as [string, RequestInit])[1].body));
    expect(forwarded.campaignOptions).toEqual(guided ? campaignOptions : undefined);
    expect(forwarded.formats).toEqual(formats ?? {});
  });

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
