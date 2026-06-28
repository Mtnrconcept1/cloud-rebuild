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

  it("keeps the mobile dashboard trigger out of bottom content", () => {
    const layout = read("src/components/DashboardLayout.tsx");

    expect(layout).toContain("fixed left-[calc(env(safe-area-inset-left,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[40] md:hidden");
    expect(layout).toContain('data-testid="restaurant-mobile-menu-trigger"');
    expect(layout).toContain("h-16 max-w-[10.75rem] rounded-[1.45rem]");
    expect(layout).toContain("flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem]");
    expect(layout).toContain("text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300");
    expect(layout).toContain("Resto");
    expect(layout).toContain('className="max-w-[6.25rem] truncate text-sm font-semibold"');
    expect(layout).toContain('<span className="sr-only">{activeNavItem?.label ?? "Ouvrir le menu"}</span>');
    expect(layout).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]");
    expect(layout).not.toContain("fixed inset-x-0 bottom-0 z-[40]");
    expect(layout).not.toContain("h-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:hidden");
  });
});
