import { describe, expect, it, vi } from "vitest";
import { configureIsolatedTestBackend, TEST_REF } from "../../scripts/configure-isolated-test-backend.mjs";

const env = {
  SUPABASE_PROJECT_REF: TEST_REF, TOK_ISOLATED_TEST_MODE: "true",
  SUPABASE_ACCESS_TOKEN: "synthetic-management-token", STRIPE_SECRET_KEY_TEST: "sk_test_synthetic",
};
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
describe("isolated Test configuration HTTP boundaries", () => {
  it("rejects replay, wrong project and live keys before any HTTP call", async () => {
    const fetchImpl = vi.fn();
    await expect(configureIsolatedTestBackend("replay", { env, fetchImpl })).rejects.toThrow("REPLAY_BLOCKED");
    for (const overrides of [{ SUPABASE_PROJECT_REF: "wwcrtyoueexyxkkikaos" }, { STRIPE_SECRET_KEY_TEST: "sk_live_synthetic" }]) {
      await expect(configureIsolatedTestBackend("configure", { env: { ...env, ...overrides }, fetchImpl })).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    { cron_exists: false, vault_count: 1, queued_count: 0 },
    { cron_exists: false, vault_count: 0, queued_count: 1 },
  ])("rejects nonempty vault/HTTP queue before secret mutations", async (state) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json([state]));
    await expect(configureIsolatedTestBackend("configure", { env, fetchImpl })).rejects.toThrow("TEST_OUTBOUND_PREFLIGHT_FAILED");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`);
  });
  it("rejects active cron before touching secrets or Stripe", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json([{ cron_exists: true, vault_count: 0, queued_count: 0 }]))
      .mockResolvedValueOnce(json([{ active_count: 1 }]));
    await expect(configureIsolatedTestBackend("configure", { env, fetchImpl })).rejects.toThrow("TEST_CRON_QUARANTINE_REQUIRED");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("keeps webhook credentials out of logs and scopes every management request to Test", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/database/query")) return json([{ cron_exists: false, vault_count: 0, queued_count: 0 }]);
      if (url.endsWith("/v1/account")) return json({ id: "acct_synthetic" });
      if (url.endsWith("/v1/webhook_endpoints")) return json({ id: "we_synthetic", livemode: false, secret: "whsec_synthetic" });
      if (init.method === "GET") return json([{ name: "RESEND_API_KEY" }]);
      return json([]);
    });
    const log = vi.fn();
    await configureIsolatedTestBackend("configure", { env, fetchImpl, log });
    expect(calls.filter((c) => c.url.startsWith("https://api.supabase.com")).every((c) => c.url.includes(`/projects/${TEST_REF}/`))).toBe(true);
    const webhookCall = calls.find((c) => c.url.endsWith("/v1/webhook_endpoints"));
    expect(String(webhookCall?.init.body)).toContain(encodeURIComponent(`https://${TEST_REF}.supabase.co/functions/v1/stripe-webhook`));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/whsec_|sk_test_|synthetic-management-token/);
  });
});
