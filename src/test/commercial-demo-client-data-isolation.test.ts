import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getCommercialDemoAntiWasteOffers,
  getCommercialDemoClientMenuItems,
  getCommercialDemoClientRestaurants,
  getCommercialDemoFlashSales,
} from "@/lib/commercialDemoClientCatalog";
import type { CommercialDemoSnapshot } from "@/lib/commercialDemoJourney";

const snapshot: CommercialDemoSnapshot = {
  session: { id: "demo-session-client-isolation", demo_restaurant_id: "demo-restaurant" },
  demo_restaurant: {
    id: "demo-restaurant",
    name: "Restaurant Démo Isolation",
    city: "Genève",
    cuisine_type: "Bistronomique",
    image_url: "/demo-restaurant.jpg",
    rating: 9.1,
    review_count: 12,
    price_range: 2,
    delivery_available: true,
    supports_pickup: true,
    supports_dinein: true,
    supports_reservation: true,
    is_demo: true,
  },
  catalog_items: [
    { id: "demo-item-visible", name: "Plat Démo", price: 24, is_available: true },
    { id: "demo-item-hidden", name: "Plat masqué", price: 18, is_available: false },
  ],
  order: null,
  mission: null,
  reservations: [],
  active_features: ["livraison", "reservation", "anti-gaspi", "ventes-flash"],
  events: [],
  allowed_actions: [],
};

function expectDemoGuardBeforeProductionCall(
  source: string,
  productionCall: string,
  demoGuard: string,
) {
  const productionCallIndex = source.indexOf(productionCall);
  expect(productionCallIndex).toBeGreaterThanOrEqual(0);

  const queryFunctionIndex = source.lastIndexOf("queryFn:", productionCallIndex);
  expect(queryFunctionIndex).toBeGreaterThanOrEqual(0);
  expect(source.slice(queryFunctionIndex, productionCallIndex)).toContain(demoGuard);
}

