import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";

const PUBLIC_ORIGIN = (Deno.env.get("TOK_CONNECT_PUBLIC_ORIGIN") || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const CANONICAL_MCP = "tok-connect-mcp";
const FULL_APP_MCP = "tok-connect-full-app-mcp";
const API_FUNCTION = "tok-connect-api";
const ACTION_WINDOW_RESOURCE_URI = "ui://tok-connect/actions-window-v1.html";
const RESOURCE_METADATA_URL = `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource`;
const AUTHORIZATION_SERVER = "https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1";
const OIDC_SCOPES = ["openid", "email", "profile"];
const MAX_BODY_BYTES = 1_000_000;

const FULL_APP_TOOL_NAMES = new Set([
  "discover_tok_application",
  "open_tok_application_console",
  "plan_tok_application_route",
  "preview_tok_client_journey",
  "preview_tok_restaurant_journey",
  "preview_tok_admin_journey",
  "read_tok_restaurant_snapshot",
  "read_tok_availability_snapshot",
  "prepare_tok_human_confirmation_packet",
  "audit_tok_action_risk",
]);

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonObject = Record<string, unknown>;

type InternalResponse = {
  response: Response;
  json: JsonObject | null;
  text: string;
};

const OAUTH_SECURITY = [{ type: "oauth2", scopes: OIDC_SCOPES }];
const TOOL_UI_META = {
  ui: { resourceUri: ACTION_WINDOW_RESOURCE_URI, visibility: ["model", "app"] },
  "openai/outputTemplate": ACTION_WINDOW_RESOURCE_URI,
  "openai/widgetAccessible": true,
};

const GATEWAY_TOOLS = [
  {
    name: "search",
    title: "Search TOK restaurants",
    description: "Search the live TOK restaurant catalogue for ChatGPT knowledge and discovery. Authenticated users receive their authorized production view; unauthenticated calls remain sandbox-safe.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, maxLength: 160 },
        city: { type: "string", maxLength: 80 },
        cuisine: { type: "string", maxLength: 80 },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { results: { type: "array", items: { type: "object" } } },
      required: ["results"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "fetch",
    title: "Fetch a TOK restaurant",
    description: "Fetch one restaurant from TOK by its restaurant id after a search result.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", minLength: 1, maxLength: 120 } },
      additionalProperties: false,
    },
    outputSchema: { type: "object", properties: { document: { type: "object" } }, required: ["document"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META },
  },
  {
    name: "get_restaurant",
    title: "Get restaurant details",
    description: "Read the live TOK restaurant record, including public reservation and restaurant information.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", required: ["restaurant_id"], properties: { restaurant_id: { type: "string", format: "uuid" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META },
  },
  {
    name: "get_restaurant_menu",
    title: "Get restaurant menu",
    description: "Read the currently available menu items for an authorized TOK restaurant.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["restaurant_id"],
      properties: { restaurant_id: { type: "string", format: "uuid" }, limit: { type: "integer", minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META },
  },
  {
    name: "get_tok_credit_balance",
    title: "Get TOK credit balance",
    description: "Read TOK credit allowance, spend and balance for an authorized restaurant without spending credits.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", properties: { restaurant_id: { type: "string", format: "uuid" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META },
  },
  {
    name: "preview_reservation_cancellation",
    title: "Preview reservation cancellation",
    description: "Preview whether a TOK Connect reservation can be cancelled. This tool never cancels by itself.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", required: ["reservation_id"], properties: { reservation_id: { type: "string", format: "uuid" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META },
  },
  {
    name: "create_reservation",
    title: "Create a confirmed TOK reservation",
    description: "Create a real TOK reservation only after explicit end-user confirmation. The server rechecks grant, capacity and idempotency before writing production data.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "date", "time", "party_size", "confirmed_by_user", "idempotency_key"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        date: { type: "string", format: "date" },
        time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
        feature: { type: "string", maxLength: 80 },
        customer_note: { type: "string", maxLength: 1000 },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META, "openai/toolInvocation/invoking": "Confirmation de la réservation TOK…", "openai/toolInvocation/invoked": "Réservation TOK traitée" },
  },
  {
    name: "cancel_reservation",
    title: "Cancel a TOK reservation",
    description: "Cancel a TOK Connect reservation only after explicit end-user confirmation. The server limits cancellation to the originating integration and requires idempotency.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["reservation_id", "confirmed_by_user", "idempotency_key"],
      properties: {
        reservation_id: { type: "string", format: "uuid" },
        reason_code: { type: "string", maxLength: 80 },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META, "openai/toolInvocation/invoking": "Annulation TOK en cours…", "openai/toolInvocation/invoked": "Annulation TOK traitée" },
  },
];

const ACTION_WINDOW_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
:root{color-scheme:light dark;--orange:#f56a12;--gold:#f2b748;--green:#36b878;--bg:#fffdfa;--card:#fff;--text:#17120e;--muted:#6c6257;--line:#eadcca} @media(prefers-color-scheme:dark){:root{--bg:#0a0908;--card:#14120f;--text:#fff5e5;--muted:#c7bbaa;--line:#403526}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 85% 0,rgba(245,106,18,.18),transparent 34%),var(--bg);color:var(--text)}main{padding:18px;min-height:100vh}.top{display:flex;align-items:center;gap:12px;margin-bottom:14px}.logo{display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:linear-gradient(145deg,var(--gold),var(--orange));color:#1a1004;font-weight:950;box-shadow:0 12px 32px rgba(245,106,18,.25)}h1{font-size:22px;line-height:1.05;margin:0}.muted{color:var(--muted)}.card{border:1px solid var(--line);border-radius:20px;background:color-mix(in srgb,var(--card) 92%,transparent);padding:15px;box-shadow:0 16px 45px rgba(50,25,0,.08)}.status{display:inline-flex;gap:7px;align-items:center;border-radius:999px;padding:6px 10px;background:rgba(54,184,120,.12);color:var(--green);font-weight:800;font-size:12px}.dot{width:8px;height:8px;border-radius:50%;background:currentColor}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.metric{border:1px solid var(--line);border-radius:15px;padding:11px}.metric b{display:block;font-size:18px}.actions{margin-top:12px;display:grid;gap:8px}.action{padding:10px 12px;border-radius:14px;background:rgba(245,106,18,.09);border:1px solid rgba(245,106,18,.18)}pre{white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;margin:12px 0 0;padding:11px;border-radius:14px;background:rgba(0,0,0,.06);font-size:11px}@media(max-width:520px){main{padding:12px}.grid{grid-template-columns:1fr}}
</style>
</head>
<body><main><div class="top"><div class="logo">TOK</div><div><h1>TOK Connect</h1><div class="muted">ChatGPT × TOK · console sécurisée</div></div></div><section class="card"><span class="status"><span class="dot"></span>Connecteur prêt</span><div class="grid"><div class="metric"><b id="tool">Action TOK</b><span class="muted">outil courant</span></div><div class="metric"><b>Confirmation</b><span class="muted">mutations sensibles contrôlées</span></div></div><div class="actions" id="actions"><div class="action">Recherche, disponibilités, menus, performances et parcours TOK.</div><div class="action">Réservations réelles uniquement après confirmation explicite et idempotence.</div><div class="action">Paiements, remboursements, publications et admin restent dans les flux TOK protégés.</div></div><pre id="payload" hidden></pre></section></main><script>
function render(data){const sc=data&&typeof data==='object'?(data.structuredContent||data):{};const current=sc.current_action||sc.reservation||sc.cancellation||null;if(current){document.getElementById('tool').textContent=current.title||current.name||'Action TOK'}const p=document.getElementById('payload');if(sc&&Object.keys(sc).length){p.hidden=false;p.textContent=JSON.stringify(sc,null,2)}}
render(window.openai?.toolOutput||{});window.addEventListener('openai:set_globals',e=>render(e.detail?.globals?.toolOutput||e.detail?.toolOutput||{}));
</script></body></html>`;

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function toolResult(data: unknown, text?: string, isError = false) {
  return {
    content: [{ type: "text", text: text || JSON.stringify(data) }],
    structuredContent: data && typeof data === "object" ? data : { value: data },
    ...(isError ? { isError: true } : {}),
    _meta: { ui: { resourceUri: ACTION_WINDOW_RESOURCE_URI }, "openai/outputTemplate": ACTION_WINDOW_RESOURCE_URI },
  };
}

function copyRequestHeaders(req: Request) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: req.headers.get("accept") || "application/json, text/event-stream",
  });
  for (const name of ["authorization", "origin", "mcp-protocol-version", "mcp-session-id", "last-event-id", "user-agent"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (anonKey) headers.set("apikey", anonKey);
  return headers;
}

async function internalMcp(slug: string, rpc: JsonRpcRequest, req: Request): Promise<InternalResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: "POST",
    headers: copyRequestHeaders(req),
    body: JSON.stringify(rpc),
  });
  const text = await response.text();
  let json: JsonObject | null = null;
  if (text) {
    try { json = JSON.parse(text) as JsonObject; } catch { json = null; }
  }
  return { response, json, text };
}

function responseHeaders(req: Request, internal?: Response) {
  const headers = new Headers(buildCorsHeaders(req));
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow, nosnippet, noarchive");
  headers.set("content-type", internal?.headers.get("content-type") || "application/json");
  headers.set("mcp-protocol-version", internal?.headers.get("mcp-protocol-version") || req.headers.get("mcp-protocol-version") || "2025-11-25");
  for (const name of ["www-authenticate", "mcp-session-id"]) {
    const value = internal?.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function relay(req: Request, internal: InternalResponse) {
  return new Response(internal.text || null, {
    status: internal.response.status,
    headers: responseHeaders(req, internal.response),
  });
}

function asRpcTools(payload: JsonObject | null) {
  const result = payload?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const tools = (result as JsonObject).tools;
  return Array.isArray(tools) ? tools.filter((tool) => tool && typeof tool === "object") : [];
}

function asRpcArray(payload: JsonObject | null, key: string) {
  const result = payload?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const value = (result as JsonObject)[key];
  return Array.isArray(value) ? value : [];
}

function mergeNamed(items: unknown[], key: string) {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const name = String((item as JsonObject)[key] || "");
    const fingerprint = name || JSON.stringify(item);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    merged.push(item);
  }
  return merged;
}

function argsOf(rpc: JsonRpcRequest) {
  const params = rpc.params && typeof rpc.params === "object" ? rpc.params : {};
  const args = params.arguments;
  return args && typeof args === "object" && !Array.isArray(args) ? args as JsonObject : {};
}

async function callRest(req: Request, path: string, init: { method?: string; body?: JsonObject; idempotencyKey?: string } = {}) {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (anonKey) headers.set("apikey", anonKey);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  return await fetch(`${SUPABASE_URL}/functions/v1/${API_FUNCTION}${path}`, {
    method: init.method || "GET",
    headers,
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

async function restTool(req: Request, rpc: JsonRpcRequest, path: string, init: { method?: string; body?: JsonObject; idempotencyKey?: string } = {}) {
  if (!req.headers.get("authorization")) {
    return jsonRpcResult(rpc.id, toolResult({ auth_required: true, resource_metadata: RESOURCE_METADATA_URL }, "Connexion TOK requise pour cette action.", true));
  }
  const response = await callRest(req, path, init);
  const payload = await response.json().catch(() => ({ ok: false, error: { code: "invalid_response", message: "invalid_response" } })) as JsonObject;
  const ok = payload.ok === true;
  const data = ok ? payload.data : payload;
  return jsonRpcResult(rpc.id, toolResult(data, undefined, !ok));
}

async function handleGatewayTool(req: Request, rpc: JsonRpcRequest, name: string) {
  const args = argsOf(rpc);

  if (name === "search") {
    const forwarded: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: rpc.id,
      method: "tools/call",
      params: {
        name: "search_restaurants",
        arguments: {
          query: args.query,
          city: args.city,
          cuisine: args.cuisine,
          limit: args.limit || 10,
        },
      },
    };
    const internal = await internalMcp(CANONICAL_MCP, forwarded, req);
    if (!internal.json || internal.json.error) return internal.json || jsonRpcError(rpc.id, -32000, "TOK search unavailable");
    const result = internal.json.result as JsonObject | undefined;
    const structured = result?.structuredContent as JsonObject | undefined;
    const restaurants = Array.isArray(structured?.restaurants) ? structured?.restaurants : [];
    const results = restaurants.map((restaurant) => {
      const item = restaurant as JsonObject;
      const id = String(item.id || "");
      const name = String(item.name || "Restaurant TOK");
      const city = String(item.city || "");
      const cuisine = String(item.cuisine_type || item.cuisine || "");
      return {
        id,
        title: name,
        url: `${PUBLIC_ORIGIN}/restaurant/${encodeURIComponent(id)}`,
        text: [name, cuisine, city].filter(Boolean).join(" · "),
        metadata: { city, cuisine },
      };
    });
    return jsonRpcResult(rpc.id, toolResult({ results }));
  }

  if (name === "fetch") {
    const id = String(args.id || "");
    const responseRpc = await restTool(req, rpc, `/v1/restaurants/${encodeURIComponent(id)}`);
    const wrapped = (responseRpc.result as JsonObject | undefined)?.structuredContent as JsonObject | undefined;
    const restaurant = wrapped?.restaurant as JsonObject | undefined;
    if (!restaurant) return responseRpc;
    return jsonRpcResult(rpc.id, toolResult({
      document: {
        id,
        title: String(restaurant.name || "Restaurant TOK"),
        url: `${PUBLIC_ORIGIN}/restaurant/${encodeURIComponent(id)}`,
        text: JSON.stringify(restaurant),
        metadata: restaurant,
      },
    }));
  }

  if (name === "get_restaurant") {
    return await restTool(req, rpc, `/v1/restaurants/${encodeURIComponent(String(args.restaurant_id || ""))}`);
  }

  if (name === "get_restaurant_menu") {
    const limit = Math.min(Math.max(Number(args.limit || 50), 1), 100);
    return await restTool(req, rpc, `/v1/restaurants/${encodeURIComponent(String(args.restaurant_id || ""))}/menu?limit=${limit}`);
  }

  if (name === "get_tok_credit_balance") {
    const restaurantId = args.restaurant_id ? `?restaurant_id=${encodeURIComponent(String(args.restaurant_id))}` : "";
    return await restTool(req, rpc, `/v1/credits/balance${restaurantId}`);
  }

  if (name === "preview_reservation_cancellation") {
    return await restTool(req, rpc, `/v1/reservations/${encodeURIComponent(String(args.reservation_id || ""))}/cancel/preview`, { method: "POST", body: {} });
  }

  if (name === "create_reservation") {
    if (args.confirmed_by_user !== true) {
      return jsonRpcResult(rpc.id, toolResult({ confirmation_required: true }, "La réservation n'a pas été créée : confirmation explicite requise.", true));
    }
    const idempotencyKey = String(args.idempotency_key || "");
    return await restTool(req, rpc, "/v1/reservations", {
      method: "POST",
      idempotencyKey,
      body: {
        restaurant_id: args.restaurant_id,
        date: args.date,
        time: args.time,
        party_size: args.party_size,
        feature: args.feature || "classique",
        customer_note: args.customer_note || null,
        confirmed_by: "end_user",
        metadata: { source: "chatgpt_tok_connect" },
      },
    });
  }

  if (name === "cancel_reservation") {
    if (args.confirmed_by_user !== true) {
      return jsonRpcResult(rpc.id, toolResult({ confirmation_required: true }, "La réservation n'a pas été annulée : confirmation explicite requise.", true));
    }
    const idempotencyKey = String(args.idempotency_key || "");
    return await restTool(req, rpc, `/v1/reservations/${encodeURIComponent(String(args.reservation_id || ""))}/cancel`, {
      method: "POST",
      idempotencyKey,
      body: { confirmed_by: "end_user", reason_code: args.reason_code || "user_requested" },
    });
  }

  return jsonRpcError(rpc.id, -32601, `Unknown TOK gateway tool: ${name}`);
}

function cleanActionResource(id: JsonRpcRequest["id"]) {
  return jsonRpcResult(id, {
    contents: [{
      uri: ACTION_WINDOW_RESOURCE_URI,
      mimeType: "text/html;profile=mcp-app",
      text: ACTION_WINDOW_HTML,
      _meta: {
        ui: { prefersBorder: false, domain: PUBLIC_ORIGIN },
        "openai/widgetDescription": "Console TOK Connect sécurisée pour les parcours et actions TOK dans ChatGPT.",
        "openai/widgetCSP": {
          connect_domains: [PUBLIC_ORIGIN, SUPABASE_URL],
          resource_domains: [PUBLIC_ORIGIN],
        },
      },
    }],
  });
}

async function mergedList(req: Request, rpc: JsonRpcRequest, key: "tools" | "resources" | "prompts") {
  const [canonical, full] = await Promise.all([
    internalMcp(CANONICAL_MCP, rpc, req),
    internalMcp(FULL_APP_MCP, rpc, req),
  ]);
  if (!canonical.json && !full.json) return relay(req, canonical);
  const canonicalItems = key === "tools" ? asRpcTools(canonical.json) : asRpcArray(canonical.json, key);
  const fullItems = key === "tools" ? asRpcTools(full.json) : asRpcArray(full.json, key);
  const extras = key === "tools" ? GATEWAY_TOOLS : [];
  const merged = mergeNamed([...canonicalItems, ...fullItems, ...extras], key === "resources" ? "uri" : "name");
  return new Response(JSON.stringify(jsonRpcResult(rpc.id, { [key]: merged })), { status: 200, headers: responseHeaders(req, canonical.response) });
}

async function fallbackRead(req: Request, rpc: JsonRpcRequest) {
  const canonical = await internalMcp(CANONICAL_MCP, rpc, req);
  if (canonical.json && !canonical.json.error) return relay(req, canonical);
  const full = await internalMcp(FULL_APP_MCP, rpc, req);
  return relay(req, full);
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (!isRequestOriginAllowed(req)) return new Response(null, { status: 403, headers: corsHeaders });
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const url = new URL(req.url);
  if (url.searchParams.get("tok_connect_route") === "protected-resource") {
    return new Response(JSON.stringify({
      resource: `${PUBLIC_ORIGIN}/mcp`,
      authorization_servers: [AUTHORIZATION_SERVER],
      scopes_supported: OIDC_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${PUBLIC_ORIGIN}/tok-connect/developer`,
    }), { status: 200, headers: new Headers({ ...Object.fromEntries(corsHeaders.entries()), "content-type": "application/json", "cache-control": "no-store", "mcp-protocol-version": "2025-11-25" }) });
  }

  if (req.method === "GET") return new Response(null, { status: 405, headers: new Headers({ ...Object.fromEntries(corsHeaders.entries()), allow: "POST, OPTIONS", "cache-control": "no-store", "mcp-protocol-version": "2025-11-25" }) });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: new Headers({ ...Object.fromEntries(corsHeaders.entries()), allow: "POST, OPTIONS" }) });

  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return new Response(JSON.stringify(jsonRpcError(null, -32600, "Request body too large")), { status: 413, headers: responseHeaders(req) });

  let rpc: JsonRpcRequest;
  try { rpc = await req.json() as JsonRpcRequest; } catch { return new Response(JSON.stringify(jsonRpcError(null, -32700, "Parse error")), { status: 400, headers: responseHeaders(req) }); }
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return new Response(JSON.stringify(jsonRpcError(rpc.id, -32600, "Invalid Request")), { status: 400, headers: responseHeaders(req) });

  try {
    if (rpc.method === "tools/list") return await mergedList(req, rpc, "tools");
    if (rpc.method === "resources/list") return await mergedList(req, rpc, "resources");
    if (rpc.method === "prompts/list") return await mergedList(req, rpc, "prompts");

    if (rpc.method === "resources/read") {
      const uri = String(rpc.params?.uri || "");
      if (uri === ACTION_WINDOW_RESOURCE_URI) return new Response(JSON.stringify(cleanActionResource(rpc.id)), { status: 200, headers: responseHeaders(req) });
      return await fallbackRead(req, rpc);
    }

    if (rpc.method === "prompts/get") return await fallbackRead(req, rpc);

    if (rpc.method === "tools/call") {
      const name = String(rpc.params?.name || "");
      if (GATEWAY_TOOLS.some((tool) => tool.name === name)) {
        const payload = await handleGatewayTool(req, rpc, name);
        return new Response(JSON.stringify(payload), { status: 200, headers: responseHeaders(req) });
      }
      if (FULL_APP_TOOL_NAMES.has(name)) return relay(req, await internalMcp(FULL_APP_MCP, rpc, req));
      return relay(req, await internalMcp(CANONICAL_MCP, rpc, req));
    }

    const canonical = await internalMcp(CANONICAL_MCP, rpc, req);
    if (rpc.method === "initialize" && canonical.json && !canonical.json.error) {
      const result = canonical.json.result;
      if (result && typeof result === "object" && !Array.isArray(result)) {
        (result as JsonObject).serverInfo = { name: "TOK Connect for ChatGPT", version: "3.0.0" };
        (result as JsonObject).instructions = "TOK Connect exposes the TOK application through one secured MCP gateway. Use reads and previews freely within grants; create or cancel reservations only after explicit user confirmation. Payments, refunds, publications, credit debits and admin mutations stay inside protected TOK flows.";
      }
      return new Response(JSON.stringify(canonical.json), { status: canonical.response.status, headers: responseHeaders(req, canonical.response) });
    }
    return relay(req, canonical);
  } catch (error) {
    console.error("tok-connect-chatgpt", error);
    return new Response(JSON.stringify(jsonRpcError(rpc.id, -32000, error instanceof Error ? error.message : "TOK Connect gateway error")), { status: 500, headers: responseHeaders(req) });
  }
});
