import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public offer query governance", () => {
  it("keeps public special-offer pages bounded and cache-driven", () => {
    const antiGaspi = read("src/pages/AntiGaspi.tsx");
    const ventesFlash = read("src/pages/VentesFlash.tsx");

    expect(antiGaspi).not.toContain("refetchInterval");
    expect(ventesFlash).not.toContain("refetchInterval");
    expect(antiGaspi).toContain(".gt(\"quantity_available\", 0)");
    expect(ventesFlash).toContain(".gt(\"quantity_available\", 0)");
    expect(antiGaspi).toContain(".limit(PUBLIC_ANTI_WASTE_OFFERS_LIMIT)");
    expect(ventesFlash).toContain(".limit(PUBLIC_FLASH_SALES_LIMIT)");
    expect(antiGaspi).toContain("staleTime: PUBLIC_SPECIAL_OFFERS_STALE_MS");
    expect(ventesFlash).toContain("staleTime: PUBLIC_SPECIAL_OFFERS_STALE_MS");
  });

  it("bounds restaurant detail eager reads until full pagination is added", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    for (const cap of [
      "RESTAURANT_MEDIA_LIMIT",
      "RESTAURANT_MENU_ITEMS_LIMIT",
      "RESTAURANT_REVIEWS_LIMIT",
      "RESTAURANT_FORMULAS_LIMIT",
      "RESTAURANT_SPECIAL_OFFERS_LIMIT",
    ]) {
      expect(restaurantDetail).toContain(`.limit(${cap})`);
    }

    expect(restaurantDetail).toContain("staleTime: RESTAURANT_DETAIL_STALE_MS");
  });
});
