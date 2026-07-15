import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260715031224_tok_connect_mcp_chatgpt_v2.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("TOK Connect MCP ChatGPT v2 migration", () => {
  it("enforces agent-run idempotency without destructive cleanup or an implicit cron", () => {
    expect(migration).toContain("uq_tok_connect_agent_runs_mcp_idempotency");
    expect(migration).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists/i);
    expect(migration).toMatch(/nulls\s+not\s+distinct/i);
    expect(migration).toContain("input ->> 'actor_id'");
    expect(migration).toContain("input ->> 'idempotency_key'");
    expect(migration).toMatch(/having\s+count\(\*\)\s*>\s*1/i);
    expect(migration).toContain("No row was changed or deleted by this migration.");

    expect(migration).not.toMatch(/\b(delete|truncate|drop)\b\s+(from|table|index)/i);
    expect(migration).not.toMatch(/\bcron\s*\.|\bcron\.schedule\b|tok_connect_webhook_dispatcher/i);
  });
});
