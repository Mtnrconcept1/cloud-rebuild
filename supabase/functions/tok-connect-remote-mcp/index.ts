import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";
import {
  MCP_LATEST_PROTOCOL_VERSION,
  McpProtocolError,
  assertMcpAcceptHeader,
  assertMcpContentType,
  assertMcpProtocolVersion,
  assertMcpRoutingHeaders,
  parseMcpJsonRpcRequest,
  type McpJsonRpcRequest,
} from "../_shared/mcp-http.ts";

const PUBLIC_ORIGIN = (Deno.env.get("TOK_CONNECT_PUBLIC_ORIGIN") || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const UPSTREAM_MCP_URL = `${SUPABASE_URL}/functions/v1/tok-connect-chatgpt`;
const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`;
const RESOURCE_METADATA_URL = `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource`;
const OIDC_SCOPES = ["openid", "email", "profile"];
const INTERNAL_MCP_PROTOCOL_VERSION = "2025-11-25";

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
  const headers = new Headers(buildCorsHeaders(req));
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

function normalizeInitialize(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rpc = payload as Record<string, unknown>;
  const result = rpc.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return payload;
  const next = { ...(result as Record<string, unknown>) };
  next.protocolVersion = MCP_LATEST_PROTOCOL_VERSION;
  next.serverInfo = { name: "TOK Connect Remote MCP", version: "4.0.0" };
  next.instructions = "TOK Connect is a provider-neutral remote MCP server for Claude, ChatGPT and other MCP clients. Reads and previews respect TOK grants. Real reservation creation and cancellation require OAuth, explicit end-user confirmation and idempotency. Payments, refunds, publications, credit debits and admin mutations remain inside their protected TOK flows.";
  return { ...rpc, result: next };
}

async function relay(req: Request, rpc: McpJsonRpcRequest) {
  const upstream = await fetch(UPSTREAM_MCP_URL, {
    method: "POST",
    headers: requestHeaders(req, rpc),
    body: JSON.stringify(rpc),
  });
  const text = await upstream.text();
  if (rpc.method !== "initialize" || !text) {
    return new Response(text || null, { status: upstream.status, headers: responseHeaders(req, upstream) });
  }

  try {
    const payload = normalizeInitialize(JSON.parse(text));
    return new Response(JSON.stringify(payload), { status: upstream.status, headers: responseHeaders(req, upstream) });
  } catch {
    return new Response(text, { status: upstream.status, headers: responseHeaders(req, upstream) });
  }
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
      mcp_protocol_versions_supported: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"],
    }), {
      status: 200,
      headers: new Headers({
        ...corsHeaders,
        "content-type": "application/json",
        "cache-control": "no-store",
        "mcp-protocol-version": MCP_LATEST_PROTOCOL_VERSION,
      }),
    });
  }

  if (req.method === "GET") {
    return new Response(null, {
      status: 405,
      headers: new Headers({
        ...corsHeaders,
        allow: "POST, OPTIONS",
        "cache-control": "no-store",
        "mcp-protocol-version": MCP_LATEST_PROTOCOL_VERSION,
      }),
    });
  }
  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: new Headers({ ...corsHeaders, allow: "POST, OPTIONS" }) });
  }

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
