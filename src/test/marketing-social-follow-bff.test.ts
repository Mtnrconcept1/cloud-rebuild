import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketingSocialFollowHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const restaurant = "22222222-2222-4222-8222-222222222222";
const sid = "s".repeat(43);
const csrf = "c".repeat(43);
const edgePath = "/functions/v1/marketing-social-follow";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

function request(body: Record<string, unknown> = { action: "list" }): MarketingApiRequest {
  return {
    method: "POST", body,
    headers: {
      host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch",
      "sec-fetch-site": "same-origin", "content-type": "application/json",
      cookie: `__Host-tok_marketing_sid=${sid}; __Host-tok_marketing_csrf=${csrf}`,
      "x-tok-marketing-csrf": csrf,
    },
  };
}

function recorder() {
  let body = "";
  const response: MarketingApiResponse = {
    statusCode: 0, setHeader: vi.fn(), end: (value) => { body = value || ""; },
  };
  return { response, value: () => JSON.parse(body), body: () => body };
}

function upstream(options: {
  session?: boolean;
  role?: boolean;
  edge?: (init?: RequestInit) => Response | Promise<Response>;
} = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) {
      return json(options.session === false ? null : {
        user_id: actor, email: "admin@example.org",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      });
    }
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(options.role === false ? [] : [{ user_id: actor }]);
    if (url.endsWith(edgePath)) return options.edge ? options.edge(init) : json({ items: [], total: 0 });
    throw new Error("Unexpected test upstream route");
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("restaurant social follow BFF", () => {
  it("checks the live admin session and forwards only the closed request and hashed session proofs", async () => {
    const fetchMock = upstream();
    vi.stubGlobal("fetch", fetchMock);
    const req = request({ action: "list", query: "  Genève  " });
    req.headers.authorization = "Bearer browser-selected-token";
    req.headers["x-marketing-actor-user-id"] = restaurant;
    const res = recorder();
    await marketingSocialFollowHandler(req, res.response);

    expect(res.response.statusCode).toBe(200);
    expect(res.value()).toEqual({ items: [], total: 0 });
    const edgeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith(edgePath));
    expect(edgeCall).toBeDefined();
    const init = edgeCall![1]!;
    expect(JSON.parse(String(init.body))).toEqual({
      request: { action: "list", query: "Genève", platform: "all", status: "all", limit: 20, offset: 0 },
      sessionHash: sha256(sid), csrfHash: sha256(csrf),
    });
    const headers = new Headers(init.headers);
    expect(headers.get("apikey")).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("x-marketing-actor-user-id")).toBeNull();
    expect(init.redirect).toBe("error");
    expect(String(init.body)).not.toContain(sid);
    expect(String(init.body)).not.toContain(csrf);
    const roleIndex = fetchMock.mock.calls.findIndex(([url]) => String(url).includes("/user_roles?"));
    expect(roleIndex).toBeGreaterThanOrEqual(0);
    expect(roleIndex).toBeLessThan(fetchMock.mock.calls.indexOf(edgeCall!));
    expect(res.response.setHeader).toHaveBeenCalledWith("Cache-Control", expect.stringContaining("no-store"));
  });

  it("supports a legacy service JWT without using the browser authorization header", async () => {
    const legacy = "legacy-service-key-longer-than-twenty";
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", legacy);
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingSocialFollowHandler(request(), res.response);
    const init = fetchMock.mock.calls.find(([url]) => String(url).endsWith(edgePath))![1]!;
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${legacy}`);
  });

  it.each([
    { description: "wrong method", update: (req: MarketingApiRequest) => { req.method = "GET"; }, status: 405 },
    { description: "wrong host", update: (req: MarketingApiRequest) => { req.headers.host = "thetok.ch"; }, status: 403 },
    { description: "cross-site origin", update: (req: MarketingApiRequest) => { req.headers.origin = "https://outside.example"; }, status: 403 },
    { description: "missing CSRF", update: (req: MarketingApiRequest) => { delete req.headers["x-tok-marketing-csrf"]; }, status: 403 },
  ])("blocks $description before contacting the service", async ({ update, status }) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const req = request(); update(req);
    const res = recorder(); await marketingSocialFollowHandler(req, res.response);
    expect(res.response.statusCode).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { action: "follow", profileId: restaurant },
    { action: "collect", website: "https://internal.example" },
    { action: "collect", limit: 4 },
    { action: "list", sessionHash: "a".repeat(64) },
    { action: "list", actorUserId: actor },
    { action: "record", profileId: restaurant, followStatus: "followed", verificationStatus: "verified",
      expectedVersion: 0, expectedSourceAccountId: "17841447348180505", confirmedWithTokAccount: false },
  ])("rejects unsupported actions, caller proofs and incomplete confirmations: %o", async (body) => {
    const fetchMock = upstream(); vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingSocialFollowHandler(request(body), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(res.value().error.code).toBe("social_follow_invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ session: false }, { role: false }])("never collects or records after a failed identity gate: %o", async (options) => {
    const fetchMock = upstream(options); vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingSocialFollowHandler(request({ action: "collect" }), res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith(edgePath))).toBe(false);
  });

  it("lets collection use its persistent lease budget instead of the five-login-attempt quota", async () => {
    const fetchMock = upstream({ edge: () => json({ processed: 3, hasMore: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder(); await marketingSocialFollowHandler(request({ action: "collect" }), res.response);
    expect(res.response.statusCode).toBe(200);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_consume_marketing_auth_attempt"))).toBe(false);
    const init = fetchMock.mock.calls.find(([url]) => String(url).endsWith(edgePath))![1]!;
    expect(JSON.parse(String(init.body)).request).toEqual({ action: "collect", limit: 3, restaurantId: null });
  });

  it.each([
    { status: 401, code: "authentication_required" },
    { status: 409, code: "social_follow_conflict" },
    { status: 409, code: "social_follow_account_changed" },
    { status: 400, code: "social_follow_invalid_profile" },
  ])("preserves the actionable $code error while discarding upstream details", async ({ status, code }) => {
    vi.stubGlobal("fetch", upstream({ edge: () => json({ error: { code, message: "private SQL provider-token" }, secret: "private-key" }, status) }));
    const res = recorder(); await marketingSocialFollowHandler(request(), res.response);
    expect(res.response.statusCode).toBe(status);
    expect(res.value().error.code).toBe(code);
    expect(res.body()).not.toMatch(/private|SQL|provider-token/);
  });

  it.each([120, 691_200])("preserves a durable collection retry time of %i seconds without shortening it", async (retryAfterSeconds) => {
    vi.stubGlobal("fetch", upstream({ edge: () => json({ error: { code: "social_follow_collection_busy", retryAfterSeconds } }, 429) }));
    const res = recorder(); await marketingSocialFollowHandler(request({ action: "collect" }), res.response);
    expect(res.response.statusCode).toBe(429);
    expect(res.response.setHeader).toHaveBeenCalledWith("Retry-After", String(retryAfterSeconds));
  });

  it.each([
    { body: { error: { code: "invalid_service_key", message: "private-key" } }, status: 401 },
    { body: { error: { code: "social_follow_conflict", message: "private SQL" } }, status: 500 },
    { body: null, status: 200 },
    { body: { error: { code: "internal_error" } }, status: 200 },
  ])("fails closed on an untrusted or malformed upstream response: %o", async ({ body, status }) => {
    vi.stubGlobal("fetch", upstream({ edge: () => json(body, status) }));
    const res = recorder(); await marketingSocialFollowHandler(request(), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(res.value()).toEqual({ error: { code: "service_unavailable", message: "Service indisponible." } });
    expect(res.response.setHeader).not.toHaveBeenCalledWith("Set-Cookie", expect.anything());
  });

  it("ends a stalled collection at the bounded timeout without reporting any work as confirmed", async () => {
    vi.useFakeTimers();
    const fetchMock = upstream({ edge: (init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    const pending = marketingSocialFollowHandler(request({ action: "collect" }), res.response);
    await vi.advanceTimersByTimeAsync(55_000);
    await pending;
    expect(res.response.statusCode).toBe(503);
    expect(res.value().error.code).toBe("service_unavailable");
    const init = fetchMock.mock.calls.find(([url]) => String(url).endsWith(edgePath))![1]!;
    expect(init.signal!.aborted).toBe(true);
    expect(res.value()).not.toHaveProperty("processed");
  });
});