describe("commercial demo client data isolation", () => {
  it("exposes exactly one demo restaurant and only its available catalog", () => {
    const restaurants = getCommercialDemoClientRestaurants(snapshot);
    const menu = getCommercialDemoClientMenuItems(snapshot, snapshot.demo_restaurant.id);

    expect(restaurants).toHaveLength(1);
    expect(restaurants[0]).toMatchObject({ id: "demo-restaurant", is_demo: true, is_active: true });
    expect(menu.map((item) => item.id)).toEqual(["demo-item-visible"]);
    expect(menu.every((item) => item.restaurant_id === snapshot.demo_restaurant.id)).toBe(true);
    expect(getCommercialDemoClientMenuItems(snapshot, "production-restaurant")).toEqual([]);
  });

  it("derives every client offer from the same demo restaurant", () => {
    const antiWaste = getCommercialDemoAntiWasteOffers(snapshot);
    const flashSales = getCommercialDemoFlashSales(snapshot);

    expect(antiWaste).toHaveLength(1);
    expect(flashSales).toHaveLength(1);
    expect(antiWaste.every((offer) => offer.restaurants.id === snapshot.demo_restaurant.id)).toBe(true);
    expect(flashSales.every((offer) => offer.restaurant_id === snapshot.demo_restaurant.id)).toBe(true);
  });

  it("guards discovery and detail production reads with the client demo snapshot", () => {
    const index = readFileSync("src/pages/Index.tsx", "utf8");
    const search = readFileSync("src/pages/Recherche.tsx", "utf8");
    const local = readFileSync("src/pages/LocalRestaurants.tsx", "utf8");
    const detail = readFileSync("src/pages/RestaurantDetail.tsx", "utf8");

    expect(index).toContain("getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot)");
    expect(index).toContain('enabled: campaignsEnabled && !isCommercialDemoClient');
    expect(index).toContain("if (isCommercialDemoClient) return demoRestaurants");
    expect(index).toContain("if (isCommercialDemoClient) return [] as ProgressiveReservationOffer[]");
    expect(index).toContain('["home-user-context", user?.id, demoSessionKey]');
    expect(search).toContain('["search-cuisine-options", demoSessionKey]');
    expect(search).toContain("getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot)");
    expect(local).toContain("city && slugCandidate && !isCommercialDemoClient");
    expect(local).toContain("getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot)");
    expect(detail).toContain("getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot, restaurantId)");
    expect(detail).toContain("getCommercialDemoFlashSales(commercialDemoFrame.snapshot)");
    expect(detail).toContain("getCommercialDemoAntiWasteOffers(commercialDemoFrame.snapshot)");
    expect(detail).toContain("buildCommercialDemoReviewSeeds(commercialDemoFrame.snapshot)");
    expect(detail).toContain('["restaurant-media", restaurantId, demoSessionKey]');
  });

  it("never reaches the SECURITY DEFINER restaurant catalog RPC in client demo mode", () => {
    const index = readFileSync("src/pages/Index.tsx", "utf8");
    const search = readFileSync("src/pages/Recherche.tsx", "utf8");
    const local = readFileSync("src/pages/LocalRestaurants.tsx", "utf8");

    const homeRailCalls = index.match(/fetchHomeRail\(\{/g) ?? [];
    const guardedHomeRailCalls = index.match(
      /queryFn:\s*\(\)\s*=>\s*isCommercialDemoClient\s*\?\s*demoRestaurants\s*:\s*fetchHomeRail\(\{/g,
    ) ?? [];

    expect(homeRailCalls).toHaveLength(5);
    expect(guardedHomeRailCalls).toHaveLength(homeRailCalls.length);
    expect(index.match(/search_restaurants_catalog/g) ?? []).toHaveLength(1);

    expect(search.match(/search_restaurants_catalog_page/g) ?? []).toHaveLength(1);
    expectDemoGuardBeforeProductionCall(
      search,
      '(supabase.rpc as any)("search_restaurants_catalog_page"',
      "if (isCommercialDemoClient)",
    );

    expect(local.match(/search_restaurants_catalog/g) ?? []).toHaveLength(1);
    expectDemoGuardBeforeProductionCall(
      local,
      '(supabase.rpc as any)("search_restaurants_catalog"',
      "if (isCommercialDemoClient)",
    );
  });

  it("prevents nested cards, cart and reservation widgets from querying live restaurant data", () => {
    const card = readFileSync("src/components/RestaurantCard.tsx", "utf8");
    const cart = readFileSync("src/pages/Panier.tsx", "utf8");
    const dialog = readFileSync("src/components/ReservationDialog.tsx", "utf8");
    const widget = readFileSync("src/components/ReservationWidget.tsx", "utf8");
    const zeroWait = readFileSync("src/pages/ZeroAttente.tsx", "utf8");

    expect(card).toContain("enabled: !isCommercialDemoClient && shouldFetchReservationProfile");
    expect(card).toContain("enabled: !isCommercialDemoClient && canShowReservationSlots");
    expect(card).toContain("enabled: !isCommercialDemoClient");
    expect(cart).toContain('["cart-restaurant-hours", restaurantId, demoSessionKey]');
    expect(cart).toContain('["restaurant-payment-config", restaurantId, demoSessionKey]');
    expect(cart.match(/if \(isCommercialDemoClient\)/g)?.length || 0).toBeGreaterThanOrEqual(3);
    expect(dialog).toContain("if (isCommercialDemoClient) return DEFAULT_SERVICE_SETTINGS");
    expect(dialog).toContain("generateDailyTimeSlots(DEFAULT_SERVICE_SETTINGS)");
    expect(widget).toContain("if (isCommercialDemoClient) return DEFAULT_SERVICE_SETTINGS");
    expect(widget).toContain("if (isCommercialDemoClient) return [] as number[]");
    expect(zeroWait).toContain("enabled: Boolean(selectedRestaurant && !isCommercialDemoClient)");
  });

  it("keeps social discovery on fixed snapshot posts in client demo mode", () => {
    const socialFeed = readFileSync("src/hooks/useSocialFeed.ts", "utf8");
    const actualites = readFileSync("src/pages/Actualites.tsx", "utf8");
    const actualitePost = readFileSync("src/pages/ActualitePost.tsx", "utf8");

    expect(socialFeed).toContain("getCommercialDemoCachedPosts(queryClient, commercialDemoFrame.snapshot)");
    expect(socialFeed).toContain("if (isCommercialDemoClient)");
    expect(socialFeed).toContain("useSocialRealtime(!isCommercialDemoClient)");
    expect(actualites).toContain("const isCommercialDemoClient = commercialDemoFrame?.surface === \"client\"");
    expect(actualitePost).toContain('robots: isCommercialDemoClient');
  });
});
