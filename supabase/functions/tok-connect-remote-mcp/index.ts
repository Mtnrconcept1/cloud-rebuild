import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";
import {
  MCP_LATEST_PROTOCOL_VERSION,
  McpProtocolError,
  assertMcpAcceptHeader,
  assertMcpContentType,
  assertMcpProtocolVersion,
  assertMcpRoutingHeaders,
  negotiateMcpProtocolVersion,
  parseMcpJsonRpcRequest,
  type McpJsonRpcRequest,
} from "../_shared/mcp-http.ts";

const PUBLIC_ORIGIN = (Deno.env.get("TOK_CONNECT_PUBLIC_ORIGIN") || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const UPSTREAM_MCP_URL = `${SUPABASE_URL}/functions/v1/tok-connect-chatgpt`;
const APP_BRIDGE_URL = `${SUPABASE_URL}/functions/v1/tok-connect-app-bridge`;
const COMMERCIAL_BRIDGE_URL = `${SUPABASE_URL}/functions/v1/tok-connect-commercial-bridge`;
const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`;
const RESOURCE_METADATA_URL = `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource`;
const OIDC_SCOPES = ["openid", "email", "profile"];
const INTERNAL_MCP_PROTOCOL_VERSION = "2025-11-25";
const CLAUDE_ORIGIN = "https://claude.ai";
const OAUTH_SECURITY = [{ type: "oauth2", scopes: OIDC_SCOPES }];

type JsonRecord = Record<string, unknown>;

const APP_BRIDGE_TOOLS = [
  {
    name: "tok_list_capabilities",
    title: "List authenticated TOK capabilities",
    description: "List the real TOK application capabilities, RPC families and RLS-backed data surfaces available to the authenticated user's roles.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_invoke_capability",
    title: "Execute a TOK application capability",
    description: "Execute an allowlisted TOK Edge Function using the authenticated user's JWT. Sensitive actions require explicit user confirmation and an idempotency key. The downstream TOK backend rechecks roles, ownership, payments and business rules.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["capability"],
      properties: {
        capability: { type: "string", minLength: 1, maxLength: 120 },
        method: { type: "string", enum: ["GET", "POST"] },
        payload: { type: "object" },
        confirmed_by_user: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_invoke_rpc",
    title: "Execute an authorized TOK business RPC",
    description: "Execute a TOK restaurant_* or admin_* business RPC with the authenticated user's database identity. Restaurant RPCs require restaurateur access; admin RPCs require the admin role. Confirmation and idempotency are mandatory.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["rpc_name", "args", "confirmed_by_user", "idempotency_key"],
      properties: {
        rpc_name: { type: "string", pattern: "^(restaurant_|admin_)[A-Za-z0-9_]+$", maxLength: 160 },
        args: { type: "object" },
        confirmed_by_user: { type: "boolean", const: true },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_data",
    title: "Read or mutate an allowlisted TOK data surface",
    description: "Read or mutate the small allowlist of TOK tables that the application itself accesses directly under RLS. All queries use the authenticated user's JWT; writes require confirmation and idempotency, and update/delete require filters.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["table", "operation"],
      properties: {
        table: { type: "string", enum: ["profiles", "user_profiles", "favorites", "notification_preferences", "reviews", "social_post_comments", "social_post_saves", "menu_items", "restaurant_promotions", "restaurant_hours", "restaurant_branches", "social_posts"] },
        operation: { type: "string", enum: ["select", "insert", "update", "delete"] },
        select: { type: "string", maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        filters: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            required: ["column", "value"],
            properties: {
              column: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
              operator: { type: "string", enum: ["eq", "neq", "is", "in"] },
              value: {},
            },
            additionalProperties: false,
          },
        },
        values: {},
        confirmed_by_user: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
  {
    name: "tok_commercial",
    title: "Operate the authenticated TOK commercial workspace",
    description: "Use commercial-only TOK RPCs, read commercial RLS data, or provision the isolated demo session. The commercial bridge requires the commercial or admin role; mutating RPCs and demo provisioning require confirmation and idempotency.",
    securitySchemes: OAUTH_SECURITY,
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["list", "rpc", "read", "demo_session"] },
        rpc_name: { type: "string", maxLength: 160 },
        args: { type: "object" },
        table: { type: "string", maxLength: 160 },
        select: { type: "string", maxLength: 500 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        filters: { type: "array", maxItems: 20, items: { type: "object" } },
        payload: { type: "object" },
        confirmed_by_user: { type: "boolean" },
        idempotency_key: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9:_-]+$" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { securitySchemes: OAUTH_SECURITY },
  },
];

const APP_BRIDGE_TOOL_NAMES = new Set(APP_BRIDGE_TOOLS.map((tool) => tool.name));

function remoteCorsHeaders(req: Request) {
  const headers = buildCorsHeaders(req);
  if (req.headers.get("origin") === CLAUDE_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = CLAUDE_ORIGIN;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function isRemoteMcpOriginAllowed(req: Request) {
  return isRequestOriginAllowed(req) || req.headers.get("origin") === CLAUDE_ORIGIN;
}

function jsonRpcResult(id: McpJsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcError(id: McpJsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function requestHeaders(req: Request, rpc: McpJsonRpcRequest) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: req.headers.get("accept") || "application/json, text/event-stream",
  });
  for (const name of ["authorization", "origin", "user-agent", "last-event-id"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const protocolVersion = req.headers.get("mcp-protocol-version");
  headers.set(
    "mcp-protocol-version",
    protocolVersion === "2026-07-28" ? INTERNAL_MCP_PROTOCOL_VERSION : protocolVersion || INTERNAL_MCP_PROTOCOL_VERSION,
  );
  const sessionId = req.headers.get("mcp-session-id");
  if (sessionId && protocolVersion !== "2026-07-28") headers.set("mcp-session-id", sessionId);
  headers.set("mcp-method", rpc.method);
  if (rpc.method === "tools/call") {
    const toolName = typeof rpc.params?.name === "string" ? rpc.params.name : "";
    if (toolName) headers.set("mcp-name", toolName);
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (anonKey) headers.set("apikey", anonKey);
  return headers;
}

function responseHeaders(req: Request, upstream?: Response) {
  const headers = new Headers(remoteCorsHeaders(req));
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, nofollow, nosnippet, noarchive");
  headers.set("content-type", upstream?.headers.get("content-type") || "application/json");
  headers.set(
    "mcp-protocol-version",
    req.headers.get("mcp-protocol-version") || upstream?.headers.get("mcp-protocol-version") || MCP_LATEST_PROTOCOL_VERSION,
  );
  for (const name of ["www-authenticate", "mcp-session-id"]) {
    const value = upstream?.headers.get(name);
    if (value && !(name === "mcp-session-id" && req.headers.get("mcp-protocol-version") === "2026-07-28")) {
      headers.set(name, value);
    }
  }
  return headers;
}

function normalizeInitialize(payload: unknown, request: McpJsonRpcRequest) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rpc = payload as Record<string, unknown>;
  const result = rpc.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  const next = { ...(result as Record<string, unknown>) };
  next.protocolVersion = negotiateMcpProtocolVersion(request.params);
  next.serverInfo = { name: "TOK Connect Remote MCP", version: "5.1.0" };
  next.instructions = "TOK Connect is a provider-neutral remote MCP server for Claude, ChatGPT and other MCP clients. Once authenticated, use tok_list_capabilities to discover the actions authorized by the user's TOK roles. Reads run under the user's JWT and RLS. Real writes, payments, refunds, publications and admin actions use allowlisted TOK backends or business RPCs and require explicit confirmation plus idempotency where applicable. The commercial role is isolated behind tok_commercial. Service-role, scheduler-only and webhook-only operations are never exposed.";
  return { ...rpc, result: next };
}

async function upstreamRequest(req: Request, rpc: McpJsonRpcRequest) {
  return await fetch(UPSTREAM_MCP_URL, { method: "POST", headers: requestHeaders(req, rpc), body: JSON.stringify(rpc) });
}

function mergeTools(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rpc = payload as JsonRecord;
  const result = rpc.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  const tools = Array.isArray((result as JsonRecord).tools) ? (result as JsonRecord).tools as unknown[] : [];
  const seen = new Set(tools.map((tool) => tool && typeof tool === "object" ? String((tool as JsonRecord).name || "") : ""));
  const additions = APP_BRIDGE_TOOLS.filter((tool) => !seen.has(tool.name));
  return { ...rpc, result: { ...(result as JsonRecord), tools: [...tools, ...additions] } };
}

function authToolResult(message = "Connexion TOK requise pour cette action.") {
  const challenge = `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`;
  return { content: [{ type: "text", text: message }], isError: true, _meta: { "mcp/www_authenticate": [challenge] } };
}

function bridgeToolBody(name: string, args: JsonRecord) {
  if (name === "tok_list_capabilities") return { mode: "edge", action: "list" };
  if (name === "tok_invoke_capability") return {
    mode: "edge", capability: args.capability, method: args.method, payload: args.payload || {},
    confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key,
  };
  if (name === "tok_invoke_rpc") return {
    mode: "rpc", rpc_name: args.rpc_name, args: args.args || {},
    confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key,
  };
  if (name === "tok_commercial") return {
    action: args.action,
    rpc_name: args.rpc_name,
    args: args.args || {},
    table: args.table,
    select: args.select,
    limit: args.limit,
    filters: args.filters || [],
    payload: args.payload || {},
    confirmed_by_user: args.confirmed_by_user,
    idempotency_key: args.idempotency_key,
  };
  return {
    mode: "data", table: args.table, operation: args.operation, select: args.select, limit: args.limit,
    filters: args.filters || [], values: args.values,
    confirmed_by_user: args.confirmed_by_user, idempotency_key: args.idempotency_key,
  };
}

async function callAppBridge(req: Request, rpc: McpJsonRpcRequest, name: string) {
  const authorization = req.headers.get("authorization");
  if (!authorization) return jsonRpcResult(rpc.id, authToolResult());
  const args = rpc.params?.arguments && typeof rpc.params.arguments === "object" && !Array.isArray(rpc.params.arguments)
    ? rpc.params.arguments as JsonRecord
    : {};
  const headers = new Headers({ "content-type": "application/json", accept: "application/json", authorization });
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (anonKey) headers.set("apikey", anonKey);
  const targetUrl = name === "tok_commercial" ? COMMERCIAL_BRIDGE_URL : APP_BRIDGE_URL;
  const response = await fetch(targetUrl, { method: "POST", headers, body: JSON.stringify(bridgeToolBody(name, args)) });
  const payload = await response.json().catch(() => ({ ok: false, error: { code: "tok_connect_bridge_invalid_response", message: "tok_connect_bridge_invalid_response" } })) as JsonRecord;
  if (response.status === 401) return jsonRpcResult(rpc.id, authToolResult());
  const text = payload.ok === false
    ? String((payload.error as JsonRecord | undefined)?.message || (payload.error as JsonRecord | undefined)?.code || "TOK action failed")
    : JSON.stringify(payload);
  return jsonRpcResult(rpc.id, {
    content: [{ type: "text", text }], structuredContent: payload, ...(response.ok ? {} : { isError: true }),
  });
}

async function relay(req: Request, rpc: McpJsonRpcRequest) {
  if (rpc.method === "tools/call") {
    const name = typeof rpc.params?.name === "string" ? rpc.params.name : "";
    if (APP_BRIDGE_TOOL_NAMES.has(name)) {
      const payload = await callAppBridge(req, rpc, name);
      return new Response(JSON.stringify(payload), { status: 200, headers: responseHeaders(req) });
    }
  }
  const upstream = await upstreamRequest(req, rpc);
  const text = await upstream.text();
  if (!text) return new Response(null, { status: upstream.status, headers: responseHeaders(req, upstream) });
  try {
    const parsed = JSON.parse(text);
    const payload = rpc.method === "initialize"
      ? normalizeInitialize(parsed, rpc)
      : rpc.method === "tools/list"
        ? mergeTools(parsed)
        : parsed;
    return new Response(JSON.stringify(payload), { status: upstream.status, headers: responseHeaders(req, upstream) });
  } catch {
    return new Response(text, { status: upstream.status, headers: responseHeaders(req, upstream) });
  }
}

Deno.serve(async (req) => {
  const corsHeaders = remoteCorsHeaders(req);
  if (!isRemoteMcpOriginAllowed(req)) return new Response(null, { status: 403, headers: corsHeaders });
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
      mcp_protocol_versions_supported: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"],
    }), {
      status: 200,
      headers: new Headers({ ...corsHeaders, "content-type": "application/json", "cache-control": "no-store", "mcp-protocol-version": MCP_LATEST_PROTOCOL_VERSION }),
    });
  }
  if (req.method === "GET") {
    return new Response(null, { status: 405, headers: new Headers({ ...corsHeaders, allow: "POST, OPTIONS", "cache-control": "no-store", "mcp-protocol-version": MCP_LATEST_PROTOCOL_VERSION }) });
  }
  if (req.method !== "POST") return new Response(null, { status: 405, headers: new Headers({ ...corsHeaders, allow: "POST, OPTIONS" }) });

  let rpc: McpJsonRpcRequest | null = null;
  try {
    assertMcpAcceptHeader(req);
    assertMcpContentType(req);
    rpc = await parseMcpJsonRpcRequest(req);
    assertMcpProtocolVersion(req, rpc.method);
    assertMcpRoutingHeaders(req, rpc);
    return await relay(req, rpc);
  } catch (error) {
    const protocolError = error instanceof McpProtocolError
      ? error
      : new McpProtocolError(-32000, error instanceof Error ? error.message : "tok_connect_remote_mcp_error", 500);
    return new Response(JSON.stringify(jsonRpcError(rpc?.id, protocolError.code, protocolError.message)), {
      status: protocolError.httpStatus,
      headers: responseHeaders(req),
    });
  }
});
