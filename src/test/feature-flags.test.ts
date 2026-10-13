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
import { getEffectiveFeatureFlagSet } from "../../supabase/functions/_shared/feature-flags";

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

  it("uses La Tok d’Or for the historical server flag label without changing its state", () => {
    const legacyRow: FeatureFlagRow = {
      id: "chefs-table",
      name: "chefs-table",
      label: "Chefs Table",
      is_active: true,
    };
    const golden = resolveFlags([legacyRow]).find((flag) => flag.name === "chefs-table");
    expect(golden?.label).toBe("La Tok d’Or");
    expect(golden?.explicitEnabled).toBe(true);
    expect(golden?.effectiveEnabled).toBe(true);
  });

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

  it("keeps pickup, reservations and checkout history independent of delivery flags", () => {
    const flags = resolveFlags(buildRows({
      commandes: false, livraison: false, emporter: true, reservation: true,
      "sur-place": true, "zero-attente": true, "chefs-table": true,
      "payment-card": true, "payment-twint": true,
      "dashboard-restaurateur": true, "dashboard-commandes": true,
    }));
    const enabled = (name: string) => flags.find((flag) => flag.name === name)?.effectiveEnabled;
    expect(enabled("commandes")).toBe(false);
    for (const name of ["emporter", "reservation", "zero-attente", "chefs-table", "payment-card", "payment-twint", "dashboard-commandes"]) {
      expect(enabled(name)).toBe(true);
    }
  });

  it("requires delivery for new delivered orders, without blocking pickup", () => {
    const flags = resolveFlags(buildRows({ commandes: true, livraison: false, emporter: true }));
    expect(flags.find((flag) => flag.name === "commandes")?.effectiveEnabled).toBe(false);
    expect(flags.find((flag) => flag.name === "emporter")?.effectiveEnabled).toBe(true);
  });

  it("maps guarded routes to their feature names", () => {
    expect(getFeatureNameForRoute("/dashboard/campagnes")).toBe("dashboard-campagnes");
    expect(getFeatureNameForRoute("/commande/abc-123")).toBeNull();
    expect(getFeatureNameForRoute("/courier/jobs")).toBe("courier-jobs");
  });

  it("documents all guarded feature route targets explicitly", () => {
    expect(getExactFeatureForRoute("/commande/confirmation")).toBeNull();
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


describe("Edge Function flags — delivery-only commandes", () => {
  const resolveEdgeFlags = async (overrides: Record<string, boolean>) => {
    const rows = Object.entries(overrides).map(([name, is_active]) => ({ name, is_active }));
    return getEffectiveFeatureFlagSet({
      from(table: string) {
        if (table !== "feature_flags") throw new Error("Unexpected table");
        return { select: async () => ({ data: rows, error: null }) };
      },
    });
  };

  it("does not treat pickup as a reason to enable delivery orders", async () => {
    const active = await resolveEdgeFlags({
      commandes: true,
      livraison: false,
      emporter: true,
      reservation: true,
      "sur-place": true,
      "zero-attente": true,
      "payment-card": true,
      "payment-twint": true,
    });

    expect(active.has("commandes")).toBe(false);
    expect(active.has("emporter")).toBe(true);
    expect(active.has("reservation")).toBe(true);
    expect(active.has("zero-attente")).toBe(true);
    expect(active.has("payment-card")).toBe(true);
    expect(active.has("payment-twint")).toBe(true);
  });

  it("allows delivery orders only when both delivery and commandes are enabled", async () => {
    const enabled = await resolveEdgeFlags({ commandes: true, livraison: true, emporter: false });
    const paused = await resolveEdgeFlags({ commandes: false, livraison: true, emporter: true });

    expect(enabled.has("commandes")).toBe(true);
    expect(enabled.has("emporter")).toBe(false);
    expect(paused.has("commandes")).toBe(false);
    expect(paused.has("emporter")).toBe(true);
  });

  it("fails closed if the remote flag read fails", async () => {
    const adminClient = {
      from: () => ({ select: async () => ({ data: null, error: { message: "feature_flags unavailable" } }) }),
    };
    await expect(getEffectiveFeatureFlagSet(adminClient)).rejects.toThrow("feature_flags unavailable");
  });
});
