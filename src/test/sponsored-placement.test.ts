import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getCampaignBudgetWeight,
  getCampaignDeliveryScore,
  orderWeightedCampaigns,
  pickWeightedCampaign,
  prioritizeSponsoredCards,
  rotateSponsoredCardsWithinRestaurants,
  selectSponsoredCampaignPlacements,
} from "@/lib/sponsoredPlacement";

const NOW = new Date("2026-06-07T00:00:00.000Z");

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pickWeightedCampaign", () => {
  it("distributes selections according to daily pacing weights", () => {
    const campaigns = [
      { id: "c1", restaurant_id: "r1", total_budget: 20, budget_daily: 2 },
      { id: "c2", restaurant_id: "r1", total_budget: 20, budget_daily: 2 },
      { id: "c3", restaurant_id: "r1", total_budget: 60, budget_daily: 6 },
    ];

    let state = { counts: {}, lastShownOrder: {}, sequence: 0 };
    const picks: string[] = [];

    for (let index = 0; index < 10; index += 1) {
      const result = pickWeightedCampaign(campaigns, state, { now: NOW });
      state = result.state;
      picks.push(String(result.campaign?.id));
    }

    expect(state.counts.c1).toBe(2);
    expect(state.counts.c2).toBe(2);
    expect(state.counts.c3).toBe(6);
    expect(new Set(picks.slice(0, 4)).size).toBeGreaterThan(1);
  });

  it("falls back to budget_daily when total budget is missing", () => {
    const campaigns = [
      { id: "c1", restaurant_id: "r1", budget_daily: 5 },
      { id: "c2", restaurant_id: "r1", budget_daily: 15 },
    ];

    let state = { counts: {}, lastShownOrder: {}, sequence: 0 };
    for (let index = 0; index < 4; index += 1) {
      state = pickWeightedCampaign(campaigns, state, { now: NOW }).state;
    }

    expect(state.counts.c1).toBe(1);
    expect(state.counts.c2).toBe(3);
  });

  it("returns single campaign when only one is eligible", () => {
    const campaigns = [{ id: "c1", restaurant_id: "r1", total_budget: 100 }];
    const result = pickWeightedCampaign(campaigns, undefined, { now: NOW });
    expect(result.campaign?.id).toBe("c1");
    expect(result.state.counts.c1).toBe(1);
  });

  it("returns null when no campaigns are eligible", () => {
    const result = pickWeightedCampaign([]);
    expect(result.campaign).toBeNull();
  });

  it("distributes using __poolWeight when present", () => {
    const campaigns = [
      { id: "c1", restaurant_id: "r1", total_budget: 1000, __poolWeight: 0.1 },
      { id: "c2", restaurant_id: "r2", total_budget: 1, __poolWeight: 0.9 },
    ];

    let state = { counts: {}, lastShownOrder: {}, sequence: 0 };
    for (let index = 0; index < 10; index += 1) {
      state = pickWeightedCampaign(campaigns as any, state, { now: NOW }).state;
    }

    // c2 should dominate despite lower total_budget because __poolWeight is 0.9
    expect(state.counts.c2).toBe(9);
    expect(state.counts.c1).toBe(1);
  });

  it("spreads all eligible campaigns instead of returning only one per pool", () => {
    const campaigns = [
      { id: "short", restaurant_id: "r1", total_budget: 50, starts_at: "2026-06-07T00:00:00Z", ends_at: "2026-06-08T00:00:00Z" },
      { id: "long", restaurant_id: "r2", total_budget: 50, starts_at: "2026-06-07T00:00:00Z", ends_at: "2026-06-27T00:00:00Z" },
      { id: "same-restaurant", restaurant_id: "r1", total_budget: 25, budget_daily: 5 },
    ];

    const result = orderWeightedCampaigns(campaigns, undefined, { now: NOW });

    expect(result.campaigns.map((campaign) => campaign.id)).toEqual(["short", "same-restaurant", "long"]);
    expect(result.state.sequence).toBe(3);
  });
});

