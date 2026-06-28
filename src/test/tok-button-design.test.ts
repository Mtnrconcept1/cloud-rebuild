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

    expect(css).toContain("--primary: 21 100% 50%;");
    expect(css).toContain("--primary-foreground: 220 20% 10%;");
    expect(css).toContain("body .text-primary");
    expect(css).toContain("color: hsl(18 100% 39%);");
    expect(css).toContain("--muted-foreground: 214 26% 88%;");
    expect(css).toContain(".dark .text-primary");
    expect(css).toContain("color: hsl(22 100% 72%);");
    expect(css).toContain(".dark .text-muted-foreground");
    expect(buttonVariants).toContain("rounded-xl text-sm font-bold");
    expect(buttonVariants).toContain("bg-primary text-primary-foreground");
    expect(buttonVariants).toContain("hover:bg-[#f45100]");
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
      "src/components/RestaurantCard.tsx",
      "src/components/dashboard/TokAiMarketingStudio.tsx",
      "src/components/social/SocialPostCard.tsx",
      "src/pages/AlternativeCommissionCouvert.tsx",
      "src/pages/MultiStop.tsx",
      "src/pages/RestaurantDetail.tsx",
      "src/pages/RestaurateursGeneve.tsx",
      "src/pages/RestaurateursGoogleBusiness.tsx",
      "src/pages/TokConnect.tsx",
      "src/pages/TokOne.tsx",
      "src/pages/TokPulse.tsx",
    ];

    const source = files.map(read).join("\n");

    expect(source).toContain("bg-[#ff5a00]");
    expect(source).toContain("text-[#111827]");
    expect(source).toContain("hover:bg-[#f45100]");
    expect(source).not.toContain("bg-purple-500 hover:bg-purple-600");
    expect(source).not.toContain("bg-pink-500 hover:bg-pink-600");
    expect(source).not.toContain("bg-violet-500 hover:bg-violet-600");
    expect(source).not.toContain("bg-violet-600 hover:bg-violet-700");
    expect(source).not.toContain("bg-orange-700 text-white");
    expect(source).not.toContain("bg-orange-600 hover:bg-orange-700");
    expect(source).not.toContain("bg-orange-500 text-white hover:bg-orange-600");
    expect(source).not.toContain("#b83200");
  });
});
