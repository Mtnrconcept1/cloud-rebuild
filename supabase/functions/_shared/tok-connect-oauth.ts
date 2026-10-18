import { HttpError, type EdgeSupabaseClient, type RequestActor } from "./auth.ts";
import { readVerifiedTokOAuthClaims, TOK_OAUTH_EDGE_DEPENDENCIES, TOK_OAUTH_RESTAURANT_SCOPES, tokOAuthScopeForTool, type TokOAuthGrant } from "./tok-connect-oauth-policy.ts";

export const TOK_OAUTH_PERMIT_HEADER = "x-tok-oauth-permit";
export type TokOAuthActorInfo = { clientId: string; grantId: string; restaurantIds: string[] };
type Execution = { grant: TokOAuthGrant; token: string; tokenHash: string; sessionId: string; scope: string | null; operation: string | null; restaurantId: string | null };
const executions = new WeakMap<RequestActor, Execution>();
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const forbidden = (code = "tok_connect_native_access_forbidden"): never => { throw new HttpError(403, code); };
function onlyKeys(value: Row, allowed: string[]) { if (Object.keys(value).some((key) => !allowed.includes(key))) forbidden("tok_connect_named_operation_required"); }
export async function tokOAuthSha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function loadTokOAuthGrant(admin: EdgeSupabaseClient, userId: string, clientId: string): Promise<TokOAuthGrant> {
  const { data, error } = await admin.from("tok_connect_oauth_grants")
    .select("id,user_id,client_id,client_name,scopes,restaurant_ids,revision,created_at,updated_at,expires_at,revoked_at")
    .eq("user_id", userId).eq("client_id", clientId).maybeSingle();
  if (error) throw new HttpError(503, "tok_connect_grant_unavailable");
  if (!data || data.revoked_at || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()) forbidden("tok_connect_grant_required:reconnect_and_choose_permissions");
  return data as TokOAuthGrant;
}
export async function registerTokOAuthActor(actor: RequestActor, req: Request, token: string, allowBridge: boolean): Promise<boolean> {
  // authenticateRequest has already verified this exact native JWT with getUser.
  const claims = readVerifiedTokOAuthClaims(token);
  if (!Object.hasOwn(claims, "client_id")) return false;
  if (!actor.userId || claims.sub !== actor.userId || typeof claims.client_id !== "string" || !claims.client_id || typeof claims.session_id !== "string" || !claims.session_id) forbidden();
  const clientId = claims.client_id as string, sessionId = claims.session_id as string;
  const tokenHash = await tokOAuthSha256(token), path = new URL(req.url).pathname.replace(/^\/functions\/v1/, "");
  let state: Execution;
  if (allowBridge && path === "/tok-connect-app-bridge") {
    state = { grant: await loadTokOAuthGrant(actor.adminClient, actor.userId!, clientId), token, tokenHash, sessionId, scope: null, operation: null, restaurantId: null };
  } else {
    const raw = req.headers.get(TOK_OAUTH_PERMIT_HEADER);
    if (!raw || !/^[0-9a-f]{64}$/.test(raw)) forbidden();
    const { data, error } = await actor.adminClient.rpc("service_validate_tok_connect_oauth_edge_permit", {
      p_permit_hash: await tokOAuthSha256(raw!), p_user_id: actor.userId, p_client_id: clientId, p_session_id: sessionId,
      p_token_hash: tokenHash, p_method: req.method, p_path: path, p_body_hash: await tokOAuthSha256(await req.clone().text()),
    });
    if (error || !data?.grant || typeof data.scope !== "string" || typeof data.operation !== "string"
      || !TOK_OAUTH_EDGE_DEPENDENCIES[data.operation]?.includes(path.slice(1))) forbidden();
    state = { grant: data.grant as TokOAuthGrant, token, tokenHash, sessionId, scope: data.scope, operation: data.operation, restaurantId: data.restaurant_id || null };
  }
  executions.set(actor, state);
  actor.tokConnectOAuth = { clientId, grantId: state.grant.id, restaurantIds: [...state.grant.restaurant_ids] };
  actor.roles = actor.roles.filter((role) => !["admin", "super_admin", "commercial", "courier"].includes(role));
  actor.isAdmin = false;
  return true;
}

