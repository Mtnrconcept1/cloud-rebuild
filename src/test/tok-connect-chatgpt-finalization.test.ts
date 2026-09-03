import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK Connect ChatGPT finalization", () => {
  const gateway = read("supabase/functions/tok-connect-chatgpt/index.ts");
  const canonical = read("supabase/functions/tok-connect-mcp/index.ts");
  const config = read("supabase/config.toml");
  const vercel = read("vercel.json");

  it("keeps one public MCP route and sends it through the ChatGPT gateway", () => {
    expect(vercel).toContain('"source": "/mcp"');
    expect(vercel).toContain("functions/v1/tok-connect-chatgpt");
    expect(vercel).toContain("tok_connect_route=protected-resource");
    expect(config).toContain("[functions.tok-connect-chatgpt]");
    expect(config).toContain("[functions.tok-connect-mcp]");
  });

  it("consolidates safe full-app capabilities into the canonical gateway", () => {
    for (const tool of [
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
    ]) {
      expect(gateway).toContain(`"${tool}"`);
    }
    expect(gateway).toContain("tok-connect-full-app-mcp");
  });

  it("exposes real reservation writes only with confirmation and idempotency", () => {
    expect(gateway).toContain('name: "create_reservation"');
    expect(gateway).toContain('name: "cancel_reservation"');
    expect(gateway).toContain("confirmed_by_user");
    expect(gateway).toContain('confirmed_by: "end_user"');
    expect(gateway).toContain("idempotency_key");
    expect(gateway).toContain("idempotency-key");
    expect(gateway).toContain("destructiveHint: true");
  });

  it("provides standard search/fetch discovery tools and an MCP Apps UI resource", () => {
    expect(gateway).toContain('name: "search"');
    expect(gateway).toContain('name: "fetch"');
    expect(gateway).toContain('mimeType: "text/html;profile=mcp-app"');
    expect(gateway).toContain("ui://tok-connect/actions-window-v1.html");
    expect(gateway).toContain("openai/outputTemplate");
  });

  it("contains no unresolved merge conflict marker in the canonical MCP", () => {
    expect(canonical).not.toContain("<<<<<<<");
    expect(canonical).not.toContain("=======");
    expect(canonical).not.toContain(">>>>>>>");
  });
});
