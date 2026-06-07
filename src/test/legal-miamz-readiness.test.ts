import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("legal Miamz and sponsored content readiness", () => {
  it("documents Miamz value, expiry, donations and refund adjustments in public legal copy", () => {
    const cgu = read("src/pages/CGU.tsx");
    const miamz = read("src/pages/MiamzSolidaires.tsx");

    for (const expected of [
      "Les Miamz ne constituent pas une monnaie",
      "sans valeur en espèces",
      "durée de validité",
      "dons solidaires",
      "annulation, remboursement, fraude ou erreur technique",
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
      "contenus sponsorisés",
      "photos générées ou retouchées par IA",
      "ne doivent pas induire les Utilisateurs en erreur",
      "droits d'utilisation des visuels",
    ]) {
      expect(cgu).toContain(expected);
    }

    for (const expected of [
      "données d'usage IA",
      "OpenAI",
      "campagnes sponsorisées",
      "mesure d'audience",
    ]) {
      expect(privacy).toContain(expected);
    }
  });
});
