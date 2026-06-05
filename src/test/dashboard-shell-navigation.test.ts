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

  it("keeps the public navbar out of protected business shells", () => {
    const app = read("src/App.tsx");

    expect(app).toContain("function shouldShowPublicNavbar");
    expect(app).toContain('pathname.startsWith("/dashboard/")');
    expect(app).toContain('pathname.startsWith("/admin/")');
    expect(app).toContain('pathname.startsWith("/courier/")');
    expect(app).toContain("{shouldShowPublicNavbar(pathname) ? <Navbar /> : null}");
  });
});
