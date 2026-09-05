import { describe, expect, it } from "vitest";

import {
  MCP_LATEST_PROTOCOL_VERSION,
  MCP_MAX_REQUEST_BYTES,
  MCP_PROTOCOL_VERSIONS,
  McpProtocolError,
  assertMcpAcceptHeader,
  assertMcpContentType,
  assertMcpProtocolVersion,
  buildMcpAuthToolResult,
  buildMcpBearerChallenge,
  isMcpNotification,
  mcpAcceptedResponse,
  mcpMethodNotAllowedResponse,
  negotiateMcpProtocolVersion,
  parseMcpJsonRpcRequest,
} from "../../supabase/functions/_shared/mcp-http.ts";

function mcpRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://www.thetok.ch/mcp", {
    method: "POST",
    headers,
    body,
  });
}

describe("TOK Connect MCP HTTP protocol helpers", () => {
  it("parses a JSON-RPC request and distinguishes notifications", async () => {
    const request = await parseMcpJsonRpcRequest(mcpRequest(JSON.stringify({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/list",
      params: {},
    })));
    const notification = await parseMcpJsonRpcRequest(mcpRequest(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    })));

    expect(request).toEqual({ jsonrpc: "2.0", id: 42, method: "tools/list", params: {} });
    expect(isMcpNotification(request)).toBe(false);
    expect(isMcpNotification(notification)).toBe(true);
  });

  it("returns the JSON-RPC error classes expected by MCP clients", async () => {
    await expect(parseMcpJsonRpcRequest(mcpRequest("{"))).rejects.toMatchObject({
      code: -32700,
      message: "parse_error",
    });
    await expect(parseMcpJsonRpcRequest(mcpRequest("[]"))).rejects.toMatchObject({
      code: -32600,
      message: "invalid_request",
    });
    await expect(parseMcpJsonRpcRequest(mcpRequest(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: [],
    })))).rejects.toMatchObject({
      code: -32602,
      message: "invalid_params",
    });
    await expect(parseMcpJsonRpcRequest(mcpRequest("{}", {
      "Content-Length": String(MCP_MAX_REQUEST_BYTES + 1),
    }))).rejects.toMatchObject({
      code: -32600,
      message: "mcp_request_too_large",
      httpStatus: 413,
    });
  });

  it("negotiates the latest stable protocol while retaining declared compatibility", () => {
    expect(MCP_LATEST_PROTOCOL_VERSION).toBe("2026-07-28");
    expect(MCP_PROTOCOL_VERSIONS).toEqual(["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
    expect(negotiateMcpProtocolVersion({ protocolVersion: "2026-07-28" })).toBe("2026-07-28");
    expect(negotiateMcpProtocolVersion({ protocolVersion: "2025-06-18" })).toBe("2025-06-18");
    expect(negotiateMcpProtocolVersion({ protocolVersion: "unsupported" })).toBe("2026-07-28");

    expect(() => assertMcpProtocolVersion(
      mcpRequest("{}", { "MCP-Protocol-Version": "2026-07-28" }),
      "tools/list",
    )).not.toThrow();
    expect(() => assertMcpProtocolVersion(
      mcpRequest("{}", { "MCP-Protocol-Version": "2025-11-25" }),
      "tools/list",
    )).not.toThrow();
    expect(() => assertMcpProtocolVersion(
      mcpRequest("{}", { "MCP-Protocol-Version": "2099-01-01" }),
      "tools/list",
    )).toThrow(McpProtocolError);
  });

  it("validates transport media types and emits empty HTTP protocol responses", async () => {
    expect(() => assertMcpContentType(mcpRequest("{}", {
      "Content-Type": "application/json; charset=utf-8",
    }))).not.toThrow();
    // RFC 9110 allows whitespace before the parameter separator. Matching the
    // raw header rejected this with 415 before any handler ran.
    expect(() => assertMcpContentType(mcpRequest("{}", {
      "Content-Type": "application/json ; charset=utf-8",
    }))).not.toThrow();
    expect(() => assertMcpContentType(mcpRequest("{}", {
      "Content-Type": "APPLICATION/JSON",
    }))).not.toThrow();

    expect(() => assertMcpContentType(mcpRequest("{}", {
      "Content-Type": "text/plain",
    }))).toThrowError(expect.objectContaining({ httpStatus: 415 }));
    expect(() => assertMcpContentType(mcpRequest("{}", {}))).toThrowError(
      expect.objectContaining({ httpStatus: 415 }),
    );

    expect(() => assertMcpAcceptHeader(mcpRequest("{}", {
      Accept: "application/json, text/event-stream",
    }))).not.toThrow();
    expect(() => assertMcpAcceptHeader(mcpRequest("{}", {
      Accept: "text/event-stream",
    }))).not.toThrow();
    expect(() => assertMcpAcceptHeader(mcpRequest("{}", {
      Accept: "text/html",
    }))).toThrowError(expect.objectContaining({ httpStatus: 406 }));

    const accepted = mcpAcceptedResponse({ "Access-Control-Allow-Origin": "https://chatgpt.com" });
    expect(accepted.status).toBe(202);
    expect(await accepted.text()).toBe("");
    expect(accepted.headers.get("MCP-Protocol-Version")).toBe("2026-07-28");

    const methodNotAllowed = mcpMethodNotAllowedResponse({});
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  it("builds the OAuth discovery challenge used by ChatGPT", () => {
    const challenge = buildMcpBearerChallenge({
      resourceMetadataUrl: "https://www.thetok.ch/.well-known/oauth-protected-resource",
      scopes: ["openid", "email", "profile"],
      error: "invalid_token",
      errorDescription: "expired token",
    });

    expect(challenge).toBe(
      'Bearer resource_metadata="https://www.thetok.ch/.well-known/oauth-protected-resource", ' +
      'scope="openid email profile", error="invalid_token", error_description="expired token"',
    );
    expect(buildMcpAuthToolResult(challenge, "Reconnect TOK Connect")).toEqual({
      content: [{ type: "text", text: "Reconnect TOK Connect" }],
      _meta: { "mcp/www_authenticate": [challenge] },
      isError: true,
    });
  });
});
