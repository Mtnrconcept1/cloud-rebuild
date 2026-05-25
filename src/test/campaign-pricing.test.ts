import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMPAIGN_PRICING,
  estimateCampaignPlan,
  getCampaignEventUnitCost,
  getCampaignObservedMetrics,
  getCampaignPricing,
  projectCampaignBenchmarkOutcomes,
  recommendCampaignStrategy,
} from "@/lib/campaignPricing";

describe("campaign pricing helpers", () => {
  it("falls back to strategy pricing when rates are absent", () => {
    expect(getCampaignPricing()).toEqual(DEFAULT_CAMPAIGN_PRICING);
    expect(getCampaignPricing({ cpmRate: 0, cpcRate: 0, conversionRate: 0 }, "visibility")).toEqual({
      cpmRate: 6.5,
      cpcRate: 1.05,
      conversionRate: 12,
    });
  });

  it("computes billable unit costs for each sponsored event", () => {
    expect(getCampaignEventUnitCost("impression", DEFAULT_CAMPAIGN_PRICING)).toBe(0.0095);
    expect(getCampaignEventUnitCost("click", DEFAULT_CAMPAIGN_PRICING)).toBe(0.95);
    expect(getCampaignEventUnitCost("conversion", DEFAULT_CAMPAIGN_PRICING)).toBe(7.5);
    expect(getCampaignEventUnitCost("conversion", null, true, "visibility")).toBe(12);
    expect(getCampaignEventUnitCost("click", DEFAULT_CAMPAIGN_PRICING, false)).toBe(0);
  });

  it("derives observed effective costs from campaign delivery", () => {
    expect(getCampaignObservedMetrics({
      impressions: 2000,
      clicks: 50,
      conversions: 4,
      spent: 34,
    })).toEqual({
      effectiveCpm: 17,
      effectiveCpc: 0.68,
      effectiveCpa: 8.5,
    });
  });

  it("estimates reach and outcomes from total budget, duration, and strategy", () => {
    expect(estimateCampaignPlan({
      totalBudgetChf: 120,
      durationDays: 10,
      strategy: "traffic",
    })).toMatchObject({
      dailyBudget: 12,
      estimatedPeopleReached: 1928,
      projectedImpressions: 3161,
      projectedClicks: 88,
      projectedConversions: 2.8,
      blendedCostPerThousand: 37.96,
      estimatedCpc: 1.36,
      estimatedCpa: 42.86,
    });
  });

  it("keeps the old benchmark projection helper aligned with the traffic estimator", () => {
    expect(projectCampaignBenchmarkOutcomes(120, DEFAULT_CAMPAIGN_PRICING)).toMatchObject({
      projectedImpressions: 2802,
      projectedClicks: 78,
      projectedConversions: 2.5,
      blendedCostPerThousand: 42.82,
    });
  });

  it("recommends a strategy from placement intent", () => {
    expect(recommendCampaignStrategy({ type: "banner", targetPages: ["home"] })).toBe("visibility");
    expect(recommendCampaignStrategy({ type: "boost", targetPages: ["search"] })).toBe("traffic");
    expect(recommendCampaignStrategy({ type: "boost", targetPages: ["flash_sales"] })).toBe("conversion");
  });
});
