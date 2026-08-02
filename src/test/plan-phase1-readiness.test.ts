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
  it("keeps CI, production deploy, package engines, and docs on the same runtime contract", () => {
    const ciWorkflow = readProjectFile(".github/workflows/ci.yml");
    const validationWorkflow = readProjectFile(".github/workflows/_validation.yml");
    const deployWorkflow = readProjectFile(".github/workflows/deploy-production.yml");
    const docs = readProjectFile("docs/skills/TOK_APPLICATION_SKILL.md");
    const pkg = readJsonFile<{ engines: Record<string, string>; packageManager: string }>("package.json");

    expect(ciWorkflow).toContain("uses: ./.github/workflows/_validation.yml");
    expect(validationWorkflow).toMatch(/NODE_VERSION:\s*22/);
    expect(validationWorkflow).not.toMatch(/NODE_VERSION:\s*24/);
    expect(deployWorkflow).toMatch(/NODE_VERSION:\s*22/);
    expect(deployWorkflow).toMatch(/SUPABASE_CLI_VERSION:\s*2\.102\.0/);
    expect(pkg.engines.node).toBe(">=22.0.0");
    expect(pkg.engines.pnpm).toBe(">=10.28.1");
    expect(pkg.packageManager).toBe("pnpm@10.28.1");
    expect(docs).toContain("Supabase CLI 2.102.0");
  });

  it("runs release readiness inside the GitHub production environment without exposing secrets", () => {
    const deployWorkflow = readProjectFile(".github/workflows/deploy-production.yml");

    expect(deployWorkflow).toContain("environment: production");
    expect(deployWorkflow).toContain("name: Release readiness");
    expect(deployWorkflow).toContain("pnpm run release:readiness");
    expect(deployWorkflow).toContain('RELEASE_READINESS_STRICT: "true"');
    expect(deployWorkflow).toContain("if: ${{ vars.PRODUCTION_DEPLOY_ENABLED == 'true' }}");

    for (const requiredSecret of [
      "secrets.VITE_STRIPE_PUBLISHABLE_KEY",
      "secrets.STRIPE_PERSONNAL_SECRET_KEY",
      "secrets.STRIPE_SECRET_KEY",
      "secrets.STRIPE_WEBHOOK_SECRET",
      "secrets.RESEND_API_KEY",
      "secrets.ALLOWED_ORIGINS",
      "secrets.FIREBASE_SERVICE_ACCOUNT",
      "secrets.FIREBASE_PROJECT_ID",
      "secrets.FIREBASE_CLIENT_EMAIL",
      "secrets.FIREBASE_PRIVATE_KEY",
    ]) {
      expect(deployWorkflow).toContain(requiredSecret);
    }

    expect(deployWorkflow).toContain('RELEASE_READINESS_TARGET: "web"');
    expect(deployWorkflow).toContain('PROVIDER_BOOTSTRAP_GRACE_UNTIL: "2026-07-26T00:00:00Z"');
    expect(deployWorkflow).not.toContain('RELEASE_READINESS_STRICT: "false"');
    expect(deployWorkflow).not.toContain("secrets.APPLE_TEAM_ID");
    expect(deployWorkflow).not.toContain("secrets.ANDROID_KEYSTORE_BASE64");
    expect(deployWorkflow).not.toContain("write-apple-app-site-association.mjs");

    expect(deployWorkflow).toContain("id: supabase_auth_security");
    expect(deployWorkflow).toContain("node ./scripts/ensure-supabase-auth-security.mjs");
    expect(deployWorkflow).toContain("steps.supabase_auth_security.outputs.confirmed");
    expect(deployWorkflow).toContain("steps.supabase_auth_security.outputs.evidence");
    expect(deployWorkflow).toContain("id: supabase_runtime_security");
    expect(deployWorkflow).toContain("node ./scripts/verify-supabase-runtime-security.mjs");
    expect(deployWorkflow).toContain("steps.supabase_runtime_security.outputs.cron_confirmed");
    expect(deployWorkflow).toContain("steps.supabase_runtime_security.outputs.resend_confirmed");
    expect(deployWorkflow).toContain("vars.VITE_STRIPE_PUBLISHABLE_KEY || secrets.VITE_STRIPE_PUBLISHABLE_KEY");
    expect(deployWorkflow).toContain("vars.EMAIL_FROM || 'Tok <noreply@thetok.ch>'");
    expect(deployWorkflow).not.toContain("INTERNAL_CRON_SECRET: ${{ secrets.");
    expect(deployWorkflow).not.toContain("EMAIL_FROM: ${{ secrets.");
    expect(deployWorkflow).not.toContain("vars.SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIRMED");
    expect(deployWorkflow).not.toContain("vars.SUPABASE_LEAKED_PASSWORD_PROTECTION_EVIDENCE");

    const authSecurity = readProjectFile("scripts/ensure-supabase-auth-security.mjs");
    expect(authSecurity).toContain("/v1/projects/${projectRef}/config/auth");
    expect(authSecurity).toContain("password_hibp_enabled: true");
    expect(authSecurity).not.toContain("console.log(config)");
    expect(authSecurity).not.toContain("console.log(response)");

    expect(deployWorkflow).toContain("APP_BASE_URL: ${{ env.APP_BASE_URL }}");
    expect(deployWorkflow).toContain("PUBLIC_APP_URL: ${{ env.PUBLIC_APP_URL }}");
  });

  it("retries transient Supabase platform errors during production deploy", () => {
    const deployWorkflow = readProjectFile(".github/workflows/deploy-production.yml");
    const retryScript = readProjectFile("scripts/supabase-ci-retry.sh");

    expect(retryScript).toContain("supabase_ci_retry()");
    expect(retryScript).toContain("supabase@${SUPABASE_CLI_VERSION}");
    expect(retryScript).toContain("error\\ code:\\ (429|500|502|503|504)");
    expect(retryScript).toContain("Unexpected\\ error\\ retrieving\\ remote\\ project\\ status");
    expect(retryScript).toContain("ECONNRESET");

    expect(deployWorkflow.match(/source \.\/scripts\/supabase-ci-retry\.sh/g)?.length).toBe(4);
    expect(deployWorkflow).toContain(
      'supabase_ci_retry link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"',
    );
    expect(deployWorkflow).toContain(
      'supabase_ci_retry secrets set --env-file "${RUNNER_TEMP}/supabase.functions.env" --project-ref "$SUPABASE_PROJECT_REF"',
    );
    expect(deployWorkflow).toContain(
      'supabase_ci_retry db push --linked --include-all --yes --password "$SUPABASE_DB_PASSWORD"',
    );
    expect(deployWorkflow).toContain(
      'supabase_ci_retry functions deploy --project-ref "$SUPABASE_PROJECT_REF" --use-api',
    );
  });

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
      "Mon espace",
      "Réserver",
      "Offres flash",
      "Actualités",
    ]);
  });

  it("exposes the TOK Pulse iPhone PWA widget landing page", () => {
    const app = readProjectFile("src/App.tsx");
    const page = readProjectFile("src/pages/TokPulse.tsx");

    expect(app).toContain('const TokPulse = lazy(() => import("./pages/TokPulse"))');
    expect(app).toContain('<FeatureSwitch enabled={hasFeature("tok-pulse")} fallback="/">');
    expect(page).toContain("TOK Pulse · présence iPhone");
    expect(page).toContain("Un widget TOK qui agit comme un gros bouton vivant.");
    expect(page).toContain("Aucun faux compteur marketing.");
  });

  it("routes /restaurateurs/geneve to a dedicated B2B landing page", () => {
    const app = readProjectFile("src/App.tsx");
    const page = readProjectFile("src/pages/RestaurateursGeneve.tsx");

    expect(app).toContain('const RestaurateursGeneve = lazy(() => import("./pages/RestaurateursGeneve"))');
    expect(app).toContain('<Route path="/restaurateurs/geneve" element={<RestaurateursGeneve />} />');
    expect(app).not.toContain('<Route path="/restaurateurs/geneve" element={<PacksRestaurateur />} />');

    for (const expectedCopy of [
      "La plateforme restaurateur pour transformer la demande locale à Genève.",
      "Demander une démo",
      "Optimiser Google Business",
      "Comparer les modèles",
      "Photos IA",
      "Miamz",
      "Onboarding restaurateur",
      "Tables par mois",
      "Commandes par mois",
    ]) {
      expect(page).toContain(expectedCopy);
    }
  });

  it("adds a Google Business B2B acquisition page with a per-cover savings simulator", () => {
    const app = readProjectFile("src/App.tsx");
    const page = readProjectFile("src/pages/RestaurateursGoogleBusiness.tsx");
    const economics = readProjectFile("src/lib/googleBusinessEconomics.ts");
    const sitemap = readProjectFile("public/sitemap-pages.xml");
    const prerender = readProjectFile("scripts/prerender-seo.mjs");
    const postDeployCheck = readProjectFile("scripts/post-deploy-check.mjs");

    expect(app).toContain('const RestaurateursGoogleBusiness = lazy(() => import("./pages/RestaurateursGoogleBusiness"))');
    expect(app).toContain('<Route path="/restaurateurs/google-business" element={<RestaurateursGoogleBusiness />} />');
    expect(page).toContain("Transformez votre fiche Google Business en canal direct");
    expect(page).toContain("Réservations issues de Google / mois");
    expect(page).toContain("Montant facturé par personne (comparatif)");
    expect(page).toContain("Auditer ma fiche Google");
    expect(page).toContain("calculateGoogleBusinessSavings");
    expect(economics).toContain("calculateGoogleBusinessSavings");
    expect(sitemap).toContain("https://www.thetok.ch/restaurateurs/google-business");
    expect(prerender).toContain("/restaurateurs/google-business");
    expect(prerender).toContain("Checklist de bascule");
    expect(postDeployCheck).toContain("https://www.thetok.ch/restaurateurs/google-business");
  });

  it("adds business finance, sales and AI cost governance tables with RLS", () => {
    const migration = latestMigrationContaining("CREATE TABLE IF NOT EXISTS public.platform_revenue_entries");
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

    expect(script).toContain("Plan d'activation Genève");
    expect(script).toContain("Bascule du bouton Google");
    expect(script).toContain("Remplacer le bouton quand les services sont prêts");
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
