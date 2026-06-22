import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("generate-campaign consumer-facing copy", () => {
  it("does not ship fallback copy that advises restaurateurs instead of writing the ad", () => {
    const source = readSource("supabase/functions/generate-campaign/index.ts");

    expect(source).not.toContain("Vos ventes flash ${restaurantName}");
    expect(source).not.toContain("Mettez vos ventes flash en avant");
    expect(source).not.toContain("Capitalisez sur votre note");
    expect(source).not.toContain("Boostez votre panier moyen");
    expect(source).toContain("containsRestaurateurAdviceCopy");
    expect(source).toContain("Interdiction de donner des conseils au restaurateur");
    expect(source).toContain("Ne parle jamais au restaurateur");
  });
});
