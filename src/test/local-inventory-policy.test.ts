import { describe, expect, it } from "vitest";

import {
  getLocalInventoryDecision,
  parseLocalInventorySnapshot,
  resolveLocalInventoryPolicy,
  type LocalInventorySnapshot,
  type LocalPageType,
} from "../lib/seo/localInventoryPolicy.mjs";

function snapshot(overrides: Partial<LocalInventorySnapshot> = {}) {
  return {
    version: 1,
    path: "/restaurants/geneve/pizza",
    pageType: "cuisine",
    inventoryCount: 3,
    parentInventoryCount: 10,
    itemListComplete: true,
    policy: resolveLocalInventoryPolicy(),
    indexable: true,
    ...overrides,
  };
}

describe("shared local inventory policy", () => {
  it.each<LocalPageType>(["city", "cuisine", "district", "intent"])("requires three real restaurants for %s by default", (pageType) => {
    expect(getLocalInventoryDecision({ pageType, inventoryCount: 2, parentInventoryCount: 10 }))
      .toMatchObject({ indexable: false, reason: "thin", minimum: 3 });
    expect(getLocalInventoryDecision({ pageType, inventoryCount: 3, parentInventoryCount: 10 }))
      .toMatchObject({ indexable: true, reason: null });
  });

  it("demotes a specialized selection at the configured parent coverage boundary", () => {
    expect(getLocalInventoryDecision({ pageType: "intent", inventoryCount: 7, parentInventoryCount: 10 }).indexable).toBe(true);
    expect(getLocalInventoryDecision({ pageType: "intent", inventoryCount: 8, parentInventoryCount: 10 }))
      .toMatchObject({ indexable: false, reason: "parent-duplicate" });
    expect(getLocalInventoryDecision({ pageType: "city", inventoryCount: 10, parentInventoryCount: 10 }).indexable).toBe(true);
  });

  it("uses the build's configured thresholds in every consumer", () => {
    const policy = resolveLocalInventoryPolicy({ minCityRestaurants: 5, minSpecializedRestaurants: 4, maxParentCoverage: 0.6 });
    expect(getLocalInventoryDecision({ pageType: "city", inventoryCount: 4, policy }).reason).toBe("thin");
    expect(getLocalInventoryDecision({ pageType: "cuisine", inventoryCount: 3, parentInventoryCount: 10, policy }).reason).toBe("thin");
    expect(getLocalInventoryDecision({ pageType: "cuisine", inventoryCount: 6, parentInventoryCount: 10, policy }).reason).toBe("parent-duplicate");
  });

  it("does not infer a parent duplicate when the parent inventory is unknown", () => {
    expect(getLocalInventoryDecision({ pageType: "district", inventoryCount: 3, parentInventoryCount: null }).indexable).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])("does not index invalid or empty inventory %s", (inventoryCount) => {
    expect(getLocalInventoryDecision({ pageType: "city", inventoryCount }).indexable).toBe(false);
  });

  it("keeps invalid policy options bounded and falls back to valid defaults", () => {
    expect(resolveLocalInventoryPolicy({ minCityRestaurants: Number.NaN, minSpecializedRestaurants: 1, maxParentCoverage: 2 }))
      .toEqual({ minCityRestaurants: 3, minSpecializedRestaurants: 2, maxParentCoverage: 1 });
  });
});

describe("local inventory snapshot ownership", () => {
  it("reads only the complete snapshot belonging to the current route", () => {
    const serialized = JSON.stringify(snapshot());
    expect(parseLocalInventorySnapshot(serialized, "/restaurants/geneve/pizza/")).toMatchObject({ indexable: true, inventoryCount: 3 });
    expect(parseLocalInventorySnapshot(serialized, "/restaurants/geneve/sushi")).toBeNull();
    expect(parseLocalInventorySnapshot(serialized, "/restaurants/lausanne/pizza")).toBeNull();
  });

  it("preserves a final exclusion even if the visible item count reaches the minimum", () => {
    const parsed = parseLocalInventorySnapshot(JSON.stringify(snapshot({ indexable: false })), "/restaurants/geneve/pizza");
    expect(parsed?.indexable).toBe(false);
  });

  it("does not promote a thin or parent-duplicate snapshot with inconsistent indexable metadata", () => {
    expect(parseLocalInventorySnapshot(JSON.stringify(snapshot({ inventoryCount: 2 })), "/restaurants/geneve/pizza")?.indexable).toBe(false);
    expect(parseLocalInventorySnapshot(JSON.stringify(snapshot({ parentInventoryCount: 3 })), "/restaurants/geneve/pizza")?.indexable).toBe(false);
  });

  it.each([
    null,
    "{",
    JSON.stringify({ ...snapshot(), version: 2 }),
    JSON.stringify({ ...snapshot(), itemListComplete: false }),
    JSON.stringify({ ...snapshot(), inventoryCount: -1 }),
    JSON.stringify({ ...snapshot(), parentInventoryCount: "10" }),
    JSON.stringify({ ...snapshot(), pageType: "city" }),
    JSON.stringify({ ...snapshot(), path: "https://external.example/restaurants/geneve/pizza" }),
    JSON.stringify({ ...snapshot(), policy: {} }),
  ])("ignores malformed, incomplete, or incompatible snapshots", (serialized) => {
    expect(parseLocalInventorySnapshot(serialized, "/restaurants/geneve/pizza")).toBeNull();
  });
});
