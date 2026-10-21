import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TOK_MARKETING_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-marketing-operations";

const mocks = vi.hoisted(() => ({
  admin: { kind: "server-only-admin" },
  createAdminClient: vi.fn(),
  resolveBroker: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("../../supabase/functions/_shared/tok-connect-broker.ts", () => ({ resolveTokConnectBrokerAccess: mocks.resolveBroker }));

let handler: (request: Request) => Promise<Response>;
const opaqueToken = `tok_oa_${"a".repeat(64)}`;
const nativeToken = "native-header.native-verified-payload.native-signature";
const privateKey = "service-role-key-must-never-cross-boundary";
const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
let bffStatus = 200;
let bffPayload: Record<string, unknown> = {};
let timeout = false;

async function rpc(method: string, params: Record<string, unknown>, token: string | null = opaqueToken) {
  const response = await handler(new Request("https://www.thetok.ch/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25", cookie: "native-marketing-cookie=must-not-forward",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  const body = await response.json();
  const serialized = JSON.stringify(body);
  for (const secret of [opaqueToken, nativeToken, privateKey, "must-not-forward"]) expect(serialized).not.toContain(secret);
  return { response, body };
}
const callTool = (name = "tok_marketing_get_overview", args: Record<string, unknown> = { args: {} }, token: string | null = opaqueToken) =>
  rpc("tools/call", { name, arguments: args }, token);

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => name === "SUPABASE_SERVICE_ROLE_KEY" ? privateKey : undefined },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import("../../supabase/functions/tok-connect-remote-mcp/index.ts");
});
beforeEach(() => {
  calls.length = 0;
  timeout = false;
  bffStatus = 200;
  bffPayload = { ok: true, data: { source: "native-marketing" } };
  mocks.createAdminClient.mockReset().mockReturnValue(mocks.admin);
  mocks.resolveBroker.mockReset().mockResolvedValue({ accessToken: nativeToken, userId: "native-admin", clientId: "delegated-client" });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const body = JSON.parse(String(init.body || "{}")) as Record<string, unknown>;
    calls.push({ url, init, body });
    if (url.endsWith("tok-connect-chatgpt")) return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [] } });
    if (url !== "https://marketing.thetok.ch/api/marketing/mcp") throw new Error("Unexpected transport destination");
    if (timeout) throw new Error("Upstream timeout");
    return Response.json(bffPayload, { status: bffStatus });
  }));
});
afterAll(() => vi.unstubAllGlobals());

describe("global marketing tools through the actual TOK remote MCP router", () => {
  it("challenges absent authentication without calling the broker or marketing BFF", async () => {
    const { body } = await callTool(undefined, undefined, null);
    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain("invalid_token");
    expect(mocks.resolveBroker).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("challenges rejected opaque tokens before any marketing request", async () => {
    mocks.resolveBroker.mockRejectedValueOnce({ status: 401, message: "invalid broker token" });
    const { body } = await callTool();
    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"]).toHaveLength(1);
    expect(mocks.resolveBroker).toHaveBeenCalledWith(mocks.admin, opaqueToken);
    expect(calls).toHaveLength(0);
  });

  it("resolves the opaque token server-side and forwards only the native bearer to a fixed BFF", async () => {
    const args = { args: { p_from: "2026-10-01T00:00:00Z" } };
    const { body } = await callTool("tok_marketing_get_overview", args);
    expect(body.result.structuredContent).toEqual(bffPayload);
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.resolveBroker).toHaveBeenCalledWith(mocks.admin, opaqueToken);
    expect(calls).toHaveLength(1);
    const request = calls[0];
    expect(request.url).toBe("https://marketing.thetok.ch/api/marketing/mcp");
    expect(request.init).toMatchObject({ method: "POST", redirect: "error" });
    const headers = new Headers(request.init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${nativeToken}`);
    for (const name of ["cookie", "apikey", "x-marketing-actor-user-id"]) expect(headers.has(name)).toBe(false);
    expect(JSON.stringify(request)).not.toContain(privateKey);
    expect(request.body).toEqual({ tool: "tok_marketing_get_overview", arguments: args });
  });

  it("advertises all 55 business tools and three marketing connection tools", async () => {
    const { body } = await rpc("tools/list", {}, null);
    const names = body.result.tools.map((tool: { name: string }) => tool.name) as string[];
    const marketing = names.filter((name) => name.startsWith("tok_marketing_"));
    expect(marketing).toHaveLength(58);
    expect(new Set(marketing).size).toBe(58);
    expect(marketing.sort()).toEqual([
      ...TOK_MARKETING_OPERATION_TOOLS.map((tool) => tool.name),
      "tok_marketing_connect", "tok_marketing_connection_status", "tok_marketing_disconnect",
    ].sort());
    expect(mocks.resolveBroker).not.toHaveBeenCalled();
  });

  it("preserves an HTTP 200 business failure as an MCP error", async () => {
    bffPayload = { ok: false, error: { code: "business_rejected", message: "Approval needed" } };
    const { body } = await callTool();
    expect(body.result).toMatchObject({ isError: true, structuredContent: bffPayload });
  });

  it("preserves the native connection-required error without inventing OAuth failure", async () => {
    bffStatus = 403;
    bffPayload = { error: { code: "marketing_connection_required", message: "Connect marketing with MFA" } };
    const { body } = await callTool();
    expect(body.result).toMatchObject({ isError: true, structuredContent: { ok: false, ...bffPayload } });
    expect(body.result._meta?.["mcp/www_authenticate"]).toBeUndefined();
  });

  it("reports an uncertain timeout once and instructs retries with the same intent key", async () => {
    timeout = true;
    const args = { args: { objective: "Reviewed campaign" }, confirmed_by_user: true, idempotency_key: "campaign:same-intent" };
    const { body } = await callTool("tok_marketing_agent_generate", args);
    expect(body.result).toMatchObject({ isError: true, structuredContent: { ok: false, error: { code: "tok_marketing_result_unconfirmed" } } });
    expect(body.result.structuredContent.error.message).toContain("même clé");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ tool: "tok_marketing_agent_generate", arguments: args });
  });

  it("lets a native mailing image larger than 1 MiB pass the actual HTTP parser", async () => {
    const imageBase64 = "a".repeat(1024 * 1024 + 100);
    const args = { args: { itemId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: "2026-10-20T10:00:00Z", contentType: "image/png", imageBase64 }, confirmed_by_user: true, idempotency_key: "mailing:image-intent" };
    const { response, body } = await callTool("tok_marketing_agent_upload_mailing_image", args);
    expect(response.status).toBe(200);
    expect(body.result.isError).not.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ tool: "tok_marketing_agent_upload_mailing_image", arguments: args });
  });
});
