import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getRestaurantOperationalStatePatch,
  isRestaurantOperationallyActive,
} from "@/lib/restaurantAdminState";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("restaurateur onboarding reliability", () => {
  it("uses one canonical restaurant activation state", () => {
    expect(getRestaurantOperationalStatePatch("active")).toEqual({
      status: "active",
      is_active: true,
    });
    expect(getRestaurantOperationalStatePatch("suspended")).toEqual({
      status: "suspended",
      is_active: false,
    });
    expect(
      isRestaurantOperationallyActive({ status: "active", is_active: false }),
    ).toBe(false);
    expect(
      isRestaurantOperationallyActive({ status: "active", is_active: true }),
    ).toBe(true);

    const admin = read("src/pages/admin/AdminRestaurants.tsx");
    const migration = read(
      "supabase/migrations/20260802000000_restaurateur_onboarding_reliability.sql",
    );
    expect(admin).not.toContain("<span>Actif</span>");
    expect(admin).toContain("RESTAURANT_OPERATIONAL_STATUS_OPTIONS");
    expect(migration).toContain("normalize_restaurant_operational_state");
    expect(migration).toContain("restaurants_operational_state_consistent");
    expect(migration).toContain("application.status = 'approved'");
  });

  it("restores the privileged form after confirmation without persisting a password", () => {
    const auth = read("src/pages/Auth.tsx");
    const recovery = read("src/lib/privilegedSignupRecovery.ts");

    expect(auth).toContain("buildSignupConfirmationRedirect");
    expect(auth).toContain("getCanonicalAuthCallbackHref");
    expect(auth).toContain("savePrivilegedSignupRecoveryDraft");
    expect(auth).toContain("loadPrivilegedSignupRecoveryDraft");
    expect(auth).toContain("recoveredForm");
    expect(auth).toContain("recoveredDocuments");
    expect(auth).toContain("J’ai confirmé mon email");
    expect(recovery).toContain(
      'DATABASE_NAME = "tok-privileged-signup-recovery"',
    );
    expect(recovery).not.toMatch(/password\s*:/i);
  });

  it("uses card-specific recovery copy without suggesting a debit", () => {
    const dashboard = read("src/pages/dashboard/DashboardHome.tsx");
    expect(dashboard).toContain("Enregistrement de carte en cours");
    expect(dashboard).toContain("Aucun débit n’a été créé");
    expect(dashboard).not.toContain("Paiement en cours de vérification");
  });

  it("sets the currency required by Stripe setup-mode checkout", () => {
    const checkout = read("supabase/functions/create-checkout/index.ts");
    expect(checkout).toContain('sessionParams.mode = "setup"');
    expect(checkout).toContain(
      "sessionParams.currency = CHECKOUT_CURRENCY.toLowerCase()",
    );
    expect(
      checkout.indexOf(
        "sessionParams.currency = CHECKOUT_CURRENCY.toLowerCase()",
      ),
    ).toBeGreaterThan(checkout.indexOf('sessionParams.mode = "setup"'));
  });
});
