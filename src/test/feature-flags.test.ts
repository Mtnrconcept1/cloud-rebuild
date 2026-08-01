import { describe, expect, it } from "vitest";

import {
  buildSafeFallbackFlags,
  FEATURE_ROUTE_DEFINITIONS,
  getFeatureNameForRoute,
  resolveFlags,
  type FeatureFlagRow,
} from "@/lib/featureCatalog";
import {
  getAllowedPaymentMethods,
  getFirstAvailablePaymentMethod,
  getGloballyEnabledPaymentMethods,
} from "@/lib/paymentMethods";

function buildRows(overrides: Record<string, boolean>): FeatureFlagRow[] {
  return Object.entries(overrides).map(([name, isActive]) => ({
    id: name,
    name,
    is_active: isActive,
  }));
}

describe("feature flag catalog", () => {
  function getExactFeatureForRoute(routeTarget: string) {
    return FEATURE_ROUTE_DEFINITIONS.find((definition) => definition.routeTarget === routeTarget)?.featureName || null;
  }

  it("computes effective state from dependencies", () => {
    const flags = resolveFlags(buildRows({
      reservation: true,
      "sur-place": true,
      "zero-attente": true,
    }));
    const zeroWait = flags.find((flag) => flag.name === "zero-attente");

    expect(zeroWait?.explicitEnabled).toBe(true);
    expect(zeroWait?.effectiveEnabled).toBe(true);
    expect(zeroWait?.blockedBy).toEqual([]);
  });

  it("blocks dependent flags when a parent feature is disabled", () => {
    const flags = resolveFlags(buildRows({
      reservation: false,
      "sur-place": true,
      "zero-attente": true,
    }));
    const zeroWait = flags.find((flag) => flag.name === "zero-attente");

    expect(zeroWait?.explicitEnabled).toBe(true);
    expect(zeroWait?.effectiveEnabled).toBe(false);
    expect(zeroWait?.blockedBy).toContain("reservation");
  });

  it("maps guarded routes to their feature names", () => {
    expect(getFeatureNameForRoute("/dashboard/campagnes")).toBe("dashboard-campagnes");
    expect(getFeatureNameForRoute("/commande/abc-123")).toBe("commandes");
    expect(getFeatureNameForRoute("/courier/jobs")).toBe("courier-jobs");
  });

  it("documents all guarded feature route targets explicitly", () => {
    expect(getExactFeatureForRoute("/commande/confirmation")).toBe("commandes");
    expect(getExactFeatureForRoute("/dashboard/compta")).toBe("dashboard-performances");
    expect(getExactFeatureForRoute("/dashboard/factures/entrees")).toBe("dashboard-factures");
    expect(getExactFeatureForRoute("/dashboard/factures/sorties")).toBe("dashboard-factures");
    expect(getExactFeatureForRoute("/admin/compta/entrees")).toBe("admin-compta");
    expect(getExactFeatureForRoute("/admin/compta/sorties")).toBe("admin-compta");
    expect(getExactFeatureForRoute("/admin/platform")).toBe("admin-platform-config");
    expect(getExactFeatureForRoute("/marketing")).toBe("admin-marketing-operations");
    expect(getExactFeatureForRoute("/admin/commandes-reservations")).toBe("admin-operations-center");
    expect(getExactFeatureForRoute("/points-cadeau")).toBe("points-cadeau");
  });

  it("fails closed for sensitive features when Supabase flags cannot be loaded", () => {
    const fallbackFlags = buildSafeFallbackFlags();

    expect(fallbackFlags.find((flag) => flag.name === "commandes")?.effectiveEnabled).toBe(false);
    expect(fallbackFlags.find((flag) => flag.name === "admin-platform-config")?.effectiveEnabled).toBe(false);
    expect(fallbackFlags.find((flag) => flag.name === "dashboard-commandes")?.effectiveEnabled).toBe(false);
    expect(fallbackFlags.filter((flag) => flag.critical).every((flag) => !flag.effectiveEnabled)).toBe(true);
  });

  it("ne connait plus la route Mon pack", () => {
    // Le forfait de 5.- est desormais le seul modele : il n'y a plus de
    // second modele a designer, donc plus de drapeau ni de route.
    expect(getExactFeatureForRoute("/dashboard/pack")).toBeNull();
  });

  it("keeps the admin operations center enabled by default but controllable", () => {
    const enabledFlags = resolveFlags(buildRows({ "admin-operations-center": true }));
    const disabledFlags = resolveFlags(buildRows({ "admin-operations-center": false }));

    expect(enabledFlags.find((flag) => flag.name === "admin-operations-center")?.effectiveEnabled).toBe(true);
    expect(disabledFlags.find((flag) => flag.name === "admin-operations-center")?.effectiveEnabled).toBe(false);
  });

  it("keeps the admin platform config enabled by default but controllable", () => {
    const enabledFlags = resolveFlags(buildRows({ "admin-platform-config": true }));
    const disabledFlags = resolveFlags(buildRows({ "admin-platform-config": false }));

    expect(enabledFlags.find((flag) => flag.name === "admin-platform-config")?.effectiveEnabled).toBe(true);
    expect(disabledFlags.find((flag) => flag.name === "admin-platform-config")?.effectiveEnabled).toBe(false);
  });
});

describe("payment helpers", () => {
  it("intersects global and restaurant payment settings", () => {
    const activeFeatures = new Set([
      "payment-card",
      "payment-twint",
      "payment-postfinance-card",
      "payment-cash",
    ]);

    expect(getGloballyEnabledPaymentMethods(activeFeatures)).toEqual(["twint", "card", "postfinance_card", "cash"]);
    expect(getAllowedPaymentMethods(activeFeatures, ["twint"])).toEqual(["card", "cash"]);
  });

  it("falls back to the first available payment method", () => {
    const activeFeatures = new Set([
      "payment-twint",
      "payment-cash",
    ]);

    expect(getFirstAvailablePaymentMethod(activeFeatures, ["twint"], "card")).toBe("cash");
    expect(getFirstAvailablePaymentMethod(new Set(), [], "card")).toBe("card");
  });

  it("does not expose PostFinance in Stripe Checkout flows", () => {
    const activeFeatures = new Set([
      "payment-postfinance-card",
      "payment-postfinance-efinance",
    ]);

    expect(getAllowedPaymentMethods(activeFeatures, [])).toEqual([]);
    expect(getFirstAvailablePaymentMethod(activeFeatures, [], "postfinance_card")).toBeNull();
  });
});

