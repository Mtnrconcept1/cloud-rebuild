import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("route back navigation", () => {
  it("provides one shared back button with history fallback handling", () => {
    const source = read("src/components/navigation/BackNavigationButton.tsx");

    expect(source).toContain("ArrowLeft");
    expect(source).toContain("export function BackNavigationButton");
    expect(source).toContain("export function FloatingRouteBackButton");
    expect(source).toContain("getBackFallbackForPathname");
    expect(source).toContain("navigate(-1)");
    expect(source).toContain("showLabel");
    expect(source).toContain("sr-only");
    expect(source).toContain("aria-label=");
  });

  it("adds back navigation to public, admin, dashboard, client and courier shells", () => {
    const app = read("src/App.tsx");
    const dashboard = read("src/components/DashboardLayout.tsx");
    const customer = read("src/components/CustomerDashboardLayout.tsx");
    const courier = read("src/components/CourierDashboardLayout.tsx");
    const backNavigation = read("src/components/navigation/BackNavigationButton.tsx");

    expect(app).toContain("<FloatingRouteBackButton />");
    expect(app).toContain("function AdminRouteFrame");
    expect(app).toContain("fixed left-3");
    expect(app).toContain("z-[80]");
    expect(app).toContain("pt-[calc(env(safe-area-inset-top,0px)+3.75rem)]");
    expect(app).toContain("showLabel={false}");
    expect(app).toContain("bg-primary");
    expect(app).toContain("function AdminDashboardRoute");
    expect(app).toContain('<AdminRouteFrame fallback="/">');
    expect(app).toContain("function AdminProtectedRoute");
    expect(app).toContain("<AdminRouteFrame fallback={fallback}>");
    expect(dashboard).toContain('const backFallback = pathname === "/dashboard" ? "/" : "/dashboard";');
    expect(dashboard).toContain("<BackNavigationButton fallback={backFallback}");
    expect(customer).toContain('<BackNavigationButton fallback="/"');
    expect(courier).toContain('const backFallback = pathname === "/courier" ? "/" : "/courier";');
    expect(courier).toContain("<BackNavigationButton fallback={backFallback}");
    expect(backNavigation).not.toContain('pathname.startsWith("/restaurant/")');
  });

  it("wraps every admin sub-route with the back-aware admin route", () => {
    const app = read("src/App.tsx");
    const adminSubRoutes = app
      .split("\n")
      .filter((line) => line.includes('<Route path="/admin/') && !line.includes('path="/admin"'));

    expect(adminSubRoutes.length).toBeGreaterThan(0);
    expect(adminSubRoutes.every((line) => line.includes("<AdminProtectedRoute"))).toBe(true);
  });
});
