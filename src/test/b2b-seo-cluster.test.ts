import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const pages = {
  geneve: "src/pages/RestaurateursGeneve.tsx",
  google: "src/pages/RestaurateursGoogleBusiness.tsx",
  alternative: "src/pages/AlternativeCommissionCouvert.tsx",
} as const;

describe("B2B restaurateur SEO cluster", () => {
  it("keeps each page focused on a distinct commercial intent", () => {
    const geneve = read(pages.geneve);
    const google = read(pages.google);
    const alternative = read(pages.alternative);

    expect(geneve).toContain("La plateforme restaurateur pour transformer la demande locale à Genève");
    expect(geneve).toContain("Trois repères avant de comparer les offres");
    expect(geneve).toContain("Réservations et commandes directes");
    expect(geneve).toContain("Anti-gaspi et ventes flash");
    expect(geneve).toContain("Actualités, campagnes et Miamz");
    expect(geneve).toContain("Onboarding restaurateur");
    expect(geneve).toContain("Ce que TOK regroupe pour un restaurant genevois");
    expect(geneve).toContain("Besoin terrain");
    expect(geneve).toContain("Résultat attendu");

    expect(google).toContain("Transformez votre fiche Google Business en canal direct");
    expect(google).toContain("clics Google Maps");
    expect(google).toContain("Checklist de bascule");
    expect(google).toContain("Réservations issues de Google / mois");
    expect(google).toContain("bouton de réservation traçable");
    expect(google).toContain("Bascule du bouton Google");
    expect(google).toContain("Situation");
    expect(google).toContain("Action TOK");

    expect(alternative).toContain("Commission par couvert : comparez avant de choisir");
    expect(alternative).toContain("coût d'acquisition");
    expect(alternative).toContain("No-shows et changements");
    expect(alternative).toContain("Scénarios chiffrés");
    expect(alternative).toContain("Marge prévisible");
    expect(alternative).toContain("À vérifier");
    expect(alternative).toContain("Avec TOK");

    expect(geneve).not.toContain("Transformez votre fiche Google Business en canal direct");
    expect(google).not.toContain("Scénarios chiffrés");
    expect(alternative).not.toContain("dashboard pensé pour les restaurants genevois");
  });

  it("keeps unique SEO metadata, FAQ schema and cross-links between the three pages", () => {
    const geneve = read(pages.geneve);
    const google = read(pages.google);
    const alternative = read(pages.alternative);

    expect(geneve).toContain("Logiciel restaurateur à Genève : réservations, commandes et marketing | TOK");
    expect(google).toContain("Google Business restaurant : convertir clics Google en réservations | TOK");
    expect(alternative).toContain("Commission par couvert restaurant : alternative et comparatif marge | TOK");

    for (const source of [geneve, google, alternative]) {
      expect(source).toContain('"@type": "FAQPage"');
    }

    expect(geneve).toContain("/restaurateurs/google-business");
    expect(geneve).toContain("/restaurateurs/alternative-commission-couvert");
    expect(google).toContain("/restaurateurs/geneve");
    expect(google).toContain("/restaurateurs/alternative-commission-couvert");
    expect(alternative).toContain("/restaurateurs/geneve");
    expect(alternative).toContain("/restaurateurs/google-business");
  });

  it("aligns static prerender content with the React pages", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    expect(prerender).toContain("Logiciel restaurateur à Genève : réservations, commandes et marketing | TOK");
    expect(prerender).toContain("Plan d'activation Genève");
    expect(prerender).toContain("Cas d'usage locaux");
    expect(prerender).toContain("Lecture simple pour restaurateur");

    expect(prerender).toContain("Google Business restaurant : convertir clics Google en réservations | TOK");
    expect(prerender).toContain("Clics Google");
    expect(prerender).toContain("Coût par conversion");
    expect(prerender).toContain("Bascule du bouton Google");

    expect(prerender).toContain("Commission par couvert restaurant : alternative et comparatif marge | TOK");
    expect(prerender).toContain("No-show et annulations");
    expect(prerender).toContain("Coût d'acquisition");
    expect(prerender).toContain("Question à trancher");
  });
});
