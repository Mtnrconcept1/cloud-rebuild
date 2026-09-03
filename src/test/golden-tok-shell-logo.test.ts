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
});
