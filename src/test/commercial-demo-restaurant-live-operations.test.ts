import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial demo real restaurant operational screens", () => {
  const orders = read("src/pages/dashboard/DashboardCommandes.tsx");
  const reservations = read("src/pages/dashboard/DashboardReservations.tsx");
  const homeAdapter = read("src/components/commercial/CommercialDemoRestaurantHome.tsx");

  it("mounts the production command and reservation presentations inside the restaurant frame", () => {
    expect(orders).toContain('if (commercialDemoFrame?.surface === "restaurant")');
    expect(orders).toContain("return <LiveDashboardCommandes />");
    expect(orders).not.toContain("CommercialDemoActorWorkspace");

    expect(reservations).toContain('if (commercialDemoFrame?.surface === "restaurant") return <LiveDashboardReservations />');
    expect(reservations).toContain('data-commercial-demo-source={isCommercialDemoRestaurant ? "isolated-snapshot" : undefined}');
  });

  it("hydrates all three real screens from the validated commercial snapshot", () => {
    expect(homeAdapter).toContain("snapshot.demo_restaurant.name");
    expect(homeAdapter).toContain("snapshot.reservations");
    expect(orders).toContain("buildCommercialDemoDashboardOrders(commercialDemoSnapshot)");
    expect(orders).toContain("commercialDemoSnapshot?.demo_restaurant");
    expect(reservations).toContain("buildCommercialDemoDashboardReservations(commercialDemoSnapshot)");
    expect(reservations).toContain("commercialDemoSnapshot?.demo_restaurant");
  });

  it("turns off production reads while the commercial restaurant frame is active", () => {
    expect(orders).toContain("enabled: Boolean(effectiveSelectedId && !isCommercialDemoRestaurant)");
    expect(reservations).toContain("enabled: Boolean(effectiveSelectedId && !isCommercialDemoRestaurant)");
    expect(homeAdapter).not.toMatch(/getSupabase|useQuery|useDashboardRestaurant|\.from\s*\(|\.rpc\s*\(/);
  });

  it("routes status actions only through commercial_demo RPC helpers and blocks production cancellations", () => {
    const orderStatusHandler = orders.slice(
      orders.indexOf("const updateStatus = async"),
      orders.indexOf("const markOrderSeen = async"),
    );
    expect(orderStatusHandler).toContain("if (commercialDemoSnapshot && commercialDemoFrame)");
    expect(orderStatusHandler).toContain("transitionCommercialDemoOrder");
    expect(orderStatusHandler.indexOf("transitionCommercialDemoOrder"))
      .toBeLessThan(orderStatusHandler.indexOf('invokeSupabaseFunction("restaurant-order-status"'));
    expect(orders).toContain("if (isCommercialDemoRestaurant) return;");
    expect(orders).toContain("open={Boolean(cancelTarget) && !isCommercialDemoRestaurant}");

    const reservationStatusMutation = reservations.slice(
      reservations.indexOf("const updateStatusMutation = useMutation"),
      reservations.indexOf("const cancelMutation = useMutation"),
    );
    expect(reservationStatusMutation).toContain("if (commercialDemoSnapshot && commercialDemoFrame)");
    expect(reservationStatusMutation).toContain("transitionCommercialDemoReservation");
    expect(reservationStatusMutation.indexOf("transitionCommercialDemoReservation"))
      .toBeLessThan(reservationStatusMutation.indexOf("updateRestaurantReservationStatus"));
    expect(reservations).toContain("L'annulation restaurateur est désactivée");
    expect(reservations).toContain("open={Boolean(cancelTarget) && !isCommercialDemoRestaurant}");
  });
});
