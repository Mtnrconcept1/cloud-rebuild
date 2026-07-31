import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GOOGLE_BUSINESS_PLAN_PRESENTATION,
  GOOGLE_BUSINESS_SERVICE_SCOPE,
} from "@/lib/googleBusinessServiceScope";
import {
  RESTAURANT_PARTNER_CONTRACT_SECTIONS,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
} from "@/lib/restaurantPartnerContract";

const read = (path: string) => readFileSync(path, "utf8");

describe("Google Business commercial scope", () => {
  it("qualifies the service for every Fair Growth subscription", () => {
    expect(Object.keys(GOOGLE_BUSINESS_PLAN_PRESENTATION)).toEqual([
      "starter",
      "business",
      "premium",
      "elite",
    ]);
    expect(GOOGLE_BUSINESS_PLAN_PRESENTATION.starter.status).toBe("Optionnel");
    expect(GOOGLE_BUSINESS_PLAN_PRESENTATION.business.status).toBe("Optionnel");
    expect(GOOGLE_BUSINESS_PLAN_PRESENTATION.premium.status).toBe("Inclus");
    expect(GOOGLE_BUSINESS_PLAN_PRESENTATION.elite.status).toContain("mandat requis");

    const packs = read("src/pages/PacksRestaurateur.tsx");
    expect(packs).toContain("getGoogleBusinessPlanPresentation(planSlug)");
    expect(packs).toContain("Voir le périmètre, les prérequis et les limites");
  });

  it("keeps offer, conditions and signed contract aligned on mandate and Google limits", () => {
    const conditions = read("src/pages/ConditionsRestaurateurs.tsx");
    const contract = RESTAURANT_PARTNER_CONTRACT_SECTIONS.flatMap((section) => section.paragraphs).join(" ");
    const publicPage = read("src/pages/RestaurateursGoogleBusiness.tsx");

    expect(RESTAURANT_PARTNER_CONTRACT_VERSION).toMatch(/v6$/);
    for (const source of [conditions, contract, publicPage]) {
      expect(source.toLowerCase()).toContain("mandat");
      expect(source.toLowerCase()).toContain("classement");
      expect(source.toLowerCase()).toContain("suspend");
    }
    expect(contract).toContain("aucune publication ou synchronisation automatique");
    expect(publicPage).toContain("il ne modifie pas automatiquement Google");
    expect(GOOGLE_BUSINESS_SERVICE_SCOPE.included.join(" ")).toContain("horaires");
    expect(GOOGLE_BUSINESS_SERVICE_SCOPE.optional.join(" ")).toContain("réponses aux avis");
  });

  it("publishes indexable, canonical Service, Offer, FAQ and terms metadata", () => {
    const page = read("src/pages/RestaurateursGoogleBusiness.tsx");
    expect(page).toContain('"@type": "Service"');
    expect(page).toContain('"@type": "Offer"');
    expect(page).toContain('"@type": "FAQPage"');
    expect(page).toContain("termsOfService");
    expect(page).toContain("https://schema.org/LimitedAvailability");
    expect(page).toContain('path: PAGE_PATH');
    expect(page).not.toContain("noindex");
  });
});
