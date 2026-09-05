import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireUserRole,
  writeAuditLog,
  type RequestActor,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { sha256Base64Url } from "../_shared/tok-connect.ts";

type JsonRecord = Record<string, unknown>;
type BridgeFilter = { column: string; value: unknown; operator?: "eq" | "neq" | "is" | "in" };

const FUNCTION_NAME = "tok-connect-commercial-bridge";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const DEMO_SESSION_FUNCTION = "provision-commercial-demo-project-session";
const IDEMPOTENCY_TABLE = "tok_connect_mcp_action_idempotency";
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,120}$/;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf";

const COMMERCIAL_RPC_NAMES = new Set([
  "accept_commercial_contract",
  "commercial_demo_ai_archive_conversation",
  "commercial_demo_ai_history",
  "commercial_demo_create_order",
  "commercial_demo_create_reservation",
  "commercial_demo_create_session",
  "commercial_demo_current_restaurant_id",
  "commercial_demo_current_user_is_restricted",
  "commercial_demo_get_snapshot",
  "commercial_demo_reset_session",
  "commercial_demo_transition",
  "commercial_demo_transition_reservation",
  "commercial_plan_key",
  "commercial_signature_commission_chf",
  "commercial_sprint_bonus_chf",
  "get_commercial_compensation_summary",
  "get_commercial_prospect_commission_summary",
  "get_commercial_prospect_followups",
  "get_commercial_prospect_signup_referral",
  "provision_commercial_demo_account",
  "record_commercial_prospect_followup",
]);

