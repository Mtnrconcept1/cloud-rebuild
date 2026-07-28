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
    expect(control).toContain("toggleFlag(packFlag.id, reason.trim())");
    expect(control).toContain("Raison obligatoire pour l'historique");
    expect(control).toContain("Les modules déjà actifs ne sont ni suspendus ni annulés");
    expect(control).toContain("Les actions de pause, d'annulation et de crédit restent disponibles");

    const criticalFlags = platform.slice(
      platform.indexOf("const CRITICAL_FLAGS"),
      platform.indexOf("const GLOBAL_OVERRIDE_FLAGS"),
    );
    expect(criticalFlags).toContain('"dashboard-pack"');
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

  it("locks the shared flags and blocks request, confirmation and resume fail-closed", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("private_finance.assert_dashboard_pack_runtime_enabled");
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain("count(*) = 2 AND bool_and(is_active)");
    expect(sql).toContain("MESSAGE = 'dashboard_pack_disabled'");
    expect(sql).toMatch(/p_action NOT IN \('request', 'confirm_activation', 'resume'\)/);
    expect(sql).toContain("ALTER FUNCTION public.request_fair_growth_module(uuid, text)");
    expect(sql).toContain("RENAME TO request_fair_growth_module_unchecked");
    expect(sql).toContain("PERFORM private_finance.assert_dashboard_pack_runtime_enabled('request')");
    expect(sql).toContain("PERFORM private_finance.assert_dashboard_pack_runtime_enabled(p_action)");
  });

  it("enforces trusted writes while preserving safe exit and credit actions", () => {
    const sql = read(migrationPath);

    expect(sql).toContain("BEFORE INSERT OR UPDATE OF status ON public.restaurant_paid_modules");
    expect(sql).toContain("NEW.status NOT IN ('requested', 'trialing', 'active')");
    expect(sql).toContain("module.availability_status IN ('available', 'pilot')");
    expect(sql).toContain("'pause'");
    expect(sql).toContain("'cancel'");
    expect(sql).toContain("'process_credit'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.pause_fair_growth_module(uuid, text)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cancel_fair_growth_module(uuid, text)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.process_fair_growth_module_credit(uuid, text, integer, text, text)");
  });

  it("updates the stored admin label without changing the current flag state", () => {
    const sql = read(migrationPath);
    const labelUpdate = sql.slice(
      sql.indexOf("UPDATE public.feature_flags"),
      sql.indexOf("CREATE OR REPLACE FUNCTION"),
    );

    expect(labelUpdate).toContain("Mon pack — coupure globale");
    expect(labelUpdate).toContain("WHERE name = 'dashboard-pack'");
    expect(labelUpdate).not.toContain("is_active =");
  });
});
