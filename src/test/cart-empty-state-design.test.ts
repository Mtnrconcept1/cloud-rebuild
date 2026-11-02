import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("cart empty state design", () => {
  it("keeps the illustrated discovery path responsive and separate from checkout logic", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Panier.tsx"), "utf8");

    expect(source).toContain('data-testid="empty-cart-state"');
    expect(source).toContain('src="/images/tok-refonte/panier-vide.webp"');
    expect(source).toContain("Votre prochaine découverte commence ici.");
    expect(source).toContain('to="/recherche"');
    expect(source).toContain('to="/actualites"');
    expect(source).toContain("md:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)]");
    expect(source).toContain('if (items.length === 0)');
  });
});
