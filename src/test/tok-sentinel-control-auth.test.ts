import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(
  "supabase/functions/ops-sentinel-control/index.ts", "utf8",
).replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const validUserId = "11111111-1111-4111-8111-111111111111";
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const env: Record<string, string> = {};
let handler: (req: Request) => Promise<Response>;
let role = "admin";
let mfa = "aal2";
let allowService = false;
const events = vi.fn(async () => ({}));
const rpc = vi.fn(async () => ({ data: null, error: null }));
const from = vi.fn((table: string) => {
  if (table === "tok_sentinel_incidents" || table === "tok_sentinel_containments") {
    const query = {
      select: () => query, order: () => query, is: () => query,
      limit: async () => ({ data: [], error: null }),
      eq: () => query, maybeSingle: async () => ({ data: null, error: null }),
    };
    return query;
  }
  return { insert: async () => ({ error: null }) };
});
const adminClient = { from, rpc };
const userClient = {
  auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({
    data: { currentLevel: mfa }, error: null,
  }) } },
};
function request(body: Record<string, unknown>, origin?: string) {
  return handler(new Request("https://tok.test/functions/v1/ops-sentinel-control", {
    method: "POST", headers: {
      "content-type": "application/json", Authorization: "Bearer user-fixture",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  }));
}
beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  env.SUPABASE_SERVICE_ROLE_KEY = "fixture-not-real";
  env.SUPABASE_URL = "https://example.supabase.co";
  env.TELEGRAM_ADMIN_CHAT_ID = "123";
  role = "admin"; mfa = "aal2"; allowService = false;
  from.mockClear(); rpc.mockClear(); events.mockClear();
  const deps = {
    Deno: {
      env: { get: (key: string) => env[key] },
      serve: (cb: typeof handler) => { handler = cb; },
    },
    HttpError,
    authenticateRequest: async (_req: Request, options: { allowServiceRole?: boolean }) =>
      options.allowServiceRole && allowService
        ? { authMode: "service_role", isServiceRole: true, adminClient }
        : { authMode: "user_jwt", isServiceRole: false, userId: validUserId, roles: [role],
            adminClient, userClient },
    requireUserRole: (actor: { roles?: string[] }, granted: string[]) => {
      if (!actor.roles?.some((value) => granted.includes(value))) {
        throw new HttpError(403, "user_role_forbidden");
      }
    },
    createAdminClient: () => adminClient,
    getEnv: (name: string) => env[name] || "",
    jsonResponse: (value: Record<string, unknown>, status: number, headers = {}) =>
      Response.json(value, { status, headers }),
    writeAuditLog: events,
    buildCorsHeaders: () => ({}),
    handleCorsPreflight: () => null,
    detectSentinelFindings: () => [],
  };
  new Function(...Object.keys(deps), compiled)(...Object.values(deps));
});

describe("TOK Sentinel control authentication, fail-safe activation and privacy", () => {
  it("rejects cross-origin admin requests before returning sensitive reports", async () => {
    const response = await request({ action: "list" }, "https://attacker.example");
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalledWith("tok_sentinel_incidents");
  });
  it("denies users without the admin role", async () => {
    role = "client";
    expect((await request({ action: "list" }, "https://sentinel.thetok.ch")).status).toBe(403);
  });
  it("requires AAL2 even for a valid admin", async () => {
    mfa = "aal1";
    expect((await request({ action: "list" }, "https://sentinel.thetok.ch")).status).toBe(403);
  });
  it("returns bounded evidence only after full admin and MFA verification", async () => {
    const response = await request({ action: "list" }, "https://sentinel.thetok.ch");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, incidents: [], activeContainments: [], enforcementArmed: false,
      autoGlobal: false,
    });
  });
  it("never permits a browser user to trigger the privileged incident scan", async () => {
    const response = await request({ action: "scan" });
    expect(response.status).toBe(403);
  });
  it("denies Telegram approve when rollout is not armed", async () => {
    allowService = true;
    const response = await request({
      action: "telegram_decision", data: "snt:a:" + "a".repeat(32),
      chatId: "123", actor: "telegram:123", messageId: 321,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "sentinel_containment_not_armed" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects forged chat identities before touching any decision", async () => {
    allowService = true;
    env.TOK_SENTINEL_ENFORCEMENT_ENABLED = "true";
    const response = await request({
      action: "telegram_decision", data: "snt:a:" + "a".repeat(32),
      chatId: "999", actor: "telegram:123", messageId: 321,
    });
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires an exact typed incident confirmation for the release", async () => {
    const response = await request({
      action: "release", incidentId: "22222222-2222-4222-8222-222222222222",
      confirmation: "LIBERER",
    }, "https://sentinel.thetok.ch");
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
