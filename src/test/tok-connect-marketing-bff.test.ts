import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MARKETING_CSRF_COOKIE, MARKETING_SESSION_COOKIE,
  marketingMcpHandler, marketingMcpLinkHandler, sha256Hex,
  type MarketingApiRequest, type MarketingApiResponse,
} from "../../server/marketingBff";

const userId = "11111111-1111-4111-8111-111111111111";
const clientId = "33333333-3333-4333-8333-333333333333";
const csrf = "c".repeat(43), sid = "s".repeat(43), code = "q".repeat(43);
const sessionHash = sha256Hex(sid), csrfHash = sha256Hex(csrf);
const readTool = "tok_marketing_get_overview";
const writeTool = "tok_marketing_set_global_pause";
const writeArgs = { args: { p_paused: true, p_reason: "Requested pause" }, confirmed_by_user: true, idempotency_key: "pause-2026-01" };
function token(claims: Record<string, unknown> = {}) {
  return `header.${Buffer.from(JSON.stringify({ sub: userId, client_id: clientId, session_id: "22222222-2222-4222-8222-222222222222", ...claims })).toString("base64url")}.signature`;
}
function nativeSession(overrides: Record<string, unknown> = {}) {
  return { user_id: userId, email: "admin@thetok.ch", expires_at: new Date(Date.now() + 60_000).toISOString(), session_hash: sessionHash, csrf_hash: csrfHash, ...overrides };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function recorder() {
  let body = "";
  const headers = new Map<string, string | readonly string[]>();
  const response: MarketingApiResponse = { statusCode: 0, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, end(value) { body = value || ""; } };
  return { response, headers, get body() { return body; }, get value() { return JSON.parse(body) as Record<string, unknown>; } };
}
function mcpRequest(tool = readTool, args: Record<string, unknown> = { args: {} }): MarketingApiRequest {
  return { method: "POST", headers: { host: "marketing.thetok.ch", authorization: `Bearer ${token()}`, "content-type": "application/json" }, body: { tool, arguments: args } };
}
function consentRequest(method: "GET" | "POST" = "POST"): MarketingApiRequest {
  return { method, url: `/api/marketing/mcp-link?code=${code}`, headers: {
    host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch", "sec-fetch-site": "same-origin",
    "content-type": "application/json", cookie: `${MARKETING_SESSION_COOKIE}=${sid}; ${MARKETING_CSRF_COOKIE}=${csrf}`, "x-tok-marketing-csrf": csrf,
  }, ...(method === "POST" ? { body: { code } } : {}) };
}
type Call = { url: string; method: string; body: Record<string, unknown> };
type MockOptions = { admin?: boolean; rate?: boolean; linked?: unknown; session?: unknown; authorize?: unknown; authStatus?: number };
function mockBackend(options: MockOptions = {}, override?: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {} };
    calls.push(call);
    const custom = override?.(call); if (custom) return custom;
    if (call.url.endsWith("/auth/v1/user")) return json({ id: userId }, options.authStatus || 200);
    if (call.url.includes("/auth/v1/admin/users/")) return json({ id: userId, email: "admin@thetok.ch" });
    if (call.url.includes("/user_roles?")) return json(options.admin === false ? [] : [{ user_id: userId }]);
    if (call.url.endsWith("/rpc/rate_limit_consume")) return json(options.rate !== false);
    if (call.url.endsWith("/rpc/service_create_tok_marketing_link")) return json({ status: "pending", expires_at: new Date(Date.now() + 60_000).toISOString() });
    if (call.url.endsWith("/rpc/service_get_tok_marketing_link")) return json("linked" in options ? options.linked : nativeSession());
    if (call.url.endsWith("/rpc/service_get_marketing_web_session")) return json("session" in options ? options.session : nativeSession());
    if (call.url.endsWith("/rpc/service_describe_tok_marketing_link")) return json({ client_name: "Test <client>" });
    if (call.url.endsWith("/rpc/service_authorize_tok_marketing_link")) return json("authorize" in options ? options.authorize : { ok: true });
    if (call.url.endsWith("/rpc/service_revoke_tok_marketing_link")) return json(true);
    if (call.url.endsWith("/rpc/service_execute_marketing_admin_operation")) return json({ ok: true, marker: "native-result" });
    if (call.url.includes("/tok_connect_mcp_action_idempotency")) return json([]);
    throw new Error(`Unexpected backend request: ${call.method} ${call.url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, fetch, rpc: (name: string) => calls.filter((call) => call.url.endsWith(`/rpc/${name}`)) };
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-longer-than-twenty");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("TOK Connect marketing BFF bearer and native MFA boundary", () => {
  it("does not accept a browser cookie in place of OAuth bearer authentication", async () => {
    const backend = mockBackend(); const req = mcpRequest();
    delete req.headers.authorization; req.headers.cookie = consentRequest().headers.cookie;
    const out = recorder(); await marketingMcpHandler(req, out.response);
    expect(out.response.statusCode).toBe(401); expect(backend.fetch).not.toHaveBeenCalled();
  });
  it("verifies the exact token with Supabase before considering OAuth claims", async () => {
    const backend = mockBackend({ authStatus: 401 }); const out = recorder();
    await marketingMcpHandler(mcpRequest(), out.response);
    expect(out.response.statusCode).toBe(401); expect(backend.calls).toHaveLength(1);
  });
  it.each([{ client_id: null }, { sub: "33333333-3333-4333-8333-333333333333" }, { session_id: null }])("rejects verified non-OAuth or mismatched JWT claims: %j", async (claims) => {
    const backend = mockBackend(); const req = mcpRequest(); req.headers.authorization = `Bearer ${token(claims)}`;
    const out = recorder(); await marketingMcpHandler(req, out.response);
    expect(out.response.statusCode).toBe(403); expect(backend.rpc("service_get_tok_marketing_link")).toHaveLength(0);
  });
  it("refuses a removed administrator role before any marketing effect", async () => {
    const backend = mockBackend({ admin: false }); const out = recorder();
    await marketingMcpHandler(mcpRequest(writeTool, writeArgs), out.response);
    expect(out.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(backend.rpc("service_get_tok_marketing_link")).toHaveLength(0);
    expect(backend.rpc("service_execute_marketing_admin_operation")).toHaveLength(0);
  });
  it("enforces a per-user rate limit before creating a consent challenge", async () => {
    const backend = mockBackend({ rate: false }); const out = recorder();
    await marketingMcpHandler(mcpRequest("tok_marketing_connect", {}), out.response);
    expect(out.response.statusCode).toBe(429); expect(out.headers.get("retry-after")).toBe("60");
    expect(backend.rpc("rate_limit_consume")[0].body).toMatchObject({ p_subject: `user:${userId}`, p_max_requests: 60 });
    expect(backend.rpc("service_create_tok_marketing_link")).toHaveLength(0);
  });
  it("returns an opaque consent URL and persists only its challenge hash", async () => {
    const backend = mockBackend(); const out = recorder();
    await marketingMcpHandler(mcpRequest("tok_marketing_connect", {}), out.response);
    expect(out.response.statusCode).toBe(200);
    const url = new URL(String(out.value.authorization_url)); const challenge = url.searchParams.get("code")!;
    expect(url.origin).toBe("https://marketing.thetok.ch"); expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(backend.rpc("service_create_tok_marketing_link")[0].body).toEqual({ p_user_id: userId, p_client_id: clientId, p_challenge_hash: sha256Hex(challenge) });
    expect(out.body).not.toContain(sessionHash); expect(out.body).not.toContain(csrfHash); expect(out.body).not.toContain("service-role-key");
  });
  it("renders consent without authorizing on GET and escapes the client label", async () => {
    const backend = mockBackend(); const out = recorder();
    await marketingMcpLinkHandler(consentRequest("GET"), out.response);
    expect(out.response.statusCode).toBe(200); expect(out.body).toContain("Test &lt;client&gt;");
    expect(backend.rpc("service_authorize_tok_marketing_link")).toHaveLength(0);
    expect(backend.rpc("service_describe_tok_marketing_link")[0].body).toEqual({ p_challenge_hash: sha256Hex(code), p_user_id: userId });
    expect(out.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
  it("allows a cross-site document navigation from the MCP client to display consent only", async () => {
    const backend = mockBackend(); const req = consentRequest("GET");
    delete req.headers.origin;
    Object.assign(req.headers, { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" });
    const out = recorder(); await marketingMcpLinkHandler(req, out.response);
    expect(out.response.statusCode).toBe(200); expect(out.body).toContain('id="authorize"');
    expect(backend.rpc("service_authorize_tok_marketing_link")).toHaveLength(0);
  });
  it.each(["GET", "POST"])("refuses cross-site fetch requests for consent with method %s", async (method) => {
    const backend = mockBackend(); const req = consentRequest(method as "GET" | "POST");
    Object.assign(req.headers, { origin: "https://untrusted.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" });
    const out = recorder(); await marketingMcpLinkHandler(req, out.response);
    expect(out.response.statusCode).toBe(403); expect(backend.fetch).not.toHaveBeenCalled();
  });
  it("requires matching CSRF on the explicit consent POST", async () => {
    const backend = mockBackend(); const req = consentRequest(); delete req.headers["x-tok-marketing-csrf"];
    const out = recorder(); await marketingMcpLinkHandler(req, out.response);
    expect(out.response.statusCode).toBe(403); expect(backend.fetch).not.toHaveBeenCalled();
  });
  it.each([null, { ok: false }])("refuses consent when SQL rejects expiration or another account: %j", async (authorize) => {
    const backend = mockBackend({ authorize }); const out = recorder();
    await marketingMcpLinkHandler(consentRequest(), out.response);
    expect(out.response.statusCode).toBe(403);
    expect(backend.rpc("service_authorize_tok_marketing_link")[0].body).toEqual({ p_challenge_hash: sha256Hex(code), p_sid_hash: sessionHash, p_csrf_hash: csrfHash });
  });
  it("authorizes consent through the native cookie session, without returning its handles", async () => {
    const backend = mockBackend(); const out = recorder();
    await marketingMcpLinkHandler(consentRequest(), out.response);
    expect(out.response.statusCode).toBe(200); expect(out.value).toEqual({ ok: true });
    expect(backend.rpc("service_authorize_tok_marketing_link")).toHaveLength(1);
  });
  it.each([null, nativeSession({ expires_at: "2020-01-01T00:00:00Z" }), nativeSession({ user_id: "33333333-3333-4333-8333-333333333333" })])("refuses absent, expired or other-account marketing links", async (linked) => {
    const backend = mockBackend({ linked }); const out = recorder();
    await marketingMcpHandler(mcpRequest(), out.response);
    expect(out.response.statusCode).toBe(403); expect(backend.rpc("service_execute_marketing_admin_operation")).toHaveLength(0);
  });
  it("delegates reads through the native dispatcher and revalidates the marketing session", async () => {
    const backend = mockBackend(); const out = recorder();
    await marketingMcpHandler(mcpRequest(), out.response);
    expect(out.response.statusCode).toBe(200); expect(out.value).toEqual({ ok: true, marker: "native-result" });
    expect(backend.rpc("service_get_marketing_web_session")[0].body).toEqual({ p_sid_hash: sessionHash, p_csrf_hash: csrfHash, p_touch: true });
    expect(backend.rpc("service_execute_marketing_admin_operation")[0].body).toEqual({ p_sid_hash: sessionHash, p_csrf_hash: csrfHash, p_operation: "admin_get_marketing_overview", p_args: {} });
    expect(backend.calls.some((call) => call.url.includes("tok_connect_mcp_action_idempotency"))).toBe(false);
    expect(out.body).not.toContain(sessionHash);
  });
  it("stops a revoked native session even if the link lookup returned an active session", async () => {
    const backend = mockBackend({ session: null }); const out = recorder();
    await marketingMcpHandler(mcpRequest(), out.response);
    expect(out.response.statusCode).toBe(401); expect(backend.rpc("service_execute_marketing_admin_operation")).toHaveLength(0);
  });
  it.each([{ args: writeArgs.args, idempotency_key: writeArgs.idempotency_key }, { args: writeArgs.args, confirmed_by_user: true }])("requires both confirmation and idempotency for mutation", async (args) => {
    const backend = mockBackend(); const out = recorder(); await marketingMcpHandler(mcpRequest(writeTool, args), out.response);
    expect(out.response.statusCode).toBe(400); expect(backend.rpc("service_execute_marketing_admin_operation")).toHaveLength(0);
    expect(backend.calls.some((call) => call.url.includes("tok_connect_mcp_action_idempotency"))).toBe(false);
  });
  it("executes a new intent once, saves its result and replays it without a second effect", async () => {
    let saved: Record<string, unknown> | undefined, executions = 0;
    const backend = mockBackend({}, (call) => {
      if (call.url.endsWith("/rpc/service_execute_marketing_admin_operation")) { executions++; return json({ ok: true, effect: executions }); }
      if (!call.url.includes("tok_connect_mcp_action_idempotency")) return undefined;
      if (call.method === "POST") { if (saved) return json({}, 409); saved = { ...call.body }; return json([]); }
      if (call.method === "PATCH") { Object.assign(saved!, call.body); return json([]); }
      return json([saved]);
    });
    const first = recorder(); await marketingMcpHandler(mcpRequest(writeTool, writeArgs), first.response);
    const replay = recorder(); await marketingMcpHandler(mcpRequest(writeTool, writeArgs), replay.response);
    expect(first.response.statusCode).toBe(200); expect(replay.response.statusCode).toBe(200);
    expect(replay.value).toEqual({ ok: true, effect: 1, replayed: true }); expect(executions).toBe(1);
    expect(saved?.idempotency_key).toBe(`mkt:${clientId}:${sha256Hex(writeArgs.idempotency_key)}`);
    expect(backend.rpc("service_get_tok_marketing_link")).toHaveLength(2);
  });
  it.each(["conflict", "in-progress"])("does not reexecute an idempotency %s", async (state) => {
    let claimed: Record<string, unknown> = {};
    const backend = mockBackend({}, (call) => {
      if (!call.url.includes("tok_connect_mcp_action_idempotency")) return undefined;
      if (call.method === "POST") { claimed = call.body; return json({}, 409); }
      return json([{ ...claimed, ...(state === "conflict" ? { request_hash: "f".repeat(64) } : {}), status_code: null, response_body: null }]);
    });
    const out = recorder(); await marketingMcpHandler(mcpRequest(writeTool, writeArgs), out.response);
    expect(out.response.statusCode).toBe(409);
    expect(out.value).toMatchObject({ error: { code: state === "conflict" ? "idempotency_conflict" : "result_unconfirmed" } });
    expect(backend.rpc("service_execute_marketing_admin_operation")).toHaveLength(0);
  });
  it("does not duplicate an effect when saving the first response fails", async () => {
    let saved: Record<string, unknown> | undefined, executions = 0;
    mockBackend({}, (call) => {
      if (call.url.endsWith("/rpc/service_execute_marketing_admin_operation")) { executions++; return json({ ok: true }); }
      if (!call.url.includes("tok_connect_mcp_action_idempotency")) return undefined;
      if (call.method === "POST") { if (saved) return json({}, 409); saved = { ...call.body }; return json([]); }
      if (call.method === "PATCH") return json({}, 503);
      return json([{ ...saved, status_code: null, response_body: null }]);
    });
    const first = recorder(); await marketingMcpHandler(mcpRequest(writeTool, writeArgs), first.response);
    expect(first.response.statusCode).toBe(503);
    const retry = recorder(); await marketingMcpHandler(mcpRequest(writeTool, writeArgs), retry.response);
    expect(retry.response.statusCode).toBe(409); expect(retry.value).toMatchObject({ error: { code: "result_unconfirmed" } });
    expect(executions).toBe(1);
  });
  it("checks link validity before returning a previous idempotent result", async () => {
    const backend = mockBackend({ linked: null }); const out = recorder();
    await marketingMcpHandler(mcpRequest(writeTool, writeArgs), out.response);
    expect(out.response.statusCode).toBe(403); expect(backend.calls.some((call) => call.url.includes("tok_connect_mcp_action_idempotency"))).toBe(false);
  });
  it.each([true, false])("returns connection state without exposing native handles: linked=%s", async (connected) => {
    mockBackend({ linked: connected ? nativeSession() : null }); const out = recorder();
    await marketingMcpHandler(mcpRequest("tok_marketing_connection_status", {}), out.response);
    expect(out.response.statusCode).toBe(200); expect(out.value.status).toBe(connected ? "connected" : "disconnected");
    expect(out.body).not.toContain(sessionHash); expect(out.body).not.toContain(csrfHash);
  });
  it("requires confirmation to revoke the exact user's client link", async () => {
    const backend = mockBackend(); const rejected = recorder();
    await marketingMcpHandler(mcpRequest("tok_marketing_disconnect", {}), rejected.response);
    expect(rejected.response.statusCode).toBe(400); expect(backend.rpc("service_revoke_tok_marketing_link")).toHaveLength(0);
    const accepted = recorder(); await marketingMcpHandler(mcpRequest("tok_marketing_disconnect", { confirmed_by_user: true }), accepted.response);
    expect(accepted.response.statusCode).toBe(200);
    expect(backend.rpc("service_revoke_tok_marketing_link")[0].body).toEqual({ p_user_id: userId, p_client_id: clientId });
  });
});

describe("marketing delegated link SQL privilege contract", () => {
  it("keeps all five link RPCs service-only and binds consent to the same native user and OAuth grant revision", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261020211506_tok_connect_marketing_native_links.sql"), "utf8");
    const functions = ["create", "describe", "authorize", "get", "revoke"].map((verb) => `service_${verb}_tok_marketing_link`);
    for (const name of functions) expect(sql).toContain(`CREATE FUNCTION public.${name}(`);
    expect(sql.match(/PERFORM public\.marketing_require_service_role\(\)/g)).toHaveLength(5);
    expect(sql).toContain("FROM PUBLIC, anon, authenticated"); expect(sql).toContain("TO service_role;");
    expect(sql).toContain("ALTER TABLE tok_connect_private.marketing_links ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("(v_session->>'user_id')::uuid IS DISTINCT FROM v_link.user_id");
    expect(sql).toContain("g.revision = v_link.grant_revision");
    expect(sql).toContain("g.revoked_at IS NULL AND g.expires_at > clock_timestamp()");
    expect(sql).toContain("l.challenge_expires_at > clock_timestamp()");
    expect(sql).toContain("challenge_hash = NULL, challenge_expires_at = NULL");
  });
});
