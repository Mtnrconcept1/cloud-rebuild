import { describe, expect, it } from "vitest";

import {
  getCampaignBudgetWeight,
  getCampaignDeliveryScore,
  orderWeightedCampaigns,
  pickWeightedCampaign,
  prioritizeSponsoredCards,
} from "@/lib/sponsoredPlacement";

const NOW = new Date("2026-06-07T00:00:00.000Z");

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
  it("keeps several paid placements from the same restaurant when campaigns differ", () => {
    const cards = prioritizeSponsoredCards(
      [{ id: "r1", name: "Organic" }, { id: "r2", name: "Other" }],
      [
        { id: "r1", campaign_id: "campaign-a", name: "Campaign A" },
        { id: "r1", campaign_id: "campaign-b", name: "Campaign B" },
      ] as any[],
      { topSlots: 3 },
    );

    expect(cards.map((card: any) => card.campaign_id || "organic")).toEqual(["campaign-a", "campaign-b", "organic"]);
  });
});
