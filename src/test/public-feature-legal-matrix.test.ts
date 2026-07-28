import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FEATURE_DEFINITIONS } from "@/lib/featureCatalog";
import { FAIR_GROWTH_MODULES } from "@/lib/fairGrowth";
import { LEGAL_ACCEPTANCE_VERSION, LEGAL_DOCUMENTS } from "@/lib/legalDocuments";
import { PUBLIC_FEATURE_MATRIX } from "@/lib/publicFeatureMatrix";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public feature, help and legal coverage", () => {
  it("maps every public feature route and every paid Fair Growth module", () => {
    const publicRoutes = FEATURE_DEFINITIONS.flatMap((feature) => feature.routeTargets || [])
      .filter((route) => !route.startsWith("/dashboard"));
    const mappedRoutes = PUBLIC_FEATURE_MATRIX.flatMap((row) => row.routes);
    for (const route of publicRoutes) expect(mappedRoutes).toContain(route);
    for (const module of FAIR_GROWTH_MODULES) {
      expect(PUBLIC_FEATURE_MATRIX.some((row) => row.feature === module.name)).toBe(true);
    }
    expect(PUBLIC_FEATURE_MATRIX.every((row) => row.helpSection && row.legalDocument)).toBe(true);
  });

  it("documents the complete restaurant onboarding and Fair Growth lifecycle", () => {
    const help = read("src/pages/Aide.tsx");
    for (const text of [
      "confirmation email", "sans débit immédiat", "ne vaut pas approbation", "onglets identité et établissement",
      "Google Business", "valeur d'un module de croissance", "fenêtre définie, généralement 90 jours",
      "mettre en pause ou résilier Fair Growth", "fin de la période en cours",
    ]) expect(help).toContain(text);
  });

  it("binds signup receipts and legal pages to exact coherent versions", () => {
    expect(LEGAL_ACCEPTANCE_VERSION).toContain(LEGAL_DOCUMENTS.cgu.version);
    expect(LEGAL_ACCEPTANCE_VERSION).toContain(LEGAL_DOCUMENTS.privacy.version);
    expect(read("src/pages/Auth.tsx")).toContain("legalAcceptance.version");
    expect(read("supabase/functions/submit-signup-application/validation.ts")).toContain(LEGAL_ACCEPTANCE_VERSION);
    expect(read("src/pages/CGU.tsx")).toContain("identifiant exact de la présente version");
  });

  it("keeps every public help/legal page indexable with explicit SEO metadata", () => {
    const pages = [
      ["src/pages/Aide.tsx", "/aide"], ["src/pages/CGU.tsx", "/cgu"],
      ["src/pages/PolitiqueConfidentialite.tsx", "/politique-confidentialite"],
      ["src/pages/Cookies.tsx", "/cookies"], ["src/pages/ConditionsRestaurateurs.tsx", "/conditions-restaurateurs"],
      ["src/pages/APropos.tsx", "/a-propos"],
    ] as const;
    for (const [file, route] of pages) {
      const source = read(file);
      expect(source).toContain("useSeoMeta(");
      expect(source).toContain(`path: "${route}"`);
      expect(source).not.toContain("noindex");
    }
    const help = read("src/pages/Aide.tsx");
    expect(help).toContain('"@type": "FAQPage"');
    expect(help).toContain("acceptedAnswer");
  });

  it("wires all matrix destinations as public routes", () => {
    const app = read("src/App.tsx");
    for (const route of ["/aide", "/cgu", "/politique-confidentialite", "/cookies", "/a-propos", "/packs-restaurateur", "/conditions-restaurateurs", "/restaurateurs/google-business"]) {
      expect(app).toContain(`path="${route}"`);
    }
  });
});
