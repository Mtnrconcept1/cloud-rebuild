import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
  it("documents TOK Connect in the public FAQ", () => {
    const aide = read("src/pages/Aide.tsx");

    expect(aide).toContain('id: "tok-connect"');
    expect(aide).toContain("Qu'est-ce que TOK Connect ?");
    expect(aide).toContain("API REST versionnée");
    expect(aide).toContain("Idempotency-Key");
    expect(aide).toContain("X-TOK-Signature");
    expect(aide).toContain("/tok-connect/developer");
  });

  it("documents TOK Connect usage rules in the CGU and distinct partner contract", () => {
    const cgu = read("src/pages/CGU.tsx");
    const partnerContract = read("public/legal/tok-connect-api.html");

    expect(cgu).toContain("Dernière mise à jour : 24 juillet 2026");
    expect(cgu).toContain("15. TOK Connect, API partenaires, MCP et webhooks");
    expect(cgu).toContain("OAuth client-credentials");
    expect(cgu).toContain("Idempotency-Key");
    expect(cgu).toContain("Le mode sandbox utilise des données de test");
    expect(cgu).toContain("/legal/tok-connect-api.html");
    expect(partnerContract).toContain("TOK-CONNECT-2026-07-v1");
    expect(partnerContract).toContain("Scopes et autorisations");
  });

  it("documents TOK Connect privacy processing", () => {
    const privacy = read("src/pages/PolitiqueConfidentialite.tsx");

    expect(privacy).toContain("Intégrations TOK Connect");
    expect(privacy).toContain("Partenaires TOK Connect approuvés");
    expect(privacy).toContain("13. Traitements liés à TOK Connect");
    expect(privacy).toContain("tokens sont opaques");
    expect(privacy).toContain("Le mode sandbox utilise des données de test");
  });

  it("documents restaurant consent and responsibilities for TOK Connect", () => {
    const restaurantTerms = read("src/pages/ConditionsRestaurateurs.tsx");

    expect(restaurantTerms).toContain('const updatedAt = "18 juillet 2026"');
    expect(restaurantTerms).toContain("26. TOK Connect, partenaires API et MCP");
    expect(restaurantTerms).toContain("autoriser ou refuser un partenaire par restaurant");
    expect(restaurantTerms).toContain("Les reservations creees par TOK Connect engagent le restaurant");
    expect(restaurantTerms).toContain("27. Contact");
  });

  it("keeps the touched French legal pages free from common mojibake markers", () => {
    for (const page of legalPages) {
      const source = read(page);

      expect(source, page).not.toContain("\uFFFD");
      expect(source, page).not.toContain("\u00C2");
      expect(source, page).not.toContain("\u00C3");
      expect(source, page).not.toContain("\u00C5");
      expect(source, page).not.toContain("\u00E2\u20AC");
    }
  });
});
