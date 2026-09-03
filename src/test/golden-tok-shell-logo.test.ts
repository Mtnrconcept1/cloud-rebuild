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
    expect(wizard).toContain("golden-tok-stage");
    expect(wizard).toContain("grid-template-columns: minmax(0, 1fr) 320px");
    expect(wizard).toContain("scroll-snap-type: x mandatory");
    expect(wizard).toContain("body:has([data-golden-tok-chefs-table]) header.sticky");
    expect(wizard).toContain("body:has([data-golden-tok-chefs-table]) footer");
    expect(wizard).toContain("golden-tok-benefits");
  });
});
