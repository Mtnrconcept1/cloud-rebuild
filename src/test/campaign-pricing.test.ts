import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMPAIGN_PRICING,
  calculateCampaignBaseBudget,
  calculateCampaignTotalCost,
  campaignSupportsPlacement,
  estimateCampaignPlan,
  getCampaignPlacementCostMultiplier,
  getCampaignEventUnitCost,
  getCampaignObservedMetrics,
  getCampaignPricing,
  normalizeCampaignPlacementSelection,
  projectCampaignBenchmarkOutcomes,
  recommendCampaignStrategy,
} from "@/lib/campaignPricing";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

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

  it("normalizes placement options and prices banner premiums", () => {
    const placements = normalizeCampaignPlacementSelection({
      banner: true,
      restaurant_cards: true,
    }, "boost");

    expect(placements).toEqual({ banner: true, restaurant_cards: true });
    expect(getCampaignPlacementCostMultiplier(placements)).toBe(1.35);
    expect(calculateCampaignTotalCost(100, placements)).toBe(135);
    expect(calculateCampaignBaseBudget(135, placements)).toBe(100);
  });

  it("keeps legacy campaign type defaults for display placement support", () => {
    expect(campaignSupportsPlacement({ type: "banner", channels: {} }, "banner")).toBe(true);
    expect(campaignSupportsPlacement({ type: "boost", channels: {} }, "restaurant_cards")).toBe(true);
    expect(campaignSupportsPlacement({ type: "push", channels: {} }, "restaurant_cards")).toBe(false);
    expect(campaignSupportsPlacement({ type: "push", channels: { banner: true } }, "banner")).toBe(true);
  });

  it("keeps campaign portal authoritative for placement-priced campaign budgets", () => {
    const portal = readSource("supabase/functions/campaign-portal/index.ts");
    const sharedPricing = readSource("supabase/functions/_shared/campaign-pricing.ts");

    expect(portal).toContain("sanitizeCampaignChannels");
    expect(portal).toContain("calculateCampaignTotalCost(baseBudget, channels, type)");
    expect(portal).toContain("channels,");
    expect(sharedPricing).toContain("normalizeCampaignPlacementSelection");
    expect(sharedPricing).toContain("banner: 0.35");
  });

  it("requires restaurant campaigns to reserve TOK credits instead of opening Stripe checkout", () => {
    const portal = readSource("supabase/functions/campaign-portal/index.ts");
    const checkout = readSource("supabase/functions/create-checkout/index.ts");
    const socialBoost = readSource("supabase/functions/create-social-post-boost/index.ts");
    const boostRpc = readSource("supabase/migrations/20260728173500_actualites_boost_atomic_media.sql");
    const dashboard = readSource("src/pages/dashboard/DashboardCampagnes.tsx");
    const paymentMethods = readSource("src/lib/paymentMethods.ts");

    expect(portal).toContain('"credits"');
    expect(portal).toContain("get_restaurant_credit_usage");
    expect(portal).toContain("getCampaignCreditBalance");
    expect(portal).toContain("Les campagnes se reglent uniquement avec les credits TOK");
    expect(portal).toContain("Credits campagnes insuffisants");
    expect(portal).toContain("paid_amount: creditsBudget");

    expect(checkout).toContain("Les campagnes se reglent uniquement avec les credits TOK");

    // Depuis #494, la campagne n'est plus insérée par la fonction Edge mais par
    // la RPC atomique, pour qu'un débit de crédits sans campagne — ou l'inverse —
    // devienne impossible. L'invariant « les campagnes se règlent en crédits TOK,
    // jamais par carte » n'a pas changé : il est seulement descendu en SQL, et
    // c'est donc là qu'il faut le vérifier.
    expect(socialBoost).toContain("get_restaurant_credit_usage");
    expect(socialBoost).toContain("create_social_post_boost_atomic");
    expect(socialBoost).toContain('payment_method: "credits"');
    expect(socialBoost).not.toContain('payment_method: "card"');

    expect(boostRpc).toContain("payment_method,");
    expect(boostRpc).toContain("payment_status,");
    expect(boostRpc).toContain("'credits',");
    expect(boostRpc).toContain("'paid',");
    expect(boostRpc).toContain("'active',");
    expect(boostRpc).not.toContain("'card'");

    expect(dashboard).toContain('const CAMPAIGN_PAYMENT_METHOD = "credits"');
    expect(dashboard).toContain("Recharger mes credits");
    expect(dashboard).toContain("attendez le prochain renouvellement");
    expect(dashboard).toContain("Utiliser les crédits TOK");
    expect(dashboard).toContain("Le budget de campagne a été réservé");
    expect(dashboard).not.toContain("PaymentMethodSelector");
    expect(dashboard).not.toContain('"create-checkout"');

    expect(paymentMethods).toContain('| "credits"');
    expect(paymentMethods).toContain('Exclude<PaymentMethodId, "credits">');
  });
});
