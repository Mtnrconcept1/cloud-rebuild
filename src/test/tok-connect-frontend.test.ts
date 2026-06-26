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
    expect(portal).toContain("fetchWithFreshAccessToken");
    expect(portal).toContain("Documentation OpenAPI");
    expect(portal).toContain("Exemple MCP");
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
    expect(admin).toContain("selectedPartnerId");
    expect(admin).toContain("grantForm");
    expect(admin).toContain("fetchWithFreshAccessToken");
    expect(admin).toContain("Checklist ChatGPT MCP");
    expect(admin).toContain("CHATGPT_MCP_SERVER_URL");
    expect(admin).toContain("tok-connect-mcp");
    expect(admin).toContain("CHATGPT_OAUTH_TOKEN_URL");
    expect(admin).toContain("tok-connect-oauth");
    expect(admin).toContain("Client OAuth défini par l'utilisateur");
    expect(admin).toContain("Périmètres par défaut");
    expect(admin).toContain("Secret affiché une seule fois");
    expect(admin).toContain("tok_connect_partners");
    expect(admin).toContain("tok_connect_api_requests");
    expect(admin).toContain("ADMIN_TOK_CONNECT_LOG_LIMIT");

    expect(dashboard).toContain("Consentements TOK Connect");
    expect(dashboard).toContain("tok_connect_restaurant_grants");
    expect(dashboard).toContain("tok-connect-portal");
    expect(dashboard).toContain("update-grant-status");
    expect(dashboard).toContain("fetchWithFreshAccessToken");
    expect(dashboard).toContain("public.auth_owns_restaurant");
    expect(dashboard).toContain("DASHBOARD_TOK_CONNECT_GRANTS_LIMIT");
  });
});
