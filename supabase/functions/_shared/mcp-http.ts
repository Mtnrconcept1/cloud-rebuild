export type McpJsonRpcId = string | number | null;

export type McpJsonRpcRequest = {
  jsonrpc: "2.0";
  id?: McpJsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export const MCP_PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

export const MCP_LATEST_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0];
export const MCP_MAX_REQUEST_BYTES = 1024 * 1024;

export class McpProtocolError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, message: string, httpStatus = 400) {
    super(message);
    this.name = "McpProtocolError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function parseMcpJsonRpcRequest(
  req: Request,
  options: { largeToolNames?: readonly string[]; maxRequestBytes?: number } = {},
): Promise<McpJsonRpcRequest> {
  const hardLimit = 4 * 1024 * 1024 + 8192;
  const configured = options.maxRequestBytes;
  const maxBytes = options.largeToolNames?.length && typeof configured === "number" && Number.isSafeInteger(configured)
    ? Math.min(hardLimit, Math.max(MCP_MAX_REQUEST_BYTES, configured)) : MCP_MAX_REQUEST_BYTES;
  const advertisedLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw new McpProtocolError(-32600, "mcp_request_too_large", 413);
  }

  let byteLength = 0, body = "";
  const reader = req.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        byteLength += chunk.value.byteLength;
        if (byteLength > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new McpProtocolError(-32600, "mcp_request_too_large", 413);
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  if (!body.trim()) throw new McpProtocolError(-32600, "invalid_request");

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new McpProtocolError(-32700, "parse_error");
  }

  if (
    !isRecord(value) ||
    value.jsonrpc !== "2.0" ||
    typeof value.method !== "string" ||
    !value.method.trim()
  ) {
    throw new McpProtocolError(-32600, "invalid_request");
  }
  if (value.params !== undefined && !isRecord(value.params)) {
    throw new McpProtocolError(-32602, "invalid_params");
  }
  // Only the specifically opted-in tool can use the larger transport budget.
  // All other methods and tools retain the default even on this endpoint.
  if (Math.max(byteLength, Number.isFinite(advertisedLength) ? advertisedLength : 0) > MCP_MAX_REQUEST_BYTES
    && (value.method !== "tools/call" || !isRecord(value.params)
      || typeof value.params.name !== "string" || !options.largeToolNames?.includes(value.params.name))) {
    throw new McpProtocolError(-32600, "mcp_request_too_large", 413);
  }
  if (
    value.id !== undefined &&
    value.id !== null &&
    typeof value.id !== "string" &&
    typeof value.id !== "number"
  ) {
    throw new McpProtocolError(-32600, "invalid_request_id");
  }

  return value as McpJsonRpcRequest;
}

export function assertMcpContentType(req: Request) {
  const mediaType = (req.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (mediaType === "application/json" || mediaType.endsWith("+json")) return;
  throw new McpProtocolError(-32600, "mcp_content_type_invalid", 415);
}

export function isMcpNotification(rpc: McpJsonRpcRequest) {
  return rpc.id === undefined;
}

export function negotiateMcpProtocolVersion(params: Record<string, unknown> | undefined) {
  const requested = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
  return MCP_PROTOCOL_VERSIONS.includes(requested as (typeof MCP_PROTOCOL_VERSIONS)[number])
    ? requested
    : MCP_LATEST_PROTOCOL_VERSION;
}

export function assertMcpProtocolVersion(req: Request, method: string) {
  if (method === "initialize") return;
  const version = req.headers.get("MCP-Protocol-Version");
  if (!version) return;
  if (!MCP_PROTOCOL_VERSIONS.includes(version as (typeof MCP_PROTOCOL_VERSIONS)[number])) {
    throw new McpProtocolError(-32600, "unsupported_mcp_protocol_version");
  }
}

export function assertMcpRoutingHeaders(req: Request, rpc: McpJsonRpcRequest) {
  const version = req.headers.get("MCP-Protocol-Version");
  const methodHeader = req.headers.get("Mcp-Method");
  const nameHeader = req.headers.get("Mcp-Name");
  const uses2026Routing = version === "2026-07-28" || Boolean(methodHeader) || Boolean(nameHeader);
  if (!uses2026Routing) return;

  if (!methodHeader) throw new McpProtocolError(-32600, "mcp_method_header_required");
  if (methodHeader !== rpc.method) throw new McpProtocolError(-32600, "mcp_method_header_mismatch");

  if (rpc.method === "tools/call") {
    const toolName = typeof rpc.params?.name === "string" ? rpc.params.name : "";
    if (!nameHeader) throw new McpProtocolError(-32600, "mcp_name_header_required");
    if (!toolName || nameHeader !== toolName) {
      throw new McpProtocolError(-32600, "mcp_name_header_mismatch");
    }
  }
}

export function assertMcpAcceptHeader(req: Request) {
  const accept = (req.headers.get("Accept") || "*/*").toLowerCase();
  if (accept.includes("*/*") || accept.includes("application/json") || accept.includes("text/event-stream")) {
    return;
  }
  throw new McpProtocolError(-32600, "mcp_accept_header_invalid", 406);
}

export function mcpResponseHeaders(
  headers: Record<string, string>,
  protocolVersion: string = MCP_LATEST_PROTOCOL_VERSION,
): Record<string, string> {
  return {
    ...headers,
    "Cache-Control": "no-store",
    "MCP-Protocol-Version": protocolVersion,
    "X-Content-Type-Options": "nosniff",
  };
}

export function mcpAcceptedResponse(headers: Record<string, string>) {
  return new Response(null, {
    status: 202,
    headers: mcpResponseHeaders(headers),
  });
}

export function mcpMethodNotAllowedResponse(headers: Record<string, string>) {
  return new Response(null, {
    status: 405,
    headers: {
      ...mcpResponseHeaders(headers),
      Allow: "POST, OPTIONS",
    },
  });
}

export function buildMcpBearerChallenge(input: {
  resourceMetadataUrl: string;
  scopes?: string[];
  error?: "invalid_token" | "insufficient_scope";
  errorDescription?: string;
}) {
  const attributes = [`resource_metadata="${input.resourceMetadataUrl}"`];
  if (input.scopes?.length) attributes.push(`scope="${input.scopes.join(" ")}"`);
  if (input.error) attributes.push(`error="${input.error}"`);
  if (input.errorDescription) {
    attributes.push(`error_description="${input.errorDescription.replace(/["\\]/g, "")}"`);
  }
  return `Bearer ${attributes.join(", ")}`;
}

export function buildMcpAuthToolResult(challenge: string, message: string) {
  return {
    content: [{ type: "text", text: message }],
    _meta: { "mcp/www_authenticate": [challenge] },
    isError: true,
  };
}
