import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("supabase/functions/tok-connect-commercial-bridge/index.ts", "utf8");
const remote = readFileSync("supabase/functions/tok-connect-remote-mcp/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

describe("TOK Connect commercial bridge", () => {
  it("requires a real commercial or admin user and forbids service-role entry", () => {
    expect(bridge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(bridge).toContain('requireUserRole(actor, ["commercial", "admin"])');
    expect(bridge).not.toContain("allowServiceRole: true");
    expect(config).toContain("[functions.tok-connect-commercial-bridge]");
  });

  it("keeps commercial RPC and data access on explicit allowlists", () => {
    expect(bridge).toContain("COMMERCIAL_RPC_NAMES");
    expect(bridge).toContain("COMMERCIAL_READ_TABLES");
    expect(bridge).toContain("tok_connect_commercial_rpc_not_allowlisted");
    expect(bridge).toContain("tok_connect_commercial_table_not_allowlisted");
    expect(bridge).toContain('"get_commercial_prospect_followups"');
    expect(bridge).toContain('"record_commercial_prospect_followup"');
    expect(bridge).toContain('"commercial_prospect_followups"');
    expect(bridge).toContain("actor.userClient.rpc(rpcName, args)");
    expect(bridge).toContain("actor.userClient.from(table)");
  });

  it("protects mutations and isolated demo provisioning with confirmation and idempotency", () => {
    expect(bridge).toContain("tok_connect_human_confirmation_required");
    expect(bridge).toContain("tok_connect_idempotency_key_required");
    expect(bridge).toContain("IDEMPOTENCY_TABLE");
    expect(bridge).toContain("provision-commercial-demo-project-session");
    expect(bridge).toContain('const DEMO_PROJECT_REF = "hzldfhjfgjcadmpghhhf"');
  });

  it("keeps the commercial workspace defined internally but outside the public read-only MCP catalogue", () => {
    expect(remote).toContain('name: "tok_commercial"');
    expect(remote).toContain("COMMERCIAL_BRIDGE_URL");
    expect(remote).toContain('name === "tok_commercial" ? COMMERCIAL_BRIDGE_URL : APP_BRIDGE_URL');
    expect(remote).toContain("The commercial role remains isolated behind its guarded backend");
    expect(remote).toContain("filterPublicReadOnlyTools");
    expect(remote).toContain("annotations?.readOnlyHint === true");
    expect(remote).toContain("public_mcp_read_only");
  });
});
