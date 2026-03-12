import { describe, expect, it } from "vitest";

import {
  buildRestaurantCategorySearchTerms,
  formatRestaurantCategorySummary,
  restaurantMatchesCategoryFilter,
} from "@/lib/restaurantCategories";

describe("restaurant categories helpers", () => {
  it("formats a readable summary from multiple categories", () => {
    expect(formatRestaurantCategorySummary(["Italien", "Pizza", "Pates"])).toBe("Italien, Pizza, Pates");
    expect(formatRestaurantCategorySummary(["Italien", "Pizza", "Pates", "Lasagnes", "Risotto"])).toBe("Italien, Pizza, Pates, Lasagnes +1");
  });

  it("builds normalized search terms from categories and keywords", () => {
    const terms = buildRestaurantCategorySearchTerms({
      categories: [
        { name: "Italien", slug: "italien", keywords: ["pizza", "lasagne"] },
      ],
      legacyCuisineType: "Italien, Pizza",
    });

    expect(terms).toContain("italien");
    expect(terms).toContain("pizza");
    expect(terms).toContain("lasagne");
  });

  it("matches user search against category keywords", () => {
    const matches = restaurantMatchesCategoryFilter({
      query: "lasagne",
      categories: [{ name: "Italien", slug: "italien", keywords: ["pizza", "lasagne"] }],
      legacyCuisineType: "Cuisine italienne",
    });

    const doesNotMatch = restaurantMatchesCategoryFilter({
      cuisineFilter: "ramen",
      categories: [{ name: "Italien", slug: "italien", keywords: ["pizza", "lasagne"] }],
      legacyCuisineType: "Cuisine italienne",
    });

    expect(matches).toBe(true);
    expect(doesNotMatch).toBe(false);
  });
});