describe("getCampaignBudgetWeight", () => {
  it("uses __poolWeight when present and positive", () => {
    const campaign = { id: "c1", total_budget: 500, __poolWeight: 0.75 } as any;
    expect(getCampaignBudgetWeight(campaign)).toBe(0.75);
  });

  it("uses remaining budget divided by remaining days before total budget", () => {
    expect(getCampaignBudgetWeight({
      id: "short",
      total_budget: 50,
      spent: 0,
      starts_at: "2026-06-07T00:00:00Z",
      ends_at: "2026-06-08T00:00:00Z",
    }, { now: NOW })).toBe(50);

    expect(getCampaignBudgetWeight({
      id: "long",
      total_budget: 50,
      spent: 0,
      starts_at: "2026-06-07T00:00:00Z",
      ends_at: "2026-06-27T00:00:00Z",
    }, { now: NOW })).toBe(2.5);

    expect(getCampaignBudgetWeight({ id: "c1", total_budget: 200, __poolWeight: 0 } as any, { now: NOW })).toBe(200);
  });

  it("stops delivery when the daily budget is exhausted today", () => {
    expect(getCampaignBudgetWeight({
      id: "c1",
      total_budget: 100,
      budget_daily: 10,
      daily_spent: 10,
      daily_spent_date: "2026-06-07",
      starts_at: "2026-06-07T00:00:00Z",
      ends_at: "2026-06-17T00:00:00Z",
    }, { now: NOW })).toBe(0);
  });

  it("falls back to budget_daily when total_budget is 0", () => {
    expect(getCampaignBudgetWeight({ id: "c1", total_budget: 0, budget_daily: 30 }, { now: NOW })).toBe(30);
  });

  it("returns 1 as minimum fallback", () => {
    expect(getCampaignBudgetWeight({ id: "c1" }, { now: NOW })).toBe(1);
  });
});

describe("getCampaignDeliveryScore", () => {
  it("combines pacing, relevance, distance, and engagement multipliers", () => {
    expect(getCampaignDeliveryScore({
      id: "c1",
      total_budget: 100,
      spent: 20,
      starts_at: "2026-06-07T00:00:00Z",
      ends_at: "2026-06-15T00:00:00Z",
      relevance_score: 1.5,
      distance_score: 0.8,
      engagement_score: 1.25,
    }, { now: NOW })).toBe(15);
  });
});

