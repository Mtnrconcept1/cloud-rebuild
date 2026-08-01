import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("privileged admin AI chat", () => {
  it("exposes a dedicated admin dashboard chat edge function locked to one configured admin", () => {
    const source = read("supabase/functions/ai-admin-dashboard-chat/index.ts");
    const config = read("supabase/config.toml");

    expect(source).toContain('const FUNCTION_NAME = "ai-admin-dashboard-chat"');
    expect(source).toContain('const FEATURE_NAME = "admin_dashboard_ai_chat"');
    expect(source).toContain("requireSingleAdminAiPrincipal");
    expect(source).toContain("TOK_ADMIN_AI_OWNER_USER_ID");
    expect(source).toContain("TOK_ADMIN_AI_OWNER_EMAIL");
    expect(source).toContain("getSingleConfiguredAdminUserId");
    expect(source).toContain('.from("user_roles")');
    expect(source).toContain('.eq("role", "admin")');
    expect(source).toContain("adminIds.size === 1");
    expect(source).toContain('requireUserRole(actor, ["admin"]');
    expect(source).toContain("requireAdminDashboardAiChatEnabled");
    expect(source).toContain("admin_dashboard_ai_chat_disabled");
    expect(source).toContain("actor.adminClient");
    expect(source).toContain("createRateLimiter");
    expect(source).toContain("writeAuditLog");
    expect(source).toContain("ai_usage_logs");
    expect(source).toContain("ai_conversations");
    expect(source).toContain("ai_messages");
    expect(source).not.toContain("VITE_OPENAI");

    expect(config).toContain("[functions.ai-admin-dashboard-chat]");
    expect(config).toMatch(/\[functions\.ai-admin-dashboard-chat\]\s+verify_jwt\s*=\s*false/i);
  });

  it("builds a bounded admin context covering dashboard data and logs", () => {
    const source = read("supabase/functions/ai-admin-dashboard-chat/index.ts");

    for (const table of [
      "orders",
      "reservations",
      "restaurants",
      "payment_transactions",
      "restaurant_invoices",
      "support_incidents",
      "ai_support_tickets",
      "feature_flags",
      "edge_function_audit_logs",
      "audit_log",
      "ai_usage_logs",
    ]) {
      expect(source).toContain(`.from("${table}")`);
    }

    expect(source).toContain("buildAdminDashboardContext");
    expect(source).toContain("limit(MAX_RECENT_ROWS)");
    expect(source).toContain("limit(MAX_LOG_ROWS)");
    expect(source).toContain("Tu peux analyser les donnees du dashboard admin TOK");
    expect(source).toContain("lecture seule");
  });

  it("routes admin-host chat to the privileged admin agent instead of the public support chat", () => {
    const helpChat = read("src/lib/helpChat.ts");
    const supportChat = read("src/components/SupportChat.tsx");
    const app = read("src/App.tsx");
    const aiClient = read("src/lib/ai/tokAiClient.ts");
    const featureCatalog = read("src/lib/featureCatalog.ts");
    const migration = read("supabase/migrations/20260615095700_admin_dashboard_ai_chat_flag.sql");

    expect(helpChat).toContain('"admin_dashboard_ai"');
    expect(aiClient).toContain("askAdminDashboardChat");
    expect(aiClient).toContain('"ai-admin-dashboard-chat"');
    expect(featureCatalog).toContain("admin_dashboard_ai_chat");
    expect(migration).toContain("admin_dashboard_ai_chat");
    expect(supportChat).toContain("useFeatureFlagSnapshot");
    expect(supportChat).toContain('activeFeatures.has("admin_dashboard_ai_chat")');
    expect(supportChat).toContain("isAdminPrivilegedSurface");
    expect(supportChat).toContain("askAdminDashboardChat({");
    expect(supportChat).toContain('setChatSurface("admin")');
    expect(supportChat).toContain('setSelectedAgent("admin_dashboard_ai")');
    expect(supportChat).toContain("currentUrl");
    expect(supportChat).toContain("Assistant IA Admin est indisponible");
    expect(supportChat).toContain("Assistant IA Admin");
    expect(supportChat).toContain("Acces administrateur principal");
    expect(app).toContain('import SupportChat from "@/components/SupportChat"');
    expect(app).not.toContain("const SupportChat = lazy");
    expect(app).toContain('const oauthConsentFrame = pathname === "/oauth/consent"');
    expect(app).toContain('commercialDemoFrame.surface !== "commercial"');
    expect(app).toContain(
      'const supportChatAllowed = (!commercialDemoFrame || commercialDemoFrame.surface !== "commercial")',
    );
    expect(app).toContain(
      'aiSupportChatEnabled === true && !oauthConsentFrame && supportChatAllowed ? <SupportChat /> : null',
    );
    expect(app).toContain("const showGlobalClientChrome = !commercialDemoFrame && !oauthConsentFrame && !isMarketingSurface");
    expect(app).toContain("{showGlobalClientChrome ? (");
    expect(app).toContain("<Suspense fallback={null}>");
  });
});
