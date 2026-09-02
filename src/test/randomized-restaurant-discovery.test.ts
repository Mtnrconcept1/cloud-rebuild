import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasRestaurantVisual,
  shuffleRestaurantsWithVisuals,
} from "../lib/randomizedRestaurantOrder";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("randomized restaurant discovery", () => {
  it("keeps only restaurants with a usable restaurant or sponsored visual", () => {
    expect(hasRestaurantVisual({ image_url: "https://example.com/restaurant.jpg" })).toBe(true);
    expect(hasRestaurantVisual({ image_url: "   ", promo_image: "https://example.com/campaign.jpg" })).toBe(true);
    expect(hasRestaurantVisual({ image_url: "   ", promo_image: null })).toBe(false);
  });

  it("shuffles image-backed restaurants deterministically for a stable render seed", () => {
    const restaurants = [
      { id: "alpha", image_url: "https://example.com/a.jpg" },
      { id: "beta", image_url: "   " },
      { id: "gamma", promo_image: "https://example.com/g.jpg" },
      { id: "delta", image_url: "https://example.com/d.jpg" },
    ];

    const first = shuffleRestaurantsWithVisuals(restaurants, 1);
    const second = shuffleRestaurantsWithVisuals(restaurants, 1);

    expect(first.map((restaurant) => restaurant.id)).toEqual(["delta", "alpha", "gamma"]);
    expect(second).toEqual(first);
    expect(restaurants.map((restaurant) => restaurant.id)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("draws homepage rails from a wider logical candidate pool before limiting the cards", () => {
    const home = read("src/pages/Index.tsx");

    expect(home).toContain('from "@/lib/randomizedRestaurantOrder"');
    expect(home).toContain("const HOME_RAIL_RANDOM_CANDIDATE_LIMIT = 24");
    expect(home).toContain("const homepageShuffleSeed = useRef(Math.floor(Math.random() * 1_000_000_000))");
    expect(home).toContain(": HOME_RAIL_RANDOM_CANDIDATE_LIMIT");
    expect(home).toContain("shuffleRestaurantsWithVisuals(");
    expect(home).toContain("`${homepageShuffleSeed.current}:${maxItems}`");
    expect(home).toContain(").slice(0, maxItems)");
    expect(home).toContain("const imageBackedOffers = progressiveOffers.filter");
    expect(home).toContain('Boolean(String(restaurant?.image_url || "").trim())');
  });

  it("keeps search pagination exact while removing alphabetical fallback and image-less rows", () => {
    const migration = read("supabase/migrations/20260902182000_randomize_image_backed_restaurant_search.sql");

    expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 54), 1), 54)");
    expect(migration).toContain("NULLIF(btrim(result.image_url), '') IS NOT NULL");
    expect(migration).toContain("NULLIF(btrim(COALESCE(p_query, '')), '') IS NOT NULL AS has_query");
    expect(migration).toContain("to_char(current_date, 'YYYY-MM-DD') AS random_seed");
    expect(migration).toContain("md5(controls.random_seed || ':' || visible.id::text)");
    expect(migration).toContain("count(*)::bigint AS total_count");
    expect(migration).toContain("PUBLIC must not execute catalog pagination directly");
    expect(migration).not.toContain("visible.name ASC");
  });
});
