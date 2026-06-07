import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const publicLegalPages = [
  "src/pages/CGU.tsx",
  "src/pages/PolitiqueConfidentialite.tsx",
  "src/pages/Aide.tsx",
  "src/pages/APropos.tsx",
];

describe("legal Miamz and sponsored content readiness", () => {
  it("keeps public legal and help pages in readable UTF-8 French", () => {
    for (const path of publicLegalPages) {
      const content = read(path);

      for (const brokenEncoding of ["Ã", "Â", "â€”", "â€™", "â€œ", "â€", "�"]) {
        expect(content, `${path} contains ${brokenEncoding}`).not.toContain(brokenEncoding);
      }
    }
  });

  it("documents Miamz value, expiry, donations and refund adjustments in public legal copy", () => {
    const cgu = read("src/pages/CGU.tsx");
    const miamz = read("src/pages/MiamzSolidaires.tsx");

    for (const expected of [
      "Les Miamz ne constituent pas une monnaie",
      "sans valeur en espèces",
      "durée de validité",
      "dons solidaires",
      "annulation, remboursement, fraude, abus ou erreur technique",
      "tables VIP",
    ]) {
      expect(cgu).toContain(expected);
    }

    for (const expected of [
      "non convertibles en espèces",
      "durée de validité affichée",
      "preuve de redistribution",
      "annulation ou remboursement",
    ]) {
      expect(miamz).toContain(expected);
    }
  });

  it("covers sponsored posts and AI photo responsibilities in legal and privacy pages", () => {
    const cgu = read("src/pages/CGU.tsx");
    const privacy = read("src/pages/PolitiqueConfidentialite.tsx");

    for (const expected of [
      "campagnes sponsorisées",
      "photos générées ou retouchées par IA",
      "ne doivent pas induire les utilisateurs en erreur",
      "post ne doit être présenté comme sponsorisé",
      "budget quotidien",
    ]) {
      expect(cgu).toContain(expected);
    }

    for (const expected of [
      "Données d'usage IA",
      "OpenAI",
      "scores d'intérêt",
      "Réseaux sociaux restaurateur",
      "jetons push",
    ]) {
      expect(privacy).toContain(expected);
    }
  });

  it("explains recent product additions in FAQ and About pages", () => {
    const aide = read("src/pages/Aide.tsx");
    const about = read("src/pages/APropos.tsx");

    for (const expected of [
      "posts sauvegardés",
      "Plus comme ça",
      "Moins comme ça",
      "CPC",
      "budget total et la durée",
      "tables VIP",
      "panier",
      "jetons de notification push",
    ]) {
      expect(aide).toContain(expected);
    }

    for (const expected of [
      "Actualités",
      "Miamz",
      "campagnes",
      "restaurants indépendants",
    ]) {
      expect(about).toContain(expected);
    }
  });
});
