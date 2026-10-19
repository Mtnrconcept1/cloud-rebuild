import type { EdgeSupabaseClient } from "./auth.ts";
import { decryptTokBrokerSecret, encryptTokBrokerSecret } from "./tok-connect-broker-crypto.ts";
import { readVerifiedTokOAuthClaims } from "./tok-connect-oauth-policy.ts";

export const TOK_BROKER_ISSUER = "https://www.thetok.ch/oauth";
export const TOK_BROKER_RESOURCE = "https://www.thetok.ch/mcp";
export const TOK_BROKER_SCOPE = "tok";
const ACCESS_LIFETIME_SECONDS = 300;
const MAX_BODY_BYTES = 16_384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCESS = /^tok_oa_[0-9a-f]{64}$/;
const REFRESH = /^tok_or_[0-9a-f]{64}$/;
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache",
  "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type", "x-content-type-options": "nosniff" };
export class TokBrokerError extends Error { constructor(public status: number, public code: string) { super(code); } }
export type TokBrokerDependencies = {
  admin: EdgeSupabaseClient; env: (name: string) => string | undefined; transport?: typeof fetch;
  consume: (subject: string, maxRequests: number, windowSeconds: number) => Promise<void>;
};
type Row = Record<string, unknown>;
type BrokerClient = { client_id: string; client_name: string; redirect_uris: string[]; client_secret_ciphertext: string };
type BrokerSession = { id: string; client_id: string; user_id: string; supabase_refresh_ciphertext: string };
const invalid = (code = "invalid_request"): never => { throw new TokBrokerError(400, code); };
function object(value: unknown): Row { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Row; }
function string(value: unknown, max = 2048): string {
  if (typeof value !== "string" || !value || value.length > max || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) invalid();
  return value as string;
}
function onlyKeys(value: Row, allowed: string[]) { if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(); }
function configured(deps: TokBrokerDependencies): string {
  const key = deps.env("TOK_CONNECT_BROKER_ENCRYPTION_KEY"), source = deps.env("SUPABASE_URL");
  try {
    const url = new URL(source || "");
    if (!key || !/^[0-9a-f]{64}$/i.test(key) || url.protocol !== "https:" || url.pathname !== "/"
      || url.username || url.password || url.search || url.hash || !deps.env("SUPABASE_SERVICE_ROLE_KEY") || !deps.env("SUPABASE_ANON_KEY")) throw new Error();
    return url.origin;
  } catch { throw new TokBrokerError(503, "temporarily_unavailable"); }
}
function json(value: Row, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: HEADERS }); }
export async function tokBrokerHash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function tokBrokerChallenge(verifier: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function opaque(prefix: string): string { return prefix + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function boundedText(body: ReadableStream<Uint8Array> | null, max: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > max) { await reader.cancel(); throw new TokBrokerError(413, "invalid_request"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function uniqueParams(params: URLSearchParams): Row {
  const result: Row = Object.create(null);
  for (const [key, value] of params) { if (Object.hasOwn(result, key)) invalid(); result[key] = value; }
  return result;
}
async function requestBody(req: Request, form = false): Promise<Row> {
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) throw new TokBrokerError(413, "invalid_request");
  const raw = await boundedText(req.body, MAX_BODY_BYTES);
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  try {
    if (type === "application/json") return object(JSON.parse(raw));
    if (form && type === "application/x-www-form-urlencoded") return uniqueParams(new URLSearchParams(raw));
  } catch (error) { if (error instanceof TokBrokerError) throw error; }
  return invalid();
}
function redirectUri(value: unknown): string {
  const raw = string(value); let url: URL;
  try { url = new URL(raw); } catch { return invalid(); }
  if (url.username || url.password || url.hash || raw.includes("#") || /[\\\s]/.test(raw)
    || !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) invalid();
  return raw;
}
function scopeAndResource(body: Row) {
  if (body.scope !== undefined && body.scope !== TOK_BROKER_SCOPE) invalid("invalid_scope");
  if (body.resource !== undefined && body.resource !== TOK_BROKER_RESOURCE) invalid("invalid_target");
}
async function getClient(deps: TokBrokerDependencies, clientId: unknown): Promise<BrokerClient> {
  if (typeof clientId !== "string" || !UUID.test(clientId)) invalid("invalid_client");
  const { data, error } = await deps.admin.rpc("service_get_tok_connect_broker_client", { p_client_id: clientId });
  if (error) throw new TokBrokerError(503, "temporarily_unavailable");
  if (!data || data.client_id !== clientId || typeof data.client_secret_ciphertext !== "string" || !Array.isArray(data.redirect_uris)) invalid("invalid_client");
  return data as BrokerClient;
}
async function providerJson(deps: TokBrokerDependencies, path: string, init: RequestInit): Promise<Row> {
  let response: Response;
  try { response = await (deps.transport || fetch)(configured(deps) + path, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) }); }
  catch { throw new TokBrokerError(503, "temporarily_unavailable"); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new TokBrokerError(response.status >= 500 ? 503 : 400, response.status >= 500 ? "temporarily_unavailable" : "invalid_grant");
  }
  try { return object(JSON.parse(await boundedText(response.body, 65_536))); }
  catch { throw new TokBrokerError(502, "server_error"); }
}
function adminHeaders(deps: TokBrokerDependencies): Record<string, string> {
  return { authorization: `Bearer ${deps.env("SUPABASE_SERVICE_ROLE_KEY")}`, apikey: deps.env("SUPABASE_SERVICE_ROLE_KEY")!, "content-type": "application/json" };
}
async function register(req: Request, deps: TokBrokerDependencies): Promise<Response> {
  configured(deps); const body = await requestBody(req);
  onlyKeys(body, ["client_name", "redirect_uris", "grant_types", "response_types", "token_endpoint_auth_method", "client_type", "scope", "client_uri", "logo_uri", "contacts", "software_id", "software_version"]);
  scopeAndResource(body);
  const name = body.client_name === undefined ? "Application TOK" : string(body.client_name, 180);
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none" || body.client_type !== undefined && body.client_type !== "public") invalid("invalid_client_metadata");
  if (body.grant_types !== undefined && (!Array.isArray(body.grant_types) || !body.grant_types.includes("authorization_code") || body.grant_types.some((v) => !["authorization_code", "refresh_token"].includes(String(v))))) invalid("invalid_client_metadata");
  if (body.response_types !== undefined && JSON.stringify(body.response_types) !== '["code"]') invalid("invalid_client_metadata");
  if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 10) invalid("invalid_redirect_uri");
  const redirects = [...new Set((body.redirect_uris as unknown[]).map(redirectUri))];
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown").slice(0, 255);
  await deps.consume(`registration-ip:${await tokBrokerHash(ip)}`, 6, 60);
  await deps.consume("registration-global-hour", 100, 3600);
  await deps.consume("registration-global-day", 1000, 86400);
  let clientId: string | null = null;
  try {
    const upstream = await providerJson(deps, "/auth/v1/admin/oauth/clients", { method: "POST", headers: adminHeaders(deps), body: JSON.stringify({ client_name: name, redirect_uris: redirects, client_type: "confidential", token_endpoint_auth_method: "client_secret_basic", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "openid" }) });
    if (typeof upstream.client_id === "string" && UUID.test(upstream.client_id)) clientId = upstream.client_id;
    if (!clientId || upstream.client_type !== "confidential" || upstream.token_endpoint_auth_method !== "client_secret_basic" || typeof upstream.client_secret !== "string" || upstream.client_secret.length < 16 || upstream.client_secret.length > 4096 || JSON.stringify(upstream.redirect_uris) !== JSON.stringify(redirects)) throw new TokBrokerError(502, "server_error");
    const { data, error } = await deps.admin.rpc("service_store_tok_connect_broker_client", { p_client_id: clientId, p_client_name: name, p_redirect_uris: redirects, p_client_secret_ciphertext: await encryptTokBrokerSecret(upstream.client_secret, `client:${clientId}:client-secret`) });
    if (error || data !== true) throw new TokBrokerError(503, "temporarily_unavailable");
  } catch (error) {
    if (clientId) {
      try { const response = await (deps.transport || fetch)(configured(deps) + "/auth/v1/admin/oauth/clients/" + encodeURIComponent(clientId), { method: "DELETE", headers: adminHeaders(deps), redirect: "error", signal: AbortSignal.timeout(10_000) }); await response.body?.cancel(); } catch { /* Never disclose orphan credentials. */ }
    }
    throw error;
  }
  return json({ client_id: clientId, client_name: name, redirect_uris: redirects, client_type: "public", token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: TOK_BROKER_SCOPE }, 201);
}
async function authorize(req: Request, deps: TokBrokerDependencies): Promise<Response> {
  const origin = configured(deps), url = new URL(req.url);
  if (url.search.length > MAX_BODY_BYTES) invalid();
  const body = uniqueParams(url.searchParams);
  // Vercel forwards the host matcher as query metadata; it must never select an OAuth destination.
  if (body.host !== undefined) {
    if (body.host !== new URL(TOK_BROKER_ISSUER).hostname) invalid();
    delete body.host;
  }
  // OIDC ui_locales is a display hint supplied by clients such as ChatGPT, not an OAuth authorization input.
  if (body.ui_locales !== undefined) {
    const locales = string(body.ui_locales, 128);
    if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*(?: [A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)*$/.test(locales)) invalid();
    delete body.ui_locales;
  }
  onlyKeys(body, ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "scope", "state", "resource"]);
  scopeAndResource(body); const client = await getClient(deps, body.client_id), redirect = redirectUri(body.redirect_uri);
  if (!client.redirect_uris.includes(redirect)) invalid("invalid_redirect_uri");
  const challenge = body.code_challenge;
  if (body.response_type !== "code" || body.code_challenge_method !== "S256" || typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return invalid();
  const state = string(body.state, 1024);
  await deps.consume(`authorize-client:${client.client_id}`, 60, 60);
  const destination = new URL(origin + "/auth/v1/oauth/authorize");
  destination.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state, scope: "openid" }).toString();
  return new Response(null, { status: 302, headers: { ...HEADERS, location: destination.toString() } });
}
async function exchangeProvider(deps: TokBrokerDependencies, client: BrokerClient, body: Record<string, string>): Promise<Row> {
  const secret = await decryptTokBrokerSecret(client.client_secret_ciphertext, `client:${client.client_id}:client-secret`);
  return providerJson(deps, "/auth/v1/oauth/token", { method: "POST", headers: { authorization: "Basic " + btoa(client.client_id + ":" + secret), apikey: deps.env("SUPABASE_ANON_KEY")!, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...body, client_id: client.client_id }).toString() });
}
async function validateProviderTokens(deps: TokBrokerDependencies, client: BrokerClient, body: Row, expectedUser?: string) {
  const access = string(body.access_token, 16_384), refresh = string(body.refresh_token, 16_384);
  const { data, error } = await deps.admin.auth.getUser(access);
  const claims = readVerifiedTokOAuthClaims(access);
  const userId = data?.user?.id;
  if (error || !userId || claims.sub !== userId || claims.client_id !== client.client_id || typeof claims.session_id !== "string" || !claims.session_id || expectedUser && userId !== expectedUser || typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return invalid("invalid_grant");
  const issuedAt = Date.now(), lifetime = Math.min(ACCESS_LIFETIME_SECONDS, Math.floor(Number(claims.exp) - issuedAt / 1000));
  if (lifetime <= 0) invalid("invalid_grant");
  return { access, refresh, userId, lifetime, expiresAt: issuedAt + lifetime * 1000 };
}
async function tokensForSession(id: string, tokens: Awaited<ReturnType<typeof validateProviderTokens>>) {
  const access = opaque("tok_oa_"), refresh = opaque("tok_or_");
  return { stored: { p_access_hash: await tokBrokerHash(access), p_refresh_hash: await tokBrokerHash(refresh), p_supabase_access_ciphertext: await encryptTokBrokerSecret(tokens.access, `session:${id}:access`), p_supabase_refresh_ciphertext: await encryptTokBrokerSecret(tokens.refresh, `session:${id}:refresh`), p_access_expires_at: new Date(tokens.expiresAt).toISOString() }, public: { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: tokens.lifetime, scope: TOK_BROKER_SCOPE } };
}
async function token(req: Request, deps: TokBrokerDependencies): Promise<Response> {
  configured(deps); if (req.headers.has("authorization")) invalid("invalid_client");
  const body = await requestBody(req, true);
  onlyKeys(body, ["client_id", "grant_type", "code", "redirect_uri", "code_verifier", "refresh_token", "scope", "resource"]);
  scopeAndResource(body); const client = await getClient(deps, body.client_id);
  await deps.consume(`token-client:${client.client_id}`, 60, 60);
  if (body.grant_type === "authorization_code") {
    if (body.refresh_token !== undefined) invalid();
    const code = string(body.code, 4096), redirect = redirectUri(body.redirect_uri), verifier = string(body.code_verifier, 128);
    if (!client.redirect_uris.includes(redirect) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) invalid("invalid_grant");
    // Read the native authorization record, not an untrusted request hint. Direct
    // GoTrue authorize calls also accept plain PKCE and must not bypass S256 here.
    const proof = await deps.admin.rpc("service_verify_tok_connect_broker_authorization", { p_client_id: client.client_id, p_code_hash: await tokBrokerHash(code), p_redirect_uri: redirect, p_code_challenge: await tokBrokerChallenge(verifier) });
    if (proof.error) throw new TokBrokerError(503, "temporarily_unavailable");
    if (proof.data !== true) invalid("invalid_grant");
    const tokens = await validateProviderTokens(deps, client, await exchangeProvider(deps, client, { grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier }));
    const id = crypto.randomUUID(), pair = await tokensForSession(id, tokens);
    const result = await deps.admin.rpc("service_create_tok_connect_broker_session", { p_id: id, p_client_id: client.client_id, p_user_id: tokens.userId, ...pair.stored });
    if (result.error || result.data !== true) invalid("invalid_grant");
    return json(pair.public);
  }
  if (body.grant_type !== "refresh_token" || body.code !== undefined || body.code_verifier !== undefined || body.redirect_uri !== undefined) invalid("unsupported_grant_type");
  if (typeof body.refresh_token !== "string" || !REFRESH.test(body.refresh_token)) invalid("invalid_grant");
  await decryptTokBrokerSecret(client.client_secret_ciphertext, `client:${client.client_id}:client-secret`);
  const claim = crypto.randomUUID();
  const result = await deps.admin.rpc("service_claim_tok_connect_broker_refresh", { p_refresh_hash: await tokBrokerHash(body.refresh_token as string), p_client_id: client.client_id, p_claim_id: claim });
  if (result.error) throw new TokBrokerError(503, "temporarily_unavailable");
  const session = result.data as BrokerSession | null;
  if (!session || !UUID.test(session.id) || session.client_id !== client.client_id || typeof session.user_id !== "string" || typeof session.supabase_refresh_ciphertext !== "string") invalid("invalid_grant");
  try {
    const refresh = await decryptTokBrokerSecret(session!.supabase_refresh_ciphertext, `session:${session!.id}:refresh`);
    const tokens = await validateProviderTokens(deps, client, await exchangeProvider(deps, client, { grant_type: "refresh_token", refresh_token: refresh }), session!.user_id);
    const pair = await tokensForSession(session!.id, tokens);
    const rotated = await deps.admin.rpc("service_rotate_tok_connect_broker_refresh", { p_id: session!.id, p_claim_id: claim, ...pair.stored });
    if (rotated.error || rotated.data !== true) invalid("invalid_grant");
    return json(pair.public);
  } catch (error) {
    // The provider may have rotated already. Never retry this upstream refresh.
    try { await deps.admin.rpc("service_revoke_tok_connect_broker_session", { p_id: session!.id, p_claim_id: claim }); } catch { /* A claimed row remains unusable. */ }
    throw error;
  }
}
export async function handleTokConnectBroker(req: Request, deps: TokBrokerDependencies): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  try {
    const route = new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?tok-connect-broker\/?/, "").replace(/\/$/, "");
    if (route === "metadata" && req.method === "GET") return json({ issuer: TOK_BROKER_ISSUER, authorization_endpoint: TOK_BROKER_ISSUER + "/authorize", token_endpoint: TOK_BROKER_ISSUER + "/token", registration_endpoint: TOK_BROKER_ISSUER + "/register", scopes_supported: [TOK_BROKER_SCOPE], response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"] });
    if (route === "register" && req.method === "POST") return await register(req, deps);
    if (route === "authorize" && req.method === "GET") return await authorize(req, deps);
    if (route === "token" && req.method === "POST") return await token(req, deps);
    return json({ error: ["register", "authorize", "token", "metadata"].includes(route) ? "invalid_request" : "not_found" }, ["register", "authorize", "token", "metadata"].includes(route) ? 405 : 404);
  } catch (error) {
    if (error instanceof TokBrokerError) return json({ error: error.code }, error.status);
    if (error && typeof error === "object" && "status" in error && error.status === 429) return json({ error: "slow_down" }, 429);
    return json({ error: "temporarily_unavailable" }, 503);
  }
}

export async function resolveTokConnectBrokerAccess(admin: EdgeSupabaseClient, raw: string): Promise<{ accessToken: string; userId: string; clientId: string }> {
  if (!ACCESS.test(raw)) throw new TokBrokerError(401, "tok_connect_token_invalid");
  const { data, error } = await admin.rpc("service_resolve_tok_connect_broker_access", { p_access_hash: await tokBrokerHash(raw) });
  if (error) throw new TokBrokerError(503, "tok_connect_token_unavailable");
  if (!data || typeof data.id !== "string" || typeof data.supabase_access_ciphertext !== "string") throw new TokBrokerError(401, "tok_connect_token_invalid");
  let accessToken: string;
  try { accessToken = await decryptTokBrokerSecret(data.supabase_access_ciphertext, `session:${data.id}:access`); }
  catch { throw new TokBrokerError(401, "tok_connect_token_invalid"); }
  const user = await admin.auth.getUser(accessToken), claims = readVerifiedTokOAuthClaims(accessToken);
  if (user.error || !user.data?.user || user.data.user.id !== data.user_id || claims.sub !== data.user_id || claims.client_id !== data.client_id || typeof claims.session_id !== "string" || !claims.session_id) throw new TokBrokerError(401, "tok_connect_token_invalid");
  return { accessToken, userId: data.user_id, clientId: data.client_id };
}
