import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo visible navigation isolation", () => {
  const app = read("src/App.tsx");
  const featureFlags = read("src/lib/featureFlags.ts");
  const clientLayout = read("src/components/CustomerDashboardLayout.tsx");
  const restaurantLayout = read("src/components/DashboardLayout.tsx");
  const dashboardContext = read("src/pages/dashboard/DashboardContext.tsx");
  const clientHome = read("src/pages/ClientDashboardHome.tsx");
  const clientOrders = read("src/pages/Commandes.tsx");
  const restaurantHome = read("src/pages/dashboard/DashboardHome.tsx");
  const restaurantOrders = read("src/pages/dashboard/DashboardCommandes.tsx");
  const notifications = read("src/hooks/useNotificationCenter.ts");

  it("keeps every visible client and restaurant tab aligned with the frame route policy", () => {
    expect(app).toContain('allowedPaths: ["/mon-espace", "/recherche", "/panier", "/commandes", "/reservations", "/notifications"]');
    expect(app).toContain('allowedPrefixes: ["/restaurant/"]');
    expect(clientLayout).toContain(
      'const COMMERCIAL_DEMO_SAFE_CLIENT_PATHS = new Set(["/mon-espace", "/recherche", "/reservations", "/commandes", "/notifications"])',
    );

    expect(app).toContain('allowedPaths: ["/dashboard"]');
    expect(app).toContain('allowedPrefixes: ["/dashboard/"]');
    expect(restaurantLayout).not.toContain("COMMERCIAL_DEMO_SAFE_RESTAURANT_PATHS");

    for (const path of [
      "/mon-espace",
      "/recherche",
      "/panier",
      "/reservations",
      "/commandes",
      "/notifications",
      "/dashboard",
      "/dashboard/commandes",
      "/dashboard/notifications",
    ]) {
      expect(app).toContain(`<Route path="${path}"`);
    }
  });

  it("uses the validated snapshot flags while an embedded dashboard is mounted", () => {
    expect(featureFlags).toContain(
      "export function useFeatureFlagSnapshot(options: { enabled?: boolean } = {})",
    );
    expect(featureFlags).toContain("if (!enabled) {");
    expect(featureFlags).toContain("return useFeatureFlagSnapshot(options).activeFeatures");

    expect(app).toContain("useFeatureFlagSnapshot({\n    enabled: !commercialDemoFrame,");
    expect(app).toContain("commercialDemoContext.snapshot.active_features.includes(flagName)");
    expect(clientLayout).toContain(
      "useActiveFeatures({ enabled: !commercialDemoFrame })",
    );
    expect(clientLayout).toContain("new Set(commercialDemoFrame.snapshot.active_features)");
    expect(restaurantLayout).toContain(
      "new Set(commercialDemoFrame.snapshot.active_features)",
    );
  });

  it("hydrates the restaurant selector only from the validated snapshot in a frame", () => {
    expect(dashboardContext).toContain("useOwnerRestaurants({ enabled: !commercialDemoFrame })");
    expect(dashboardContext).toContain("const restaurants = commercialDemoFrame ? frameRestaurants : ownerRestaurants.restaurants");
    expect(dashboardContext).toContain(
      "commercialDemoFrame?.snapshot.session.demo_restaurant_id",
    );
    expect(dashboardContext).toContain("resolveCommercialDemoRestaurantSelection(restaurants, frameDemoRestaurantId)");
    expect(dashboardContext).toContain("const selectedId = commercialDemoFrame");
    expect(dashboardContext).toContain("if (commercialDemoFrame) return;");
  });

  it("mounts isolated presentation branches for all visible content routes", () => {
    expect(clientHome).toContain("enabled: Boolean(!isCommercialDemoClientFrame");
    expect(clientHome).toContain(
      "const overviewData = isCommercialDemoClientFrame ? demoOverviewData : overviewQuery.data",
    );
    expect(clientOrders).toContain(
      'if (commercialDemoFrame?.surface === "client")',
    );
    expect(clientOrders).toContain(
      '<CommercialDemoActorWorkspace surface="client" />',
    );
    expect(clientOrders).toContain("return <LiveCommandes />");

    expect(restaurantHome).toContain(
      'if (commercialDemoFrame?.surface === "restaurant")',
    );
    expect(restaurantHome).toContain("return <CommercialDemoRestaurantHome />");
    expect(restaurantOrders).toContain(
      '<CommercialDemoActorWorkspace surface="restaurant" />',
    );
    expect(restaurantOrders).toContain(
      "return isDemoMode ? <CommercialDemoOrders /> : <LiveDashboardCommandes />",
    );

    expect(notifications).toContain(
      "enabled: Boolean(user?.id && !isCommercialDemoFrame)",
    );
    expect(notifications).toContain("commercialDemoFrame.snapshot.events");
  });

  it("removes session-ending controls from the embedded restaurant shell", () => {
    expect(restaurantLayout.match(/<SignOutButton/g)).toHaveLength(3);
    expect(restaurantLayout).toContain(
      "{!commercialDemoFrame ? <SignOutButton iconOnly /> : null}",
    );
    expect(restaurantLayout.match(/!commercialDemoFrame \? \(/g).length).toBeGreaterThanOrEqual(4);
  });
});
