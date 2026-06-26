import { describe, expect, it } from "vitest";

import {
  SAFE_TOK_CONNECT_MCP_TOOLS,
  TOK_CONNECT_REQUIRED_FEATURE_FLAGS,
  TOK_CONNECT_WEBHOOK_EVENTS,
  assertTokConnectScopes,
  buildTokConnectWebhookHeaders,
  buildTokConnectEnvelope,
  createTokConnectCursor,
  getTokConnectIdempotencyDecision,
  getTokConnectRetryDelaySeconds,
  getTokConnectSandboxMcpToolResult,
  hashTokConnectSecret,
  isSafeTokConnectWebhookUrl,
  isValidTokConnectIdempotencyKey,
  parseTokConnectCursor,
  parseTokConnectLimit,
  signTokConnectWebhook,
  verifyTokConnectSecret,
} from "../../supabase/functions/_shared/tok-connect.ts";

describe("TOK Connect shared runtime", () => {
  it("standardizes API envelopes and cursor pagination", () => {
    expect(buildTokConnectEnvelope({ requestId: "req_123", data: { ok: true }, nextCursor: "cursor" })).toEqual({
      ok: true,
      data: { ok: true },
      error: null,
      request_id: "req_123",
      next_cursor: "cursor",
    });

    expect(buildTokConnectEnvelope({ requestId: "req_123", error: { code: "missing_scope", message: "Scope absent" } }))
      .toEqual({
        ok: false,
        data: null,
        error: { code: "missing_scope", message: "Scope absent" },
        request_id: "req_123",
        next_cursor: null,
      });

    const cursor = createTokConnectCursor("2026-06-26T10:00:00.000Z", "restaurant-1");
    expect(parseTokConnectCursor(cursor)).toEqual({ createdAt: "2026-06-26T10:00:00.000Z", id: "restaurant-1" });
    expect(parseTokConnectLimit("500", 25, 100)).toBe(100);
    expect(parseTokConnectLimit("bad", 25, 100)).toBe(25);
  });

  it("keeps idempotency keys required and bounded for reservation writes", () => {
    expect(isValidTokConnectIdempotencyKey("booking_20260626_partner_abc123")).toBe(true);
    expect(isValidTokConnectIdempotencyKey("x")).toBe(false);
    expect(isValidTokConnectIdempotencyKey("contains spaces")).toBe(false);
    expect(isValidTokConnectIdempotencyKey("a".repeat(121))).toBe(false);

    expect(getTokConnectIdempotencyDecision(null, "hash_a")).toEqual({ status: "new" });
    expect(getTokConnectIdempotencyDecision({
      request_hash: "hash_a",
      response_body: { ok: true },
      status_code: 201,
    }, "hash_a")).toEqual({
      status: "replay",
      responseBody: { ok: true },
      statusCode: 201,
    });
    expect(getTokConnectIdempotencyDecision({
      request_hash: "hash_a",
      response_body: { ok: true },
      status_code: 201,
    }, "hash_b")).toEqual({ status: "conflict" });
    expect(getTokConnectIdempotencyDecision({
      request_hash: "hash_a",
      response_body: null,
      status_code: null,
    }, "hash_a")).toEqual({ status: "in_progress" });
  });

  it("rejects unsafe webhook callback URLs unless local development explicitly allows localhost http", () => {
    expect(isSafeTokConnectWebhookUrl("https://partner.example/webhooks")).toBe(true);
    expect(isSafeTokConnectWebhookUrl("http://partner.example/webhooks")).toBe(false);
    expect(isSafeTokConnectWebhookUrl("https://127.0.0.1/webhooks")).toBe(false);
    expect(isSafeTokConnectWebhookUrl("https://10.0.0.5/webhooks")).toBe(false);
    expect(isSafeTokConnectWebhookUrl("http://localhost:8787/webhooks")).toBe(false);
    expect(isSafeTokConnectWebhookUrl("http://localhost:8787/webhooks", { allowLocalHttp: true })).toBe(true);
  });

  it("returns deterministic sandbox MCP results without production RPC mutations", () => {
    const availability = getTokConnectSandboxMcpToolResult("get_real_time_availability", {
      restaurant_id: "00000000-0000-4000-8000-000000000101",
      date: "2026-06-26",
    });
    const campaign = getTokConnectSandboxMcpToolResult("generate_campaign_preview", {
      restaurant_id: "00000000-0000-4000-8000-000000000101",
      objective: "Remplir le service du midi",
    });

    expect(availability?.content[0]?.text).toContain("remaining_tables");
    expect(campaign?.content[0]?.text).toContain("requires_human_approval");
  });

  it("enforces scoped access without enabling autopilot tools in v1", () => {
    expect(() => assertTokConnectScopes(["restaurants:read", "availability:read"], ["availability:read"]))
      .not.toThrow();
    expect(() => assertTokConnectScopes(["restaurants:read"], ["reservations:create"]))
      .toThrow(/reservations:create/);

    expect(SAFE_TOK_CONNECT_MCP_TOOLS.map((tool) => tool.name)).toEqual([
      "search_restaurants",
      "get_real_time_availability",
      "prepare_reservation",
      "get_restaurant_performance",
      "estimate_campaign_credit_cost",
      "generate_campaign_preview",
    ]);
    expect(SAFE_TOK_CONNECT_MCP_TOOLS.map((tool) => tool.name)).not.toContain("create_flash_offer");
    expect(TOK_CONNECT_REQUIRED_FEATURE_FLAGS).toContain("tok-connect-autopilot");
  });

  it("hashes client secrets and signs outgoing webhooks", async () => {
    const hash = await hashTokConnectSecret("tokc_secret_test");
    expect(hash).toMatch(/^tokc_sha256:/);
    await expect(verifyTokConnectSecret("tokc_secret_test", hash)).resolves.toBe(true);
    await expect(verifyTokConnectSecret("wrong", hash)).resolves.toBe(false);

    const signature = await signTokConnectWebhook({
      secret: "whsec_test",
      timestamp: "2026-06-26T10:00:00.000Z",
      payload: JSON.stringify({ event: "reservation.created", id: "res_1" }),
    });

    expect(signature).toMatch(/^v1=[A-Za-z0-9_-]{40,}$/);
    expect(TOK_CONNECT_WEBHOOK_EVENTS).toEqual([
      "reservation.created",
      "reservation.cancelled",
      "webhook.test",
      "campaign.previewed",
    ]);
  });

  it("builds signed webhook headers and bounded retry delays for the dispatcher", async () => {
    const headers = await buildTokConnectWebhookHeaders({
      eventType: "webhook.test",
      deliveryId: "delivery_123",
      secret: "tokc_whsec_test",
      timestamp: "2026-06-26T10:00:00.000Z",
      payload: JSON.stringify({ event: "webhook.test" }),
    });

    expect(headers["X-TOK-Event"]).toBe("webhook.test");
    expect(headers["X-TOK-Delivery"]).toBe("delivery_123");
    expect(headers["X-TOK-Timestamp"]).toBe("2026-06-26T10:00:00.000Z");
    expect(headers["X-TOK-Signature"]).toMatch(/^v1=[A-Za-z0-9_-]{40,}$/);
    expect(getTokConnectRetryDelaySeconds(0)).toBe(60);
    expect(getTokConnectRetryDelaySeconds(3)).toBe(480);
    expect(getTokConnectRetryDelaySeconds(20)).toBe(3600);
  });
});
