import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  const path = resolve(process.cwd(), relativePath);
  expect(existsSync(path), `${relativePath} should exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("TOK Connect Full App MCP", () => {
  it("registers the full app MCP edge function with in-handler authorization", () => {
    const config = read("supabase/config.toml");

    expect(config).toContain("[functions.tok-connect-full-app-mcp]");
    expect(config).toMatch(/\[functions\.tok-connect-full-app-mcp\][\s\S]{0,80}verify_jwt\s*=\s*false/i);
  });

  it("exposes every major TOK surface through safe ChatGPT MCP tools", () => {
    const source = read("supabase/functions/tok-connect-full-app-mcp/index.ts");

    for (const tool of [
      "discover_tok_application",
      "open_tok_application_console",
      "plan_tok_application_route",
      "preview_tok_client_journey",
      "preview_tok_restaurant_journey",
      "preview_tok_admin_journey",
      "read_tok_restaurant_snapshot",
      "read_tok_availability_snapshot",
      "prepare_tok_human_confirmation_packet",
      "audit_tok_action_risk",
    ]) {
      expect(source).toContain(tool);
    }

    for (const module of [
      "home_discovery",
      "restaurant_profile",
      "reservation",
      "zero_attente",
      "chefs_table",
      "orders_checkout",
      "multi_restaurant",
      "miamz_loyalty",
      "tok_one",
      "client_account",
      "restaurant_dashboard",
      "service_pilotage",
      "floorplan_ai",
      "menus_catalogue",
      "orders_management",
      "reservation_management",
      "credits_wallet",
      "studio_marketing",
      "photopro",
      "campaigns_sponsored",
      "flash_sales",
      "news_feed",
      "crm_clients",
      "analytics",
      "accounting_invoices",
      "subscription_billing",
      "commercial_workspace",
      "courier_portal",
      "admin_supervision",
      "support",
    ]) {
      expect(source).toContain(module);
    }

    expect(source).toContain("TOK_APP_MODULES");
    expect(source).toContain("FULL_APP_MCP_TOOLS");
    expect(source).toContain("text/html;profile=mcp-app");
    expect(source).toContain("ui://tok-connect/full-app-console-v1.html");
    expect(source).toContain('"openai/outputTemplate"');
    expect(source).toContain("window.openai.requestDisplayMode");
    expect(source).toContain("window.openai.sendFollowUpMessage");
  });

  it("matches the TOK application visual system instead of a generic MCP skin", () => {
    const source = read("supabase/functions/tok-connect-full-app-mcp/index.ts");

    for (const marker of [
      "DM Sans",
      "Playfair Display",
      "Bubblegum Sans",
      "Playball",
      "--primary: 24 95% 53%",
      "--miamz-green",
      "--miamz-orange",
      "tok-dashboard-shell",
      "tok-dashboard-sidebar",
      "tok-dashboard-hero",
      "tok-dashboard-panel",
      "tok-dashboard-kpi",
      "tok-action-primary",
      "tok-public-utility",
      "tok-navbar",
      "tok-main-nav",
      "Mes espaces",
      "https://www.thetok.ch/logotok.png",
      "https://www.thetok.ch/chef.png",
      "design_system: \"tok-dashboard\"",
    ]) {
      expect(source).toContain(marker);
    }
  });

  it("keeps risky app actions behind confirmation packets", () => {
    const source = read("supabase/functions/tok-connect-full-app-mcp/index.ts");

    for (const marker of [
      "mutation_allowed: false",
      "requires_human_confirmation",
      "blocked_until_confirmed",
      "payment_required",
      "publication_blocked",
      "reservation_blocked",
      "confirmation_packet",
      "audit_tok_action_risk",
      "assertTokConnectFeatureEnabled",
      "assertTokConnectRestaurantGrant",
      "recordTokConnectApiRequest",
    ]) {
      expect(source).toContain(marker);
    }

    expect(source).not.toContain("autonomous_mutation_allowed: true");
    expect(source).not.toContain("create_flash_offer");
    expect(source).not.toContain("redeem_miamz");
  });
});
