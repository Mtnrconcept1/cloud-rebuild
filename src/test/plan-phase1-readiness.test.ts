import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readProjectFile(path)) as T;
}

function allMigrations() {
  return readdirSync(resolve(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      source: readProjectFile(`supabase/migrations/${name}`),
    }));
}

function latestMigrationContaining(marker: string) {
  const matches = allMigrations().filter((migration) => migration.source.includes(marker));
  expect(matches.length, `migration containing ${marker}`).toBeGreaterThan(0);
  return matches[matches.length - 1];
}

describe("phase 1 launch audit plan readiness", () => {
  it("aligns the PWA manifest with the TOK Geneva launch positioning", () => {
    const manifest = readJsonFile<{
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      screenshots?: Array<{ src: string; sizes: string; form_factor: string }>;
      shortcuts?: Array<{ name: string; url: string }>;
    }>("public/manifest.json");

    expect(manifest.name).toBe("TOK — Réservez, commandez, profitez à Genève");
    expect(manifest.short_name).toBe("TOK");
    expect(manifest.description).toBe("Réservez, commandez, profitez d'offres locales et cumulez des Miamz solidaires.");
    expect(manifest.start_url).toBe("/?source=pwa");
    expect(manifest.screenshots?.map((screenshot) => screenshot.form_factor).sort()).toEqual(["narrow", "wide"]);
    expect(manifest.shortcuts?.map((shortcut) => shortcut.name)).toEqual([
      "Réserver",
      "Offres",
      "Miamz",
      "Restaurateurs",
    ]);
  });

  it("routes /restaurateurs/geneve to a dedicated B2B landing page", () => {
    const app = readProjectFile("src/App.tsx");
    const page = readProjectFile("src/pages/RestaurateursGeneve.tsx");

    expect(app).toContain('const RestaurateursGeneve = lazy(() => import("./pages/RestaurateursGeneve"))');
    expect(app).toContain('<Route path="/restaurateurs/geneve" element={<RestaurateursGeneve />} />');
    expect(app).not.toContain('<Route path="/restaurateurs/geneve" element={<PacksRestaurateur />} />');

    for (const expectedCopy of [
      "Remplissez vos tables sans exploser vos commissions.",
      "Demander une démo",
      "Voir les packs",
      "5 CHF/table",
      "Photos IA",
      "Zéro attente",
      "heures creuses",
      "Nom du restaurant",
      "Nombre de tables",
    ]) {
      expect(page).toContain(expectedCopy);
    }
  });

  it("adds business finance, sales and AI cost governance tables with RLS", () => {
    const migration = latestMigrationContaining("platform_revenue_entries");
    const adminCompta = readProjectFile("src/pages/admin/AdminCompta.tsx");
    const sql = migration.source;

    for (const table of [
      "platform_revenue_entries",
      "platform_cost_entries",
      "marketing_budget_periods",
      "sales_representatives",
      "restaurant_leads",
      "restaurant_deals",
      "commercial_commissions",
      "restaurant_activation_metrics",
      "ai_usage_costs",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
      expect(sql).toMatch(new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+idx_${table}_`, "i"));
    }

    expect(sql).toContain("marketing_budget_ratio numeric(5,4) NOT NULL DEFAULT 0.6000");
    expect(sql).toContain("CHECK (amount_chf >= 0)");
    expect(sql).toContain("CHECK (commission_rate >= 0 AND commission_rate <= 0.12)");
    expect(sql).toContain("CHECK (ai_budget_ratio >= 0 AND ai_budget_ratio <= 0.04)");
    expect(sql).toContain("CREATE OR REPLACE VIEW public.admin_platform_finance_monthly_snapshot");
    expect(sql).toContain("GRANT SELECT ON public.admin_platform_finance_monthly_snapshot TO authenticated");
    expect(adminCompta).toContain("Budget marketing 60 %");
    expect(adminCompta).toContain("Dashboard commercial");
    expect(adminCompta).toContain("[10, 15, 25, 30, 50]");
    expect(adminCompta).toContain("Plafond commercial 12 %");
  });

  it("documents and hardens anon executable SECURITY DEFINER functions", () => {
    const audit = readProjectFile("docs/supabase/anon-security-definer-audit.md");
    const migration = latestMigrationContaining("anon_security_definer_function_executable");
    const sql = migration.source;

    for (const functionName of [
      "auth_can_access_cart",
      "auth_can_access_order",
      "auth_can_manage_dish",
      "donate_points_for_meal",
    ]) {
      expect(audit).toContain(functionName);
    }

    expect(audit).toContain("publique volontaire");
    expect(audit).toContain("a revoquer");
    expect(sql).toContain("anon_security_definer_function_executable");
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.donate_points_for_meal/i);
    expect(sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.auth_can_manage_dish/i);
  });

  it("adds post-deploy checks for the official Vercel production project", () => {
    const pkg = readJsonFile<{ scripts: Record<string, string> }>("package.json");
    const readme = readProjectFile("README_DEPLOY.md");
    const script = readProjectFile("scripts/post-deploy-check.mjs");

    expect(pkg.scripts["deploy:postcheck"]).toBe("node ./scripts/post-deploy-check.mjs");
    expect(readme).toContain("Projet Vercel officiel = cloud-rebuild-recovered");
    expect(readme).toContain("www.thetok.ch");
    expect(readme).toContain("admin.thetok.ch");

    for (const target of [
      "https://www.thetok.ch/",
      "https://www.thetok.ch/manifest.json",
      "https://www.thetok.ch/robots.txt",
      "https://www.thetok.ch/sitemap.xml",
      "https://www.thetok.ch/restaurateurs/geneve",
    ]) {
      expect(script).toContain(target);
    }
  });

  it("caches feature flags and batches public analytics events client-side", () => {
    const featureFlags = readProjectFile("src/lib/featureFlags.ts");
    const analytics = readProjectFile("src/lib/analytics.ts");

    expect(featureFlags).toContain("FEATURE_FLAGS_CACHE_TTL_MS = 180_000");
    expect(featureFlags).toContain("featureFlagsCache");
    expect(featureFlags).toContain("invalidateFeatureFlagsCache");

    expect(analytics).toContain("ANALYTICS_BATCH_FLUSH_MS");
    expect(analytics).toContain("ANALYTICS_DEDUPE_TTL_MS");
    expect(analytics).toContain("queueAnalyticsEvent");
    expect(analytics).toContain("flushAnalyticsQueue");
    expect(analytics).toContain("sendBeacon");
  });
});
