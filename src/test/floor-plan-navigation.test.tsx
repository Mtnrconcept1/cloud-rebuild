import { render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { buildFloorPlanHref, isValidServiceDate } from "@/lib/floorPlanNavigation";

describe("floor plan navigation", () => {
  it.each([null, "", "2026-02-30", "2026-13-01", "2026-05-27T20:00:00", "not-a-date"])("rejects an invalid service date %s", (value) => {
    expect(isValidServiceDate(value)).toBe(false);
  });

  it("accepts real calendar dates including leap days", () => {
    expect(isValidServiceDate("2028-02-29")).toBe(true);
    expect(isValidServiceDate("2026-05-27")).toBe(true);
    expect(isValidServiceDate("2026-02-29")).toBe(false);
  });

  it("preserves the reservation, branch, day and service in a safe application URL", () => {
    const href = buildFloorPlanHref({ date: "2026-05-27", branchId: "branch 1", reservationId: "r&1", service: "dinner" });
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/dashboard/plan-salle");
    expect(Object.fromEntries(url.searchParams)).toEqual({ date: "2026-05-27", branch: "branch 1", reservation: "r&1", service: "dinner" });
    expect(buildFloorPlanHref({ date: "2026-02-30", service: "unknown" })).toBe("/dashboard/plan-salle");
  });

  it("lets the router preserve the isolated demo basename", () => {
    render(
      <MemoryRouter basename="/commercial/demo/restaurant" initialEntries={["/commercial/demo/restaurant/dashboard/reservations"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Link to={buildFloorPlanHref({ date: "2026-05-27", reservationId: "demo-reservation" })}>Plan de salle</Link>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Plan de salle" })).toHaveAttribute("href", "/commercial/demo/restaurant/dashboard/plan-salle?date=2026-05-27&reservation=demo-reservation");
  });
});
