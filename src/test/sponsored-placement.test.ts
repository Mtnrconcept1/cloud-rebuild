import { describe, expect, it } from "vitest";

import { getCampaignBudgetWeight, pickWeightedCampaign } from "@/lib/sponsoredPlacement";

describe("pickWeightedCampaign", () => {
  it("distributes selections according to budget weights", () => {
    const campaigns = [
      { id: "c1", restaurant_id: "r1", total_budget: 20 },
      { id: "c2", restaurant_id: "r1", total_budget: 20 },
      { id: "c3", restaurant_id: "r1", total_budget: 60 },
    ];

    let state = { counts: {}, lastShownOrder: {}, sequence: 0 };
    const picks: string[] = [];

    for (let index = 0; index < 10; index += 1) {
      const result = pickWeightedCampaign(campaigns, state);
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
      state = pickWeightedCampaign(campaigns, state).state;
    }

    expect(state.counts.c1).toBe(1);
    expect(state.counts.c2).toBe(3);
  });

  it("returns single campaign when only one is eligible", () => {
    const campaigns = [{ id: "c1", restaurant_id: "r1", total_budget: 100 }];
    const result = pickWeightedCampaign(campaigns);
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
      state = pickWeightedCampaign(campaigns as any, state).state;
    }

    // c2 should dominate despite lower total_budget because __poolWeight is 0.9
    expect(state.counts.c2).toBe(9);
    expect(state.counts.c1).toBe(1);
  });
});

describe("getCampaignBudgetWeight", () => {
  it("uses __poolWeight when present and positive", () => {
    const campaign = { id: "c1", total_budget: 500, __poolWeight: 0.75 } as any;
    expect(getCampaignBudgetWeight(campaign)).toBe(0.75);
  });

  it("falls back to total_budget when __poolWeight is 0 or missing", () => {
    expect(getCampaignBudgetWeight({ id: "c1", total_budget: 200 })).toBe(200);
    expect(getCampaignBudgetWeight({ id: "c1", total_budget: 200, __poolWeight: 0 } as any)).toBe(200);
  });

  it("falls back to budget_daily when total_budget is 0", () => {
    expect(getCampaignBudgetWeight({ id: "c1", total_budget: 0, budget_daily: 30 })).toBe(30);
  });

  it("returns 1 as minimum fallback", () => {
    expect(getCampaignBudgetWeight({ id: "c1" })).toBe(1);
  });
});
