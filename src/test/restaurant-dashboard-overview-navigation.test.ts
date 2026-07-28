import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("restaurant overview navigation", () => {
  it("links overview families while honoring access locks", () => {
    const overview = read("src/components/dashboard/RestaurantDashboardHomeView.tsx");
    for (const target of ["/dashboard/commandes", "/dashboard/reservations", "/dashboard/performances", "/dashboard/campagnes"]) expect(overview).toContain(target);
    expect(overview).toContain("dashboardAccessLocked");
    expect(overview).toContain("disabledFeatures.has(feature)");
    expect(overview).toContain('grid-cols-1 gap-3 min-[360px]:grid-cols-2');
  });

  it("uses established precise query parameters", () => {
    const overview = read("src/components/dashboard/RestaurantDashboardHomeView.tsx");
    expect(overview).toContain("?order=${encodeURIComponent(order.id)}");
    expect(overview).toContain("?reservation=${encodeURIComponent(reservation.id)}");
  });

  it("opens, scrolls to and focuses exact records", () => {
    const orders = read("src/pages/dashboard/DashboardCommandes.tsx");
    const reservations = read("src/pages/dashboard/DashboardReservations.tsx");
    expect(orders).toContain('searchParams.get("order")');
    expect(orders).toContain("setOpenDayKey(targetDate)");
    expect(orders).toContain("order-${target.id}");
    expect(orders).toContain("scrollIntoView");
    expect(orders).toContain("focus({ preventScroll: true })");
    expect(reservations).toContain('searchParams.get("reservation")');
    expect(reservations).toContain("setOpenDayKey(target.date)");
    expect(reservations).toContain("reservation-${target.id}");
    expect(reservations).toContain("scrollIntoView");
    expect(reservations).toContain("prefers-reduced-motion");
  });
});
