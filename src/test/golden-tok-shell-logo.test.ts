import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Golden TOK public chrome", () => {
  it("keeps the navbar and footer on the shared route-aware TOK logo source", () => {
    const navbar = read("src/components/Navbar.tsx");
    const footer = read("src/components/home/FooterSection.tsx");
    const logoHook = read("src/hooks/useTokLogo.ts");

    expect(navbar).toContain("useTokLogoSrc");
    expect(footer).toContain("useTokLogoSrc");
    expect(logoHook).toContain("getTokLogoSrcForPath(pathname)");
  });

  it("keeps the Chef Table visual shell aligned with the Golden TOK desktop and mobile layouts", () => {
    const wizard = read("src/components/FeatureWizard.tsx");

    expect(wizard).toContain("data-golden-tok-chefs-table");
    expect(wizard).toContain("golden-tok-rail");
    expect(wizard).toContain('alt="Golden TOK"');
    expect(wizard).toContain("golden-tok-stage");
    expect(wizard).toContain("grid-template-columns: minmax(0, 1fr) 320px");
    expect(wizard).toContain("scroll-snap-type: x mandatory");
    expect(wizard).toContain("body:has([data-golden-tok-chefs-table]) header.sticky");
    expect(wizard).toContain("body:has([data-golden-tok-chefs-table]) footer");
    expect(wizard).toContain("golden-tok-benefits");
  });

  it("loads V2 then the responsive V3 refinement after the base Golden TOK theme", () => {
    const main = read("src/main.tsx");
    const v2 = read("src/styles/golden-tok-chefs-table-v2.css");
    const v3 = read("src/styles/golden-tok-chefs-table-v3.css");

    const baseIndex = main.indexOf("golden-tok-chefs-table.css");
    const v2Index = main.indexOf("golden-tok-chefs-table-v2.css");
    const v3Index = main.indexOf("golden-tok-chefs-table-v3.css");

    expect(baseIndex).toBeGreaterThan(-1);
    expect(v2Index).toBeGreaterThan(baseIndex);
    expect(v3Index).toBeGreaterThan(v2Index);

    expect(v2).toContain("grid-template-columns: repeat(12, minmax(0, 1fr))");
    expect(v2).toContain("tok-reference-food-02.webp");
    expect(v2).toContain(".golden-tok-stage:has(.golden-tok-content [class~=\"border-dashed\"])");
    expect(v2).toContain("html:not(.dark)");
    expect(v2).toContain("html.dark");
    expect(v2).toContain("@media (max-width: 820px)");
    expect(v2).toContain("@media (max-width: 390px)");
    expect(v2).toContain("button:focus-visible");
    expect(v2).toContain("button:disabled");

    expect(v3).toContain(".golden-tok-rail");
    expect(v3).toContain("repeat(auto-fit, minmax(min(100%, 610px), 1fr))");
    expect(v3).toContain("container-type: inline-size");
    expect(v3).toContain("@container golden-drop (min-width: 840px)");
    expect(v3).toContain("@container golden-drop (min-width: 560px) and (max-width: 839px)");
    expect(v3).toContain("scroll-snap-type: none");
    expect(v3).toContain("@media (max-width: 520px)");
    expect(v3).toContain("@media (max-width: 380px)");
  });
});
