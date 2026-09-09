import { describe, expect, it } from "vitest";

import {
  buildHomeRestaurantSections,
  type HomeRestaurantCandidate,
} from "../lib/homeRestaurantDiscovery";
import { hasRestaurantVisual } from "../lib/randomizedRestaurantOrder";

const CATEGORIES = [
  "cafe",
  "pizza",
  "burger",
  "salades",
  "sandwich",
  "sushi",
  "italien",
  "japonais",
  "thai",
  "chinois",
  "francais",
  "suisse",
  "grillades",
  "indien",
  "libanais",
  "portugais",
  "bistro",
  "brasserie",
  "desserts",
  "street-food",
] as const;

function candidate(index: number, withImage: boolean): HomeRestaurantCandidate {
  const category = CATEGORIES[index % CATEGORIES.length];
  return {
    id: `restaurant-${index + 1}-${withImage ? "photo" : "no-photo"}`,
    name: `Restaurant ${index + 1}`,
    image_url: withImage ? `https://example.com/restaurants/${index + 1}.jpg` : null,
    city: "Genève",
    address: `Rue de Test ${index + 1}`,
    cuisine_type: category,
    category_names: [category],
    category_slugs: [category],
    latitude: 46.2044 + ((index % 5) * 0.001),
    longitude: 6.1432 + ((index % 7) * 0.001),
    rating: 0,
    review_count: 0,
    monthly_reservations: 0,
    monthly_orders: 0,
    promotion_score: 0,
  };
}

describe("homepage restaurant photo gate", () => {
  it("keeps the photo requirement across homepage discovery sections", () => {
    const photographed = Array.from({ length: 32 }, (_, index) => candidate(index, true));
    const imageless = Array.from({ length: 32 }, (_, index) => candidate(index + 100, false));

    const sections = buildHomeRestaurantSections({
      candidates: [...imageless, ...photographed],
      personalRestaurants: [imageless[0], photographed[0]],
      userCoordinates: { latitude: 46.2044, longitude: 6.1432 },
      radiusKm: 5,
      seed: 20260909,
      lunchFocus: true,
    });

    const selected = [
      ...sections.personalCards,
      ...sections.localCards,
      ...sections.lunchCards,
      ...sections.dinnerCards,
      ...sections.trendingCards,
      ...sections.mapRestaurants,
    ];

    expect(sections.localCards).toHaveLength(4);
    expect(sections.lunchCards).toHaveLength(4);
    expect(sections.dinnerCards).toHaveLength(4);
    expect(sections.trendingCards).toHaveLength(6);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every(hasRestaurantVisual)).toBe(true);
  });

  it("reuses photographed candidates across rails when the visual pool is small", () => {
    const photographed = Array.from({ length: 5 }, (_, index) => candidate(index, true));
    const imageless = Array.from({ length: 20 }, (_, index) => candidate(index + 100, false));

    const sections = buildHomeRestaurantSections({
      candidates: [...imageless, ...photographed],
      userCoordinates: { latitude: 46.2044, longitude: 6.1432 },
      radiusKm: 5,
      seed: 20260909,
      lunchFocus: true,
    });

    expect(sections.localCards.length).toBeGreaterThan(0);
    expect(sections.lunchCards.length).toBeGreaterThan(0);
    expect(sections.dinnerCards.length).toBeGreaterThan(0);
    expect(sections.trendingCards.length).toBeGreaterThan(0);

    const selected = [
      ...sections.localCards,
      ...sections.lunchCards,
      ...sections.dinnerCards,
      ...sections.trendingCards,
    ];

    expect(selected.every(hasRestaurantVisual)).toBe(true);
    expect(new Set(selected.map((restaurant) => restaurant.id)).size).toBeLessThan(selected.length);
  });
});
