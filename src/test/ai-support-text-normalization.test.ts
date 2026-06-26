import { describe, expect, it } from "vitest";

import { normalizeVisibleAiSupportText } from "@/lib/ai/supportText";

describe("AI support text normalization", () => {
  it("replaces the mixed-script message token seen in support replies", () => {
    const value = normalizeVisibleAiSupportText(
      "Merci d'indiquer le plus possible de détails dans votre prochain संदेश : numéro de commande.",
    );

    expect(value).toBe(
      "Merci d'indiquer le plus possible de détails dans votre prochain message : numéro de commande.",
    );
    expect(value).not.toMatch(/[\u0900-\u097F]/);
  });

  it("preserves normal French accents while removing stray Devanagari characters", () => {
    expect(normalizeVisibleAiSupportText("Facturation réglée après vérification सं")).toBe(
      "Facturation réglée après vérification",
    );
  });
});
