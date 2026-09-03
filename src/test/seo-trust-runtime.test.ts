import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("SEO trust runtime", () => {
  it("is loaded from the public shell and preserves the same trust rules as prerender", () => {
    const index = readFileSync(resolve(root, "index.html"), "utf8");
    const runtime = readFileSync(resolve(root, "public/seo-trust-runtime.js"), "utf8");

    expect(index).toContain('<script src="/seo-trust-runtime.js" defer></script>');
    expect(index).toContain("TOK - Restaurants à Genève : adresses, réservation et commande");
    expect(runtime).toContain("noindex,nofollow,noarchive");
    expect(runtime).toContain("GENERIC_STRUCTURED_IMAGE_PATHS");
    expect(runtime).toContain('output[key] = "$".repeat');
    expect(runtime).toContain("Restaurants à ${city} : bonnes adresses | TOK");
    expect(runtime).not.toContain("Suisse romande");
  });
});
