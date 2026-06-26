import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TOK_CONNECT_TABLES = [
  "tok_connect_partners",
  "tok_connect_clients",
  "tok_connect_partner_members",
  "tok_connect_restaurant_grants",
  "tok_connect_access_tokens",
  "tok_connect_api_requests",
  "tok_connect_idempotency_keys",
  "tok_connect_webhook_endpoints",
  "tok_connect_webhook_deliveries",
  "tok_connect_agent_runs",
];

function findTokConnectMigration() {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const migration = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .find((file) => readFileSync(resolve(dir, file), "utf8").includes("tok_connect_partners"));
  return migration ? resolve(dir, migration) : null;
}

function readMigration() {
  const migration = findTokConnectMigration();
  expect(migration, "TOK Connect foundation migration should exist").toBeTruthy();
  expect(existsSync(migration!)).toBe(true);
  return readFileSync(migration!, "utf8");
}

function readAllMigrations() {
  const dir = resolve(process.cwd(), "supabase/migrations");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(resolve(dir, file), "utf8"))
    .join("\n\n");
}

describe("TOK Connect SQL foundation", () => {
  it("creates all partner, auth, grant, request and webhook tables with RLS", () => {
    const sql = readMigration();

    for (const table of TOK_CONNECT_TABLES) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
      expect(sql).toMatch(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS[\\s\\S]+ON\\s+public\\.${table}`, "i"));
    }
  });

  it("keeps browser access least-privilege and blocks anon from private TOK Connect data", () => {
    const sql = readMigration();

    expect(sql).toContain("REVOKE ALL ON public.tok_connect_clients FROM anon;");
    expect(sql).toContain("REVOKE ALL ON public.tok_connect_access_tokens FROM anon;");
    expect(sql).toContain("REVOKE ALL ON public.tok_connect_api_requests FROM anon;");
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]{0,120}tok_connect_[a-z_]+[\s\S]{0,40}\s+TO\s+anon/i);
    expect(sql).toContain("public.auth_is_admin()");
    expect(sql).toContain("public.auth_owns_restaurant(restaurant_id)");
  });

  it("adds indexed foreign keys and non-recursive helper functions", () => {
    const sql = readMigration();

    for (const indexName of [
      "idx_tok_connect_clients_partner_id",
      "idx_tok_connect_partner_members_user_id",
      "idx_tok_connect_restaurant_grants_restaurant_id",
      "idx_tok_connect_access_tokens_token_hash",
      "idx_tok_connect_api_requests_client_created",
      "idx_tok_connect_webhook_deliveries_endpoint_status",
    ]) {
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${indexName}`);
    }

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.tok_connect_is_partner_member/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.tok_connect_restaurant_grant_enabled/i);
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it("seeds the TOK Connect feature flags with autopilot disabled", () => {
    const sql = readMigration();

    for (const flag of [
      "tok-connect",
      "tok-connect-api",
      "tok-connect-mcp",
      "tok-connect-webhooks",
      "tok-connect-autopilot",
    ]) {
      expect(sql).toContain(`'${flag}'`);
    }
    expect(sql).toMatch(/'tok-connect-autopilot'[\s\S]{0,220}false/i);
  });

  it("adds retry indexes and accounting columns for webhook dispatch", () => {
    const sql = readAllMigrations();

    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.tok_connect_webhook_deliveries\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+last_attempted_at/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.tok_connect_webhook_deliveries\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+response_body/i);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_tok_connect_webhook_deliveries_retry");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_tok_connect_access_tokens_client_revoked");
  });

  it("does not expose webhook signing secrets through authenticated table reads", () => {
    const sql = readAllMigrations();

    expect(sql).toContain("REVOKE SELECT ON public.tok_connect_webhook_endpoints FROM authenticated;");
    expect(sql).toMatch(/GRANT\s+SELECT\s+\([\s\S]*\)\s+ON\s+public\.tok_connect_webhook_endpoints\s+TO\s+authenticated;/i);
    const authenticatedColumnGrant = sql.match(/GRANT\s+SELECT\s+\(([\s\S]*?)\)\s+ON\s+public\.tok_connect_webhook_endpoints\s+TO\s+authenticated;/i)?.[1] || "";
    expect(authenticatedColumnGrant).not.toContain("signing_secret");
    expect(sql).toContain("GRANT ALL ON public.tok_connect_webhook_endpoints TO service_role;");
  });

  it("schedules signed TOK Connect webhook dispatch through pg_cron and Vault", () => {
    const sql = readAllMigrations();

    expect(sql).toMatch(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_cron/i);
    expect(sql).toMatch(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pg_net/i);
    expect(sql).toContain("tok-connect-webhook-dispatcher");
    expect(sql).toContain("tok-connect-webhook-dispatch");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("internal_cron_secret");
    expect(sql).toContain("x-internal-cron-secret");
    expect(sql).toMatch(/cron\.schedule\('tok-connect-webhook-dispatcher',\s+'\* \* \* \* \*'/i);
    expect(sql).toMatch(/net\.http_post\(/i);
  });
});