const COMMERCIAL_READ_TABLES = new Set([
  "commercial_prospect_catalog",
  "commercial_prospect_followups",
  "commercial_prospect_followup_history",
  "commercial_commissions",
  "commercial_subscription_commissions",
  "commercial_compensation_profiles",
  "commercial_compensation_profile_events",
  "commercial_compensation_adjustments",
  "commercial_contract_acceptances",
  "commercial_contract_versions",
  "commercial_statements",
  "commercial_earning_events",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function requireCommercial(actor: RequestActor) {
  requireUserRole(actor, ["commercial", "admin"]);
}

function readIdempotencyKey(body: JsonRecord) {
  const key = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!IDEMPOTENCY_KEY.test(key)) throw new HttpError(400, "tok_connect_idempotency_key_required");
  return key;
}

function requireConfirmation(body: JsonRecord) {
  if (body.confirmed_by_user !== true) throw new HttpError(409, "tok_connect_human_confirmation_required");
}

async function claim(actor: RequestActor, key: string, operation: string, hash: string) {
  if (!actor.userId) throw new HttpError(401, "tok_connect_user_required");
  const { data: existing, error } = await actor.adminClient.from(IDEMPOTENCY_TABLE)
    .select("request_hash,response_body,status_code")
    .eq("user_id", actor.userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (existing) {
    if (existing.request_hash !== hash) throw new HttpError(409, "tok_connect_idempotency_key_reused_with_different_body");
    if (existing.response_body && existing.status_code) return { replay: true, response: existing.response_body as JsonRecord, status: Number(existing.status_code) };
    throw new HttpError(409, "tok_connect_idempotency_request_in_progress");
  }
  const { error: insertError } = await actor.adminClient.from(IDEMPOTENCY_TABLE).insert({
    user_id: actor.userId,
    idempotency_key: key,
    operation,
    request_hash: hash,
  });
  if (insertError) {
    if (String(insertError.code || "") === "23505") return await claim(actor, key, operation, hash);
    throw new HttpError(500, insertError.message);
  }
  return { replay: false as const };
}

async function complete(actor: RequestActor, key: string, response: JsonRecord, status: number) {
  if (!actor.userId) return;
  await actor.adminClient.from(IDEMPOTENCY_TABLE).update({ response_body: response, status_code: status })
    .eq("user_id", actor.userId)
    .eq("idempotency_key", key);
}

function applyFilters(query: any, filters: BridgeFilter[]) {
  let next = query;
  for (const filter of filters) {
    if (!filter || !SAFE_IDENTIFIER.test(String(filter.column || ""))) throw new HttpError(400, "tok_connect_filter_invalid");
    const operator = filter.operator || "eq";
    if (operator === "eq") next = next.eq(filter.column, filter.value);
    else if (operator === "neq") next = next.neq(filter.column, filter.value);
    else if (operator === "is") next = next.is(filter.column, filter.value);
    else if (operator === "in" && Array.isArray(filter.value)) next = next.in(filter.column, filter.value);
    else throw new HttpError(400, "tok_connect_filter_operator_invalid");
  }
  return next;
}

async function invokeRpc(actor: RequestActor, body: JsonRecord) {
  const rpcName = typeof body.rpc_name === "string" ? body.rpc_name.trim() : "";
  if (!COMMERCIAL_RPC_NAMES.has(rpcName)) throw new HttpError(403, "tok_connect_commercial_rpc_not_allowlisted");
  requireConfirmation(body);
  const key = readIdempotencyKey(body);
  const args = isRecord(body.args) ? body.args : {};
  const hash = await sha256Base64Url(stableStringify({ rpc_name: rpcName, args }));
  const decision = await claim(actor, key, `commercial-rpc:${rpcName}`, hash);
  if (decision.replay) return { ...decision.response, replayed: true };
  if (!actor.userClient) throw new HttpError(401, "tok_connect_user_client_required");
  const { data, error } = await actor.userClient.rpc(rpcName, args);
  const result: JsonRecord = error
    ? { ok: false, rpc_name: rpcName, error: { code: error.code, message: error.message }, replayed: false }
    : { ok: true, rpc_name: rpcName, data, replayed: false };
  await complete(actor, key, result, error ? 400 : 200);
  return result;
}

async function provisionDemo(req: Request, actor: RequestActor, body: JsonRecord) {
  requireConfirmation(body);
  const key = readIdempotencyKey(body);
  const payload = isRecord(body.payload) ? body.payload : { requested_project_ref: DEMO_PROJECT_REF };
  const hash = await sha256Base64Url(stableStringify({ demo_session: payload }));
  const decision = await claim(actor, key, "commercial-demo-session", hash);
  if (decision.replay) return { ...decision.response, replayed: true };
  const authorization = req.headers.get("authorization") || "";
  const headers = new Headers({ authorization, "content-type": "application/json", accept: "application/json" });
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (anonKey) headers.set("apikey", anonKey);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${DEMO_SESSION_FUNCTION}`, { method: "POST", headers, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({ error: "invalid_downstream_response" }));
  const result: JsonRecord = { ok: response.ok, downstream_status: response.status, data, replayed: false };
  await complete(actor, key, result, response.status);
  return result;
}

async function readTable(actor: RequestActor, body: JsonRecord) {
  const table = typeof body.table === "string" ? body.table.trim() : "";
  if (!COMMERCIAL_READ_TABLES.has(table)) throw new HttpError(403, "tok_connect_commercial_table_not_allowlisted");
  if (!actor.userClient) throw new HttpError(401, "tok_connect_user_client_required");
  const select = typeof body.select === "string" && body.select.length <= 500 ? body.select : "*";
  const filters = Array.isArray(body.filters) ? body.filters as BridgeFilter[] : [];
  let query: any = actor.userClient.from(table).select(select);
  query = applyFilters(query, filters).limit(Math.max(1, Math.min(Number(body.limit || 50), 100)));
  const { data, error } = await query;
  if (error) throw new HttpError(400, error.message);
  return { ok: true, table, data };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (!isRequestOriginAllowed(req)) return new Response(null, { status: 403, headers: corsHeaders });
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, corsHeaders);

  let actor: RequestActor | null = null;
  let action = "invoke";
  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    requireCommercial(actor);
    const limiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await limiter.consume(`user:${actor.userId}`, { maxRequests: 120, windowSeconds: 60 });
    const body = await req.json().catch(() => ({})) as JsonRecord;
    action = String(body.action || "");
    let result: JsonRecord;
    if (action === "list") {
      result = { ok: true, rpc_names: [...COMMERCIAL_RPC_NAMES], read_tables: [...COMMERCIAL_READ_TABLES], actions: ["rpc", "read", "demo_session"] };
    } else if (action === "rpc") result = await invokeRpc(actor, body);
    else if (action === "read") result = await readTable(actor, body);
    else if (action === "demo_session") result = await provisionDemo(req, actor, body);
    else throw new HttpError(400, "tok_connect_commercial_action_invalid");
    await writeAuditLog({ adminClient: actor.adminClient, functionName: FUNCTION_NAME, action, actor, request: req, status: "success" });
    return jsonResponse(result, 200, corsHeaders);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "tok_connect_commercial_bridge_error";
    if (actor) await writeAuditLog({ adminClient: actor.adminClient, functionName: FUNCTION_NAME, action, actor, request: req, status: "failure", errorMessage: message });
    return jsonResponse({ ok: false, error: { code: message, message } }, status, corsHeaders);
  }
});
