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

  it("keeps the public navbar out of protected business shells", () => {
    const app = read("src/App.tsx");

    expect(app).toContain("function shouldShowPublicNavbar");
    expect(app).toContain('pathname.startsWith("/dashboard/")');
    expect(app).toContain('pathname.startsWith("/admin/")');
    expect(app).toContain('pathname.startsWith("/courier/")');
    expect(app).toContain("{shouldShowPublicNavbar(pathname) ? <Navbar /> : null}");
  });
});
