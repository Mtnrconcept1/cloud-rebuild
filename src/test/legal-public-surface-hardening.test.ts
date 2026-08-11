import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS,
  FAIR_GROWTH_PLANS,
  RESERVATION_FLAT_FEE_CHF,
} from "@/lib/fairGrowth";
import { isHelpCategoryVisible, isHelpQuestionVisible } from "@/lib/featureVisibility";

// These checks intentionally inspect source copy as well as runtime constants:
// contractual/internal wording must not silently re-enter a public surface.
// They also keep the versions accepted by onboarding synchronized with the
// versions actually displayed and signed by restaurateurs.
const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public legal and commercial surface", () => {
  it("exposes a flat 90/10 marketplace model for every restaurant plan", () => {
    expect(FAIR_GROWTH_MARKETPLACE_COMMISSION_BPS).toBe(1000);
    expect(RESERVATION_FLAT_FEE_CHF).toBe(5);
    expect(FAIR_GROWTH_PLANS.every((plan) => plan.marketplaceCommissionBps === 1000)).toBe(true);

    for (const path of [
      "src/pages/ConditionsRestaurateurs.tsx",
      "src/lib/restaurantPartnerContract.ts",
      "src/pages/PacksRestaurateur.tsx",
      "docs/legal/03-abonnements-commissions.md",
    ]) {
      const text = source(path);
      expect(text).not.toMatch(/9[,.]9\s*%|8[,.]9\s*%|7[,.]9\s*%|6[,.]9\s*%/i);
      expect(text).not.toMatch(/plafonn[^\n]*7\s*%/i);
    }
  });

  it("keeps internal production and developer allocation out of restaurant-facing contract copy", () => {
    const contract = source("src/lib/restaurantPartnerContract.ts");
    const restaurantTerms = source("src/pages/ConditionsRestaurateurs.tsx");

    for (const text of [contract, restaurantTerms]) {
      expect(text).not.toMatch(/le développeur/i);
      expect(text).not.toMatch(/admin\.thetok\.ch/i);
      expect(text).not.toMatch(/politiques?\s+RLS/i);
      expect(text).not.toMatch(/feature\s+flag/i);
      expect(text).not.toMatch(/configuration\s+administrateur/i);
    }

    expect(contract).toContain("restaurant reçoit 90%");
    expect(contract).toContain("TOK conserve 10%");
  });

  it("does not ship developer allocation constants in the public fair-growth module", () => {
    const clientFinance = source("src/lib/fairGrowth.ts");
    expect(clientFinance).not.toMatch(/developer_order_bps|developerShareCents|tokNetRevenueCents/i);
  });

  it("keeps delivery and courier journeys fail-closed while takeaway stays enabled", () => {
    const catalog = source("src/lib/featureCatalog.ts");
    const clientFlags = source("src/lib/featureFlags.ts");
    const serverFlags = source("supabase/functions/_shared/feature-flags.ts");

    expect(catalog).toMatch(/name:\s*"livraison"[\s\S]*?defaultEnabled:\s*false/);
    expect(catalog).toMatch(/name:\s*"espace-livreur"[\s\S]*?defaultEnabled:\s*false/);
    expect(clientFlags).toMatch(/livraison:\s*false,[\s\S]*?emporter:\s*true/);
    expect(serverFlags).toMatch(/livraison:\s*\{\s*defaultEnabled:\s*false\s*\}/);
  });

  it("hides delivery help copy when the delivery feature is disabled", () => {
    const active = new Set(["commandes", "emporter", "reservation", "tok-one"]);
    expect(isHelpCategoryVisible("delivery", active)).toBe(true);
    expect(
      isHelpQuestionVisible(
        "delivery",
        "Quelle est la différence entre livraison et retrait à emporter ?",
        "En livraison, le repas est apporté à votre adresse.",
        active,
      ),
    ).toBe(false);
    expect(
      isHelpQuestionVisible(
        "delivery",
        "Comment choisir une heure de retrait ?",
        "Sélectionnez À emporter et choisissez un créneau disponible.",
        active,
      ),
    ).toBe(true);
  });

  it("does not leak internal admin routes or implementation details through help SEO/copy", () => {
    const help = source("src/pages/Aide.tsx");
    expect(help).toContain('"@type": "FAQPage"');
    expect(help).toContain("visibleFaqSections.flatMap");
    expect(help).not.toContain("/admin/tok-connect");
    expect(help).not.toContain("contrôles côté Edge Function");
    expect(help).not.toContain("Les fonctions désactivées côté admin");
    expect(help).not.toContain("Idempotency-Key");
    expect(help).not.toContain("X-TOK-Signature");
    expect(source("src/pages/Cookies.tsx")).not.toContain("maintenu dans le code source");
  });

  it("keeps Tok One public copy free of active delivery promises", () => {
    const tokOne = source("src/pages/TokOne.tsx");
    expect(tokOne).not.toContain("Livraison offerte");
    expect(tokOne).not.toContain("bénéfice livraison");
    expect(tokOne).not.toContain("Tok One | Livraison offerte");
    expect(tokOne).toContain("price_monthly: 9.9");
    expect(tokOne).toContain("price_yearly: 89.9");
  });

  it("keeps restaurant signup validation on the August legal versions", () => {
    const validation = source("supabase/functions/submit-signup-application/validation.ts");
    expect(validation).toContain(
      'RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-2026-08-v7"',
    );
    expect(validation).toContain(
      'LEGAL_ACCEPTANCE_VERSION = "cgu-2026-08-v5+privacy-2026-08-v5"',
    );
    expect(validation).not.toContain("TOK-CH-RP-2026-07-v6");
    expect(validation).not.toContain("cgu-2026-07-v4+privacy-2026-07-v4");
  });

  it("moves restaurant subscription internals behind a safe RPC", () => {
    const migration = source("supabase/migrations/20260811070000_flat_marketplace_pickup_privacy.sql");
    expect(migration).toContain("get_my_restaurant_ai_subscriptions");
    expect(migration).toContain("REVOKE SELECT ON TABLE public.restaurant_subscription_plans FROM anon, authenticated");
    expect(migration).toContain("restaurant_ai_subscriptions_admin_select");
    expect(migration).toContain("reservation_fee_charges_admin_select");
    expect(migration).toContain("marketplace_commission_bps = 1000");
  });
});