/** Allow only named, schema-checked business operations before any userClient I/O. */
export async function authorizeTokOAuthBridge(actor: RequestActor, body: Row): Promise<void> {
  const state = executions.get(actor); if (!state) return;
  const args = record(body.args); let name = ""; let restaurantId: string | null = null;
  if (body.mode === "role_operation" || body.mode === "customer_operation") {
    onlyKeys(body, ["mode", "operation", "args"]); name = typeof body.operation === "string" ? body.operation : "";
  } else if (body.mode === "customer_history") {
    onlyKeys(body, ["mode", "kind", "limit"]);
    name = body.kind === "orders" ? "tok_my_orders" : body.kind === "reservations" ? "tok_my_reservations" : "";
  } else if (body.mode === "customer_commerce") {
    const actions: Record<string, string> = { special_offers: "tok_list_customer_special_offers", quote: "tok_quote_customer_cart", checkout: "tok_checkout_customer_cart", status: "tok_customer_payment_status", cancel_attempt: "tok_cancel_cart_payment_attempt" };
    name = actions[String(body.action)] || "";
  } else if (body.mode === "edge" && ["reservations.classic.quote", "reservations.classic.create"].includes(String(body.capability))) {
    onlyKeys(body, ["mode", "capability", "method", "payload", "confirmed_by_user", "idempotency_key"]);
    if (body.method !== undefined && body.method !== "POST") forbidden();
    const payload = record(body.payload), quote = body.capability === "reservations.classic.quote";
    if (payload.action !== (quote ? "quote" : "create") || !quote && payload.feature !== "classique") forbidden();
    onlyKeys(payload, quote ? ["action", "party_size"] : ["action", "feature", "restaurant_id", "date", "time", "party_size", "notes", "guarantee_accepted"]);
    name = quote ? "tok_quote_reservation" : "tok_book_table";
  } else if (body.mode === "rpc" && body.rpc_name === "cancel_reservation_by_customer") {
    onlyKeys(body, ["mode", "rpc_name", "args", "confirmed_by_user", "idempotency_key"]);
    onlyKeys(args, ["p_reservation_id"]); name = "tok_cancel_my_reservation";
  }
  const scope = tokOAuthScopeForTool(name);
  if (!scope) forbidden("tok_connect_named_operation_required");
  if (!state.grant.scopes.includes(scope!)) forbidden(`tok_connect_scope_required:${scope}`);
  if (TOK_OAUTH_RESTAURANT_SCOPES.has(scope!) && name !== "tok_list_my_restaurants") {
    restaurantId = typeof args.restaurant_id === "string" ? args.restaurant_id : null;
    if (!restaurantId || !state.grant.restaurant_ids.includes(restaurantId)) forbidden("tok_connect_selected_restaurant_required");
    const { data, error } = await actor.adminClient.from("restaurants").select("id,tok_connect_mcp_enabled")
      .eq("id", restaurantId).eq("owner_id", actor.userId).maybeSingle();
    if (error) throw new HttpError(503, "tok_connect_restaurant_check_unavailable");
    if (!data || data.tok_connect_mcp_enabled !== true) forbidden("tok_connect_owned_restaurant_required");
  }
  state.scope = scope; state.operation = name; state.restaurantId = restaurantId;
}
async function mintPermit(actor: RequestActor, state: Execution, req: Request, audience: "data" | "edge"): Promise<string> {
  if (!state.scope || !state.operation) forbidden("tok_connect_named_operation_required");
  const raw = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const path = new URL(req.url).pathname.replace(audience === "data" ? /^\/rest\/v1/ : /^\/functions\/v1/, "");
  const { data, error } = await actor.adminClient.rpc("service_create_tok_connect_oauth_permit", {
    p_permit_hash: await tokOAuthSha256(raw), p_grant_id: state.grant.id, p_grant_revision: state.grant.revision,
    p_user_id: actor.userId, p_client_id: state.grant.client_id, p_session_id: state.sessionId, p_token_hash: state.tokenHash,
    p_scope: state.scope, p_operation: state.operation, p_restaurant_id: state.restaurantId,
    p_audience: audience, p_method: req.method, p_path: path,
    p_body_hash: audience === "edge" ? await tokOAuthSha256(await req.clone().text()) : null,
  });
  if (error || data !== true) forbidden("tok_connect_grant_changed:reconnect_application");
  return raw;
}

/** Use the original user JWT and RLS; only the unreturned server permit adds delegation. */
export function tokOAuthUserFetch(actor: RequestActor, projectUrl: string, transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init), state = executions.get(actor);
    if (!state) return transport(req);
    const url = new URL(req.url);
    if (url.origin !== new URL(projectUrl).origin) forbidden();
    req.headers.delete(TOK_OAUTH_PERMIT_HEADER);
    if (url.pathname.startsWith("/rest/v1/")) {
      if (req.headers.get("authorization") !== `Bearer ${state.token}`) forbidden();
      req.headers.set(TOK_OAUTH_PERMIT_HEADER, await mintPermit(actor, state, req, "data"));
    } else if (url.pathname !== "/auth/v1/user" || req.method !== "GET") forbidden();
    return transport(new Request(req, { redirect: "error" }));
  };
}
export async function tokOAuthEdgeFetch(actor: RequestActor, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init), state = executions.get(actor);
  req.headers.delete(TOK_OAUTH_PERMIT_HEADER);
  if (state) {
    const url = new URL(req.url), project = Deno.env.get("SUPABASE_URL");
    if (!project || url.origin !== new URL(project).origin || !url.pathname.startsWith("/functions/v1/")
      || !state.operation || !TOK_OAUTH_EDGE_DEPENDENCIES[state.operation]?.includes(url.pathname.slice("/functions/v1/".length))) forbidden();
    // The inbound bearer is opaque. The native token is available only in this WeakMap.
    req.headers.set("authorization", `Bearer ${state.token}`);
    req.headers.set(TOK_OAUTH_PERMIT_HEADER, await mintPermit(actor, state, req, "edge"));
  }
  return fetch(new Request(req, { redirect: "error" }));
}