describe("prioritizeSponsoredCards", () => {
  it("rotates campaign ordering inside each restaurant group", () => {
    const cards = rotateSponsoredCardsWithinRestaurants(
      [
        { id: "r1", campaign_id: "campaign-a" },
        { id: "r1", campaign_id: "campaign-b" },
        { id: "r2", campaign_id: "campaign-c" },
      ],
      1,
    );

    expect(cards.map((card: any) => card.campaign_id)).toEqual(["campaign-b", "campaign-a", "campaign-c"]);
  });

  it("rotates banner campaign objects grouped by their nested restaurant id", () => {
    const campaigns = rotateSponsoredCardsWithinRestaurants(
      [
        { id: "campaign-a", restaurants: { id: "r1" }, title: "A" },
        { id: "campaign-b", restaurants: { id: "r1" }, title: "B" },
      ] as any[],
      1,
    );

    expect(campaigns.map((campaign: any) => campaign.id)).toEqual(["campaign-b", "campaign-a"]);
  });

  it("rotates multiple active campaigns from the same restaurant across sponsored placements", () => {
    const campaigns = [
      { id: "quirinale-lunch", restaurant_id: "quirinale", total_budget: 50, budget_daily: 10 },
      { id: "quirinale-dinner", restaurant_id: "quirinale", total_budget: 50, budget_daily: 10 },
    ];

    let store = {};
    const firstPlacement = selectSponsoredCampaignPlacements(campaigns, store, {
      page: "home",
      maxSlots: 3,
      now: NOW,
    });
    store = firstPlacement.store;

    const secondPlacement = selectSponsoredCampaignPlacements(campaigns, store, {
      page: "flash_sales",
      maxSlots: 3,
      now: NOW,
    });

    expect(firstPlacement.campaigns).toHaveLength(1);
    expect(secondPlacement.campaigns).toHaveLength(1);
    expect(new Set([
      firstPlacement.campaigns[0].id,
      secondPlacement.campaigns[0].id,
    ])).toEqual(new Set(["quirinale-lunch", "quirinale-dinner"]));
  });

  it("keeps only one visible sponsored campaign per restaurant in the top slots", () => {
    const cards = prioritizeSponsoredCards(
      [
        { id: "r1", name: "Organic R1" },
        { id: "r2", name: "Organic R2" },
        { id: "r3", name: "Organic R3" },
        { id: "r4", name: "Organic R4" },
      ],
      [
        { id: "r1", campaign_id: "campaign-a", name: "Campaign A" },
        { id: "r1", campaign_id: "campaign-b", name: "Campaign B" },
        { id: "r2", campaign_id: "campaign-c", name: "Campaign C" },
        { id: "r3", campaign_id: "campaign-d", name: "Campaign D" },
        { id: "r4", campaign_id: "campaign-e", name: "Campaign E" },
      ] as any[],
      { topSlots: 3 },
    );

    const visibleCampaigns = cards.filter((card: any) => card.campaign_id);

    expect(cards.slice(0, 3).map((card: any) => card.campaign_id)).toEqual(["campaign-a", "campaign-c", "campaign-d"]);
    expect(visibleCampaigns.map((card: any) => card.campaign_id)).toEqual(["campaign-a", "campaign-c", "campaign-d"]);
    expect(new Set(visibleCampaigns.map((card: any) => card.id)).size).toBe(3);
    expect(cards.some((card: any) => card.campaign_id === "campaign-b")).toBe(false);
    expect(cards.some((card: any) => card.campaign_id === "campaign-e")).toBe(false);
  });

  it("can rotate the visible restaurant card campaign when one restaurant has several active campaigns", () => {
    const firstPass = prioritizeSponsoredCards(
      [{ id: "r2", name: "Organic R2" }],
      [
        { id: "r1", campaign_id: "campaign-a", name: "Campaign A" },
        { id: "r1", campaign_id: "campaign-b", name: "Campaign B" },
      ] as any[],
      { topSlots: 1, rotationSeed: 0 },
    );
    const secondPass = prioritizeSponsoredCards(
      [{ id: "r2", name: "Organic R2" }],
      [
        { id: "r1", campaign_id: "campaign-a", name: "Campaign A" },
        { id: "r1", campaign_id: "campaign-b", name: "Campaign B" },
      ] as any[],
      { topSlots: 1, rotationSeed: 1 },
    );

    expect(firstPass[0]).toMatchObject({ id: "r1", campaign_id: "campaign-a" });
    expect(secondPass[0]).toMatchObject({ id: "r1", campaign_id: "campaign-b" });
  });

  it("caps sponsored top slots to three even when a caller asks for more", () => {
    const cards = prioritizeSponsoredCards(
      [{ id: "r4" }, { id: "r5" }],
      [
        { id: "r1", campaign_id: "campaign-a" },
        { id: "r2", campaign_id: "campaign-b" },
        { id: "r3", campaign_id: "campaign-c" },
        { id: "r4", campaign_id: "campaign-d" },
      ] as any[],
      { topSlots: 10 },
    );

    expect(cards.filter((card: any) => card.campaign_id).map((card: any) => card.campaign_id))
      .toEqual(["campaign-a", "campaign-b", "campaign-c"]);
  });

  it("keeps a page organic when sponsored top slots are disabled", () => {
    const cards = prioritizeSponsoredCards(
      [{ id: "r1", name: "Organic" }],
      [{ id: "r2", campaign_id: "campaign-a" }] as any[],
      { topSlots: 0 },
    );

    expect(cards).toEqual([{ id: "r1", name: "Organic" }]);
  });

  it("keeps home and search sponsored inventory inside the first restaurant cards", () => {
    const homePage = readSource("src/pages/Index.tsx");
    const searchPage = readSource("src/pages/Recherche.tsx");
    const banner = readSource("src/components/CampaignBanner.tsx");
    const analytics = readSource("src/lib/analytics.ts");

    expect(homePage).toContain("primarySponsoredCards = prioritizeSponsoredCards");
    expect(homePage).toContain("topSlots: 3");
    expect(homePage).toContain('<CampaignBanner page="home" maxBanners={1} />');
    expect(homePage).toContain('getActiveSponsoredRestaurants("home", "restaurant_cards")');
    expect(searchPage).toContain("prioritizeSponsoredCards(organicSearchResults as any[], sponsoredCards, { topSlots: 3, rotationSeed: sponsoredRotationSeed })");
    expect(searchPage).toContain("rotationSeed: sponsoredRotationSeed");
    expect(searchPage).toContain('<CampaignBanner page="search" maxBanners={1} />');
    expect(searchPage).toContain('getActiveSponsoredRestaurants("search", "restaurant_cards")');
    expect(banner).toContain('getActiveSponsoredRestaurants(page, "banner")');
    expect(banner).toContain("rotateSponsoredCardsWithinRestaurants");
    expect(banner).toContain("rotationSeed");
    expect(banner).toContain('variant="banner"');
    expect(banner).toContain('compactBanner={page === "home" || page === "flash_sales"}');
    expect(banner).toContain("SponsoredRestaurantTemplateCard");
    expect(analytics).toContain("avoidCompanionPlacementDuplicates");
    expect(analytics).toContain("campaignSupportsPlacement(campaign, placement)");
  });

  it("keeps home and flash sales campaign banners compact without clipping their copy", () => {
    const banner = readSource("src/components/CampaignBanner.tsx");
    const templateCard = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");
    const flashSalesPage = readSource("src/pages/VentesFlash.tsx");

    expect(flashSalesPage).toContain('<CampaignBanner page="flash_sales" maxBanners={1} />');
    expect(banner).toContain('compactBanner={page === "home" || page === "flash_sales"}');
    expect(templateCard).toContain("compactBanner");
    expect(templateCard).toContain("min-h-[268px] sm:min-h-[286px] md:min-h-[300px]");
    expect(templateCard).toContain("min-h-[160px] bg-white sm:min-h-[190px] md:min-h-[260px]");
    expect(templateCard).toContain("fullyVisible");
    expect(templateCard).toContain("object-contain");
    expect(templateCard).not.toContain("lg:h-[268px]");
    expect(templateCard).not.toContain("aspect-[16/5]");
    expect(templateCard).not.toContain("lg:min-h-0");
  });

  it("gives tablets the two-column banner layout instead of the tall mobile stack", () => {
    const templateCard = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    // The designed layout and its decorations used to start only at lg, so
    // every tablet fell back to the stacked mobile block with oversized type.
    expect(templateCard).toContain("md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] md:grid-rows-1");
    expect(templateCard).toContain("md:block");
    expect(templateCard).toContain("md:hidden");
    expect(templateCard).not.toContain("lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]");

    // The non-compact banner keeps a useful visual floor while its content
    // remains free to grow beyond it.
    expect(templateCard).toContain("min-h-[400px] sm:min-h-[440px] md:min-h-[360px] lg:min-h-[420px]");
    expect(templateCard).not.toContain("min-h-[520px]");
    expect(templateCard).not.toContain("grid h-full");
    expect(templateCard).toContain("min-w-0 break-words [overflow-wrap:anywhere]");
    expect(templateCard).toContain("whitespace-nowrap");

    // Banner surfaces follow the dark theme instead of staying white.
    expect(templateCard).toContain("dark:bg-slate-900");
    expect(templateCard).toContain("dark:border-slate-900");
  });

  it("keeps the sponsored restaurant badge readable over restaurant photos", () => {
    const visual = readSource("src/components/campaigns/SponsoredVisual.tsx");
    const theme = readSource("src/components/campaigns/sponsoredVisualTheme.ts");
    const restaurantCard = readSource("src/components/RestaurantCard.tsx");

    expect(visual).toContain("backdrop-blur-xl");
    expect(visual).toContain("ring-white/35");
    expect(theme).toContain("ring-2 ring-white/80");
    expect(theme).toContain("bg-slate-950/82 text-white");
    expect(restaurantCard).toContain("absolute left-3 right-14 top-3");
  });

  it("surfaces restaurant promotions in search card time slots", () => {
    const restaurantCard = readSource("src/components/RestaurantCard.tsx");
    const templateCard = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(restaurantCard).toContain("selectRestaurantCardReservationSlots");
    expect(restaurantCard).toContain("openingHours");
    expect(restaurantCard).toContain("supportsReservation");
    expect(restaurantCard).toContain("get_restaurant_reservation_slot_availability");
    expect(restaurantCard).toContain("reservationStep=datetime");
    expect(restaurantCard).toContain("reservationSource=card_slot");
    expect(restaurantCard).not.toContain("function getNextTimeSlots");
    expect(restaurantCard).not.toContain('"12:00"');
    expect(restaurantCard).toContain("discountLabel={discountBadgeLabel || undefined}");
    expect(restaurantCard).toContain("Créneaux promo visibles");
    expect(restaurantCard).toContain("Promo {discountBadgeLabel}");
    expect(templateCard).toContain("const slotDiscountLabel = getSlotDiscountLabel(discountLabel)");
    expect(templateCard).toContain("{slotDiscountLabel}");
    expect(templateCard).toContain("ad-card-spotlight");
  });
});
