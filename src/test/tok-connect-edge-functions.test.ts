import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  const path = resolve(process.cwd(), relativePath);
  expect(existsSync(path), `${relativePath} should exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("TOK Connect Edge Functions", () => {
  it("registers all TOK Connect functions with in-handler authorization", () => {
    const config = read("supabase/config.toml");

    for (const functionName of [
      "tok-connect-oauth",
      "tok-connect-api",
      "tok-connect-mcp",
      "tok-connect-portal",
      "tok-connect-webhook-dispatch",
    ]) {
      expect(config).toContain(`[functions.${functionName}]`);
      expect(config).toMatch(new RegExp(`\\[functions\\.${functionName}\\][\\s\\S]{0,80}verify_jwt\\s*=\\s*false`, "i"));
    }
  });

  it("implements OAuth client-credentials with hashed secrets, scopes and audit logs", () => {
    const source = read("supabase/functions/tok-connect-oauth/index.ts");
    const authSource = read("supabase/functions/_shared/tok-connect-auth.ts");

    expect(source).toContain("client_credentials");
    expect(source).toContain("assertTokConnectFeatureEnabled");
    expect(source).toContain("hashTokConnectSecret");
    expect(source).toContain("verifyTokConnectSecret");
    expect(source).toContain("revoked_at");
    expect(source).toContain("createRateLimiter");
    expect(source).toContain("tok_connect_access_tokens");
    expect(source).toContain("writeAuditLog");
    expect(source).not.toContain("service_role_key");
    expect(authSource).toContain("tok_connect_token_client_mismatch");
    expect(authSource).toContain("tok_connect_token_scope_revoked");
  });

  it("implements the versioned REST API with scoped access, pagination and idempotent reservation writes", () => {
    const source = read("supabase/functions/tok-connect-api/index.ts");

    for (const marker of [
      "/v1/restaurants",
      "/v1/reservations/preview",
      "/v1/reservations",
      "/v1/campaigns/preview",
      "Idempotency-Key",
      "validate_and_create_reservation_safe",
      "tok_connect_idempotency_keys",
      "tok_connect_webhook_deliveries",
      "parseTokConnectLimit",
      "assertTokConnectScopes",
      "assertTokConnectFeatureEnabled",
      "assertTokConnectRestaurantGrant",
      "writeAuditLog",
      "getTokConnectIdempotencyDecision",
      "idempotency_key_reused_with_different_body",
    ]) {
      expect(source).toContain(marker);
    }

    expect(source).not.toContain("create_flash_offer");
    expect(source).not.toContain("autopilot_bounded_write");
  });

  it("implements the MCP JSON-RPC surface with only v1-safe tools", () => {
    const source = read("supabase/functions/tok-connect-mcp/index.ts");

    for (const method of ["initialize", "tools/list", "tools/call", "resources/list", "resources/read", "prompts/list", "prompts/get"]) {
      expect(source).toContain(method);
    }

    for (const tool of [
      "search_restaurants",
      "get_real_time_availability",
      "prepare_reservation",
      "get_restaurant_performance",
      "estimate_campaign_credit_cost",
      "generate_campaign_preview",
    ]) {
      expect(source).toContain(tool);
    }

    expect(source).not.toContain("create_flash_offer");
    expect(source).not.toContain("redeem_miamz");
    expect(source).toContain("assertTokConnectFeatureEnabled");
    expect(source).toContain("assertTokConnectRestaurantGrant");
    expect(source).toContain("getTokConnectSandboxMcpToolResult");
    expect(source).toContain("context = result.context");
  });

  it("keeps developer portal actions authenticated by user JWT instead of public table writes", () => {
    const source = read("supabase/functions/tok-connect-portal/index.ts");

    expect(source).toContain("authenticateRequest");
    expect(source).toContain("create-sandbox-client");
    expect(source).toContain("rotate-client-secret");
    expect(source).toContain("revoke-client");
    expect(source).toContain("send-webhook-test");
    expect(source).toContain("create-webhook-endpoint");
    expect(source).toContain("writeAuditLog");
    expect(source).toContain("hashTokConnectSecret");
    expect(source).toContain("isSafeTokConnectWebhookUrl");
    expect(source).toContain("isLocalTokConnectDevelopmentRuntime");
  });

  it("dispatches signed TOK Connect webhooks with retry accounting", () => {
    const source = read("supabase/functions/tok-connect-webhook-dispatch/index.ts");

    for (const marker of [
      "tok_connect_webhook_deliveries",
      "tok_connect_webhook_endpoints",
      "buildTokConnectWebhookHeaders",
      "X-TOK-Event",
      "next_retry_at",
      "attempts",
      "delivered",
      "failed",
      "fetch(",
      "writeAuditLog",
      "assertTokConnectFeatureEnabled",
    ]) {
      expect(source).toContain(marker);
    }
  });
});
