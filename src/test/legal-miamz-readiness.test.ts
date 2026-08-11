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

const brokenEncodingMarkers = [
  String.fromCharCode(0x00c3),
  String.fromCharCode(0x00c2),
  `${String.fromCharCode(0x00e2)}${String.fromCharCode(0x20ac)}`,
  String.fromCharCode(0xfffd),
];

describe("legal Miamz and sponsored content readiness", () => {
  it("keeps public legal and help pages in readable UTF-8 French", () => {
    for (const path of publicLegalPages) {
      const content = read(path);
      for (const marker of brokenEncodingMarkers) expect(content, path).not.toContain(marker);
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
      "Une annulation, un remboursement, une fraude, un abus ou une erreur technique",
      "tables ou expériences VIP",
    ]) expect(cgu).toContain(expected);
    for (const expected of [
      "non convertibles en espèces",
      "durée de validité affichée",
      "preuve de redistribution",
      "annulation ou remboursement",
    ]) expect(miamz).toContain(expected);
  });

  it("covers sponsored posts and AI responsibilities without exposing production internals", () => {
    const cgu = read("src/pages/CGU.tsx");
    const privacy = read("src/pages/PolitiqueConfidentialite.tsx");
    for (const expected of [
      "campagnes sponsorisées",
      "photos générées ou retouchées par IA",
      "ne doivent pas induire les utilisateurs en erreur",
      "ne doit être présenté comme sponsorisé",
      "budget et la durée",
    ]) expect(cgu).toContain(expected);
    for (const expected of [
      "Fonctions d'intelligence artificielle",
      "OpenAI",
      "signaux d'intérêt",
      "identifiant technique de notification",
      "Partenaires TOK Connect approuvés",
    ]) expect(privacy).toContain(expected);
  });

  it("explains recent product additions in FAQ and About pages", () => {
    const aide = read("src/pages/Aide.tsx");
    const about = read("src/pages/APropos.tsx");
    for (const expected of [
      "posts sauvegardés", "Plus comme ça", "Moins comme ça", "CPC",
      "budget total et la durée", "tables VIP", "panier", "jetons de notification push",
    ]) expect(aide).toContain(expected);
    for (const expected of ["Actualités", "Miamz", "campagnes", "restaurants indépendants"]) {
      expect(about).toContain(expected);
    }
  });
});
