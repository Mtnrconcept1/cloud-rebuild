import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo restaurant home isolation", () => {
  const dashboard = read("src/pages/dashboard/DashboardHome.tsx");
  const demoAdapter = read("src/components/commercial/CommercialDemoRestaurantHome.tsx");
  const presentation = read("src/components/dashboard/RestaurantDashboardHomeView.tsx");

  it("renders the same production home presentation in the restaurant frame", () => {
    expect(dashboard).toContain('commercialDemoFrame?.surface === "restaurant"');
    expect(dashboard).toContain("return <CommercialDemoRestaurantHome />");
    expect(dashboard).toContain("<RestaurantDashboardHomeView");
    expect(demoAdapter).toContain("<RestaurantDashboardHomeView");
    expect(dashboard).not.toContain("CommercialDemoActorOverview");
  });

  it("derives every commercial-frame metric from the validated snapshot and demo restaurant", () => {
    expect(demoAdapter).toContain("const { snapshot, realtimeStatus } = frame");
    expect(demoAdapter).toContain("snapshot.demo_restaurant.name");
    expect(demoAdapter).toContain("const order = snapshot.order");
    expect(demoAdapter).toContain("snapshot.reservations");
    expect(demoAdapter).toContain("getLocalDateKey(new Date())");
    expect(demoAdapter).toContain('order?.payment_status === "test_paid"');
    expect(demoAdapter).toContain("totalUpcomingOrders={upcomingOrders.length}");
    expect(demoAdapter).toContain("totalUpcomingReservations={upcomingReservations.length}");
    expect(demoAdapter).toContain("todayRevenue={orderAmount}");
    expect(demoAdapter).toContain("marketingEnabled={false}");
    expect(presentation).toContain('data-commercial-demo-source={demoSnapshot ? "isolated-snapshot" : undefined}');
  });

  it("keeps the commercial adapter and shared view free of production reads and writes", () => {
    for (const source of [demoAdapter, presentation]) {
      expect(source).not.toMatch(/getSupabase|useQuery|useMutation|invokeSupabase|\.from\s*\(|\.rpc\s*\(|create-checkout|fetch\s*\(/);
    }
    expect(demoAdapter).not.toContain("GoogleBusinessBookingCard");
    expect(demoAdapter).not.toContain("SignupApplicationStatusCard");
    expect(demoAdapter).not.toContain("CommercialDemoScenario");
    expect(demoAdapter).not.toContain("useDashboardRestaurant");
  });

  it("keeps all production integrations behind the non-frame LiveDashboard container", () => {
    const frameBranch = dashboard.indexOf('commercialDemoFrame?.surface === "restaurant"');
    const liveDashboard = dashboard.indexOf("function LiveDashboard()");
    const firstProductionOrderRead = dashboard.indexOf('.from("orders")');
    const firstProductionReservationRead = dashboard.indexOf('.from("reservations")');
    const checkoutCall = dashboard.indexOf('"create-checkout"');

    expect(frameBranch).toBeGreaterThan(-1);
    expect(liveDashboard).toBeGreaterThan(frameBranch);
    expect(firstProductionOrderRead).toBeGreaterThan(liveDashboard);
    expect(firstProductionReservationRead).toBeGreaterThan(liveDashboard);
    expect(checkoutCall).toBeGreaterThan(liveDashboard);
  });
});
