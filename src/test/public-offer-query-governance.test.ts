import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function expectMenuItemsQueryBounded(source: string) {
  const queryMatches = [...source.matchAll(/from\("menu_items"\)[\s\S]*?(?:;|return data \|\| \[\];)/g)];
  expect(queryMatches.length).toBeGreaterThan(0);

  for (const [query] of queryMatches) {
    expect(query).toContain(".limit(PUBLIC_MENU_ITEMS_LIMIT)");
  }
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

  it("keeps remaining high-volume public and dashboard reads bounded", () => {
    const home = read("src/pages/Index.tsx");
    const chefsTable = read("src/pages/ChefsTable.tsx");
    const dashboardReservations = read("src/pages/dashboard/DashboardReservations.tsx");
    const socialFeed = read("src/hooks/useSocialFeed.ts");

    expect(home).toContain("const HOME_CANDIDATE_POOL_LIMIT = 54");
    expect(home).toContain("p_limit: Math.min(Math.max(limit, 1), HOME_CANDIDATE_POOL_LIMIT)");
    expect(home).toContain("const allRestaurants = shouldLoadMap ? homeSections.mapRestaurants : [];");
    expect(home).not.toContain("HOME_MAP_RESTAURANTS_LIMIT");
    expect(chefsTable).toContain(".limit(CHEFS_TABLE_DROPS_LIMIT)");
    expect(dashboardReservations).toContain(".limit(DASHBOARD_RESERVATIONS_FETCH_LIMIT)");
    expect(socialFeed).toContain(".limit(RESTAURANT_SOCIAL_POSTS_LIMIT)");
    expect(socialFeed).toContain(".limit(SOCIAL_COMMENTS_LIMIT)");
  });

  it("bounds public menu item reads used by guided checkout funnels", () => {
    for (const file of [
      "src/pages/CreneauxGarantis.tsx",
      "src/pages/FlexPrixBas.tsx",
      "src/pages/GarantieQualite.tsx",
      "src/pages/MatchGroupes.tsx",
      "src/pages/MultiRestaurant.tsx",
      "src/pages/MultiStop.tsx",
      "src/pages/ZeroAttente.tsx",
      "src/components/cart/UpsellModal.tsx",
    ]) {
      expectMenuItemsQueryBounded(read(file));
    }
  });

  it("bounds public restaurant discovery reads in guided checkout funnels", () => {
    const matchGroupes = read("src/pages/MatchGroupes.tsx");
    const multiRestaurant = read("src/pages/MultiRestaurant.tsx");

    expect(matchGroupes).toContain(".limit(PUBLIC_RESTAURANTS_LIMIT)");
    expect(multiRestaurant).toContain(".limit(PUBLIC_RESTAURANTS_LIMIT)");
  });
});
