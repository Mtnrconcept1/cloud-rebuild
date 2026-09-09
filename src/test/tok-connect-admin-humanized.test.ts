import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("TOK Connect admin humanized workflow", () => {
  it("gives every restaurant a real global MCP access switch enforced by OAuth and all restaurant reads", () => {
    const migration = read("supabase/migrations/20260909014500_tok_connect_restaurant_mcp_access.sql");
    const auth = read("supabase/functions/_shared/tok-connect-auth.ts");
    const adminApi = read("supabase/functions/tok-connect-admin/index.ts");

    expect(migration).toContain("tok_connect_mcp_enabled");
    expect(migration).toContain("DEFAULT true");
    expect(auth).toContain("withTokConnectRestaurantVisibility");
    expect(auth).toContain('.eq("tok_connect_mcp_enabled", true)');
    expect(adminApi).toContain('"set-restaurant-mcp-access"');
    expect(adminApi).toContain("tok_connect_mcp_enabled");
  });

  it("loads an enriched admin overview with human restaurant, owner, partner and agent names", () => {
    const adminApi = read("supabase/functions/tok-connect-admin/index.ts");

    expect(adminApi).toContain('"admin-overview"');
    expect(adminApi).toContain("restaurant_name");
    expect(adminApi).toContain("owner_name");
    expect(adminApi).toContain("owner_email");
    expect(adminApi).toContain("partner_name");
    expect(adminApi).toContain("agent_name");
    expect(adminApi).toContain("profiles");
  });

  it("lets an admin pick a restaurant by name and authorize or revoke MCP access in one click", () => {
    const admin = read("src/pages/admin/AdminTokConnect.tsx");

    expect(admin).toContain("Restaurants autorisés au MCP");
    expect(admin).toContain("Rechercher un restaurant");
    expect(admin).toContain("Autoriser l’accès MCP");
    expect(admin).toContain("Révoquer l’accès MCP");
    expect(admin).toContain("set-restaurant-mcp-access");
    expect(admin).toContain("restaurant_name");
    expect(admin).toContain("owner_name");
    expect(admin).toContain("agent_name");
    expect(admin).toContain("Diagnostic technique");

    expect(admin).not.toContain("PARTNER ID");
    expect(admin).not.toContain("CLIENT UUID");
    expect(admin).not.toContain("Grant restaurant");
    expect(admin).not.toContain("Politique client OAuth");
    expect(admin).not.toContain("Checklist ChatGPT MCP");
    expect(admin).not.toContain("Client OAuth défini par l'utilisateur");
    expect(admin).not.toContain("client_secret_basic");
  });

  it("documents the real ChatGPT install path without the obsolete advanced OAuth form", () => {
    const page = read("src/pages/TokConnect.tsx");

    expect(page).toContain("https://www.thetok.ch/mcp");
    expect(page).toContain("Ajouter TOK Connect dans ChatGPT");
    expect(page).toContain("Choisir OAuth");
    expect(page).toContain("Se connecter à TOK");
    expect(page).toContain("Le module TOK s’ouvre automatiquement");
    expect(page).toContain("tok-connect-widget-restaurants.svg");
    expect(page).toContain("tok-connect-widget-details.svg");

    expect(page).not.toContain("OAuth avancé");
    expect(page).not.toContain("Client OAuth défini par l'utilisateur");
    expect(page).not.toContain("Secret client OAuth");
    expect(page).not.toContain("URL jeton");
    expect(page).not.toContain("OIDC activé");
    expect(page).not.toContain("Dynamic Client Registration");
    expect(page).not.toContain("chatgpt-mcp-dcr-error.png");
    expect(page).not.toContain("chatgpt-mcp-oauth-endpoints.png");
    expect(page).not.toContain("chatgpt-mcp-oidc.png");
  });
});
