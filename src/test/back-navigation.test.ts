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
    expect(source).toContain('aria-label="Retour à l\'écran précédent"');
  });

  it("adds back navigation to public, admin, dashboard, client and courier shells", () => {
    const app = read("src/App.tsx");
    const dashboard = read("src/components/DashboardLayout.tsx");
    const customer = read("src/components/CustomerDashboardLayout.tsx");
    const courier = read("src/components/CourierDashboardLayout.tsx");

    expect(app).toContain("<FloatingRouteBackButton />");
    expect(app).toContain("function AdminProtectedRoute");
    expect(app).toContain("<BackNavigationButton fallback={fallback} />");
    expect(dashboard).toContain('<BackNavigationButton fallback="/dashboard"');
    expect(customer).toContain('<BackNavigationButton fallback="/"');
    expect(courier).toContain('<BackNavigationButton fallback="/courier"');
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
