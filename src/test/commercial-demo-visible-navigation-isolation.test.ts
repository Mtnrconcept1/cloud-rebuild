import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo visible navigation isolation", () => {
  const app = read("src/App.tsx");
  const clientRoutes = read("src/lib/commercialDemoClientRoutes.ts");
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
    expect(app).toContain("isPathAllowed: isCommercialDemoClientPathAllowed");
    expect(clientLayout).toContain("isCommercialDemoClientPathAllowed(target.pathname)");

    for (const path of [
      "/mon-espace",
      "/recherche",
      "/panier",
      "/commandes",
      "/reservations",
      "/mes-avis",
      "/notifications",
      "/contact",
      "/profil",
      "/tok-one",
      "/points-cadeau",
      "/actualites",
      "/anti-gaspi",
      "/creneaux-garantis",
      "/flex-prix-bas",
      "/match-groupes",
      "/multi-stop",
      "/multi-restaurant",
      "/chefs-table",
      "/zero-attente",
      "/garantie-qualite",
      "/budget-auto",
      "/abonnement",
      "/tok-pulse",
      "/miamz-solidaires",
      "/ventes-flash",
    ]) {
      expect(clientRoutes).toContain(`"${path}"`);
      expect(app).toContain(`<Route path="${path}"`);
    }

    expect(clientRoutes).toContain('"/restaurant/"');
    expect(clientRoutes).toContain('"/actualites/"');
    expect(app).toContain('<Route path="/actualites/:postId"');
    expect(clientRoutes).not.toContain('"/commande/",');

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

  it("shows every enabled client feature in the real dashboard navigation", () => {
    for (const feature of [
      "anti-gaspi",
      "ventes-flash",
      "actualites-sociales",
      "chefs-table",
      "zero-attente",
      "creneaux-garantis",
      "flex-prix-bas",
      "match-groupes",
      "multi-stop",
      "multi-restaurant",
      "garantie-qualite",
      "budget-auto",
      "tok-one",
      "abonnement",
      "points-cadeau",
      "tok-pulse",
    ]) {
      expect(clientLayout).toContain(`feature: "${feature}"`);
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
    expect(dashboardContext).toContain("useOwnerRestaurants()");
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
      'const isCommercialDemoClient = commercialDemoFrame?.surface === "client"',
    );
    expect(clientOrders).toContain("buildCommercialDemoClientOrders(commercialDemoFrame.snapshot)");
    expect(clientOrders).toContain("enabled: Boolean(user && !isCommercialDemoClient)");
    expect(clientOrders).not.toContain("CommercialDemoActorWorkspace");
    expect(clientOrders).toContain("return <LiveCommandes />");

    expect(restaurantHome).toContain(
      'if (commercialDemoFrame?.surface === "restaurant")',
    );
    expect(restaurantHome).toContain("return <CommercialDemoRestaurantHome />");
    expect(restaurantOrders).toContain("buildCommercialDemoDashboardOrders");
    expect(restaurantOrders).not.toContain("CommercialDemoActorWorkspace");
    expect(restaurantOrders).toContain(
      "return <LiveDashboardCommandes />",
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
