import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migrationPath =
  "supabase/migrations/20260728160000_dashboard_pack_runtime_kill_switch.sql";

describe("Mon pack admin kill switch", () => {
  it("exposes a dedicated, reasoned control on the admin home", () => {
    const home = read("src/pages/admin/AdminHome.tsx");
    const control = read("src/components/admin/AdminMonPackControl.tsx");
    const platform = read("src/pages/admin/AdminPlatformConfig.tsx");
    const catalog = read("src/lib/featureCatalog.ts");

    expect(home).toContain('AdminMonPackControl from "@/components/admin/AdminMonPackControl"');
    expect(home).toContain("<AdminMonPackControl />");
    expect(control).toContain('MON_PACK_FLAG_NAME = "dashboard-pack"');
    expect(control).toContain("useFeatureFlags(true)");
    expect(control).toContain("setFlagState(packFlag.id, pendingState, reason.trim())");
    expect(control).toContain("Raison obligatoire pour l'historique");
    expect(control).toContain("required");
    expect(control).toContain('aria-required="true"');
    expect(control).toContain("Les modules déjà actifs ne sont ni suspendus ni annulés");

    const criticalFlags = platform.slice(
      platform.indexOf("const CRITICAL_FLAGS"),
      platform.indexOf("const GLOBAL_OVERRIDE_FLAGS"),
    );
    const globalOverrides = platform.slice(
      platform.indexOf("const GLOBAL_OVERRIDE_FLAGS"),
      platform.indexOf("const REQUIRED_PRESET_NAMES"),
    );
    expect(criticalFlags).toContain('"dashboard-pack"');
    expect(globalOverrides).toContain('"dashboard-pack"');
    expect(catalog).toContain('label: "Mon pack — coupure globale"');
  });

  it("keeps the tab and direct route attached to the global feature flag", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/DashboardLayout.tsx");

    expect(app).toContain('const dashboardPackEnabled = hasFeature("dashboard-pack")');
    expect(app).toContain('path="/dashboard/pack"');
    expect(app).toContain("FeatureSwitch enabled={dashboardPackEnabled} fallback=\"/dashboard\"");
    expect(layout).toContain('{ to: "/dashboard/pack", label: "Mon pack", icon: Package, feature: "dashboard-pack" }');
  });

  it("propagates the switch to already-open sessions through one app-level channel", () => {
    const app = read("src/App.tsx");
    const flags = read("src/lib/featureFlags.ts");
    const sql = read(migrationPath);

    expect(app).toContain("live: true");
    expect(flags).toContain("live?: boolean");
    expect(flags).toContain('.channel("feature-flags-runtime")');
    expect(flags).toContain('{ event: "*", schema: "public", table: "feature_flags" }');
    expect(flags).toContain("invalidateFeatureFlagsCache()");
    expect(flags).toContain("removeChannel(channel)");
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags");
    expect(sql).toContain("pg_catalog.pg_publication_tables");
  });

  it("requires an audited reason and blocks new request, confirmation and resume transitions", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag");
    expect(sql).toMatch(/'dashboard-restaurateur',\s*'dashboard-pack',\s*'espace-livreur'/);
    expect(sql).toContain("reason is required for critical feature flag disable");
    expect(sql).toContain("private_finance.assert_dashboard_pack_runtime_enabled");
    expect(sql).toContain("WHERE flag.name = 'dashboard-pack'");
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain("ERRCODE = 'PT423'");
    expect(sql).toContain("MESSAGE = 'dashboard_pack_disabled'");
    expect(sql).toMatch(/p_action NOT IN \('request', 'confirm_activation', 'resume'\)/);
    expect(sql).not.toContain("RENAME TO request_fair_growth_module_unchecked");
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.request_fair_growth_module\(uuid, text\)\s+TO authenticated, service_role;/,
    );
  });

  it("preserves lifecycle idempotency and safe exit actions while guarding trusted writes", () => {
    const sql = read(migrationPath);

    expect(sql).not.toContain("RENAME TO transition_fair_growth_module_unchecked");
    expect(sql).toContain("private_finance.transition_fair_growth_module(uuid,text,text,text,text,integer)");
    expect(sql).toContain("AFTER INSERT OR UPDATE OF status, module_id ON public.restaurant_paid_modules");
    expect(sql).toContain("NEW.status IS NOT DISTINCT FROM OLD.status");
    expect(sql).toContain("NEW.module_id IS NOT DISTINCT FROM OLD.module_id");
    expect(sql).toContain("NEW.status NOT IN ('requested', 'trialing', 'active')");
    expect(sql).toContain("module.availability_status IN ('available', 'pilot')");

    const guardBody = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION private_finance.assert_dashboard_pack_runtime_enabled"),
      sql.indexOf("REVOKE ALL ON FUNCTION private_finance.assert_dashboard_pack_runtime_enabled"),
    );
    expect(guardBody).toContain("'request', 'confirm_activation', 'resume'");
    expect(guardBody).not.toContain("'pause'");
    expect(guardBody).not.toContain("'cancel'");
    expect(guardBody).not.toContain("'process_credit'");
  });

  it("upserts the stored label without overwriting an existing flag state", () => {
    const sql = read(migrationPath);
    const flagSeed = sql.slice(
      sql.indexOf("INSERT INTO public.feature_flags"),
      sql.indexOf("-- Keep already-open clients"),
    );
    const conflictUpdate = flagSeed.slice(flagSeed.indexOf("ON CONFLICT"));

    expect(flagSeed).toContain("Mon pack — coupure globale");
    expect(flagSeed).toContain("'dashboard-pack'");
    expect(flagSeed).toContain("ON CONFLICT (name) DO UPDATE");
    expect(conflictUpdate).toContain("label = EXCLUDED.label");
    expect(conflictUpdate).not.toContain("is_active =");
  });
});
