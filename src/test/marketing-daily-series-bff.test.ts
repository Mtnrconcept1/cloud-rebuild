import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETING_DAILY_OPERATION_NAMES, marketingRpcHandler, sha256Hex, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const sid = "s".repeat(43);
const csrf = "c".repeat(43);
const payload = { status: "active", local_time: "10:00", expected_version: 1 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function request(operation = "admin_upsert_marketing_daily_series", args: Record<string, unknown> = { p_payload: payload }): MarketingApiRequest {
  return { method: "POST", body: { operation, args }, headers: {
    host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch", "sec-fetch-site": "same-origin", "content-type": "application/json",
    cookie: `__Host-tok_marketing_sid=${sid}; __Host-tok_marketing_csrf=${csrf}`, "x-tok-marketing-csrf": csrf,
  } };
}

function recorder() {
  let body = "";
  const response: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: (value) => { body = value || ""; } };
  return { response, value: () => JSON.parse(body) };
}

function upstream(result: unknown, status = 200, isAdmin = true) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json({ user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600000).toISOString() });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(isAdmin ? [{ user_id: actor }] : []);
    if (url.endsWith("/rpc/service_marketing_daily_operation")) return json(result, status);
    throw new Error("Unexpected test upstream");
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("BFF de génération quotidienne Instagram", () => {
  it.each([...MARKETING_DAILY_OPERATION_NAMES])("route %s vers le dispatcher quotidien avec session et CSRF hashés", async (operation) => {
    const result = { series: { status: "paused" }, recent_runs: [] };
    const fetchMock = upstream(result);
    vi.stubGlobal("fetch", fetchMock);
    const args = operation === "admin_get_marketing_daily_series" ? {} : { p_payload: payload };
    const res = recorder();
    await marketingRpcHandler(request(operation, args), res.response);
    expect(res.response.statusCode).toBe(200);
    expect(res.value()).toEqual(result);
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/rpc/service_marketing_daily_operation"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ p_sid_hash: sha256Hex(sid), p_csrf_hash: sha256Hex(csrf), p_operation: operation, p_args: args });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/user_roles?"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("service_execute_marketing_admin_operation"))).toBe(false);
  });

  it.each([
    { p_payload: { ...payload, status: "published" } },
    { p_payload: { ...payload, local_time: "24:00" } },
    { p_payload: { ...payload, local_time: "9:00" } },
    { p_payload: { ...payload, expected_version: "1" } },
    { p_payload: { ...payload, expected_version: 0 } },
    { p_payload: { ...payload, expected_version: 1.5 } },
    { p_payload: { ...payload, owner_user_id: actor } },
    { p_payload: { ...payload, requires_approval: false } },
    { p_payload: payload, p_sid_hash: "forged" },
    { p_payload: [] },
  ])("refuse une charge utile invalide ou une tentative d’élévation : %o", async (args) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingRpcHandler(request("admin_upsert_marketing_daily_series", args), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse des arguments de service sur la lecture administrative", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingRpcHandler(request("admin_get_marketing_daily_series", { p_operation: "claim" }), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["session", "csrf", "origin", "role"])("conserve la protection %s avant de modifier la série", async (missing) => {
    const fetchMock = upstream({}, 200, missing !== "role");
    vi.stubGlobal("fetch", fetchMock);
    const req = request();
    if (missing === "session") req.headers.cookie = `__Host-tok_marketing_csrf=${csrf}`;
    if (missing === "csrf") req.headers["x-tok-marketing-csrf"] = "wrong";
    if (missing === "origin") req.headers.origin = "https://other.example";
    const res = recorder();
    await marketingRpcHandler(req, res.response);
    expect(res.response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/rpc/service_marketing_daily_operation"))).toBe(false);
  });

  it.each([
    ["40001", "Daily series was modified by another administrator", 409, "marketing_edit_conflict"],
    ["55000", "Daily generation runtime is disabled", 503, "marketing_daily_runtime_unavailable"],
    ["55000", "Daily generation scheduler is unavailable", 503, "marketing_daily_scheduler_unavailable"],
  ] as const)("explique l’erreur quotidienne %s / %s", async (code, message, expectedStatus, expectedCode) => {
    vi.stubGlobal("fetch", upstream({ code, message, details: "PRIVATE_DETAILS" }, 500));
    const res = recorder();
    await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(expectedStatus);
    expect(res.value().error.code).toBe(expectedCode);
    expect(JSON.stringify(res.value())).not.toContain("PRIVATE_DETAILS");
  });
});
