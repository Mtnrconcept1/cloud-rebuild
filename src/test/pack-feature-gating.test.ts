import { describe, expect, it } from "vitest";

import {
  computeDisabledFeatures,
  computeEnabledFeatures,
  getPackServiceFeatureMap,
  isEliteRestaurantSubscription,
  isPremiumOrEliteRestaurantSubscription,
  type GatableFeatureKey,
} from "@/lib/packFeatureGating";

describe("packFeatureGating", () => {
  it("unlocks social news when a pack includes social media setup", () => {
    const enabled = computeEnabledFeatures(["social_media_setup"]);

    expect(enabled).toContain("dashboard-reseaux-sociaux");
    expect(enabled).toContain("dashboard-actualites");
    expect(computeDisabledFeatures(["social_media_setup"])).not.toContain("dashboard-actualites");
  });

  it("keeps pack, support, and overview always enabled", () => {
    expect(computeEnabledFeatures([])).toEqual([
      "dashboard-overview",
      "dashboard-support",
      "dashboard-pack",
    ]);
  });

  it("exposes every service mapping without unknown dashboard keys", () => {
    const allKnown = new Set<GatableFeatureKey>([
      "dashboard-overview",
      "dashboard-advisor",
      "dashboard-restaurant",
      "dashboard-menu",
      "dashboard-photos",
      "dashboard-commandes",
      "dashboard-reservations",
      "dashboard-performances",
      "dashboard-comparaison",
      "dashboard-avis",
      "dashboard-crm",
      "dashboard-campagne-overview",
      "dashboard-reseaux-sociaux",
      "dashboard-actualites",
      "dashboard-campagnes",
      "dashboard-factures",
      "dashboard-offres",
      "dashboard-ventes-flash",
      "dashboard-formules",
      "dashboard-service",
      "dashboard-plan-salle",
      "dashboard-support",
      "dashboard-pack",
    ]);

    for (const features of Object.values(getPackServiceFeatureMap())) {
      for (const feature of features) {
        expect(allKnown.has(feature)).toBe(true);
      }
    }
  });

  it("computes the paid restaurant disabled features for an Essentiel pack", () => {
    const disabled = computeDisabledFeatures([
      "mise_en_place",
      "menu_creation",
      "product_photography",
      "social_media_setup",
    ]);

    expect(disabled).not.toContain("dashboard-photos");
    expect(disabled).not.toContain("dashboard-reseaux-sociaux");
    expect(disabled).not.toContain("dashboard-actualites");
    expect(disabled).toContain("dashboard-plan-salle");
    expect(disabled).toContain("dashboard-campagnes");
  });

  it("unlocks dashboard features from the active restaurant subscription as well as the launch pack", () => {
    const enabled = computeEnabledFeatures([], {
      subscription: {
        plan: "premium",
        status: "active",
        features: ["Insights compta et performance", "Assistant IA avance"],
      },
    });

    expect(enabled).toContain("dashboard-advisor");
    expect(enabled).toContain("dashboard-performances");
    expect(enabled).toContain("dashboard-comparaison");
    expect(enabled).toContain("dashboard-factures");
  });

  it("does not unlock subscription features when the restaurant subscription is inactive", () => {
    const disabled = computeDisabledFeatures([], {
      subscription: {
        plan: "elite",
        status: "cancelled",
        features: ["Operations Center premium"],
      },
    });

    expect(disabled).toContain("dashboard-plan-salle");
    expect(disabled).toContain("dashboard-service");
    expect(disabled).toContain("dashboard-campagnes");
  });

  it("opens restaurant services on every active subscription and reserves CRM/news to Premium and Elite", () => {
    const starterEnabled = computeEnabledFeatures([], {
      subscription: {
        plan: "starter",
        status: "active",
      },
    });
    const proEnabled = computeEnabledFeatures([], {
      subscription: {
        plan: "pro",
        status: "active",
      },
    });
    const premiumEnabled = computeEnabledFeatures([], {
      subscription: {
        plan: "premium",
        status: "active",
      },
    });
    const eliteEnabled = computeEnabledFeatures([], {
      subscription: {
        plan: "elite",
        status: "active",
      },
    });

    for (const feature of ["dashboard-campagnes", "dashboard-plan-salle", "dashboard-photos", "dashboard-service"]) {
      expect(starterEnabled).toContain(feature);
      expect(proEnabled).toContain(feature);
    }

    expect(starterEnabled).not.toContain("dashboard-crm");
    expect(starterEnabled).not.toContain("dashboard-actualites");
    expect(proEnabled).not.toContain("dashboard-crm");
    expect(proEnabled).not.toContain("dashboard-actualites");
    expect(premiumEnabled).toContain("dashboard-crm");
    expect(premiumEnabled).toContain("dashboard-actualites");
    expect(eliteEnabled).toContain("dashboard-crm");
    expect(eliteEnabled).toContain("dashboard-actualites");
    expect(isEliteRestaurantSubscription({ plan: "premium", status: "active" })).toBe(false);
    expect(isEliteRestaurantSubscription({ plan: "elite", status: "active" })).toBe(true);
    expect(isEliteRestaurantSubscription({ plan: "elite", status: "cancelled" })).toBe(false);
    expect(isPremiumOrEliteRestaurantSubscription({ plan: "premium", status: "active" })).toBe(true);
    expect(isPremiumOrEliteRestaurantSubscription({ plan: "elite", status: "active" })).toBe(true);
    expect(isPremiumOrEliteRestaurantSubscription({ plan: "pro", status: "active" })).toBe(false);
  });
});
