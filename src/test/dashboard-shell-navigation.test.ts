import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("dashboard shell navigation", () => {
  it("matches the dashboard root exactly and chooses the most specific active item", () => {
    const layout = read("src/components/DashboardLayout.tsx");

    expect(layout).toContain("function isDashboardNavItemActive");
    expect(layout).toContain('if (itemTo === "/dashboard") return pathname === itemTo');
    expect(layout).toContain("isDashboardNavItemActive(pathname, item.to)");
    expect(layout).toContain("sort((a, b) => b.to.length - a.to.length)[0]");
  });

  it("exposes the promotions dashboard route in restaurateur navigation", () => {
    const layout = read("src/components/DashboardLayout.tsx");
    const app = read("src/App.tsx");

    expect(app).toContain('path="/dashboard/promotions"');
    expect(layout).toContain('to: "/dashboard/promotions"');
    expect(layout).toContain('feature: "dashboard-promotions"');
  });

  it("removes the legacy recommendations dashboard surface in favor of Assistant IA", () => {
    const layout = read("src/components/DashboardLayout.tsx");
    const app = read("src/App.tsx");
    const featureCatalog = read("src/lib/featureCatalog.ts");
    const packFeatureGating = read("src/lib/packFeatureGating.ts");
    const edgePackEntitlements = read("supabase/functions/_shared/pack-entitlements.ts");

    expect(layout).not.toContain('to: "/dashboard/recommandations"');
    expect(layout).not.toContain('label: "Recommandations"');
    expect(app).toContain('path="/dashboard/recommandations"');
    expect(app).toContain('to="/dashboard/advisor"');
    expect(app).not.toContain("DashboardRecommandations");
    expect(featureCatalog).not.toContain("dashboard-recommandations");
    expect(packFeatureGating).not.toContain("dashboard-recommandations");
    expect(edgePackEntitlements).not.toContain("dashboard-recommandations");
  });

  it("locks pending restaurateur dashboards outside the status overview", () => {
    const route = read("src/components/DashboardRoute.tsx");
    const layout = read("src/components/DashboardLayout.tsx");
    const context = read("src/pages/dashboard/DashboardContext.tsx");
    const home = read("src/pages/dashboard/DashboardHome.tsx");

    expect(route).toContain("DashboardAccessGate");
    expect(route).toContain('dashboardAccessLocked && location.pathname !== "/dashboard"');
    expect(route).toContain('to="/dashboard"');
    expect(layout).toContain('dashboardAccessLocked && item.to !== "/dashboard"');
    expect(layout).toContain("Dossier restaurateur en attente de validation admin");
    expect(context).toContain("isRestaurantDashboardAccessApproved");
    expect(context).toContain("dashboardAccessLocked");
    expect(home).toContain("operationalQueriesEnabled");
    expect(home).toContain("!dashboardAccessLocked");
  });

  it("keeps the public navbar out of protected business shells", () => {
    const app = read("src/App.tsx");

    expect(app).toContain("function shouldShowPublicNavbar");
    expect(app).toContain('pathname.startsWith("/dashboard/")');
    expect(app).toContain('pathname.startsWith("/admin/")');
    expect(app).toContain('pathname.startsWith("/courier/")');
    expect(app).toContain("const publicNavbar = shouldShowPublicNavbar(pathname) ? <Navbar /> : null");
    expect(app).not.toContain('pathname === "/actualites" && publicNavbar');
  });

  it("keeps fixed dashboard controls below modal overlays", () => {
    const layout = read("src/components/DashboardLayout.tsx");
    const sheet = read("src/components/ui/sheet.tsx");
    const dialog = read("src/components/ui/dialog.tsx");

    expect(layout).toContain("top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[40] flex items-center gap-2");
    expect(layout).not.toContain("top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[70] flex items-center gap-2");
    expect(sheet).toContain("fixed inset-0 z-50");
    expect(sheet).toContain('"fixed z-50 gap-4');
    expect(dialog).toContain("fixed inset-0 z-[80]");
    expect(dialog).toContain("fixed left-[50%] top-[50%] z-[90]");
  });
});
