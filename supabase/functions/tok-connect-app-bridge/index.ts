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
type BridgeMode = "edge" | "rpc" | "data";
type DataOperation = "select" | "insert" | "update" | "delete";
type FilterOperator = "eq" | "neq" | "is" | "in";

type BridgeFilter = {
  column: string;
  operator?: FilterOperator;
  value: unknown;
};

type EdgeCapability = {
  functionName: string;
  roles: string[];
  methods: Array<"GET" | "POST">;
  confirmationRequired: boolean;
  idempotencyRequired: boolean;
  category: string;
  description: string;
};

const FUNCTION_NAME = "tok-connect-app-bridge";
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const IDEMPOTENCY_TABLE = "tok_connect_mcp_action_idempotency";
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,120}$/;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_RESPONSE_CHARS = 750_000;
const MAX_SELECT_LIMIT = 100;

const EDGE_CAPABILITIES: Record<string, EdgeCapability> = {
  "orders.validate": { functionName: "validate-order", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "orders", description: "Valider une commande avec les règles métier TOK." },
  "orders.checkout.create": { functionName: "create-checkout", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "payments", description: "Créer le checkout sécurisé d'une commande." },
  "orders.checkout.complete": { functionName: "complete-order-checkout", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "payments", description: "Finaliser un checkout de commande déjà autorisé." },
  "orders.checkout.cancel_pending": { functionName: "cancel-pending-order-checkout", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "payments", description: "Annuler un checkout de commande encore en attente." },
  "orders.match_group.authorize": { functionName: "authorize-match-group-order", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "payments", description: "Autoriser la part d'une commande groupée." },
  "orders.match_group.confirm": { functionName: "confirm-match-group-authorization", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "payments", description: "Confirmer une autorisation de commande groupée." },
  "reservations.classic.create": { functionName: "create-reservation", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "reservations", description: "Créer une réservation classique réelle." },
  "reservations.zero_attente.create": { functionName: "create-zero-attente-reservation", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "reservations", description: "Créer une réservation Zéro Attente réelle." },
  "reservations.golden_tok.create": { functionName: "create-chefs-table-reservation", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "reservations", description: "Créer une réservation La Tok d'Or réelle." },
  "subscription.tok_one.manage": { functionName: "manage-tok-one-subscription", roles: ["client"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "subscriptions", description: "Gérer l'abonnement client TOK One." },
  "account.delete": { functionName: "delete-account", roles: [], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "account", description: "Supprimer le compte de l'utilisateur authentifié via le flux RGPD TOK." },
  "ai.client.chat": { functionName: "ai-client-chat", roles: ["client"], methods: ["POST"], confirmationRequired: false, idempotencyRequired: false, category: "ai", description: "Utiliser l'assistant IA client TOK." },
  "restaurant.orders.status": { functionName: "restaurant-order-status", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "restaurant_operations", description: "Modifier un statut de commande restaurant avec contrôles serveur." },
  "restaurant.subscription.manage": { functionName: "manage-restaurant-subscription", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "subscriptions", description: "Gérer l'abonnement restaurateur." },
  "restaurant.stripe_connect.onboard": { functionName: "stripe-connect-onboard", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "payments", description: "Démarrer l'onboarding Stripe Connect du restaurant." },
  "restaurant.stripe_connect.status": { functionName: "stripe-connect-status", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: false, idempotencyRequired: false, category: "payments", description: "Lire le statut Stripe Connect du restaurant." },
  "restaurant.campaign.generate": { functionName: "generate-campaign", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "marketing", description: "Générer une campagne via le flux TOK existant." },
  "restaurant.campaign.portal": { functionName: "campaign-portal", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "marketing", description: "Piloter les opérations du portail campagnes." },
  "restaurant.social.boost": { functionName: "create-social-post-boost", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "marketing", description: "Créer une mise en avant sponsorisée d'une publication." },
  "restaurant.floorplan.ai": { functionName: "floorplan-ai", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "ai", description: "Utiliser l'IA du plan de salle." },
  "restaurant.advisor": { functionName: "restaurant-advisor", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: false, idempotencyRequired: false, category: "ai", description: "Utiliser l'assistant conseiller restaurateur." },
  "restaurant.ai.agent": { functionName: "ai-restaurant-agent", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: false, idempotencyRequired: false, category: "ai", description: "Utiliser les agents IA restaurateur." },
  "restaurant.ai.image": { functionName: "ai-image-enhance", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "ai", description: "Générer ou retoucher un visuel via PhotoPro." },
  "restaurant.ai.daily_dish": { functionName: "daily-dish-ai", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "ai", description: "Générer le plat du jour via le backend TOK." },
  "restaurant.menu.import_image": { functionName: "menu-image-import", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "menu", description: "Extraire un menu depuis des images." },
  "restaurant.media.manage": { functionName: "restaurant-media-governance", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "media", description: "Gérer les médias restaurant via le backend gouverné." },
  "restaurant.invoices.generate": { functionName: "generate-invoices", roles: ["restaurateur", "restaurant_owner", "admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "billing", description: "Générer les factures autorisées." },
  "courier.portal": { functionName: "courier-portal", roles: ["courier", "admin"], methods: ["GET", "POST"], confirmationRequired: true, idempotencyRequired: true, category: "courier", description: "Piloter les actions du portail livreur." },
  "admin.refund": { functionName: "process-refund", roles: ["admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "admin_finance", description: "Traiter un remboursement via le flux admin sécurisé." },
  "admin.restaurant.adjustment": { functionName: "admin-restaurant-adjustment", roles: ["admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "admin", description: "Appliquer un ajustement administratif restaurant." },
  "admin.commercial.provision": { functionName: "provision-commercial-accounts", roles: ["admin"], methods: ["POST"], confirmationRequired: true, idempotencyRequired: true, category: "admin", description: "Provisionner des comptes commerciaux avec les contrôles admin existants." },
  "admin.ai.chat": { functionName: "ai-admin-dashboard-chat", roles: ["admin"], methods: ["POST"], confirmationRequired: false, idempotencyRequired: false, category: "ai", description: "Utiliser l'assistant IA du dashboard admin." },
};

const DATA_TABLE_ROLES: Record<string, string[]> = {
  profiles: [],
  user_profiles: [],
  favorites: ["client", "admin"],
  notification_preferences: [],
  reviews: ["client", "admin"],
  social_post_comments: [],
  social_post_saves: [],
  menu_items: ["restaurateur", "restaurant_owner", "admin"],
  restaurant_promotions: ["restaurateur", "restaurant_owner", "admin"],
  restaurant_hours: ["restaurateur", "restaurant_owner", "admin"],
  restaurant_branches: ["restaurateur", "restaurant_owner", "admin"],
  social_posts: ["restaurateur", "restaurant_owner", "admin"],
};

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

function assertIdentifier(value: string, label: string) {
  if (!SAFE_IDENTIFIER.test(value)) throw new HttpError(400, `${label}_invalid`);
}

function assertRoles(actor: RequestActor, allowedRoles: string[]) {
  if (allowedRoles.length === 0) {
    if (!actor.userId) throw new HttpError(401, "tok_connect_user_required");
    return;
  }
  requireUserRole(actor, allowedRoles);
}

function assertConfirmation(body: JsonRecord, required: boolean) {
  if (required && body.confirmed_by_user !== true) {
    throw new HttpError(409, "tok_connect_human_confirmation_required");
  }
}

function readIdempotencyKey(body: JsonRecord, required: boolean) {
  const value = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!required && !value) return null;
  if (!IDEMPOTENCY_KEY.test(value)) throw new HttpError(400, "tok_connect_idempotency_key_required");
  return value;
}

async function claimIdempotency(actor: RequestActor, key: string, operation: string, requestHash: string) {
  if (!actor.userId) throw new HttpError(401, "tok_connect_user_required");
  const { data: existing, error: readError } = await actor.adminClient
    .from(IDEMPOTENCY_TABLE)
    .select("request_hash,response_body,status_code,expires_at")
    .eq("user_id", actor.userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (readError) throw new HttpError(500, readError.message);
  if (existing) {
    if (existing.request_hash !== requestHash) throw new HttpError(409, "tok_connect_idempotency_key_reused_with_different_body");
    if (existing.response_body && existing.status_code) {
      return { replay: true, responseBody: existing.response_body as JsonRecord, statusCode: Number(existing.status_code) };
    }
    throw new HttpError(409, "tok_connect_idempotency_request_in_progress");
  }

  const { error: insertError } = await actor.adminClient.from(IDEMPOTENCY_TABLE).insert({
    user_id: actor.userId,
    idempotency_key: key,
    operation,
    request_hash: requestHash,
  });
  if (insertError) {
    if (String(insertError.code || "") === "23505") return await claimIdempotency(actor, key, operation, requestHash);
    throw new HttpError(500, insertError.message);
  }
  return { replay: false as const };
}

async function completeIdempotency(actor: RequestActor, key: string, responseBody: JsonRecord, statusCode: number) {
  if (!actor.userId) return;
  await actor.adminClient.from(IDEMPOTENCY_TABLE).update({ response_body: responseBody, status_code: statusCode })
    .eq("user_id", actor.userId)
    .eq("idempotency_key", key);
}

function publicCapabilities(actor: RequestActor) {
  return Object.entries(EDGE_CAPABILITIES)
    .filter(([, capability]) => capability.roles.length === 0 || capability.roles.some((role) => actor.roles.includes(role)) || actor.isAdmin)
    .map(([name, capability]) => ({
      name,
      mode: "edge",
      category: capability.category,
      description: capability.description,
      methods: capability.methods,
      confirmation_required: capability.confirmationRequired,
      idempotency_required: capability.idempotencyRequired,
    }));
}

async function invokeEdge(req: Request, actor: RequestActor, body: JsonRecord) {
  const capabilityName = typeof body.capability === "string" ? body.capability : "";
  const capability = EDGE_CAPABILITIES[capabilityName];
  if (!capability) throw new HttpError(404, "tok_connect_capability_not_found");
  assertRoles(actor, capability.roles);
  assertConfirmation(body, capability.confirmationRequired);
  const method = String(body.method || capability.methods[0]).toUpperCase() as "GET" | "POST";
  if (!capability.methods.includes(method)) throw new HttpError(405, "tok_connect_capability_method_not_allowed");
  const payload = isRecord(body.payload) ? body.payload : {};
  const idempotencyKey = readIdempotencyKey(body, capability.idempotencyRequired);
  const requestHash = await sha256Base64Url(stableStringify({ mode: "edge", capability: capabilityName, method, payload }));
  if (idempotencyKey) {
    const decision = await claimIdempotency(actor, idempotencyKey, `edge:${capabilityName}`, requestHash);
    if (decision.replay) return { statusCode: decision.statusCode, payload: { ...decision.responseBody, replayed: true } };
  }

  const headers = new Headers({ accept: "application/json, text/plain, text/event-stream" });
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (anonKey) headers.set("apikey", anonKey);
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  if (method === "POST") headers.set("content-type", "application/json");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${capability.functionName}`, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
  const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
  let downstream: unknown = text;
  try { downstream = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  const result: JsonRecord = {
    ok: response.ok,
    mode: "edge",
    capability: capabilityName,
    downstream_status: response.status,
    data: downstream,
    replayed: false,
  };
  if (idempotencyKey) await completeIdempotency(actor, idempotencyKey, result, response.status);
  return { statusCode: response.ok ? 200 : response.status, payload: result };
}

function rpcRole(name: string) {
  if (name.startsWith("admin_")) return ["admin"];
  if (name.startsWith("restaurant_")) return ["restaurateur", "restaurant_owner", "admin"];
  throw new HttpError(403, "tok_connect_rpc_not_allowlisted");
}

async function invokeRpc(actor: RequestActor, body: JsonRecord) {
  const rpcName = typeof body.rpc_name === "string" ? body.rpc_name.trim() : "";
  assertIdentifier(rpcName, "rpc_name");
  assertRoles(actor, rpcRole(rpcName));
  assertConfirmation(body, true);
  const args = isRecord(body.args) ? body.args : {};
  const idempotencyKey = readIdempotencyKey(body, true)!;
  const requestHash = await sha256Base64Url(stableStringify({ mode: "rpc", rpc_name: rpcName, args }));
  const decision = await claimIdempotency(actor, idempotencyKey, `rpc:${rpcName}`, requestHash);
  if (decision.replay) return { statusCode: decision.statusCode, payload: { ...decision.responseBody, replayed: true } };
  if (!actor.userClient) throw new HttpError(401, "tok_connect_user_client_required");
  const { data, error } = await actor.userClient.rpc(rpcName, args);
  const result: JsonRecord = error
    ? { ok: false, mode: "rpc", rpc_name: rpcName, error: { code: error.code, message: error.message }, replayed: false }
    : { ok: true, mode: "rpc", rpc_name: rpcName, data, replayed: false };
  const statusCode = error ? 400 : 200;
  await completeIdempotency(actor, idempotencyKey, result, statusCode);
  return { statusCode, payload: result };
}

function tableRoles(table: string) {
  const roles = DATA_TABLE_ROLES[table];
  if (!roles) throw new HttpError(403, "tok_connect_table_not_allowlisted");
  return roles;
}

function applyFilters(query: any, filters: BridgeFilter[]) {
  let next = query;
  for (const filter of filters) {
    if (!filter || typeof filter.column !== "string") throw new HttpError(400, "tok_connect_filter_invalid");
    assertIdentifier(filter.column, "filter_column");
    const operator = filter.operator || "eq";
    if (operator === "eq") next = next.eq(filter.column, filter.value);
    else if (operator === "neq") next = next.neq(filter.column, filter.value);
    else if (operator === "is") next = next.is(filter.column, filter.value);
    else if (operator === "in" && Array.isArray(filter.value)) next = next.in(filter.column, filter.value);
    else throw new HttpError(400, "tok_connect_filter_operator_invalid");
  }
  return next;
}

async function invokeData(actor: RequestActor, body: JsonRecord) {
  const table = typeof body.table === "string" ? body.table.trim() : "";
  assertIdentifier(table, "table");
  assertRoles(actor, tableRoles(table));
  if (!actor.userClient) throw new HttpError(401, "tok_connect_user_client_required");
  const operation = String(body.operation || "select") as DataOperation;
  if (!["select", "insert", "update", "delete"].includes(operation)) throw new HttpError(400, "tok_connect_data_operation_invalid");
  const filters = Array.isArray(body.filters) ? body.filters as BridgeFilter[] : [];
  const mutation = operation !== "select";
  if (mutation && filters.length === 0 && operation !== "insert") throw new HttpError(400, "tok_connect_mutation_filter_required");
  assertConfirmation(body, mutation);
  const idempotencyKey = readIdempotencyKey(body, mutation);
  const values = body.values;
  const requestHash = mutation
    ? await sha256Base64Url(stableStringify({ mode: "data", table, operation, filters, values }))
    : "";
  if (mutation && idempotencyKey) {
    const decision = await claimIdempotency(actor, idempotencyKey, `data:${table}:${operation}`, requestHash);
    if (decision.replay) return { statusCode: decision.statusCode, payload: { ...decision.responseBody, replayed: true } };
  }

  let query: any = actor.userClient.from(table);
  if (operation === "select") {
    const select = typeof body.select === "string" && body.select.length <= 500 ? body.select : "*";
    query = applyFilters(query.select(select), filters).limit(Math.max(1, Math.min(Number(body.limit || 50), MAX_SELECT_LIMIT)));
  } else if (operation === "insert") {
    if (!isRecord(values) && !Array.isArray(values)) throw new HttpError(400, "tok_connect_values_required");
    query = query.insert(values as any).select();
  } else if (operation === "update") {
    if (!isRecord(values)) throw new HttpError(400, "tok_connect_values_required");
    query = applyFilters(query.update(values), filters).select();
  } else {
    query = applyFilters(query.delete(), filters).select();
  }
  const { data, error } = await query;
  const result: JsonRecord = error
    ? { ok: false, mode: "data", table, operation, error: { code: error.code, message: error.message }, replayed: false }
    : { ok: true, mode: "data", table, operation, data, replayed: false };
  const statusCode = error ? 400 : 200;
  if (mutation && idempotencyKey) await completeIdempotency(actor, idempotencyKey, result, statusCode);
  return { statusCode, payload: result };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (!isRequestOriginAllowed(req)) return new Response(null, { status: 403, headers: corsHeaders });
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405, corsHeaders);

  let actor: RequestActor | null = null;
  let body: JsonRecord = {};
  let statusCode = 500;
  let auditAction = "invoke";
  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "tok_connect_user_required");
    const limiter = createRateLimiter(actor.adminClient, FUNCTION_NAME);
    await limiter.consume(`user:${actor.userId}`, { maxRequests: 180, windowSeconds: 60 });
    body = await req.json().catch(() => ({}));
    const mode = String(body.mode || "") as BridgeMode;

    if (mode === "edge" && body.action === "list") {
      statusCode = 200;
      return jsonResponse({ ok: true, capabilities: publicCapabilities(actor), rpc_prefixes: actor.isAdmin ? ["admin_", "restaurant_"] : actor.roles.some((role) => ["restaurateur", "restaurant_owner"].includes(role)) ? ["restaurant_"] : [], data_tables: Object.keys(DATA_TABLE_ROLES).filter((table) => DATA_TABLE_ROLES[table].length === 0 || DATA_TABLE_ROLES[table].some((role) => actor!.roles.includes(role)) || actor!.isAdmin) }, 200, corsHeaders);
    }

    let result: { statusCode: number; payload: JsonRecord };
    if (mode === "edge") {
      auditAction = `edge:${String(body.capability || "unknown")}`;
      result = await invokeEdge(req, actor, body);
    } else if (mode === "rpc") {
      auditAction = `rpc:${String(body.rpc_name || "unknown")}`;
      result = await invokeRpc(actor, body);
    } else if (mode === "data") {
      auditAction = `data:${String(body.table || "unknown")}:${String(body.operation || "select")}`;
      result = await invokeData(actor, body);
    } else {
      throw new HttpError(400, "tok_connect_bridge_mode_invalid");
    }
    statusCode = result.statusCode;
    await writeAuditLog({ adminClient: actor.adminClient, functionName: FUNCTION_NAME, action: auditAction, actor, request: req, status: result.statusCode < 400 ? "success" : "failure", errorMessage: result.statusCode >= 400 ? String((result.payload.error as JsonRecord | undefined)?.message || "downstream_error") : null, metadata: { mode, idempotency_key_present: Boolean(body.idempotency_key) } });
    return jsonResponse(result.payload, result.statusCode, corsHeaders);
  } catch (error) {
    statusCode = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "tok_connect_app_bridge_error";
    if (actor) await writeAuditLog({ adminClient: actor.adminClient, functionName: FUNCTION_NAME, action: auditAction, actor, request: req, status: "failure", errorMessage: message, metadata: { idempotency_key_present: Boolean(body.idempotency_key) } });
    return jsonResponse({ ok: false, error: { code: message, message } }, statusCode, corsHeaders);
  }
});
