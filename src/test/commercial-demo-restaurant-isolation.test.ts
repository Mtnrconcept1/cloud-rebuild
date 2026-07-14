import { describe, expect, it } from "vitest";

import {
  filterCommercialDemoRestaurants,
  resolveCommercialDemoRestaurantSelection,
} from "../lib/commercialDemoRestaurantScope";

const targetDemoId = "11111111-1111-4111-8111-111111111111";

const restaurants = [
  { id: targetDemoId, name: "Restaurant Démo autorisé", is_demo: true },
  { id: "22222222-2222-4222-8222-222222222222", name: "Restaurant réel du compte", is_demo: false },
  { id: "33333333-3333-4333-8333-333333333333", name: "Autre restaurant démo", is_demo: true },
];

describe("commercial demo restaurant frame isolation", () => {
  it("drops every real or unrelated restaurant even if the backend returns extra rows", () => {
    expect(filterCommercialDemoRestaurants(restaurants, targetDemoId)).toEqual([
      restaurants[0],
    ]);
  });

  it("fails closed when the snapshot id is absent or points to a non-demo row", () => {
    expect(filterCommercialDemoRestaurants(restaurants, null)).toEqual([]);
    expect(filterCommercialDemoRestaurants(restaurants, "   ")).toEqual([]);
    expect(filterCommercialDemoRestaurants(restaurants, restaurants[1].id)).toEqual([]);
  });

  it("never restores a stale real restaurant as the dashboard selection", () => {
    expect(resolveCommercialDemoRestaurantSelection(restaurants, targetDemoId)).toBe(targetDemoId);
    expect(resolveCommercialDemoRestaurantSelection(restaurants, restaurants[1].id)).toBeNull();
  });
});
