import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TOK_MARKETING_OPERATION_TOOLS,
  TOK_MARKETING_RPC_OPERATIONS,
  TOK_MARKETING_AGENT_ACTIONS,
  TOK_MARKETING_ORCHESTRATOR_ACTIONS,
  buildTokMarketingRequest,
  validateTokMarketingOperation,
} from "../../supabase/functions/_shared/tok-connect-marketing-operations";

const source = readFileSync("server/marketingBff.ts", "utf8");
const confirmed = { confirmed_by_user: true, idempotency_key: "marketing:intent-123" };
const find = (operation: string) => TOK_MARKETING_OPERATION_TOOLS.find((tool) => tool.backendOperation === operation)!;

describe("TOK marketing BFF operation catalogue", () => {
  it("covers exactly every BFF SQL allowlist and no arbitrary RPC", () => {
    const lists = ["MARKETING_OPERATION_NAMES", "MARKETING_OUTREACH_OPERATION_NAMES", "MARKETING_AUTOPILOT_OPERATION_NAMES", "MARKETING_DAILY_OPERATION_NAMES"];
    const operations = lists.flatMap((list) => {
      const block = source.match(new RegExp(`export const ${list} = \\[([\\s\\S]*?)\\] as const`))?.[1];
      expect(block).toBeDefined();
      return [...block!.matchAll(/"(admin_[a-z_]+)"/g)].map((match) => match[1]);
    });
    expect(TOK_MARKETING_RPC_OPERATIONS).toHaveLength(39);
    expect([...TOK_MARKETING_RPC_OPERATIONS].sort()).toEqual(operations.sort());
  });

  it("covers the exact interactive agent and orchestrator action contracts", () => {
    expect([...TOK_MARKETING_AGENT_ACTIONS].sort()).toEqual([
      "generate", "list_runs", "discover_sources", "mailing_facets", "interpret_mailing", "upload_mailing_image", "prepare_mailing_recipients",
    ].sort());
    expect([...TOK_MARKETING_ORCHESTRATOR_ACTIONS].sort()).toEqual([
      "run_due", "run_item", "check_meta", "instagram_discover", "instagram_comments", "instagram_review_submit", "instagram_review_list",
      "content_review_status", "content_review_retry",
    ].sort());
    for (const action of [...TOK_MARKETING_AGENT_ACTIONS, ...TOK_MARKETING_ORCHESTRATOR_ACTIONS]) expect(source).toContain(`"${action}"`);
    expect(TOK_MARKETING_OPERATION_TOOLS).toHaveLength(55);
    expect(new Set(TOK_MARKETING_OPERATION_TOOLS.map((tool) => tool.name)).size).toBe(55);
    expect(TOK_MARKETING_OPERATION_TOOLS.every((tool) => tool.name.startsWith("tok_marketing_"))).toBe(true);
    expect(TOK_MARKETING_OPERATION_TOOLS.some((tool) => ["launch", "generate_daily"].includes(tool.backendOperation))).toBe(false);
  });

  it("matches the latest checked-in SQL function signatures exactly", () => {
    const signatures = new Map<string, string[]>();
    for (const file of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
      for (const match of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(admin_[a-z_]+)\s*\(([\s\S]*?)\)\s*RETURNS/gi)) {
        if (!TOK_MARKETING_RPC_OPERATIONS.includes(match[1])) continue;
        signatures.set(match[1], [...match[2].matchAll(/\b(p_[a-z_]+)\s+[a-z]/gi)].map((argument) => argument[1]));
      }
    }
    for (const tool of TOK_MARKETING_OPERATION_TOOLS.filter((entry) => entry.endpoint === "rpc")) {
      expect(signatures.get(tool.backendOperation), tool.backendOperation).toBeDefined();
      expect([...tool.allowedArgs].sort(), tool.backendOperation).toEqual(signatures.get(tool.backendOperation)!.sort());
    }
    expect(find("admin_simulate_marketing_automation").access).toBe("write");
  });

  it("fixes transport destinations and RPC/action selectors server-side", () => {
    for (const tool of TOK_MARKETING_OPERATION_TOOLS) {
      const request = buildTokMarketingRequest(tool.name, { args: {}, ...(tool.requiresConfirmation ? confirmed : {}) });
      expect(request.path).toBe(`/api/marketing/${tool.endpoint}`);
      expect(request.body).toEqual(tool.endpoint === "rpc" ? { operation: tool.backendOperation, args: {} } : { action: tool.backendOperation });
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect((tool.inputSchema.properties as Record<string, Record<string, unknown>>).args.additionalProperties).toBe(false);
    }
    expect(buildTokMarketingRequest(find("admin_list_marketing_contacts").name, { args: { p_limit: 50, p_offset: 100 } }).body).toEqual({
      operation: "admin_list_marketing_contacts", args: { p_limit: 50, p_offset: 100 },
    });
  });

  it("requires explicit confirmation and stable idempotency for every mutation or external execution", () => {
    for (const tool of TOK_MARKETING_OPERATION_TOOLS.filter((candidate) => candidate.access !== "read")) {
      expect(() => validateTokMarketingOperation(tool.name, { args: {} })).toThrow("confirmation_required");
      expect(() => validateTokMarketingOperation(tool.name, { args: {}, ...confirmed, confirmed_by_user: false })).toThrow("confirmation_required");
      expect(() => validateTokMarketingOperation(tool.name, { args: {}, confirmed_by_user: true })).toThrow("idempotency_required");
      expect(buildTokMarketingRequest(tool.name, { args: {}, ...confirmed }).idempotencyKey).toBe(confirmed.idempotency_key);
    }
  });

  it("rejects selector, destination and identity injection", () => {
    const tool = find("admin_upsert_marketing_campaign");
    for (const extra of [{ operation: "arbitrary" }, { action: "run_due" }, { path: "/admin" }, { userId: "other" }, { Authorization: "Bearer secret" }]) {
      expect(() => buildTokMarketingRequest(tool.name, { args: {}, ...confirmed, ...extra })).toThrow("unknown_argument");
      expect(() => buildTokMarketingRequest(tool.name, { args: extra, ...confirmed })).toThrow("unknown_argument");
    }
    for (const key of ["__proto__", "constructor", "authorization", "cookie", "service_role_key", "p_sid_hash", "p_csrf_hash", "access_token"]) {
      const payload = JSON.parse(`{"${key}":"secret"}`);
      expect(() => buildTokMarketingRequest(tool.name, { args: { p_payload: payload }, ...confirmed })).toThrow("forbidden_argument");
    }
    expect(() => buildTokMarketingRequest("tok_marketing_arbitrary_rpc", { args: {} })).toThrow("tool_not_found");
  });

  it("bounds JSON and rejects non-JSON values before transport", () => {
    const name = find("admin_upsert_marketing_campaign").name;
    const request = (payload: unknown) => buildTokMarketingRequest(name, { args: { p_payload: payload }, ...confirmed });
    for (const value of [undefined, NaN, Infinity, 2n, () => null, new Date()]) expect(() => request(value)).toThrow("json_invalid");
    expect(() => request({ text: "a".repeat(32_001) })).toThrow("string_limit");
    expect(() => request(Array(1001).fill(null))).toThrow("array_limit");
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => request(cyclic)).toThrow("json_invalid");
    let deep: unknown = null;
    for (let index = 0; index < 14; index++) deep = { child: deep };
    expect(() => request(deep)).toThrow("json_limit");
    const original = { text: "reviewed" };
    const result = request(original);
    original.text = "changed";
    expect(result.body).toMatchObject({ args: { p_payload: { text: "reviewed" } } });
  });

  it("allows the dedicated bounded image upload without weakening ordinary strings", () => {
    expect(() => buildTokMarketingRequest(find("upload_mailing_image").name, { args: { imageBase64: "a".repeat(100_000) }, ...confirmed })).not.toThrow();
    expect(() => buildTokMarketingRequest(find("upload_mailing_image").name, { args: { imageBase64: "a".repeat(4 * 1024 * 1024 + 1) }, ...confirmed })).toThrow();
  });
});
