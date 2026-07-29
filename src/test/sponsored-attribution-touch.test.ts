import { describe, expect, it } from "vitest";

import {
  SPONSORED_ATTRIBUTION_KEY,
  SPONSORED_ATTRIBUTION_MAX_AGE_MS,
  getValidSponsoredAttributions,
  rememberSponsoredAttribution,
} from "@/lib/sponsoredAttribution";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("sponsored attribution touch tokens", () => {
  it("persists the server touch token across an anonymous-to-authenticated journey", () => {
    const storage = new MemoryStorage();
    const clickedAt = Date.parse("2026-07-29T08:00:00.000Z");

    rememberSponsoredAttribution("campaign-1", "restaurant-1", {
      nowMs: clickedAt,
      storage,
      touchToken: "11111111-1111-4111-8111-111111111111",
    });

    expect(getValidSponsoredAttributions("restaurant-1", clickedAt + 5_000, storage)).toEqual([
      {
        campaignId: "campaign-1",
        clickedAt: "2026-07-29T08:00:00.000Z",
        touchToken: "11111111-1111-4111-8111-111111111111",
      },
    ]);
  });

  it("keeps the legacy timestamp signature compatible and prunes expired touches", () => {
    const storage = new MemoryStorage();
    const clickedAt = Date.parse("2026-07-29T08:00:00.000Z");

    rememberSponsoredAttribution("campaign-legacy", "restaurant-1", clickedAt, storage);
    expect(getValidSponsoredAttributions("restaurant-1", clickedAt + 1_000, storage)).toHaveLength(1);

    expect(
      getValidSponsoredAttributions(
        "restaurant-1",
        clickedAt + SPONSORED_ATTRIBUTION_MAX_AGE_MS + 1,
        storage,
      ),
    ).toEqual([]);
    expect(storage.getItem(SPONSORED_ATTRIBUTION_KEY)).toBe("{}");
  });

  it("replaces an older touch for the same campaign without duplicating it", () => {
    const storage = new MemoryStorage();
    const clickedAt = Date.parse("2026-07-29T08:00:00.000Z");

    rememberSponsoredAttribution("campaign-1", "restaurant-1", {
      nowMs: clickedAt,
      storage,
      touchToken: "11111111-1111-4111-8111-111111111111",
    });
    rememberSponsoredAttribution("campaign-1", "restaurant-1", {
      nowMs: clickedAt + 10_000,
      storage,
      touchToken: "22222222-2222-4222-8222-222222222222",
    });

    expect(getValidSponsoredAttributions("restaurant-1", clickedAt + 20_000, storage)).toEqual([
      {
        campaignId: "campaign-1",
        clickedAt: "2026-07-29T08:00:10.000Z",
        touchToken: "22222222-2222-4222-8222-222222222222",
      },
    ]);
  });

  it("rejects implausible future timestamps instead of retaining them indefinitely", () => {
    const storage = new MemoryStorage();
    const now = Date.parse("2026-07-29T08:00:00.000Z");

    storage.setItem(SPONSORED_ATTRIBUTION_KEY, JSON.stringify({
      "restaurant-1": [{
        campaignId: "campaign-future",
        clickedAt: "2026-07-30T08:00:00.000Z",
        touchToken: "33333333-3333-4333-8333-333333333333",
      }],
    }));

    expect(getValidSponsoredAttributions("restaurant-1", now, storage)).toEqual([]);
  });
});
