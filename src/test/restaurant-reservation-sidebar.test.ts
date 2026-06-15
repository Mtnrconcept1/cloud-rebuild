import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant reservation sidebar", () => {
  it("keeps the sticky reservation widget bottom-constrained to the viewport", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("reservationSidebarRef");
    expect(restaurantDetail).toContain("RESERVATION_SIDEBAR_BOTTOM_GAP");
    expect(restaurantDetail).toContain("ResizeObserver");
    expect(restaurantDetail).toContain("bottomAlignedTop");
    expect(restaurantDetail).toContain("--reservation-sidebar-sticky-top");
    expect(restaurantDetail).toContain("lg:top-[var(--reservation-sidebar-sticky-top)]");
    expect(restaurantDetail).not.toContain("sticky top-24 space-y-4");
    expect(restaurantDetail).not.toContain("lg:overflow-y-auto");
  });
});
