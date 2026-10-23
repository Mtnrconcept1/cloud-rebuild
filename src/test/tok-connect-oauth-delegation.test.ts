// @vitest-environment node
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { TOK_ROLE_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-role-operations";
import { TOK_CUSTOMER_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-customer-operations";
import { tokOAuthScopeForTool } from "../../supabase/functions/_shared/tok-connect-oauth-policy";
type Row = Record<string, any>;
const USER = "11111111-1111-4111-8111-111111111111", RESTAURANT = "22222222-2222-4222-8222-222222222222", OTHER_RESTAURANT = "33333333-3333-4333-8333-333333333333";
const CLIENT = "44444444-4444-4444-8444-444444444444", OPAQUE = "tok_oa_" + "1".repeat(64);
const PROJECT = "https://synthetic-project.example";
const claims = { sub: USER, client_id: CLIENT, session_id: "synthetic-oauth-session", exp: Math.floor(Date.now() / 1000) + 3600 };
const jwt = (data: Row) => "synthetic." + Buffer.from(JSON.stringify(data)).toString("base64url") + ".signature";
function harness(options: { scopes?: string[]; missing?: boolean; revoked?: boolean; expired?: boolean; badIdentity?: boolean; owner?: boolean; roles?: string[]; mintError?: boolean; legacy?: boolean; logError?: Row } = {}) {
  const raw = jwt(claims), native = jwt({ sub: USER, session_id: "native-session" });
  const grant = { id: "55555555-5555-4555-8555-555555555555", user_id: USER, client_id: CLIENT, client_name: "Synthetic app", scopes: options.scopes || ["account:read"], restaurant_ids: [RESTAURANT], revision: 1, expires_at: new Date(Date.now() + (options.expired ? -1000 : 60_000)).toISOString(), revoked_at: options.revoked ? new Date().toISOString() : null };
  const observed: Row[] = [], network = vi.fn(async (request: Request) => { observed.push({ url: request.url, method: request.method, headers: Object.fromEntries(request.headers), redirect: request.redirect, body: await request.clone().text() }); return Response.json({ ok: true }); });
  const auditFallback = vi.fn(), modules = new Map<string, { exports: Row }>();
  const authProvider = { getUser: vi.fn(async (token: string) => ({ data: { user: !options.badIdentity && [raw, native].includes(token) ? { id: USER, app_metadata: {} } : null }, error: options.badIdentity ? { message: "synthetic private failure" } : null })) };
  let denyMint = Boolean(options.mintError);
  const rpc = vi.fn(async (name: string, params: Row = {}) => {
    if (name === "get_launch_gate_state") return { data: { enabled: false }, error: null };
    if (name === "service_create_tok_connect_oauth_permit") return { data: !denyMint, error: denyMint ? { code: "42501" } : null };
    if (name === "service_resolve_tok_connect_broker_access") return { data: params.p_access_hash === await oauth.tokOAuthSha256(OPAQUE) ? { id: "broker-session", user_id: USER, client_id: CLIENT, supabase_access_ciphertext: await encryption.encryptTokBrokerSecret(raw, "session:broker-session:access") } : null, error: null };
    return { data: null, error: null };
  });
  const from = (table: string) => {
    const filters: Row = {};
    const result = (): Row => {
      if (table === "tok_connect_oauth_grants") return { data: options.missing ? null : grant, error: null };
      if (table === "user_roles") return { data: (options.roles || ["client", "restaurateur", "admin", "super_admin", "courier", "commercial"]).map((role) => ({ role })), error: null };
      if (table === "restaurants") return { data: options.owner === false || filters.id !== RESTAURANT ? null : { id: RESTAURANT, owner_id: USER, tok_connect_mcp_enabled: true }, error: null };
      if (table === "restaurant_staff") return { data: [], error: null };
      if (options.legacy && table === "tok_connect_access_tokens") return { data: { id: "legacy-token", partner_id: "legacy-partner", client_id: "legacy-client", scopes: ["restaurants:read"], environment: "production", expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null }, error: null };
      if (options.legacy && table === "tok_connect_clients") return { data: { id: "legacy-client", partner_id: "legacy-partner", status: "active", allowed_scopes: ["restaurants:read"], environment: "production" }, error: null };
      if (options.legacy && table === "tok_connect_partners") return { data: { id: "legacy-partner", status: "active", environment: "production" }, error: null };
      return { data: null, error: null };
    };
    const query: Row = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, contains: () => query, update: () => query, in: () => query,
      maybeSingle: async () => result(), insert: async () => ({ error: options.logError || null }), then: (resolve: (value: Row) => unknown) => Promise.resolve(resolve(result())) };
    return query;
  };
  const admin = { from, rpc, auth: authProvider };
  const createClient = (_url: string, key: string, settings: Row = {}) => key === "synthetic-service"
    ? admin : { from, rpc, auth: { getUser: () => authProvider.getUser(String(settings.global?.headers?.Authorization || "").slice(7)) } };
  const env = { SUPABASE_URL: PROJECT, SUPABASE_SERVICE_ROLE_KEY: "synthetic-service", SUPABASE_ANON_KEY: "synthetic-anon", TOK_CONNECT_BROKER_ENCRYPTION_KEY: "ab".repeat(32) };
  const deno = { env: { get: (name: string) => (env as Row)[name] } };
  const load = (file: string): Row => {
    const resolved = path.resolve(file); if (modules.has(resolved)) return modules.get(resolved)!.exports;
    const module = { exports: {} as Row }; modules.set(resolved, module);
    const compiled = ts.transpileModule(readFileSync(resolved, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const require = (specifier: string) => specifier.startsWith("https://") ? { createClient } : load(path.resolve(path.dirname(resolved), specifier));
    new Function("require", "module", "exports", "Deno", "crypto", "fetch", "console", compiled)(require, module, module.exports, deno, webcrypto, network, { error: auditFallback, log: vi.fn(), warn: vi.fn() });
    return module.exports;
  };
  const auth = load("supabase/functions/_shared/auth.ts"), oauth = load("supabase/functions/_shared/tok-connect-oauth.ts"), encryption = load("supabase/functions/_shared/tok-connect-broker-crypto.ts"), tokens = load("supabase/functions/_shared/tok-connect-auth.ts");
  const request = (endpoint = "tok-connect-app-bridge", token = OPAQUE, headers: Row = {}, body: Row = {}) => new Request(`${PROJECT}/functions/v1/${endpoint}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const actor = () => auth.authenticateRequest(request(), { allowTokConnectOAuthBridge: true });
  return { auth, oauth, tokens, raw, native, grant, rpc, admin, network, observed, auditFallback, request, actor, denyMint: () => { denyMint = true; } };
}
describe("TOK native OAuth delegation boundary", () => {
  it("maps every exposed role/customer operation explicitly and denies unknown or administrator tools", () => {
    for (const tool of [...TOK_ROLE_OPERATION_TOOLS, ...TOK_CUSTOMER_OPERATION_TOOLS]) expect(tokOAuthScopeForTool(tool.name), tool.name).toBeTruthy();
    for (const name of ["tok_data", "tok_invoke_rpc", "tok_invoke_capability", "tok_commercial", "tok_admin_list_users", "unknown"]) expect(tokOAuthScopeForTool(name)).toBeNull();
  });
  it("preserves native app sessions and explicit service identities", async () => {
    const h = harness(); const native = await h.auth.authenticateRequest(h.request("create-checkout", h.native)); expect(native.isAdmin).toBe(true); expect(native.tokConnectOAuth).toBeUndefined();
    const service = await h.auth.authenticateRequest(h.request("create-checkout", "synthetic-service"), { allowServiceRole: true }); expect(service.isServiceRole).toBe(true);
  });
  it.each(["create-checkout", "delete-account", "tok-connect-commercial-bridge", "tok-connect-portal"])("rejects OAuth direct ingress to %s", async (endpoint) => {
    const h = harness(); for (const token of [OPAQUE, h.raw]) await expect(h.auth.authenticateRequest(h.request(endpoint, token))).rejects.toMatchObject({ status: 403 });
  });
  it("refuses externally supplied native OAuth JWTs at both MCP and bridge", async () => {
    const h = harness(); await expect(h.tokens.authenticateTokConnectToken(h.request("tok-connect-mcp", h.raw))).rejects.toMatchObject({ status: 401 });
    await expect(h.auth.authenticateRequest(h.request("tok-connect-app-bridge", h.raw), { allowTokConnectOAuthBridge: true })).rejects.toMatchObject({ status: 403 });
  });
  it("cannot trust a forged permit header or the bridge opt-in on another function", async () => {
    const h = harness(); await expect(h.auth.authenticateRequest(h.request("delete-account", h.raw, { "x-tok-oauth-permit": "a".repeat(64) }), { allowTokConnectOAuthBridge: true })).rejects.toMatchObject({ status: 403 }); expect(h.network).not.toHaveBeenCalled();
  });
  it.each([{ missing: true }, { revoked: true }, { expired: true }])("requires a current explicit business grant %j", async (options) => { const h = harness(options); await expect(h.actor()).rejects.toMatchObject({ status: 403 }); });
  it("strips platform privileges and rejects generic execution even for an administrator", async () => {
    const h = harness(), actor = await h.actor(); expect(actor.isAdmin).toBe(false); expect(actor.roles).toEqual(["client", "restaurateur"]); expect(actor.tokConnectOAuth).toEqual({ clientId: CLIENT, grantId: h.grant.id, restaurantIds: [RESTAURANT] });
    for (const body of [{ mode: "data", table: "profiles" }, { mode: "rpc", rpc_name: "admin_list_users" }, { mode: "edge", action: "list" }]) await expect(h.oauth.authorizeTokOAuthBridge(actor, body)).rejects.toMatchObject({ status: 403 });
  });
  it("does not turn account read into a profile mutation or restaurant read", async () => {
    const h = harness(), actor = await h.actor(); await h.oauth.authorizeTokOAuthBridge(actor, { mode: "role_operation", operation: "tok_get_my_account", args: {} });
    for (const operation of ["tok_update_my_profile", "tok_list_restaurant_menu"]) await expect(h.oauth.authorizeTokOAuthBridge(actor, { mode: "role_operation", operation, args: { restaurant_id: RESTAURANT } })).rejects.toMatchObject({ status: 403 });
  });
  it.each([{ id: OTHER_RESTAURANT, owner: true }, { id: RESTAURANT, owner: false }])("checks selected restaurant and actual owner before issuing permits %j", async ({ id, owner }) => {
    const h = harness({ scopes: ["restaurant:read"], owner }), actor = await h.actor(); await expect(h.oauth.authorizeTokOAuthBridge(actor, { mode: "role_operation", operation: "tok_list_restaurant_menu", args: { restaurant_id: id } })).rejects.toMatchObject({ status: 403 }); expect(h.rpc.mock.calls.some(([name]) => name === "service_create_tok_connect_oauth_permit")).toBe(false);
  });
  it("cannot smuggle a native creation through the quote adapter", async () => {
    const h = harness({ scopes: ["reservations:create"] }), actor = await h.actor();
    await h.oauth.authorizeTokOAuthBridge(actor, { mode: "edge", capability: "reservations.classic.quote", method: "POST", payload: { action: "quote", party_size: 2 } });
    await expect(h.oauth.authorizeTokOAuthBridge(actor, { mode: "edge", capability: "reservations.classic.quote", method: "POST", payload: { action: "create", party_size: 2, feature: "classique" } })).rejects.toMatchObject({ status: 403 });
  });
  it("adds only a server-held permit to the original user JWT and preserves RLS transport", async () => {
    const h = harness(), actor = await h.actor(), transport = h.oauth.tokOAuthUserFetch(actor, PROJECT, h.network);
    await expect(transport(PROJECT + "/rest/v1/profiles", { headers: { authorization: "Bearer " + h.raw } })).rejects.toMatchObject({ status: 403 });
    await h.oauth.authorizeTokOAuthBridge(actor, { mode: "role_operation", operation: "tok_get_my_account", args: {} });
    await transport(PROJECT + "/rest/v1/profiles?select=first_name", { headers: { authorization: "Bearer " + h.raw, "x-tok-oauth-permit": "untrusted" } });
    expect(h.observed[0].headers.authorization).toBe("Bearer " + h.raw); expect(h.observed[0].headers["x-tok-oauth-permit"]).toMatch(/^[0-9a-f]{64}$/); expect(h.observed[0].redirect).toBe("error");
    expect(h.rpc.mock.calls.find(([name]) => name === "service_create_tok_connect_oauth_permit")?.[1]).toMatchObject({ p_scope: "account:read", p_operation: "tok_get_my_account", p_path: "/profiles", p_method: "GET", p_audience: "data" });
  });
  it("blocks Storage, foreign origins, Auth mutations and unrelated Edge capabilities", async () => {
    const h = harness(), actor = await h.actor(); await h.oauth.authorizeTokOAuthBridge(actor, { mode: "role_operation", operation: "tok_get_my_account", args: {} });
    const userFetch = h.oauth.tokOAuthUserFetch(actor, PROJECT, h.network);
    for (const url of [PROJECT + "/storage/v1/object/private/key", "https://other.example/rest/v1/profiles"]) await expect(userFetch(url)).rejects.toMatchObject({ status: 403 });
    await expect(userFetch(PROJECT + "/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: "synthetic" }) })).rejects.toMatchObject({ status: 403 });
    await expect(h.oauth.tokOAuthEdgeFetch(actor, PROJECT + "/functions/v1/delete-account", { method: "POST" })).rejects.toMatchObject({ status: 403 }); expect(h.network).not.toHaveBeenCalled();
  });
  it("replaces the opaque bearer only on a permitted native Edge request and binds its body", async () => {
    const h = harness({ scopes: ["reservations:create"] }), actor = await h.actor(); await h.oauth.authorizeTokOAuthBridge(actor, { mode: "edge", capability: "reservations.classic.quote", payload: { action: "quote", party_size: 2 } });
    await h.oauth.tokOAuthEdgeFetch(actor, PROJECT + "/functions/v1/create-reservation", { method: "POST", headers: { authorization: "Bearer " + OPAQUE, "x-tok-oauth-permit": "forged" }, body: '{"action":"quote","party_size":2}' });
    expect(h.observed[0].headers.authorization).toBe("Bearer " + h.raw); expect(h.observed[0].headers["x-tok-oauth-permit"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h.rpc.mock.calls.find(([name]) => name === "service_create_tok_connect_oauth_permit")?.[1]).toMatchObject({ p_audience: "edge", p_path: "/create-reservation", p_body_hash: await h.oauth.tokOAuthSha256('{"action":"quote","party_size":2}') });
  });
  it("fails closed when a grant changes between authorization and actual native request", async () => {
    const h = harness(), actor = await h.actor(); await h.oauth.authorizeTokOAuthBridge(actor, { mode: "role_operation", operation: "tok_get_my_account", args: {} }); h.denyMint();
    await expect(h.oauth.tokOAuthUserFetch(actor, PROJECT, h.network)(PROJECT + "/rest/v1/profiles", { headers: { authorization: "Bearer " + h.raw } })).rejects.toMatchObject({ status: 403 }); expect(h.network).not.toHaveBeenCalled();
  });
  it("retains verified audit identity before scope refusal without trusting invalid identity", async () => {
    const h = harness(), callback = vi.fn(); await expect(h.tokens.authenticateTokConnectToken(h.request("tok-connect-mcp"), ["account:write"], { onAuthenticated: callback })).rejects.toMatchObject({ status: 403 });
    expect(callback).toHaveBeenCalledOnce(); expect(callback.mock.calls[0][0]).toMatchObject({ userId: USER, oauthClientId: CLIENT, authMode: "supabase_oauth", scopes: ["account:read"] });
    const invalid = harness({ badIdentity: true }), never = vi.fn(); await expect(invalid.tokens.authenticateTokConnectToken(invalid.request("tok-connect-mcp"), [], { onAuthenticated: never })).rejects.toMatchObject({ status: 401 }); expect(never).not.toHaveBeenCalled();
  });
  it("preserves explicitly bounded legacy client-credentials tokens", async () => {
    const h = harness({ legacy: true }); const context = await h.tokens.authenticateTokConnectToken(h.request("tok-connect-api", "synthetic-partner-token"), ["restaurants:read"]); expect(context).toMatchObject({ authMode: "legacy_partner_token", scopes: ["restaurants:read"] });
    await expect(h.tokens.authenticateTokConnectToken(h.request("tok-connect-api", "synthetic-partner-token"), ["restaurant:write"])).rejects.toMatchObject({ status: 403 });
  });
  it("emits a sanitized fallback when the audit SDK returns an error without throwing", async () => {
    const h = harness({ logError: { code: "42501", message: "synthetic sensitive payload " + OPAQUE } });
    await h.tokens.recordTokConnectApiRequest({ context: null, request: h.request(), requestId: "synthetic-request", route: "POST /mcp", statusCode: 403, startedAt: Date.now() });
    expect(h.auditFallback).toHaveBeenCalledWith("[tok-connect] audit_write_failed", { event: "audit_write_failed", function_name: "tok-connect", code: "42501" }); expect(JSON.stringify(h.auditFallback.mock.calls)).not.toContain(OPAQUE);
  });
});
