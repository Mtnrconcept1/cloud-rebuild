import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketingOrchestratorHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const reviewId = "33333333-3333-4333-8333-333333333333";
const csrf = "c".repeat(43);
const statusRequest = { action: "content_review_status", targetType: "campaign", targetId };
const retryRequest = { ...statusRequest, action: "content_review_retry", expectedRevision: 4, expectedReviewId: reviewId };
const request = (body: unknown): MarketingApiRequest => ({ method: "POST", body, headers: {
  host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch", "sec-fetch-site": "same-origin",
  "content-type": "application/json", "x-tok-marketing-csrf": csrf,
  cookie: `__Host-tok_marketing_sid=${"s".repeat(43)}; __Host-tok_marketing_csrf=${csrf}`,
} });
function response() {
  let output = "";
  const res: MarketingApiResponse = { statusCode: 0, setHeader: vi.fn(), end: body => { output = body || ""; } };
  return { res, value: () => JSON.parse(output) };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function upstream(options: { admin?: boolean; session?: boolean; quota?: boolean; error?: { code: string; message: string } } = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) return json(options.session === false ? null : {
      user_id: actor, email: "admin@example.org", expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json(options.admin === false ? [] : [{ user_id: actor }]);
    if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) return json({ allowed: options.quota !== false, retry_after_seconds: 60 });
    if (url.endsWith("/rpc/service_execute_marketing_admin_operation")) return options.error ? json(options.error, 409) : json({
      target_type: "campaign", target_id: targetId, revision: 4, status: "queued", updated_at: "2026-10-21T12:00:00Z", review: null,
    });
    throw new Error(`Unexpected route: ${url}`);
  });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Marketing content review BFF", () => {
  it.each([
    [statusRequest, "admin_get_marketing_content_review_status"],
    [retryRequest, "admin_retry_marketing_content_review"],
  ])("uses the opaque admin session and closed database dispatcher: %j", async (body, operation) => {
    const fetchImpl = upstream(); vi.stubGlobal("fetch", fetchImpl);
    const { res, value } = response(); await marketingOrchestratorHandler(request(body), res);
    expect(res.statusCode).toBe(200);
    expect(value()).toMatchObject({ target_id: targetId, status: "queued" });
    const mutation = fetchImpl.mock.calls.find(([url]) => String(url).endsWith("/rpc/service_execute_marketing_admin_operation"))!;
    const forwarded = JSON.parse(String(mutation[1]?.body));
    expect(forwarded).toMatchObject({ p_operation: operation, p_args: { p_target_type: "campaign", p_target_id: targetId } });
    expect(forwarded.p_sid_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(forwarded.p_csrf_hash).toMatch(/^[0-9a-f]{64}$/);
    if (body.action === "content_review_retry") expect(forwarded.p_args).toMatchObject({ p_expected_revision: 4, p_expected_review_id: reviewId });
    else expect(Object.keys(forwarded.p_args)).toHaveLength(2);
    for (const [input] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://project.supabase.co");
      expect(url.pathname.startsWith("/functions/v1/")).toBe(false);
    }
    expect(JSON.stringify(value())).not.toMatch(/sb_secret_|token_hash|chat_id|p_sid_hash/);
  });

  it.each([{ admin: false }, { session: false }, { quota: false }])("blocks both reads and retries when an admin gate fails: %j", async options => {
    for (const body of [statusRequest, retryRequest]) {
      const fetchImpl = upstream(options); vi.stubGlobal("fetch", fetchImpl);
      const { res } = response(); await marketingOrchestratorHandler(request(body), res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("service_execute_marketing_admin_operation"))).toBe(false);
    }
  });

  it.each([
    { ...statusRequest, chat_id: "attacker" }, { ...retryRequest, content: { caption: "changed" } },
    { ...retryRequest, expectedRevision: undefined }, { ...retryRequest, expectedReviewId: "wrong" },
    { ...statusRequest, targetType: "restaurant" }, { ...statusRequest, targetId: "../campaign" },
    { action: "content_review_process" },
  ])("rejects extra fields, invalid revisions and worker invocation before upstream: %j", async body => {
    const fetchImpl = upstream(); vi.stubGlobal("fetch", fetchImpl);
    const { res } = response(); await marketingOrchestratorHandler(request(body), res);
    expect(res.statusCode).toBe(400); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires CSRF even for the POST status endpoint", async () => {
    const fetchImpl = upstream(); vi.stubGlobal("fetch", fetchImpl);
    const req = request(statusRequest); delete req.headers["x-tok-marketing-csrf"];
    const { res } = response(); await marketingOrchestratorHandler(req, res);
    expect(res.statusCode).toBe(403); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a recoverable conflict when a stale screen retries an older review", async () => {
    const fetchImpl = upstream({ error: { code: "40001", message: "Content review changed; refresh before retrying" } });
    vi.stubGlobal("fetch", fetchImpl);
    const { res, value } = response(); await marketingOrchestratorHandler(request(retryRequest), res);
    expect(res.statusCode).toBe(409); expect(value().error.code).toBe("marketing_content_review_changed");
    expect(JSON.stringify(value())).not.toContain("40001");
  });
});
