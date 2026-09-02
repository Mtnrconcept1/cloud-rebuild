import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildHomeRestaurantSections,
  hasHomeOfferSignal,
  hasHomeTrendSignal,
  type HomeRestaurantCandidate,
} from "../lib/homeRestaurantDiscovery";
import {
  hasRestaurantVisual,
  shuffleRestaurantsWithVisuals,
} from "../lib/randomizedRestaurantOrder";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const CATEGORY_POOL = [
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

function candidate(
  id: string,
  category: string,
  overrides: Partial<HomeRestaurantCandidate> = {},
): HomeRestaurantCandidate {
  return {
    id,
    image_url: `https://example.com/${id}.jpg`,
    city: "Genève",
    cuisine_type: category,
    category_names: [category],
    category_slugs: [category],
    latitude: 46.2044,
    longitude: 6.1432,
    rating: 0,
    review_count: 0,
    monthly_reservations: 0,
    monthly_orders: 0,
    promotion_score: 0,
    ...overrides,
  };
}

function makeCandidates(count = 36) {
  return Array.from({ length: count }, (_, index) => candidate(
    `restaurant-${index + 1}`,
    CATEGORY_POOL[index % CATEGORY_POOL.length],
    {
      latitude: 46.2044 + ((index % 5) * 0.001),
      longitude: 6.1432 + ((index % 7) * 0.001),
    },
  ));
}

function ids(restaurants: readonly HomeRestaurantCandidate[]) {
  return restaurants.map((restaurant) => String(restaurant.id));
}

function firstCategories(restaurants: readonly HomeRestaurantCandidate[]) {
  return restaurants.map((restaurant) => String(
    Array.isArray(restaurant.category_slugs) ? restaurant.category_slugs[0] || "" : "",
  ));
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

  it("does not reuse the same restaurant across discovery sections and varies cuisines", () => {
    const restaurants = makeCandidates();
    const personal = restaurants[0];
    const sponsored = {
      ...restaurants[1],
      campaign_id: "campaign-1",
      promo_image: "https://example.com/sponsored.jpg",
    };
    const offers = [
      { ...restaurants[2], promotion_score: 25 },
      { ...restaurants[3], promotion_score: 15 },
    ];

    const sections = buildHomeRestaurantSections({
      candidates: restaurants,
      offerCandidates: offers,
      personalRestaurants: [personal],
      sponsoredRestaurants: [sponsored],
      userCoordinates: { latitude: 46.2044, longitude: 6.1432 },
      radiusKm: 5,
      seed: 12345,
      lunchFocus: true,
    });

    const sectionLists = [
      sections.personalCards,
      sections.sponsoredCards,
      sections.offersCards,
      sections.localCards,
      sections.lunchCards,
      sections.dinnerCards,
      sections.trendingCards,
    ];
    const allIds = sectionLists.flatMap(ids);

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(sections.localCards).toHaveLength(4);
    expect(sections.lunchCards).toHaveLength(4);
    expect(sections.dinnerCards).toHaveLength(4);
    expect(sections.trendingMode).toBe("discover");
    expect(sections.trendingCards).toHaveLength(6);
    expect(new Set(firstCategories(sections.lunchCards)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(firstCategories(sections.dinnerCards)).size).toBeGreaterThanOrEqual(3);
  });

  it("scopes every discovery section to the current 5 km area", () => {
    const nearby = makeCandidates(32);
    const far = candidate("far-away", "pizza", {
      latitude: 47.3769,
      longitude: 8.5417,
      promotion_score: 50,
    });
    const farSponsored = {
      ...far,
      id: "far-sponsored",
      campaign_id: "campaign-far",
      promo_image: "https://example.com/far-sponsored.jpg",
    };

    const sections = buildHomeRestaurantSections({
      candidates: [...nearby, far],
      offerCandidates: [far, { ...nearby[2], promotion_score: 20 }],
      sponsoredRestaurants: [farSponsored],
      userCoordinates: { latitude: 46.2044, longitude: 6.1432 },
      radiusKm: 5,
      seed: 67890,
      lunchFocus: false,
    });

    const discoveryIds = [
      ...ids(sections.localCards),
      ...ids(sections.lunchCards),
      ...ids(sections.dinnerCards),
      ...ids(sections.offersCards),
      ...ids(sections.trendingCards),
      ...ids(sections.sponsoredCards),
      ...ids(sections.mapRestaurants),
    ];

    expect(discoveryIds).not.toContain("far-away");
    expect(discoveryIds).not.toContain("far-sponsored");
  });

  it("does not invent a bons plans section when there is no real promotion signal", () => {
    const restaurants = makeCandidates(24);
    const sections = buildHomeRestaurantSections({
      candidates: restaurants,
      offerCandidates: restaurants.map((restaurant) => ({
        ...restaurant,
        promotion_score: 0,
      })),
      userCoordinates: { latitude: 46.2044, longitude: 6.1432 },
      seed: 9876,
      lunchFocus: true,
    });

    expect(sections.offersCards).toEqual([]);
    expect(restaurants.every((restaurant) => !hasHomeOfferSignal(restaurant))).toBe(true);
  });

  it("uses the trends label only when actual engagement signals exist", () => {
    const restaurants = makeCandidates(30);
    const signaled = restaurants.map((restaurant, index) => index < 4
      ? { ...restaurant, monthly_reservations: index + 1 }
      : restaurant);

    const sections = buildHomeRestaurantSections({
      candidates: signaled,
      userCoordinates: { latitude: 46.2044, longitude: 6.1432 },
      seed: 2468,
      lunchFocus: true,
    });

    expect(sections.trendingMode).toBe("trending");
    expect(sections.trendingCards.length).toBeGreaterThanOrEqual(3);
    expect(sections.trendingCards.every(hasHomeTrendSignal)).toBe(true);
  });

  it("loads the homepage from an image-backed page before splitting it into sections", () => {
    const home = read("src/pages/Index.tsx");

    expect(home).toContain('"search_restaurants_catalog_page"');
    expect(home).toContain("const HOME_CANDIDATE_POOL_LIMIT = 54");
    expect(home).toContain("buildHomeRestaurantSections({");
    expect(home).toContain("userCoordinates,");
    expect(home).toContain("radiusKm: HOME_NEARBY_RADIUS_KM");
    expect(home).toContain("offersCards.length > 0");
    expect(home).toContain('trendingIsSignalBased ? "Tendances en ce moment" : "À découvrir"');
    expect(home).not.toContain("fetchHomeRail");
    expect(home).not.toContain("HOME_RAIL_RANDOM_CANDIDATE_LIMIT");
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
