import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("homepage positioning guards", () => {
  it("keeps the homepage focused on the three public TOK pillars", () => {
    const hero = read("src/components/home/HeroSection.tsx");
    const features = read("src/components/home/FeaturesSection.tsx");
    const index = read("src/pages/Index.tsx");

    expect(hero).toContain("Réservez, commandez et profitez");
    expect(hero).toContain("Je veux manger");
    expect(hero).toContain("Je suis restaurateur");
    expect(features).toContain("PRIMARY_PILLARS");
    expect(features).toContain("Zéro attente");
    expect(features).toContain("Offres anti-gaspi & Tables du Chef");
    expect(features).toContain("Miamz solidaires");
    expect(index).toContain("Réservations et plaisir");
    expect(index).toContain("Près de chez vous");
    expect(index).toContain("À ne pas manquer");
  });

  it("keeps restaurateur packs as a softer B2B tunnel before direct checkout", () => {
    const packs = read("src/pages/PacksRestaurateur.tsx");

    expect(packs).toContain("Comparer les packs");
    expect(packs).toContain("Demander une démo");
    expect(packs).toContain("/contact?subject=demo-restaurateur");
    expect(packs).toContain("create-checkout");
    expect(packs).toContain('checkout_kind: "launch-pack"');
  });

  it("keeps homepage content rails visually separated", () => {
    const index = read("src/pages/Index.tsx");
    const restaurantSection = read("src/components/home/RestaurantSection.tsx");
    const cuisineStrip = read("src/components/home/CuisineCategoryStrip.tsx");
    const solidarity = read("src/components/home/SolidaritySection.tsx");
    const features = read("src/components/home/FeaturesSection.tsx");

    expect(restaurantSection).toContain("border-y border-border/70");
    expect(restaurantSection).toContain("accentClassName");
    expect(restaurantSection).toContain("headerClassName");
    expect(restaurantSection).toContain("bg-primary/10");
    expect(cuisineStrip).toContain("border-primary/15 bg-primary/10");
    expect(index).toContain("bg-rose-50/70");
    expect(index).toContain("bg-pink-500/10");
    expect(index).toContain("bg-sky-50/75");
    expect(index).toContain("bg-sky-500/10");
    expect(index).toContain("bg-indigo-50/70");
    expect(index).toContain("bg-indigo-500/10");
    expect(index).toContain("bg-orange-50/70");
    expect(index).toContain("bg-emerald-50/75");
    expect(index).toContain("bg-emerald-500/10");
    expect(solidarity).toContain("border-y border-pink-500/10");
    expect(features).toContain("border-y border-border/70");
    expect(features).toContain("border-primary/15 bg-primary/10");
  });

  it("exposes the restaurateur B2B funnel from public entry points", () => {
    const navbar = read("src/components/Navbar.tsx");
    const hero = read("src/components/home/HeroSection.tsx");
    const footer = read("src/components/home/FooterSection.tsx");

    expect(navbar).toContain('to="/restaurateurs/geneve"');
    expect(navbar).toContain("Restaurateurs");
    expect(navbar).toContain("Devenir partenaire");
    expect(hero).toContain('navigate("/restaurateurs/geneve")');
    expect(footer).toContain('to="/restaurateurs/geneve"');
    expect(footer).toContain('to="/packs-restaurateur"');
    expect(footer).toContain('to="/restaurateurs/google-business"');
    expect(footer).toContain('to="/restaurateurs/alternative-commission-couvert"');
  });

  it("keeps reduced-motion support for the animated public experience", () => {
    const css = read("src/index.css");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("transition-duration: 0.01ms !important");
    expect(css).toContain("scroll-behavior: auto !important");
  });
});
