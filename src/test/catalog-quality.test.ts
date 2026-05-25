import { describe, expect, it } from "vitest";

import { scoreRestaurantCatalogQuality } from "@/lib/catalogQuality";

describe("catalog quality", () => {
  it("marks complete restaurants as publishable", () => {
    expect(scoreRestaurantCatalogQuality({
      image_url: "/images/resto.jpg",
      address: "Rue du Rhone 1, Geneve",
      latitude: 46.2044,
      longitude: 6.1432,
      opening_hours: { monday: [{ open: "11:30", close: "14:00" }] },
      menu_items_count: 8,
      payment_methods: ["card", "twint"],
      cuisine_type: "Italien",
    })).toEqual({
      score: 100,
      publishable: true,
      missingFields: [],
    });
  });

  it("lists missing production catalog fields", () => {
    expect(scoreRestaurantCatalogQuality({
      image_url: "",
      address: "",
      latitude: null,
      longitude: null,
      opening_hours: {},
      menu_items_count: 0,
      payment_methods: [],
      cuisine_type: null,
    })).toEqual({
      score: 0,
      publishable: false,
      missingFields: ["image", "address", "coordinates", "opening_hours", "menu", "payment_methods", "cuisine"],
    });
  });
});
