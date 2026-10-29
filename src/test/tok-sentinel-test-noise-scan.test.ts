import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  detectSentinelFindings, isAuthorizedTestNoise,
  type SentinelAudit,
} from "../../supabase/functions/_shared/tok-sentinel-rules.ts";

const source = readFileSync("supabase/functions/ops-sentinel-control/index.ts", "utf8")
  .replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const trustedId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const uuid = (n: number) => "99999999-9999-4999-8999-" + String(n).padStart(12, "0");

type HarnessOptions = {
  activeIds?: string[];
  allowlistError?: boolean;
  mixUser?: boolean;
  risk?: boolean;
};
function harness(options: HarnessOptions = {}) {
  const events: Record<string, unknown>[] = [];
  const incidents: Record<string, unknown>[] = [];
  const messageFetch = vi.fn(async () => Response.json({ ok: true, result: { message_id: 91 } }));
  let handler: (req: Request) => Promise<Response>;
  const now = Date.now();
  const auditRows: SentinelAudit[] = Array.from({ length: 8 }, (_, i) => ({
    id: uuid(i + 1),
    created_at: new Date(now - 4_000).toISOString(),
    function_name: i % 2 ? "create-checkout" : "create-reservation",
    action: "forbidden", status: "failure",
    error_message: options.risk && i === 0 ? "confirmed_rls_bypass" : "Unauthorized",
    actor_user_id: options.mixUser && i === 0 ? otherId : trustedId,
    is_service_role: false,
    request_metadata: { ip: "192.0.2.1" },
  }));

  const from = vi.fn((table: string) => {
    if (table === "edge_function_audit_logs") {
      const query = {
        select: () => query, eq: () => query,
        gte: () => query, order: () => query,
        limit: async () => ({ data: auditRows, error: null }),
      };
      return query;
    }
    if (table === "tok_sentinel_test_accounts") {
      const query = {
        select: () => query, is: () => query, lte: () => query, gt: () => query,
        limit: async () => ({
          data: (options.activeIds ?? [trustedId]).map((user_id) => ({ user_id })),
          error: options.allowlistError ? { message: "denied" } : null,
        }),
      };
      return query;
    }
    if (table === "tok_sentinel_incidents") {
      return {
        insert: (row: Record<string, unknown>) => {
          incidents.push(row);
          return { select: () => ({ single: async () =>
            ({ data: { id: uuid(101) }, error: null }) }) };
        },
        update: () => {
          const query = { eq: () => query, is: async () => ({ error: null }) };
          return query;
        },
      };
    }
    if (table === "tok_sentinel_events") {
      return { insert: async (row: Record<string, unknown>) => {
        events.push(row);
        return { error: null };
      } };
    }
    throw new Error("Unexpected table: " + table);
  });
  const adminClient = { from };
  const deps = {
    Deno: { serve: (cb: typeof handler) => { handler = cb; } },
    HttpError: class extends Error {
      constructor(public status: number, message: string) { super(message); }
    },
    createAdminClient: () => adminClient,
    authenticateRequest: async () => ({ authMode: "service_role", userId: null, adminClient }),
    requireUserRole: () => {},
    getEnv: (name: string) => ({
      TELEGRAM_BOT_TOKEN: "unused_fixture_token",
      TELEGRAM_ADMIN_CHAT_ID: "123",
      TELEGRAM_WEBHOOK_SECRET: "unused_fixture_webhook_secret",
      TOK_SENTINEL_ENFORCEMENT_ENABLED: "",
    })[name as "TELEGRAM_BOT_TOKEN"] || "",
    jsonResponse: (data: Record<string, unknown>, status: number) => Response.json(data, { status }),
    writeAuditLog: async () => {},
    buildCorsHeaders: () => ({}),
    handleCorsPreflight: () => null,
    detectSentinelFindings,
    isAuthorizedTestNoise,
    crypto: webcrypto,
    fetch: messageFetch,
  };
  new Function(...Object.keys(deps), compiled)(...Object.values(deps));
  return {
    incidents, events, auditRows, messageFetch,
    scan: () => handler(new Request("https://tok.test/ops-sentinel-control", {
      method: "POST", headers: { authorization: "Bearer service-fixture", "content-type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    })),
  };
}

describe("TOK Sentinel scanner and authorized QA identities", () => {
  it("records a test-only incident and evidence without Telegram or a quarantine token", async () => {
    const h = harness();
    const response = await h.scan();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, findings: 1, notified: 0, testNoiseObserved: 1,
      testNoiseConfigHealthy: true,
    });
    expect(h.incidents).toHaveLength(1);
    expect(h.incidents[0]).toMatchObject({
      status: "observed_test", approval_token_hash: null,
      decision_chat_id: null, approval_expires_at: null,
      evidence_ids: h.auditRows.map((row) => row.id),
    });
    expect(h.events.some((event) => event.event_type === "authorized_test_noise_observed")).toBe(true);
    expect(h.messageFetch).not.toHaveBeenCalled();
  });

  it("notifies as normal when evidence from a second actor shares the same IP", async () => {
    const h = harness({ mixUser: true });
    const response = await h.scan();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notified: 1, testNoiseObserved: 0 });
    expect(h.incidents[0]).toMatchObject({ status: "awaiting_approval" });
    expect(h.messageFetch).toHaveBeenCalledTimes(1);
  });

  it("fails safe to normal alerting if Supabase allowlist cannot be read", async () => {
    const h = harness({ allowlistError: true });
    const response = await h.scan();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ testNoiseConfigHealthy: false, notified: 1 });
    expect(h.incidents[0]).toMatchObject({ status: "awaiting_approval" });
  });

  it("does not downgrade a confirmed RLS-bypass indicator from a test user", async () => {
    const h = harness({ risk: true });
    const response = await h.scan();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notified: 1, testNoiseObserved: 0 });
    expect(h.messageFetch).toHaveBeenCalledTimes(1);
  });

  it("notifies again after test-account approval has expired", async () => {
    const h = harness({ activeIds: [] });
    const response = await h.scan();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notified: 1, testNoiseObserved: 0 });
  });
});
