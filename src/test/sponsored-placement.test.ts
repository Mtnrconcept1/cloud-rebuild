import { describe, expect, it } from "vitest";

import { pickWeightedCampaign } from "@/lib/sponsoredPlacement";

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
});
