import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getFeatureNameForRoute } from "@/lib/featureCatalog";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("TOK Connect frontend integration", () => {
  it("wires public, developer, admin and restaurant routes behind TOK Connect feature flags", () => {
    const app = read("src/App.tsx");

    expect(app).toContain('path="/tok-connect"');
    expect(app).toContain('path="/tok-connect/developer"');
    expect(app).toContain('path="/admin/tok-connect"');
    expect(app).toContain('path="/dashboard/tok-connect"');
    expect(getFeatureNameForRoute("/tok-connect/developer")).toBe("tok-connect");
    expect(getFeatureNameForRoute("/admin/tok-connect")).toBe("admin-tok-connect");
    expect(getFeatureNameForRoute("/dashboard/tok-connect")).toBe("dashboard-tok-connect");
  });

  it("uses the secure portal Edge Function for developer client and webhook actions", () => {
    const portal = read("src/pages/TokConnectDeveloper.tsx");

    expect(portal).toContain("tok-connect-portal");
    expect(portal).toContain("tokConnectOpenApiDocument");
    expect(portal).toContain("create-sandbox-client");
    expect(portal).toContain("rotate-client-secret");
    expect(portal).toContain("revoke-client");
    expect(portal).toContain("create-webhook-endpoint");
    expect(portal).toContain("send-webhook-test");
    expect(portal).toContain("Autopilot");
    expect(portal).toContain("tok_connect_agent_runs");
    expect(portal).toContain("fetchWithFreshAccessToken");
    expect(portal).toContain("Documentation OpenAPI");
    expect(portal).toContain("Exemple MCP");
  });

  it("surfaces all TOK Connect entry points and the simplified MCP/API deployment path on the public page", () => {
    const page = read("src/pages/TokConnect.tsx");

    expect(page).toContain("Accès rapides TOK Connect");
    expect(page).toContain("/tok-connect/developer");
    expect(page).toContain("/admin/tok-connect");
    expect(page).toContain("/dashboard/tok-connect");
    expect(page).toContain("#api-rest");
    expect(page).toContain("#mcp-server");
    expect(page).toContain("#webhooks");
    expect(page).toContain("#deployer-mcp-api");
    expect(page).toContain("Déployer MCP/API en 5 actions");
    expect(page).toContain("ChatGPT MCP en 3 minutes");
    expect(page).toContain("CHATGPT_MCP_SERVER_URL");
    expect(page).toContain("CHATGPT_OAUTH_AUTHORIZATION_URL");
    expect(page).toContain("CHATGPT_OAUTH_TOKEN_URL");
    expect(page).toContain("CHATGPT_REST_API_URL");
    expect(page).toContain("Champ ChatGPT");
    expect(page).toContain("Valeur TOK à coller");
    expect(page).toContain("Dynamic Client Registration");
    expect(page).toContain("Ne collez jamais l'URL OAuth token dans URL du serveur");
    expect(page).toContain("/images/tok-connect/chatgpt-mcp-new-app.png");
    expect(page).toContain("/images/tok-connect/chatgpt-mcp-oauth-endpoints.png");
    expect(page).toContain("Ce que TOK Connect sait faire");
    expect(page).toContain("https://www.thetok.ch/functions/v1/tok-connect-api");
    expect(page).toContain("https://www.thetok.ch/functions/v1/tok-connect-mcp");
    expect(page).toContain("https://www.thetok.ch/functions/v1/tok-connect-oauth/authorize");
    expect(page).toContain("Autopilot avanc");
    expect(page).toContain("selectedActor");
    expect(page).toContain("Envoyer");
    expect(page).toContain("Simule une demande libre");
    expect(page).toContain("tok-plan-step-enter");
  });

  it("keeps text selection visible across TOK pages", () => {
    const css = read("src/index.css");

    expect(css).toContain("::selection");
    expect(css).toContain("::-moz-selection");
    expect(css).toContain("rgba(255, 106, 26, 0.82)");
    expect(css).toContain(".dark ::selection");
    expect(css).toContain("rgba(255, 170, 64, 0.92)");
  });

  it("adds operational TOK Connect consoles for admins and restaurateurs", () => {
    const admin = read("src/pages/admin/AdminTokConnect.tsx");
    const dashboard = read("src/pages/dashboard/DashboardTokConnect.tsx");

    expect(admin).toContain("Supervision TOK Connect");
    expect(admin).toContain("tok-connect-portal");
    expect(admin).toContain("approve-partner");
    expect(admin).toContain("suspend-partner");
    expect(admin).toContain("revoke-partner");
    expect(admin).toContain("revoke-client");
    expect(admin).toContain("upsert-restaurant-grant");
    expect(admin).toContain("update-client-policy");
    expect(admin).toContain("approve-agent-run");
    expect(admin).toContain("reject-agent-run");
    expect(admin).toContain("selectedPartnerId");
    expect(admin).toContain("grantForm");
    expect(admin).toContain("fetchWithFreshAccessToken");
    expect(admin).toContain("Checklist ChatGPT MCP");
    expect(admin).toContain("CHATGPT_MCP_SERVER_URL");
    expect(admin).toContain("tok-connect-mcp");
    expect(admin).toContain("CHATGPT_OAUTH_AUTHORIZATION_URL");
    expect(admin).toContain("CHATGPT_OAUTH_TOKEN_URL");
    expect(admin).toContain("tok-connect-oauth");
    expect(admin).toContain("client_secret_basic");
    expect(admin).toContain("Client OAuth défini par l'utilisateur");
    expect(admin).toContain("Périmètres par défaut");
    expect(admin).toContain("Secret affiché une seule fois");
    expect(admin).toContain("tok_connect_partners");
    expect(admin).toContain("tok_connect_api_requests");
    expect(admin).toContain("tok_connect_agent_runs");
    expect(admin).toContain("ADMIN_TOK_CONNECT_LOG_LIMIT");

    expect(dashboard).toContain("Consentements TOK Connect");
    expect(dashboard).toContain("tok_connect_restaurant_grants");
    expect(dashboard).toContain("tok-connect-portal");
    expect(dashboard).toContain("update-grant-status");
    expect(dashboard).toContain("fetchWithFreshAccessToken");
    expect(dashboard).toContain("public.auth_owns_restaurant");
    expect(dashboard).toContain("DASHBOARD_TOK_CONNECT_GRANTS_LIMIT");
  });

  it("keeps the OAuth Edge Function compatible with ChatGPT manual OAuth", () => {
    const oauth = read("supabase/functions/tok-connect-oauth/index.ts");

    expect(oauth).toContain("handleAuthorizationRequest");
    expect(oauth).toContain("response_type_code_required");
    expect(oauth).toContain("authorization_code");
    expect(oauth).toContain("readBasicClientCredentials");
    expect(oauth).toContain("redirect_uri_not_allowed");
    expect(oauth).toContain("chatgpt.com");
  });
});
