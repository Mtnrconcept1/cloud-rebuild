import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const socialComposer = readFileSync("src/components/social/SocialComposer.tsx", "utf8");

describe("commercial demo AI page copy", () => {
  it("labels the sponsored campaign preset as a local deterministic recommendation", () => {
    expect(socialComposer).toContain("TOK recommande les meilleurs paramètres");
    expect(socialComposer).toContain("Calcule localement une recommandation");
    expect(socialComposer).toContain("Recommander mes paramètres");
    expect(socialComposer).toContain("Recommandation appliquée");
    expect(socialComposer).not.toContain("TOK IA choisit les meilleurs paramètres");
    expect(socialComposer).not.toContain("IA optimise ma publicité");
    expect(socialComposer).not.toContain("Plan IA appliqué");
  });

  it("keeps the actual three-variant generation explicitly attributed to OpenAI", () => {
    expect(socialComposer).toContain(
      "OpenAI génère ensuite 3 variantes prêtes à publier.",
    );
    expect(socialComposer).toContain(
      "Crée exactement 3 variantes distinctes d’une actualité prête à publier pour ce restaurant.",
    );
    expect(socialComposer).toContain("await askCommercialDemoAi({");
  });
});
