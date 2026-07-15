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
    expect(source).toContain("decodeOAuthBasicComponent");
    expect(source).toContain("client_secret_basic");
    expect(source).not.toContain("service_role_key");
    expect(authSource).toContain("tok_connect_token_client_mismatch");
    expect(authSource).toContain("tok_connect_token_scope_revoked");
    expect(authSource).toContain("clientQuotaPerMinute");
    expect(authSource).toContain("tok_connect_quota_per_minute");
  });

  it("returns OAuth token exchange responses at the JSON root for ChatGPT compatibility", () => {
    const source = read("supabase/functions/tok-connect-oauth/index.ts");

    expect(source).toContain("type OAuthTokenPayload");
    expect(source).toContain("function oauthTokenResponse");
    expect(source).toContain("return oauthTokenResponse({");
    expect(source).toContain("access_token: accessToken");
    expect(source).toContain('token_type: "Bearer"');
    expect(source).toContain("expires_in: expiresIn");
    expect(source).toContain('scope: issuedScopes.join(" ")');
    expect(source).toContain('"Cache-Control": "no-store"');
    expect(source).toContain('"Pragma": "no-cache"');
    expect(source).not.toMatch(/buildTokConnectEnvelope\(\{[\s\S]{0,240}access_token/i);
    expect(source).not.toMatch(/data:\s*\{\s*access_token/i);
  });

  it("implements the versioned REST API with scoped access, pagination and idempotent reservation writes", () => {
    const source = read("supabase/functions/tok-connect-api/index.ts");

    for (const marker of [
      "/v1/restaurants",
      "/v1/reservations/preview",
      "/v1/reservations",
      "/v1/reservations/{id}/cancel",
      "/v1/campaigns/preview",
      "/v1/autopilot/plan",
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
      "tok_connect_reservation_not_owned",
      "end_user_cancellation_confirmation_required",
      "reservation.cancelled",
      "get_restaurant_credit_usage",
      "source: \"get_restaurant_credit_usage\"",
      "tok-connect-autopilot",
      "buildTokConnectAutopilotPlan",
      "pending_approval",
      "autopilot_bounded",
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
      "build_autopilot_plan",
    ]) {
      expect(source).toContain(tool);
    }

    expect(source).not.toContain("create_flash_offer");
    expect(source).not.toContain("redeem_miamz");
    expect(source).toContain("tok-connect-autopilot");
    expect(source).toContain("tok://autopilot-runs/{restaurant_id}");
    expect(source).toContain("buildTokConnectAutopilotPlan");
    expect(source).toContain("agent_runs");
    expect(source).toContain(".limit(25)");
    expect(source).toContain("assertTokConnectFeatureEnabled");
    expect(source).toContain("assertTokConnectRestaurantGrant");
    expect(source).toContain("getTokConnectSandboxMcpToolResult");
    expect(source).toContain("context = result.context");
  });

  it("exposes a ChatGPT Apps action window for visible MCP actions", () => {
    const source = read("supabase/functions/tok-connect-mcp/index.ts");

    expect(source).toContain("ACTION_WINDOW_RESOURCE_URI");
    expect(source).toContain("ui://tok-connect/actions-window-v1.html");
    expect(source).toContain("text/html;profile=mcp-app");
    expect(source).toContain("TOK_CONNECT_ACTION_WINDOW_TOOL");
    expect(source).toContain("open_action_window");
    expect(source).toContain("TOK_CONNECT_APP_MODULES");
    expect(source).toContain("toolUiMeta");
    expect(source).toContain("studio_marketing");
    expect(source).toContain("photopro");
    expect(source).toContain("reservation");
    expect(source).toContain("commande");
    expect(source).toContain("zero_attente");
    expect(source).toContain("multi_resto");
    expect(source).toContain("query_application_tool");
    expect(source).toContain("open_application_sandbox");
    expect(source).toContain("buildApplicationToolQueryResult");
    expect(source).toContain("buildApplicationSandboxResult");
    expect(source).toContain("mutation_allowed");
    expect(source).toContain("requires_human_confirmation");
    expect(source).toContain("Sandbox parcours TOK");
    expect(source).toContain("https://www.thetok.ch/logo.png");
    expect(source).toContain("https://www.thetok.ch/chef.png");
    expect(source).toContain("tok-topbar");
    expect(source).toContain("tok-mascot");
    expect(source).toContain("floating-menu");
    expect(source).toContain("Mes espaces");
    expect(source).toContain("Journal technique");
    expect(source).toContain("resourceDomains");
    expect(source).toContain("tok-restaurant-card");
    expect(source).toContain("renderRestaurantCards");
    expect(source).toContain("renderToolPayload");
    expect(source).toContain("parseToolPayload");
    expect(source).toContain("MCP_TOOLS.map(toolDefinition)");
    expect(source).toContain("buildActionWindowResult");
    expect(source).toContain('"openai/outputTemplate"');
    expect(source).toContain("window.openai.requestDisplayMode");
    expect(source).toContain("window.openai.sendFollowUpMessage");
    expect(source).toContain("MCP resources/read action-window");
  });

  it("keeps public discovery available while requiring OAuth for protected MCP tools", () => {
    const source = read("supabase/functions/tok-connect-mcp/index.ts");
    const transport = read("supabase/functions/_shared/mcp-http.ts");

    expect(source).toContain("function hasBearerToken");
    expect(source).toContain('route: context ? "MCP initialize" : "MCP initialize noauth"');
    expect(source).toContain('route: context ? "MCP tools/list" : "MCP tools/list noauth"');
    expect(source).toContain("buildMcpAuthToolResult");
    expect(source).toContain('"mcp/www_authenticate"');
    expect(source).toContain("TOK_CONNECT_RESOURCE_METADATA_URL");
    expect(source).toContain('{ type: "noauth" }');
    expect(source).toContain('{ type: "oauth2", scopes: TOK_CONNECT_OIDC_SCOPES }');
    expect(source).toContain("securitySchemes");
    expect(source).toContain("negotiateMcpProtocolVersion");
    expect(source).toContain("isMcpNotification");
    expect(source).toContain("mcpAcceptedResponse");
    expect(transport).toContain('"2025-11-25"');
    expect(transport).toContain("assertMcpContentType");
    expect(source).toContain("TOK Connect DEV noauth");
  });

  it("keeps developer portal actions authenticated by user JWT instead of public table writes", () => {
    const source = read("supabase/functions/tok-connect-portal/index.ts");

    expect(source).toContain("authenticateRequest");
    expect(source).toContain("create-sandbox-client");
    expect(source).toContain("rotate-client-secret");
    expect(source).toContain("revoke-client");
    expect(source).toContain("send-webhook-test");
    expect(source).toContain("create-webhook-endpoint");
    expect(source).toContain("upsert-restaurant-grant");
    expect(source).toContain("update-grant-status");
    expect(source).toContain("update-client-policy");
    expect(source).toContain("approve-agent-run");
    expect(source).toContain("reject-agent-run");
    expect(source).toContain("requireRestaurantAccess");
    expect(source).toContain("max_daily_reservations");
    expect(source).toContain("token_ttl_seconds");
    expect(source).toContain("tok_connect_quota_per_minute");
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
