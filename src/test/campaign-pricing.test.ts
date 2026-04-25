import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMPAIGN_PRICING,
  getCampaignEventUnitCost,
  getCampaignObservedMetrics,
  getCampaignPricing,
  projectCampaignBenchmarkOutcomes,
} from "@/lib/campaignPricing";

describe("campaign pricing helpers", () => {
  it("falls back to default pricing when rates are absent", () => {
    expect(getCampaignPricing()).toEqual(DEFAULT_CAMPAIGN_PRICING);
    expect(getCampaignPricing({ cpmRate: 0, cpcRate: 0, conversionRate: 0 })).toEqual(DEFAULT_CAMPAIGN_PRICING);
  });

  it("computes billable unit costs for each sponsored event", () => {
    expect(getCampaignEventUnitCost("impression", DEFAULT_CAMPAIGN_PRICING)).toBe(0.008);
    expect(getCampaignEventUnitCost("click", DEFAULT_CAMPAIGN_PRICING)).toBe(0.85);
    expect(getCampaignEventUnitCost("conversion", DEFAULT_CAMPAIGN_PRICING)).toBe(9);
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

  it("projects benchmark outcomes from a budget", () => {
    expect(projectCampaignBenchmarkOutcomes(120, DEFAULT_CAMPAIGN_PRICING)).toMatchObject({
      projectedImpressions: 3539,
      projectedClicks: 77,
      projectedConversions: 2.8,
      blendedCostPerThousand: 33.91,
    });
  });
});
