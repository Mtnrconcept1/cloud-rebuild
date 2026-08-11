import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

const legalPages = [
  "src/pages/Aide.tsx",
  "src/pages/CGU.tsx",
  "src/pages/PolitiqueConfidentialite.tsx",
  "src/pages/ConditionsRestaurateurs.tsx",
];

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("TOK Connect legal and help content", () => {
  it("documents TOK Connect publicly without exposing private implementation details", () => {
    const aide = read("src/pages/Aide.tsx");
    expect(aide).toContain('id: "tok-connect"');
    expect(aide).toContain("Qu'est-ce que TOK Connect ?");
    expect(aide).toContain("partenaires approuvés");
    expect(aide).toContain("autorisations accordées");
    expect(aide).not.toContain("/tok-connect/developer");
    expect(aide).not.toContain("/admin/tok-connect");
    expect(aide).not.toContain("Idempotency-Key");
    expect(aide).not.toContain("X-TOK-Signature");
    expect(aide).not.toContain("contrôles côté Edge Function");
  });

  it("documents TOK Connect usage rules in the CGU", () => {
    const cgu = read("src/pages/CGU.tsx");
    const legalDocuments = read("src/lib/legalDocuments.ts");
    expect(cgu).toContain("Version {LEGAL_DOCUMENTS.cgu.version} — applicable dès le {LEGAL_EFFECTIVE_DATE_FR}");
    expect(legalDocuments).toContain(`LEGAL_EFFECTIVE_DATE_FR = "${LEGAL_EFFECTIVE_DATE_FR}"`);
    expect(cgu).toContain("Intégrations TOK Connect et partenaires autorisés");
    expect(cgu).toContain("permissions accordées");
    expect(cgu).toContain("environnements de test");
    expect(cgu).not.toContain("OAuth client-credentials");
    expect(cgu).not.toContain("Idempotency-Key");
  });

  it("documents TOK Connect privacy processing without publishing secrets", () => {
    const privacy = read("src/pages/PolitiqueConfidentialite.tsx");
    expect(privacy).toContain("Intégrations TOK Connect");
    expect(privacy).toContain("Partenaires TOK Connect approuvés");
    expect(privacy).toContain("données strictement nécessaires");
    expect(privacy).toContain("sans publier les secrets ou mécanismes internes");
    expect(privacy).not.toContain("tokens sont opaques");
  });

  it("documents restaurant consent and responsibilities for TOK Connect", () => {
    const restaurantTerms = read("src/pages/ConditionsRestaurateurs.tsx");
    expect(restaurantTerms).toContain("const updatedAt = LEGAL_EFFECTIVE_DATE_FR;");
    expect(restaurantTerms).toContain("TOK Connect et partenaires autorisés");
    expect(restaurantTerms).toContain("autoriser ou révoquer un partenaire TOK Connect");
    expect(restaurantTerms).toContain("Une réservation réelle");
    expect(restaurantTerms).toContain("15. Droit applicable et contact");
  });

  it("keeps the touched French legal pages free from common mojibake markers", () => {
    for (const page of legalPages) {
      const source = read(page);
      expect(source, page).not.toContain("�");
      expect(source, page).not.toContain("Â");
      expect(source, page).not.toContain("Ã");
      expect(source, page).not.toContain("Å");
      expect(source, page).not.toContain("â€");
    }
  });
});
