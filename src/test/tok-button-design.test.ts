import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("TOK button design", () => {
  it("keeps primary actions orange and readable in dark mode", () => {
    const css = read("src/index.css");
    const buttonVariants = read("src/components/ui/button-variants.ts");

    expect(css).toContain("--primary: 18 100% 41%;");
    expect(css).toContain("--muted-foreground: 214 26% 88%;");
    expect(css).toContain(".dark .text-primary");
    expect(css).toContain("color: hsl(22 100% 72%);");
    expect(css).toContain(".dark .text-muted-foreground");
    expect(buttonVariants).toContain("rounded-xl text-sm font-bold");
    expect(buttonVariants).toContain("bg-primary text-primary-foreground");
    expect(buttonVariants).toContain("hover:bg-[#b83200]");
    expect(buttonVariants).toContain("dark:text-orange-200");
  });

  it("keeps public CTA overrides aligned with the TOK orange system", () => {
    const files = [
      "src/components/home/HeroSection.tsx",
      "src/pages/Abonnement.tsx",
      "src/pages/GiftPoints.tsx",
      "src/pages/MatchGroupes.tsx",
      "src/pages/MultiRestaurant.tsx",
      "src/pages/Profil.tsx",
      "src/pages/admin/DropsManagement.tsx",
      "src/components/OrderConflictDialog.tsx",
      "src/components/LoyaltyStatus.tsx",
    ];

    const source = files.map(read).join("\n");

    expect(source).toContain("bg-[#d13f00]");
    expect(source).toContain("hover:bg-[#b83200]");
    expect(source).not.toContain("bg-purple-500 hover:bg-purple-600");
    expect(source).not.toContain("bg-pink-500 hover:bg-pink-600");
    expect(source).not.toContain("bg-violet-500 hover:bg-violet-600");
    expect(source).not.toContain("bg-violet-600 hover:bg-violet-700");
  });
});
