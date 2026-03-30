import { describe, expect, it } from "vitest";

import {
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
});

describe("payment helpers", () => {
  it("intersects global and restaurant payment settings", () => {
    const activeFeatures = new Set([
      "payment-card",
      "payment-twint",
      "payment-cash",
    ]);

    expect(getGloballyEnabledPaymentMethods(activeFeatures)).toEqual(["card", "twint", "cash"]);
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
});
