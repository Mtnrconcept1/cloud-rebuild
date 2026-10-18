import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTokConnectBroker, resolveTokConnectBrokerAccess, tokBrokerChallenge, tokBrokerHash, TOK_BROKER_ISSUER, TOK_BROKER_RESOURCE, type TokBrokerDependencies } from "../../supabase/functions/_shared/tok-connect-broker";
import { decryptTokBrokerSecret, encryptTokBrokerSecret } from "../../supabase/functions/_shared/tok-connect-broker-crypto";
type Row = Record<string, any>;
const CLIENT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const USER = "cccccccc-3333-4333-8333-cccccccccccc", CALLBACK = "https://client.example/callback";
const SECRET = "synthetic-confidential-client-secret", NATIVE_REFRESH = "synthetic-native-refresh-never-exported";
const ENV: Record<string, string> = { SUPABASE_URL: "https://project.example", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", SUPABASE_ANON_KEY: "synthetic-anon-key", TOK_CONNECT_BROKER_ENCRYPTION_KEY: "ab".repeat(32) };
const jwt = (claims: Row) => "synthetic." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".signature";
const codeBody = () => ({ client_id: CLIENT, grant_type: "authorization_code", code: "synthetic-code", redirect_uri: CALLBACK, code_verifier: "v".repeat(43), scope: "tok", resource: TOK_BROKER_RESOURCE });
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("Deno", { env: { get: (name: string) => ENV[name] } }); });
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const clients = new Map<string, Row>(), sessions = new Map<string, Row>(), spentRefreshes = new Map<string, { clientId: string; sessionId: string }>();
  let activeGrant = true, pkce = "s256", failure = false, upstreamError = false;
  let afterToken: (() => void) | undefined, verifiedUser = USER;
  let native = jwt({ sub: USER, client_id: CLIENT, session_id: "native-session", exp: Math.floor(Date.now() / 1000) + 3600 });
  const auth = { getUser: vi.fn(async (token: string) => ({ data: { user: token === native ? { id: verifiedUser } : null }, error: token === native ? null : { message: "invalid" } })) };
  const rpc = vi.fn(async (name: string, p: Row = {}) => {
    let data: unknown = null;
    if (name === "service_store_tok_connect_broker_client") { clients.set(p.p_client_id, { client_id: p.p_client_id, client_name: p.p_client_name, redirect_uris: p.p_redirect_uris, client_secret_ciphertext: p.p_client_secret_ciphertext }); data = true; }
    if (name === "service_get_tok_connect_broker_client") data = clients.get(p.p_client_id) || null;
    if (name === "service_verify_tok_connect_broker_authorization") data = pkce === "s256" && p.p_client_id === CLIENT && p.p_code_hash === await tokBrokerHash("synthetic-code") && p.p_redirect_uri === CALLBACK && p.p_code_challenge === await tokBrokerChallenge("v".repeat(43));
    if (name === "service_create_tok_connect_broker_session") {
      if (activeGrant) { sessions.set(p.p_id, { id: p.p_id, client_id: p.p_client_id, user_id: p.p_user_id, state: "active", ...p }); data = true; } else data = false;
    }
    if (name === "service_resolve_tok_connect_broker_access") {
      const row = [...sessions.values()].find((s) => s.p_access_hash === p.p_access_hash && s.state === "active" && Date.parse(s.p_access_expires_at) > Date.now());
      if (row) data = { id: row.id, client_id: row.client_id, user_id: row.user_id, supabase_access_ciphertext: row.p_supabase_access_ciphertext };
    }
    if (name === "service_claim_tok_connect_broker_refresh") {
      const spent = spentRefreshes.get(p.p_refresh_hash);
      if (spent?.clientId === p.p_client_id) { const row = sessions.get(spent.sessionId); if (row) { row.state = "revoked"; row.claim = null; } return { data: null, error: null }; }
      const row = [...sessions.values()].find((s) => s.p_refresh_hash === p.p_refresh_hash && s.client_id === p.p_client_id && s.state === "active" && activeGrant);
      if (row) { spentRefreshes.set(p.p_refresh_hash, { clientId: row.client_id, sessionId: row.id }); row.state = "refreshing"; row.claim = p.p_claim_id; data = { id: row.id, client_id: row.client_id, user_id: row.user_id, supabase_refresh_ciphertext: row.p_supabase_refresh_ciphertext }; }
    }
    if (name === "service_rotate_tok_connect_broker_refresh") {
      const row = sessions.get(p.p_id);
      if (row?.state === "refreshing" && row.claim === p.p_claim_id && activeGrant) { Object.assign(row, p, { state: "active", claim: null }); data = true; } else data = false;
    }
    if (name === "service_revoke_tok_connect_broker_session") { const row = sessions.get(p.p_id); if (row?.claim === p.p_claim_id) row.state = "revoked"; data = true; }
    return { data, error: null };
  });
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    expect(init?.redirect).toBe("error"); expect(init?.signal).toBeTruthy();
    if (url.endsWith("/admin/oauth/clients") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return Response.json({ client_id: CLIENT, client_type: "confidential", token_endpoint_auth_method: "client_secret_basic", client_secret: SECRET, redirect_uris: body.redirect_uris });
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    expect(url).toBe(ENV.SUPABASE_URL + "/auth/v1/oauth/token");
    expect(new Headers(init?.headers).get("authorization")).toBe("Basic " + btoa(CLIENT + ":" + SECRET));
    if (failure) throw new Error("network lost " + SECRET);
    if (upstreamError) return Response.json({ error: SECRET, refresh_token: NATIVE_REFRESH }, { status: 400 });
    afterToken?.();
    return Response.json({ access_token: native, refresh_token: NATIVE_REFRESH, expires_in: 3600, token_type: "bearer", id_token: "never-export-this", user: { email: "synthetic@example.test" } });
  });
  const consume = vi.fn(async () => {});
  const deps = { admin: { auth, rpc }, env: (name: string) => ENV[name], transport, consume } as unknown as TokBrokerDependencies;
  const run = (route: string, body?: Row, headers?: Record<string, string>) => handleTokConnectBroker(new Request("https://project.example/functions/v1/tok-connect-broker/" + route, { method: body ? "POST" : "GET", headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), deps);
  const register = async (body: Row = { redirect_uris: [CALLBACK], client_name: "Synthetic app", scope: "tok" }) => { const response = await run("register", body); expect(response.status).toBe(201); return response.json(); };
  const issue = async () => { await register(); const response = await run("token", codeBody()); expect(response.status).toBe(200); return response.json(); };
  return { deps, clients, sessions, auth, rpc, transport, consume, run, register, issue,
    revoke: () => { activeGrant = false; for (const row of sessions.values()) row.state = "revoked"; },
    noGrant: () => { activeGrant = false; }, plain: () => { pkce = "plain"; },
    setClaims: (claims: Row) => { native = jwt({ sub: USER, client_id: CLIENT, session_id: "native-session", exp: Math.floor(Date.now() / 1000) + 3600, ...claims }); },
    setUser: (id: string) => { verifiedUser = id; }, failProvider: () => { failure = true; }, providerError: () => { upstreamError = true; },
    onToken: (callback: () => void) => { afterToken = callback; }, native: () => native };
}
describe("TOK OAuth broker boundary", () => {
  it("creates a confidential upstream client while returning public metadata without credentials", async () => {
    const h = harness(), result = await h.register();
    expect(result).toMatchObject({ client_id: CLIENT, token_endpoint_auth_method: "none", client_type: "public", scope: "tok" });
    expect(JSON.stringify(result)).not.toContain(SECRET); expect(result).not.toHaveProperty("client_secret");
    const input = JSON.parse(String(h.transport.mock.calls[0][1]?.body));
    expect(input).toMatchObject({ client_type: "confidential", token_endpoint_auth_method: "client_secret_basic", scope: "openid" });
    expect(h.clients.get(CLIENT)?.client_secret_ciphertext).not.toContain(SECRET);
    expect(h.consume).toHaveBeenCalledTimes(3);
  });
  it.each(["http://external.example/callback", "https://client.example/cb#fragment", "https://name:pass@client.example/cb", "javascript:alert(1)"])("rejects unsafe registered redirect %s", async (redirect) => {
    const h = harness(); expect((await h.run("register", { redirect_uris: [redirect] })).status).toBe(400); expect(h.transport).not.toHaveBeenCalled();
  });
  it("permits exact native-app loopback redirects", async () => {
    const h = harness(); expect(await h.register({ redirect_uris: ["http://127.0.0.1:41231/callback"] })).toHaveProperty("redirect_uris", ["http://127.0.0.1:41231/callback"]);
  });
  it("fails closed on missing encryption configuration and applies registration rate limits", async () => {
    const h = harness(); h.deps.env = (name) => name === "TOK_CONNECT_BROKER_ENCRYPTION_KEY" ? undefined : ENV[name];
    expect((await h.run("register", { redirect_uris: [CALLBACK] })).status).toBe(503); expect(h.transport).not.toHaveBeenCalled();
    h.deps.env = (name) => ENV[name]; h.consume.mockRejectedValueOnce({ status: 429, message: SECRET });
    const response = await h.run("register", { redirect_uris: [CALLBACK] }); expect(response.status).toBe(429); expect(await response.json()).toEqual({ error: "slow_down" });
  });
  it("bounds registration body bytes before provider calls", async () => {
    const h = harness(); expect((await h.run("register", { redirect_uris: [CALLBACK], client_name: "x".repeat(20_000) })).status).toBe(413); expect(h.transport).not.toHaveBeenCalled();
  });
  it("binds authorization to registered redirect, S256 and state", async () => {
    const h = harness(); await h.register();
    const query = new URLSearchParams({ client_id: CLIENT, redirect_uri: CALLBACK, response_type: "code", code_challenge: await tokBrokerChallenge("v".repeat(43)), code_challenge_method: "S256", state: "synthetic-state", scope: "tok", resource: TOK_BROKER_RESOURCE });
    const response = await h.run("authorize?" + query); expect(response.status).toBe(302);
    const destination = new URL(response.headers.get("location")!); expect(destination.origin).toBe(ENV.SUPABASE_URL); expect(destination.searchParams.get("scope")).toBe("openid"); expect(destination.searchParams.get("state")).toBe("synthetic-state");
    query.set("code_challenge_method", "plain"); expect((await h.run("authorize?" + query)).status).toBe(400);
    query.set("code_challenge_method", "S256"); query.set("redirect_uri", CALLBACK + "/other"); expect((await h.run("authorize?" + query)).status).toBe(400);
  });
  it("exposes only opaque credentials, encrypts native tokens and resolves them only server-side", async () => {
    const h = harness(), pair = await h.issue();
    expect(Object.keys(pair).sort()).toEqual(["access_token", "expires_in", "refresh_token", "scope", "token_type"]);
    expect(pair.access_token).toMatch(/^tok_oa_[0-9a-f]{64}$/); expect(pair.refresh_token).toMatch(/^tok_or_[0-9a-f]{64}$/); expect(pair.expires_in).toBeLessThanOrEqual(300);
    expect(JSON.stringify(pair)).not.toContain(h.native()); expect(JSON.stringify(pair)).not.toContain(NATIVE_REFRESH);
    const row = [...h.sessions.values()][0]; expect(row.p_supabase_access_ciphertext).not.toContain(h.native());
    expect(await resolveTokConnectBrokerAccess(h.deps.admin, pair.access_token)).toEqual({ accessToken: h.native(), userId: USER, clientId: CLIENT });
    await expect(resolveTokConnectBrokerAccess(h.deps.admin, h.native())).rejects.toMatchObject({ status: 401 });
  });
  it("rejects native plain PKCE even if the client bypassed broker authorize", async () => {
    const h = harness(); await h.register(); h.plain(); h.transport.mockClear();
    expect((await h.run("token", codeBody())).status).toBe(400); expect(h.transport).not.toHaveBeenCalled();
    const other = harness(); await other.register(); other.transport.mockClear();
    expect((await other.run("token", { ...codeBody(), code_verifier: "w".repeat(43) })).status).toBe(400); expect(other.transport).not.toHaveBeenCalled();
  });
  it("never extends opaque access past the native JWT absolute expiration", async () => {
    const h = harness(), expires = Math.floor(Date.now() / 1000) + 45; h.setClaims({ exp: expires });
    const pair = await h.issue(), row = [...h.sessions.values()][0]; expect(pair.expires_in).toBeLessThanOrEqual(45); expect(Date.parse(row.p_access_expires_at)).toBeLessThanOrEqual(expires * 1000);
  });
  it.each([{ scope: "openid" }, { resource: "https://other.example/mcp" }, { code_verifier: "short" }, { redirect_uri: CALLBACK + "/other" }, { client_secret: "attacker-supplied" }])("rejects invalid token contract %j before provider exchange", async (patch) => {
    const h = harness(); await h.register(); h.transport.mockClear(); expect((await h.run("token", { ...codeBody(), ...patch })).status).toBe(400); expect(h.transport).not.toHaveBeenCalled();
  });
  it("rejects duplicated form parameters and external Authorization headers", async () => {
    const h = harness(); await h.register(); h.transport.mockClear();
    const req = new Request("https://project.example/functions/v1/tok-connect-broker/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "client_id=" + CLIENT + "&client_id=" + OTHER });
    expect((await handleTokConnectBroker(req, h.deps)).status).toBe(400);
    expect((await h.run("token", codeBody(), { authorization: "Basic synthetic" })).status).toBe(400); expect(h.transport).not.toHaveBeenCalled();
  });
  it("does not issue an opaque session before explicit TOK grants exist", async () => {
    const h = harness(); await h.register(); h.noGrant(); const response = await h.run("token", codeBody()); expect(response.status).toBe(400); expect(h.sessions.size).toBe(0); expect(await response.text()).not.toContain(NATIVE_REFRESH);
  });
  it.each([{ client_id: OTHER }, { sub: OTHER }, { session_id: null }, { exp: 1 }])("rejects token identity/binding mismatch %j", async (claims) => {
    const h = harness(); await h.register(); h.setClaims(claims); expect((await h.run("token", codeBody())).status).toBe(400); expect(h.sessions.size).toBe(0);
  });
  it("rotates both opaque tokens and revokes their descendant when a spent token is reused", async () => {
    const h = harness(), pair = await h.issue(); h.transport.mockClear();
    const body = { client_id: CLIENT, grant_type: "refresh_token", refresh_token: pair.refresh_token };
    const response = await h.run("token", body); expect(response.status).toBe(200); expect(h.transport).toHaveBeenCalledOnce();
    const next = await response.json(); expect(next.refresh_token).not.toBe(pair.refresh_token);
    await expect(resolveTokConnectBrokerAccess(h.deps.admin, pair.access_token)).rejects.toMatchObject({ status: 401 });
    expect(await resolveTokConnectBrokerAccess(h.deps.admin, next.access_token)).toMatchObject({ userId: USER, clientId: CLIENT });
    expect((await h.run("token", body)).status).toBe(400);
    await expect(resolveTokConnectBrokerAccess(h.deps.admin, next.access_token)).rejects.toMatchObject({ status: 401 });
    expect((await h.run("token", { ...body, refresh_token: next.refresh_token })).status).toBe(400);
  });
  it("fails closed on concurrent refresh without letting a second provider call escape", async () => {
    const h = harness(), pair = await h.issue(); h.transport.mockClear();
    const body = { client_id: CLIENT, grant_type: "refresh_token", refresh_token: pair.refresh_token };
    const responses = await Promise.all([h.run("token", body), h.run("token", body)]);
    expect(responses.filter((r) => r.status === 400).length).toBeGreaterThanOrEqual(1);
    expect(h.transport.mock.calls.length).toBeLessThanOrEqual(1);
    expect([...h.sessions.values()][0].state).toBe("revoked");
    for (const response of responses) if (response.status === 200) await expect(resolveTokConnectBrokerAccess(h.deps.admin, (await response.json()).access_token)).rejects.toMatchObject({ status: 401 });
  });
  it("binds encrypted credentials and refresh tokens to the registered client", async () => {
    const h = harness(), pair = await h.issue(); h.transport.mockClear();
    h.clients.set(OTHER, { ...h.clients.get(CLIENT), client_id: OTHER, client_secret_ciphertext: await encryptTokBrokerSecret(SECRET, `client:${OTHER}:client-secret`) });
    expect((await h.run("token", { client_id: OTHER, grant_type: "refresh_token", refresh_token: pair.refresh_token })).status).toBe(400); expect(h.transport).not.toHaveBeenCalled();
    expect(await resolveTokConnectBrokerAccess(h.deps.admin, pair.access_token)).toMatchObject({ userId: USER });
    await expect(decryptTokBrokerSecret(h.clients.get(CLIENT)!.client_secret_ciphertext, `client:${OTHER}:client-secret`)).rejects.toThrow("tok_broker_crypto_unavailable");
  });
  it("honors revocation between provider refresh and CAS storage", async () => {
    const h = harness(), pair = await h.issue(); h.onToken(h.revoke);
    expect((await h.run("token", { client_id: CLIENT, grant_type: "refresh_token", refresh_token: pair.refresh_token })).status).toBe(400);
    await expect(resolveTokConnectBrokerAccess(h.deps.admin, pair.access_token)).rejects.toMatchObject({ status: 401 });
  });
  it("consumes ambiguous refresh failures and never retries the provider with the same token", async () => {
    const h = harness(), pair = await h.issue(); h.transport.mockClear(); h.failProvider();
    const body = { client_id: CLIENT, grant_type: "refresh_token", refresh_token: pair.refresh_token };
    const failed = await h.run("token", body); expect(failed.status).toBe(503); expect(await failed.json()).toEqual({ error: "temporarily_unavailable" });
    expect((await h.run("token", body)).status).toBe(400); expect(h.transport).toHaveBeenCalledOnce(); expect([...h.sessions.values()][0].state).toBe("revoked");
  });
  it("refuses refresh subject changes and strips upstream error diagnostics", async () => {
    const h = harness(), pair = await h.issue(); h.setUser(OTHER); h.setClaims({ sub: OTHER });
    expect((await h.run("token", { client_id: CLIENT, grant_type: "refresh_token", refresh_token: pair.refresh_token })).status).toBe(400);
    const other = harness(); await other.register(); other.providerError(); const failed = await other.run("token", codeBody()); expect(await failed.json()).toEqual({ error: "invalid_grant" });
  });
  it("publishes OAuth metadata without an OIDC identity token surface", async () => {
    const h = harness(), response = await h.run("metadata"), data = await response.json();
    expect(data).toMatchObject({ issuer: TOK_BROKER_ISSUER, scopes_supported: ["tok"], code_challenge_methods_supported: ["S256"] }); expect(data).not.toHaveProperty("jwks_uri"); expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
