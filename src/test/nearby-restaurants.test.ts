import { describe, expect, it } from "vitest";

import {
  filterRestaurantsWithinRadius,
  getDistanceKm,
  getRestaurantDistanceKm,
  isRestaurantWithinRadius,
} from "@/lib/nearbyRestaurants";

const GENEVA = { latitude: 46.2044, longitude: 6.1432 };

describe("nearby restaurant helpers", () => {
  it("computes a realistic distance between two coordinates", () => {
    const distance = getDistanceKm(GENEVA, { latitude: 46.2102, longitude: 6.1425 });
    expect(distance).toBeGreaterThan(0.5);
    expect(distance).toBeLessThan(0.8);
  });

  it("keeps only restaurants inside the requested radius without changing rubric order", () => {
    const restaurants = [
      { id: "mid", latitude: 46.2250, longitude: 6.1432 },
      { id: "far", latitude: 46.2600, longitude: 6.1432 },
      { id: "near", latitude: 46.2050, longitude: 6.1432 },
      { id: "missing", latitude: null, longitude: null },
    ];

    const result = filterRestaurantsWithinRadius(restaurants, GENEVA, 5);

    expect(result.map((restaurant) => restaurant.id)).toEqual(["mid", "near"]);
    expect(result.every((restaurant) => restaurant.distance_km <= 5)).toBe(true);
  });

  it("can sort a dedicated proximity block from nearest to farthest", () => {
    const restaurants = [
      { id: "mid", latitude: 46.2250, longitude: 6.1432 },
      { id: "near", latitude: 46.2050, longitude: 6.1432 },
    ];

    const result = filterRestaurantsWithinRadius(restaurants, GENEVA, 5, {
      sortByDistance: true,
    });

    expect(result.map((restaurant) => restaurant.id)).toEqual(["near", "mid"]);
  });

  it("rejects invalid or missing restaurant coordinates", () => {
    expect(getRestaurantDistanceKm({ latitude: null, longitude: null }, GENEVA)).toBeNull();
    expect(getRestaurantDistanceKm({ latitude: 91, longitude: 6 }, GENEVA)).toBeNull();
    expect(isRestaurantWithinRadius({ latitude: null, longitude: null }, GENEVA, 5)).toBe(false);
  });
});
