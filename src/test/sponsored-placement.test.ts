import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getCampaignBudgetWeight,
  getCampaignDeliveryScore,
  orderWeightedCampaigns,
  pickWeightedCampaign,
  prioritizeSponsoredCards,
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

    expect(homePage).toContain("primarySponsoredCards = prioritizeSponsoredCards");
    expect(homePage).toContain("topSlots: 3");
    expect(homePage).not.toContain('<CampaignBanner page="home"');
    expect(searchPage).toContain("prioritizeSponsoredCards(organicSearchResults as any[], sponsoredCards, { topSlots: 3 })");
    expect(searchPage).not.toContain('<CampaignBanner page="search"');
  });
});
