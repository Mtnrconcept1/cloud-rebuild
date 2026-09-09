import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/tok-connect-admin/index.ts"),
  "utf8",
);

describe("TOK Connect admin schema contract", () => {
  it("does not query columns absent from the TOK Connect foundation schema", () => {
    expect(source).not.toContain('id, name, slug, status, environment, contact_email, created_at');
    expect(source).not.toContain('allowed_scopes, created_at, last_used_at');
    expect(source).not.toContain('partner_id, client_id, restaurant_id, tool_name, status, created_at, updated_at');
  });

  it("uses stable human-readable partner fields", () => {
    expect(source).toContain('id, name, partner_type, status, environment, website_url, contact_email, created_at');
  });
});
