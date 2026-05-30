import { describe, expect, it } from "vitest";

import { getCartRestaurantSummaryLabel } from "@/lib/cartRestaurantSummary";

describe("cart restaurant summary", () => {
  it("lists every restaurant for meal subscription carts", () => {
    expect(getCartRestaurantSummaryLabel({
      cartMetadata: { feature: "abonnement", restaurants: ["Tok Test", "Green Test"] },
      items: [
        { restaurantName: "Tok Test" },
        { restaurantName: "Green Test" },
        { restaurantName: "Tok Test" },
      ],
    })).toBe("Restaurants : Tok Test, Green Test");
  });

  it("keeps the single restaurant label for ordinary carts", () => {
    expect(getCartRestaurantSummaryLabel({
      cartMetadata: {},
      items: [{ restaurantName: "Tok Test" }],
    })).toBe("Restaurant : Tok Test");
  });
});
