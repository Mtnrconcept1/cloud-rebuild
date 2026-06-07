import { describe, expect, it } from "vitest";

import { calculateGoogleBusinessSavings } from "@/lib/googleBusinessEconomics";

describe("Google Business restaurant economics", () => {
  it("compares a per-cover model with TOK's fixed 5 CHF per table model", () => {
    const result = calculateGoogleBusinessSavings({
      monthlyTables: 120,
      coversPerTable: 3,
      commissionPerCoverChf: 6.2,
      tokFeePerTableChf: 5,
      monthlyPackFeeChf: 149,
    });

    expect(result.monthlyCovers).toBe(360);
    expect(result.perCoverModelCostChf).toBe(2232);
    expect(result.tokModelCostChf).toBe(749);
    expect(result.monthlySavingsChf).toBe(1483);
    expect(result.annualSavingsChf).toBe(17796);
    expect(result.tokEffectiveCostPerCoverChf).toBe(2.08);
  });

  it("never reports negative savings as a positive gain", () => {
    const result = calculateGoogleBusinessSavings({
      monthlyTables: 10,
      coversPerTable: 2,
      commissionPerCoverChf: 1,
      tokFeePerTableChf: 5,
      monthlyPackFeeChf: 149,
    });

    expect(result.monthlySavingsChf).toBe(-179);
    expect(result.isTokCheaper).toBe(false);
  });
});
