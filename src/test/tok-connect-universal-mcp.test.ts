import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const transport = readFileSync("supabase/functions/_shared/mcp-http.ts", "utf8");
const cors = readFileSync("supabase/functions/_shared/cors.ts", "utf8");
const remoteGateway = readFileSync("supabase/functions/tok-connect-remote-mcp/index.ts", "utf8");
const actionGateway = readFileSync("supabase/functions/tok-connect-chatgpt/index.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

describe("TOK Connect universal remote MCP", () => {
  it("supports the 2026-07-28 stateless MCP transport while keeping older clients compatible", () => {
    expect(transport).toContain('"2026-07-28"');
    expect(transport.indexOf('"2026-07-28"')).toBeLessThan(transport.indexOf('"2025-11-25"'));
    expect(transport).toContain("assertMcpRoutingHeaders");
    expect(transport).toContain('req.headers.get("Mcp-Method")');
    expect(transport).toContain('req.headers.get("Mcp-Name")');
    expect(transport).toContain("mcp_method_header_required");
    expect(transport).toContain("mcp_name_header_required");
    expect(transport).toContain('"2025-11-25"');
    expect(transport).toContain('"2025-06-18"');
    expect(transport).toContain('"2025-03-26"');
  });

  it("implements the 2026 discovery lifecycle instead of only advertising the protocol revision", () => {
    expect(remoteGateway).toContain('const MODERN_MCP_PROTOCOL_VERSION = "2026-07-28"');
    expect(remoteGateway).toContain('rpc.method === "server/discover"');
    expect(remoteGateway).toContain("buildServerDiscoverResult");
    expect(remoteGateway).toContain("supportedVersions: [MODERN_MCP_PROTOCOL_VERSION]");
    expect(remoteGateway).toContain('"io.modelcontextprotocol/serverInfo": REMOTE_SERVER_INFO');
    expect(remoteGateway).toContain("normalizeModernResult");
    expect(remoteGateway).toContain('resultType: "complete"');
    expect(remoteGateway).toContain("ttlMs: 30_000");
    expect(remoteGateway).toContain('cacheScope: "public"');
    expect(remoteGateway).toContain('next.cacheScope = "private"');
  });

  it("allows browser-based Claude and ChatGPT clients to send MCP 2026 routing headers without widening Claude CORS globally", () => {
    expect(cors).toContain('"https://chatgpt.com"');
    expect(cors).not.toContain('"https://claude.ai"');
    expect(cors).toContain('"mcp-method"');
    expect(cors).toContain('"mcp-name"');
    expect(remoteGateway).toContain('const CLAUDE_ORIGIN = "https://claude.ai"');
    expect(remoteGateway).toContain("remoteCorsHeaders");
    expect(remoteGateway).toContain("isRemoteMcpOriginAllowed");
  });

  it("keeps one public provider-neutral MCP endpoint for ChatGPT, Claude and generic agents", () => {
    expect(vercel).toContain('"source": "/mcp"');
    expect(vercel).toContain("tok-connect-remote-mcp");
    expect(remoteGateway).toContain("MCP_LATEST_PROTOCOL_VERSION");
    expect(remoteGateway).toContain("assertMcpRoutingHeaders");
    expect(remoteGateway).toContain("negotiateMcpProtocolVersion");
    expect(remoteGateway).toContain("next.protocolVersion = negotiateMcpProtocolVersion(request.params)");
    expect(remoteGateway).toContain('headers.set("mcp-method", rpc.method)');
    expect(remoteGateway).toContain('headers.set("mcp-name", toolName)');
    expect(remoteGateway).toContain('name: "TOK Connect Remote MCP"');
    expect(remoteGateway).toContain("Claude, ChatGPT and other MCP clients");
    expect(remoteGateway).toContain("tok-connect-chatgpt");
    expect(remoteGateway).toContain("mcp_protocol_versions_supported");
  });

  it("retains real guarded actions instead of exposing only previews", () => {
    expect(actionGateway).toContain('name: "create_reservation"');
    expect(actionGateway).toContain('name: "cancel_reservation"');
    expect(actionGateway).toContain("confirmed_by_user");
    expect(actionGateway).toContain("idempotency_key");
    expect(actionGateway).toContain("destructiveHint: true");
    expect(actionGateway).toContain("resource_metadata");
    expect(actionGateway).toContain('confirmed_by: "end_user"');
  });
});
