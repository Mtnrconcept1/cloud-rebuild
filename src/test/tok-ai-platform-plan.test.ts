import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readMigrationContaining(slug: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .find((name) => name.includes(slug));

  expect(migrationName, `migration containing ${slug} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, migrationName!), "utf8");
}

describe("TOK AI platform plan", () => {
  it("adds the complete AI governance schema, quotas and feature flag seeds", () => {
    const sql = readMigrationContaining("tok_ai_platform");

    for (const table of [
      "ai_support_tickets",
      "ai_restaurant_tasks",
      "ai_admin_events",
      "ai_security_events",
      "ai_performance_snapshots",
      "ai_accounting_insights",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
      expect(sql).toMatch(new RegExp(`GRANT\\s+SELECT`, "i"));
    }

    for (const feature of [
      "ai_support_chat",
      "ai_menu_optimizer",
      "ai_marketing_campaigns",
      "ai_photo_enhancer",
      "ai_sales_insights",
      "ai_accounting_insights",
      "ai_admin_monitoring",
      "ai_premium_image_generation",
    ]) {
      expect(sql).toContain(feature);
    }

    expect(sql).toContain("public.check_restaurant_ai_quota");
    expect(sql).toContain("public.get_restaurant_ai_usage");
    expect(sql).toContain("public.has_role");
    expect(sql).toContain("public.auth_owns_restaurant");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("exposes canonical Edge Functions for each agent with auth, quotas, audit and usage logs", () => {
    for (const fn of [
      "ai-client-support",
      "ai-restaurant-agent",
      "ai-accounting-agent",
      "ai-admin-monitor",
    ]) {
      const source = readProjectFile(`supabase/functions/${fn}/index.ts`);

      expect(source).toContain("authenticateRequest");
      expect(source).toContain("createRateLimiter");
      expect(source).toContain("writeAuditLog");
      expect(source).toContain("ai_usage_logs");
      expect(source).toContain("OPENAI_API_KEY");
      expect(source).toContain("check_restaurant_ai_quota");
      expect(source).not.toContain("VITE_OPENAI");
    }

    const config = readProjectFile("supabase/config.toml");
    for (const fn of [
      "ai-client-support",
      "ai-restaurant-agent",
      "ai-accounting-agent",
      "ai-admin-monitor",
    ]) {
      expect(config).toContain(`[functions.${fn}]`);
      expect(config).toMatch(new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt\\s*=\\s*false`, "i"));
    }
  });

  it("centralizes frontend calls in a shared TOK AI client", () => {
    const client = readProjectFile("src/lib/ai/tokAiClient.ts");

    for (const exportName of [
      "askClientSupport",
      "runRestaurantAgent",
      "runAccountingAgent",
      "runAdminMonitor",
      "estimateAiCost",
      "getAiUsageForRestaurant",
      "getAiSubscriptionForRestaurant",
      "getAccountingInsightsForRestaurant",
    ]) {
      expect(client).toContain(exportName);
    }

    for (const fn of [
      "ai-client-support",
      "ai-restaurant-agent",
      "ai-accounting-agent",
      "ai-admin-monitor",
    ]) {
      expect(client).toContain(fn);
    }

    expect(client).toContain('import { invokeSupabaseFunction } from "@/lib/session";');
    expect(client).toContain("invokeSupabaseFunction<T>");
    expect(client).not.toContain("supabase.auth.getSession");
    expect(client).not.toContain("supabase.functions.invoke(functionName");
    expect(client).not.toContain("OPENAI_API_KEY");
    expect(client).not.toContain("VITE_OPENAI");
  });

  it("adds dedicated restaurant, support, accounting and admin AI UI surfaces", () => {
    const dashboardAdvisor = readProjectFile("src/pages/dashboard/DashboardAdvisor.tsx");
    const supportChat = readProjectFile("src/components/support/TokAiSupportChat.tsx");
    const adminComptaAi = readProjectFile("src/pages/admin/AdminComptaAi.tsx");
    const adminAiOperations = readProjectFile("src/pages/admin/AdminAiOperations.tsx");

    for (const text of ["Assistant IA", "ai-restaurant-tools", "SUGGESTED_PROMPTS", "QUICK_TOOLS"]) {
      expect(dashboardAdvisor).toContain(text);
    }

    expect(supportChat).toContain("askClientSupport");
    expect(supportChat).toContain("escalated");
    expect(supportChat).toContain("waiting_tok");

    const dashboardFactures = readProjectFile("src/pages/dashboard/DashboardFactures.tsx");
    for (const text of [
      "Comptabilité IA",
      "Générer une synthèse IA",
      "Historique des rapports IA",
      "getAccountingInsightsForRestaurant",
      "runAccountingAgent",
    ]) {
      expect(dashboardFactures).toContain(text);
    }

    expect(supportChat).toContain("Ne jamais promettre remboursement");

    for (const text of [
      "Résumé mensuel",
      "Anomalies factures",
      "Factures impayées",
      "Restaurants à risque",
      "Prévision CA",
      "Marge par restaurant",
      "Coût IA par restaurant",
      "Commission TOK estimée",
      "Export synthèse",
      "Export PDF",
      "exportAiAccountingPdf",
      "window.print",
    ]) {
      expect(adminComptaAi).toContain(text);
    }

    for (const text of [
      "Santé IA",
      "Coût OpenAI estimé",
      "Alertes sécurité",
      "Erreurs Supabase Functions",
      "Tickets critiques",
      "Utilisateurs abusifs",
      "Restaurants avec incidents répétés",
      "Temps de réponse moyen",
      "Taux d'escalade humaine",
      "Actions recommandées",
      "Export rapport IA",
      "exportAdminAiOperationsReport",
      "application/json",
    ]) {
      expect(adminAiOperations).toContain(text);
    }
  });

  it("wires routes, dashboard navigation and feature flags for the AI platform", () => {
    const app = readProjectFile("src/App.tsx");
    const dashboardLayout = readProjectFile("src/components/DashboardLayout.tsx");
    const featureCatalog = readProjectFile("src/lib/featureCatalog.ts");
    const aide = readProjectFile("src/pages/Aide.tsx");
    const suiviCommande = readProjectFile("src/pages/SuiviCommande.tsx");
    const commandes = readProjectFile("src/pages/Commandes.tsx");

    for (const route of [
      "/admin/compta/ia",
      "/admin/ai-operations",
    ]) {
      expect(app).toContain(route);
      expect(featureCatalog).toContain(route);
    }

    expect(app).not.toContain("/dashboard/ai");
    expect(featureCatalog).not.toContain("/dashboard/ai");
    expect(dashboardLayout).toContain("/dashboard/advisor");
    expect(dashboardLayout).toContain("Assistant IA");
    expect(dashboardLayout).not.toContain("/dashboard/ai");
    expect(dashboardLayout).not.toContain("Agent IA");

    for (const feature of [
      "ai_support_chat",
      "ai_menu_optimizer",
      "ai_marketing_campaigns",
      "ai_photo_enhancer",
      "ai_sales_insights",
      "ai_accounting_insights",
      "ai_admin_monitoring",
      "ai_premium_image_generation",
    ]) {
      expect(featureCatalog).toContain(feature);
    }

    expect(aide).toContain("TokAiSupportChat");
    expect(suiviCommande).toContain("TokAiSupportChat");
    expect(commandes).toContain("TokAiSupportChat");
  });

  it("selects task-specific OpenAI models and keeps high-risk actions in draft/escalation mode", () => {
    const helper = readProjectFile("supabase/functions/_shared/openai.ts");
    const restaurantAgent = readProjectFile("supabase/functions/ai-restaurant-agent/index.ts");
    const accountingAgent = readProjectFile("supabase/functions/ai-accounting-agent/index.ts");
    const adminMonitor = readProjectFile("supabase/functions/ai-admin-monitor/index.ts");
    const clientSupport = readProjectFile("supabase/functions/ai-client-support/index.ts");

    expect(helper).toContain("selectTokAiModel");
    expect(helper).toContain("gpt-5.4-mini");
    expect(helper).toContain("gpt-5.5");

    expect(clientSupport).toContain("Aucun remboursement automatique");
    expect(clientSupport).toContain("escalade humaine");
    expect(restaurantAgent).toContain("mode brouillon");
    expect(accountingAgent).toContain("aucune ecriture comptable");
    expect(accountingAgent).toContain("requireRestaurantAccess(actor, restaurantId)");
    expect(accountingAgent).toContain("requireUserRole(actor, [\"admin\"]");
    expect(accountingAgent).not.toContain("requireUserRole(actor, [\"admin\"]);\n    if (!OPENAI_API_KEY)");
    expect(adminMonitor).toContain("aucune action destructive");
    expect(adminMonitor).toContain("ai_failure_ratio_7d");
    expect(adminMonitor).toContain("failure_ratio_not_absolute_spend");
    expect(adminMonitor).toContain("aucune sanction utilisateur");
  });
});
