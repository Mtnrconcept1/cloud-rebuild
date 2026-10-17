import { describe, expect, it } from "vitest";
import {
  assertStripeTestTarget,
  inspectStripeTestWebhooks,
  PRODUCTION_SUPABASE_REF,
  REQUIRED_CHECKOUT_EVENTS,
} from "../../scripts/verify-tok-stripe-test-webhooks.mjs";

const testRef = "abcdefghijklmnopqrst";
const testUrl = "https://" + testRef + ".supabase.co";
const productionUrl = "https://" + PRODUCTION_SUPABASE_REF + ".supabase.co";
const env = {
  TOK_TEST_SUPABASE_PROJECT_REF: testRef,
  TOK_TEST_SUPABASE_URL: testUrl,
  STRIPE_SECRET_KEY_TEST: "sk_test_example_for_unit_test",
};

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "we_test_1",
    url: testUrl + "/functions/v1/stripe-webhook",
    livemode: false,
    status: "enabled",
    enabled_events: [...REQUIRED_CHECKOUT_EVENTS],
    ...overrides,
  };
}

function mockPages(pages: Array<{ data: unknown[]; has_more: boolean }>) {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = async (url: string, options: { headers: Record<string, string> }) => {
    requests.push({ url, headers: options.headers });
    const payload = pages[requests.length - 1];
    if (!payload) throw new Error("Unexpected extra API request");
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetchImpl, requests };
}

describe("TOK Stripe Test webhook readiness gate", () => {
  it("rejects production and incorrect target URLs before any network request", async () => {
    let calls = 0;
    const fetchImpl = () => { calls += 1; throw new Error("network unexpectedly called"); };
    for (const invalid of [
      { ...env, TOK_TEST_SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_REF, TOK_TEST_SUPABASE_URL: productionUrl },
      { ...env, TOK_TEST_SUPABASE_URL: productionUrl },
      { ...env, TOK_TEST_SUPABASE_PROJECT_REF: "" },
      { ...env, STRIPE_SECRET_KEY_TEST: "sk_live_not_accepted" },
      { ...env, STRIPE_SECRET_KEY_TEST: "" },
    ]) {
      await expect(inspectStripeTestWebhooks({ env: invalid, fetchImpl })).rejects.toThrow();
    }
    expect(calls).toBe(0);
  });

  it("does not accept a production URL merely because Stripe Test is selected", () => {
    expect(() => assertStripeTestTarget({
      ...env,
      TOK_TEST_SUPABASE_URL: "https://www.thetok.ch",
    })).toThrow("STRIPE_TEST_PROJECT_URL_MISMATCH");
  });

  it("rejects disabled Test webhooks, including the existing disabled production callbacks", async () => {
    const { fetchImpl } = mockPages([{
      data: [endpoint({ id: "we_disabled", url: productionUrl + "/functions/v1/stripe-webhook", status: "disabled" })],
      has_more: false,
    }]);
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("ISOLATED_STRIPE_TEST_WEBHOOK_NOT_READY");
  });

  it("blocks any active Test webhook pointing to TOK production", async () => {
    const { fetchImpl } = mockPages([{
      data: [
        endpoint({ id: "we_bad", url: productionUrl + "/functions/v1/stripe-webhook" }),
        endpoint({ id: "we_good" }),
      ],
      has_more: false,
    }]);
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("ACTIVE_STRIPE_TEST_WEBHOOK_TARGETS_PRODUCTION");
  });

  it("blocks an active Test webhook aimed at the public TOK domain", async () => {
    const { fetchImpl } = mockPages([{
      data: [endpoint({ url: "https://www.thetok.ch/api/stripe-webhook" })],
      has_more: false,
    }]);
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("ACTIVE_STRIPE_TEST_WEBHOOK_TARGETS_PRODUCTION");
  });

  it("requires both Checkout completion events and an enabled endpoint", async () => {
    const { fetchImpl } = mockPages([{
      data: [endpoint({ enabled_events: ["checkout.session.completed"] })],
      has_more: false,
    }]);
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("ISOLATED_STRIPE_TEST_WEBHOOK_NOT_READY");
  });

  it("rejects duplicate active endpoints for the same isolated target", async () => {
    const { fetchImpl } = mockPages([{
      data: [endpoint({ id: "we_first" }), endpoint({ id: "we_second" })],
      has_more: false,
    }]);
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("DUPLICATE_ISOLATED_STRIPE_TEST_WEBHOOKS");
  });

  it("paginates Stripe endpoints and returns a sanitised summary", async () => {
    const { fetchImpl, requests } = mockPages([
      { data: [endpoint({ id: "we_disabled", status: "disabled", url: productionUrl + "/functions/v1/stripe-webhook" })], has_more: true },
      { data: [endpoint({ id: "we_valid" })], has_more: false },
    ]);
    const result = await inspectStripeTestWebhooks({ env, fetchImpl });
    expect(result).toEqual({
      projectRef: testRef,
      activeWebhookCount: 1,
      disabledWebhookCount: 1,
      isolatedCheckoutWebhookCount: 1,
      status: "ready",
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].url).toContain("starting_after=we_disabled");
    expect(requests[0].headers.Authorization).toBe("Bearer " + env.STRIPE_SECRET_KEY_TEST);
    expect(JSON.stringify(result)).not.toContain(env.STRIPE_SECRET_KEY_TEST);
  });

  it("fails closed when pagination is malformed", async () => {
    const { fetchImpl } = mockPages([{ data: [], has_more: true }]);
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("STRIPE_TEST_WEBHOOK_PAGINATION_INVALID");
  });

  it("does not reveal Stripe error response bodies or secrets", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      text: async () => "secret error body that must never be displayed",
    });
    await expect(inspectStripeTestWebhooks({ env, fetchImpl }))
      .rejects.toThrow("STRIPE_TEST_WEBHOOK_READ_FAILED_401");
  });
});
