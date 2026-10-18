import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingRpcHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const csrf = "c".repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function request(operation = "admin_approve_marketing_item"): MarketingApiRequest {
  return { method: "POST", body: { operation, args: {
    [operation === "admin_approve_marketing_campaign" ? "p_campaign_id" : "p_item_id"]: itemId,
    p_reason: "Reviewed content",
  } }, headers: { host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch",
    "sec-fetch-site": "same-origin", "content-type": "application/json",
    cookie: `__Host-tok_marketing_sid=${"s".repeat(43)}; __Host-tok_marketing_csrf=${csrf}`,
    "x-tok-marketing-csrf": csrf } };
}
function recorder() {
  let body = "";
  const response: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: (value) => { body = value || ""; } };
  return { response, value: () => JSON.parse(body) };
}
function upstream(pages: unknown[], role = true) {
  let page = 0;
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json({ user_id: actor,
      email: "admin@example.org", expires_at: new Date(Date.now() + 600000).toISOString() });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(role ? [{ user_id: actor }] : []);
    if (url.includes("/marketing_calendar_items?")) return json(pages[page++]);
    if (url.endsWith("/rpc/service_execute_marketing_admin_operation")) return json({ approval_status: "approved" });
    throw new Error("Unexpected test upstream");
  });
}
const incomplete = { id: itemId, channel: "facebook", visual_url: null, visual_status: "pending_generation" };
const ready = { ...incomplete, visual_url: "https://cdn.example.com/tok.jpg", visual_status: "ready" };
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("approval checks the stored social image after authentication", () => {
  it.each(["visual_format", "format"])("allows campaign review but blocks automatic approval of a manual Story export (%s)", async (field) => {
    const story = { ...ready, channel: "instagram", [field]: "9:16" };
    const fetchMock = upstream([[story], [story]]); vi.stubGlobal("fetch", fetchMock);
    const campaign = recorder(); await marketingRpcHandler(request("admin_approve_marketing_campaign"), campaign.response);
    expect(campaign.response.statusCode).toBe(200);
    const item = recorder(); await marketingRpcHandler(request(), item.response);
    expect(item.response.statusCode).toBe(400);
    expect(item.value().error.code).toBe("instagram_story_manual_required");
    expect(item.value().error.message).toMatch(/Story manuelle/);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("service_execute_marketing_admin_operation"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => decodeURIComponent(String(url)).includes("visual_format:content->>visual_format"))).toBe(true);
  });
  it.each(["admin_approve_marketing_campaign", "admin_approve_marketing_item"])("refuses %s for an incomplete visual", async (operation) => {
    const fetchMock = upstream([[incomplete]]); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingRpcHandler(request(operation), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(res.value().error.code).toBe("marketing_visual_required");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_execute_marketing_admin_operation"))).toBe(false);
  });
  it("allows a ready image through the existing authenticated SQL dispatcher", async () => {
    const fetchMock = upstream([[ready]]); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(200);
    const paths = fetchMock.mock.calls.map(([url]) => String(url));
    expect(paths.findIndex((url) => url.includes("/user_roles?"))).toBeLessThan(paths.findIndex((url) => url.includes("/marketing_calendar_items?")));
    expect(paths.some((url) => url.includes("/marketing_calendar_items?") && url.includes("limit=100"))).toBe(true);
  });
  it("preserves intentionally text-only legacy Facebook posts", async () => {
    vi.stubGlobal("fetch", upstream([[{ id: itemId, channel: "facebook" }]]));
    const res = recorder(); await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(200);
  });
  it.each(["admin_approve_marketing_campaign", "admin_approve_marketing_item"])("blocks %s for a mailing without a ready banner", async (operation) => {
    const content = { mailing_version: "tok-mailing-v1", subject: "Objet", headline: "Titre", body: "Texte", call_to_action: "Voir TOK", visual_url: null, visual_status: "pending_generation" };
    const fetchMock = upstream([[{ id: itemId, channel: "email", content }]]); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingRpcHandler(request(operation), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(res.value().error.code).toBe("marketing_visual_required");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_execute_marketing_admin_operation"))).toBe(false);
  });
  it.each([
    { body: "Courrier historique" },
    { mailing_version: "tok-mailing-v1", subject: "Objet", headline: "Titre", body: "Texte", call_to_action: "Voir TOK", visual_url: "https://example.org/banner.jpg", visual_status: "ready" },
  ])("preserves reviewed and legacy email approval: %o", async (content) => {
    vi.stubGlobal("fetch", upstream([[{ id: itemId, channel: "email", content }]]));
    const res = recorder(); await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(200);
  });
  it("checks subsequent pages and refuses an incomplete campaign item beyond the first hundred", async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ ...ready, id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}` }));
    const fetchMock = upstream([page, [incomplete]]); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingRpcHandler(request("admin_approve_marketing_campaign"), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/marketing_calendar_items?"))).toHaveLength(2);
  });
  it("fails closed on a malformed readiness response", async () => {
    const fetchMock = upstream([{ unexpected: true }]); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_execute_marketing_admin_operation"))).toBe(false);
  });
  it("does not read content or approve when the administrator role is missing", async () => {
    const fetchMock = upstream([[ready]], false); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingRpcHandler(request(), res.response);
    // Existing BFF deliberately hides downstream role-check details.
    expect(res.response.statusCode).toBe(503);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/marketing_calendar_items?"))).toBe(false);
  });
  it("does not read content or approve without CSRF", async () => {
    const fetchMock = upstream([[ready]]); vi.stubGlobal("fetch", fetchMock);
    const req = request(); delete req.headers["x-tok-marketing-csrf"];
    const res = recorder(); await marketingRpcHandler(req, res.response);
    expect(res.response.statusCode).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
});
