import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as mcpHttp from "../../supabase/functions/_shared/mcp-http";

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const restaurantId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const hash = async (value: string) => createHash("sha256").update(value).digest("hex");
function loadHandler(path: string, dependencies: Record<string, unknown>) {
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync(path, "utf8").replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "").replace(/\bexport\s+(?=(?:const|function|async))/g, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const bindings = { ...mcpHttp, HttpError,
    Deno: { env: { get: () => undefined }, serve: (callback: typeof handler) => { handler = callback; } },
    buildCorsHeaders: () => ({}), isRequestOriginAllowed: () => true, handleCorsPreflight: () => null,
    jsonResponse: (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers }),
    createRateLimiter: () => ({ consume: async () => {} }), makeTokConnectRequestId: () => "synthetic-request",
    sha256Base64Url: hash, ...dependencies,
  };
  new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
  return handler;
}

function mcpHarness(denyAtAuthentication = false) {
  const queries = vi.fn(() => { throw new Error("unexpected_database_read"); });
  const context = { authMode: "partner", partnerId: "synthetic-partner", clientId: "synthetic-client", adminClient: { from: queries }, environment: "production" };
  const record = vi.fn(async () => {});
  const grant = vi.fn(async (_context, _restaurant, scope: string) => { if (scope === "autopilot:plan") throw new HttpError(403, "restaurant_scope_denied"); });
  const handler = loadHandler("supabase/functions/tok-connect-mcp/index.ts", {
    SAFE_TOK_CONNECT_MCP_TOOLS: [{ name: "build_autopilot_plan", requiredScopes: ["autopilot:plan", "analytics:read", "campaigns:preview"],
      inputSchema: { type: "object", required: ["restaurant_id", "objective"], properties: { restaurant_id: { type: "string" }, objective: { type: "string" } } } }],
    TOK_ROLE_OPERATION_TOOLS: [{ name: "tok_generate_restaurant_marketing_visual", inputSchema: { type: "object", properties: {} } }], TOK_CUSTOMER_RESERVATION_INPUT_SCHEMA: { type: "object", properties: {} },
    TOK_DISCOVERY_RESOURCE_URI: "ui://tok-connect/restaurant-discovery-v1.html",
    buildTokDiscoveryResourceDescriptor: () => ({}), buildTokDiscoveryToolMeta: () => ({}),
    buildTokConnectEnvelope: (value: unknown) => value,
    authenticateTokConnectToken: async (_request: Request, _scopes: string[], options: { onAuthenticated: (value: unknown) => void }) => {
      options.onAuthenticated(context);
      if (denyAtAuthentication) throw new HttpError(403, "insufficient_scope");
      return context;
    },
    assertTokConnectFeatureEnabled: async () => {}, assertTokConnectRestaurantGrant: grant, recordTokConnectApiRequest: record,
  });
  const rpc = (method: string, params: unknown) => handler(new Request("https://www.thetok.ch/mcp", {
    method: "POST", headers: { authorization: "Bearer synthetic-token", "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  return { context, record, grant, queries, rpc };
}

describe("actual security-sensitive HTTP handlers", () => {
  it("requires autopilot permission before either plan or resource database access", async () => {
    for (const [method, params] of [["tools/call", { name: "build_autopilot_plan", arguments: { restaurant_id: restaurantId, objective: "Synthetic plan" } }],
      ["resources/read", { uri: `tok://autopilot-runs/${restaurantId}` }]] as const) {
      const h = mcpHarness();
      const response = await h.rpc(method, params);
      expect(response.status).toBe(403);
      expect((await response.json()).error.message).toBe("restaurant_scope_denied");
      expect(h.grant).toHaveBeenCalledWith(h.context, restaurantId, "autopilot:plan", { requireMcp: true });
      expect(h.queries).not.toHaveBeenCalled();
      expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ context: h.context, restaurantId, statusCode: 403 }));
    }
  });
  it("preserves verified identity, route and requested scopes on an authentication scope denial", async () => {
    const h = mcpHarness(true);
    expect((await h.rpc("tools/call", { name: "build_autopilot_plan", arguments: { restaurant_id: restaurantId, objective: "Synthetic plan" } })).status).toBe(403);
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ context: h.context, route: "MCP tools/call build_autopilot_plan",
      restaurantId, errorCode: "insufficient_scope", scopes: ["autopilot:plan", "analytics:read", "campaigns:preview"] }));
    expect(h.queries).not.toHaveBeenCalled();
  });
  it("reports commercial business failures as failures and preserves their status on replay", async () => {
    const entries = new Map<string, Record<string, any>>();
    const writeAuditLog = vi.fn(async () => {});
    const rpc = vi.fn(async () => ({ data: { ok: false, error_code: "synthetic_business_refusal" }, error: null }));
    const adminClient = { from: () => {
      let key = ""; let update: Record<string, unknown> | undefined;
      const query = { select: () => query, eq: (name: string, value: string) => { if (name === "idempotency_key") key = value; return query; },
        maybeSingle: async () => ({ data: entries.get(key) || null, error: null }),
        insert: async (row: Record<string, any>) => { entries.set(row.idempotency_key, row); return { error: null }; },
        update: (row: Record<string, unknown>) => { update = row; return query; },
        then: (resolve: (value: unknown) => unknown) => { if (update) entries.set(key, { ...entries.get(key), ...update }); return Promise.resolve(resolve({ error: null })); },
      }; return query;
    } };
    const handler = loadHandler("supabase/functions/tok-connect-commercial-bridge/index.ts", {
      authenticateRequest: async () => ({ userId: "synthetic-user", adminClient, userClient: { rpc } }), requireUserRole: () => {}, writeAuditLog,
    });
    const body = { action: "rpc", rpc_name: "accept_commercial_contract", confirmed_by_user: true, idempotency_key: "commercial:synthetic-1", args: {} };
    for (const replayed of [false, true]) {
      const response = await handler(new Request("https://tok.example/bridge", { method: "POST", body: JSON.stringify(body) }));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ ok: false, replayed, downstream_status: 409 });
    }
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(writeAuditLog.mock.calls.every(([value]) => value.status === "failure")).toBe(true);
  });
  it("closes the old interactive OAuth routes before token issuance", async () => {
    const createAdminClient = vi.fn(() => ({}));
    const handler = loadHandler("supabase/functions/tok-connect-oauth/index.ts", {
      createAdminClient, assertTokConnectFeatureEnabled: async () => {}, writeAuditLog: async () => {},
    });
    const response = await handler(new Request("https://tok.example/oauth?response_type=code&client_id=synthetic"));
    expect(response.status).toBe(410);
    expect(createAdminClient).not.toHaveBeenCalled();
    const exchange = await handler(new Request("https://tok.example/oauth", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", client_id: "synthetic", code: "legacy", client_secret: "synthetic-secret" }) }));
    expect(exchange.status).toBe(400);
    expect((await exchange.json()).error).toBe("unsupported_grant_type");
  });
  it("retains B2B client_credentials with Basic authentication and hashed access token storage", async () => {
    const writes: unknown[] = [];
    const client = { id: "synthetic-id", client_id: "partner-client", partner_id: "synthetic-partner", status: "active",
      client_secret_hash: "synthetic-hash", allowed_scopes: ["restaurants:read"], environment: "production", token_ttl_seconds: 900 };
    const adminClient = { from: (table: string) => {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "tok_connect_clients" ? client : { status: "active" }, error: null }),
        insert: async (value: unknown) => { writes.push(value); return { error: null }; } }; return query;
    } };
    const verify = vi.fn(async (secret: string) => secret === "synthetic-secret");
    const handler = loadHandler("supabase/functions/tok-connect-oauth/index.ts", {
      createAdminClient: () => adminClient, assertTokConnectFeatureEnabled: async () => {}, writeAuditLog: async () => {},
      verifyTokConnectSecret: verify, createTokConnectAccessToken: () => "synthetic-access-token", hashTokConnectSecret: hash,
      buildRequestMetadata: () => ({}), assertTokConnectScopes: () => {},
    });
    const response = await handler(new Request("https://tok.example/oauth", { method: "POST", headers: {
      authorization: "Basic " + btoa("partner-client:synthetic-secret"), "content-type": "application/x-www-form-urlencoded",
    }, body: "grant_type=client_credentials&scope=restaurants%3Aread" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ access_token: "synthetic-access-token", scope: "restaurants:read", expires_in: 900 });
    expect(verify).toHaveBeenCalledWith("synthetic-secret", "synthetic-hash");
    expect(writes).toEqual([expect.objectContaining({ token_hash: await hash("synthetic-access-token") })]);
    expect(JSON.stringify(writes)).not.toContain("synthetic-access-token");
  });
});
