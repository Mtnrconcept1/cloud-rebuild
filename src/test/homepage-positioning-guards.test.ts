import { existsSync, readFileSync } from "node:fs";
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
    const showcaseHeader = read("src/components/home/SectionShowcaseHeader.tsx");
    const solidarity = read("src/components/home/SolidaritySection.tsx");
    const features = read("src/components/home/FeaturesSection.tsx");

    expect(restaurantSection).toContain("border-y border-border/70");
    expect(restaurantSection).toContain("accentClassName");
    expect(restaurantSection).toContain("SectionShowcaseHeader");
    expect(restaurantSection).toContain("headerTheme");
    expect(restaurantSection).toContain("headerImageSrc");
    expect(showcaseHeader).toContain("SectionHeaderTheme");
    expect(showcaseHeader).toContain("contentClassName");
    expect(showcaseHeader).toContain("illustrationClassName");
    expect(showcaseHeader).toContain("radial-gradient");
    expect(showcaseHeader).toContain("linear-gradient");
    expect(showcaseHeader).toContain("rounded-[100%]");
    expect(showcaseHeader).toContain("data-section-illustration");
    expect(showcaseHeader).toContain("motion.div");
    expect(showcaseHeader).toContain("useReducedMotion");
    expect(showcaseHeader).toContain("whileInView");
    expect(showcaseHeader).toContain("-right-10 -top-6 bottom-0 z-40 w-56 overflow-visible");
    expect(showcaseHeader).toContain("data-section-action-row");
    expect(showcaseHeader).toContain("max-w-[calc(100%-9.5rem)]");
    expect(showcaseHeader).toContain("z-50");
    expect(showcaseHeader).toContain("bottom-0 right-0 h-48 w-48 translate-x-3");
    expect(showcaseHeader).not.toContain("Sparkles");
    expect(showcaseHeader).not.toContain("right-[31%]");
    expect(showcaseHeader).not.toContain("doodle");
    expect(showcaseHeader).not.toContain("blur-2xl");
    expect(showcaseHeader).not.toContain("drop-shadow-[");
    expect(restaurantSection).toContain("section-headers/gift-3d.png");
    expect(cuisineStrip).toContain("SectionShowcaseHeader");
    expect(cuisineStrip).toContain("/desig app/assiette.png");
    expect(index).toContain("bg-rose-50/70");
    expect(index).toContain('headerTheme="rose"');
    expect(index).toContain("SECTION_HEADER_IMAGES.personal");
    expect(index).toContain("bg-sky-50/75");
    expect(index).toContain('headerTheme="sky"');
    expect(index).toContain("SECTION_HEADER_IMAGES.local");
    expect(index).toContain("bg-indigo-50/70");
    expect(index).toContain("SECTION_HEADER_IMAGES.reservation");
    expect(index).toContain('reservation: "/desig app/calendrier.png"');
    expect(index).toContain('lunch: "/desig app/burger.png"');
    expect(index).toContain("bg-orange-50/70");
    expect(index).toContain('promo: "/desig app/chefsection.png"');
    expect(index).toContain('title={"Promotions\\u00a0et activations\\u00a0du moment"}');
    expect(index).toContain("className=\"-mx-4 min-h-[222px] pb-16 pt-5");
    expect(index).toContain("contentClassName=\"z-30 max-w-[13rem] pr-0");
    expect(index).toContain("illustrationClassName=\"z-[60] -right-16 -top-8 w-72");
    expect(index).toContain("imageClassName=\"-right-5 h-72 w-72 translate-x-12");
    expect(index).toContain("bg-emerald-50/75");
    expect(index).toContain('headerTheme="emerald"');
    expect(index).toContain("SECTION_HEADER_IMAGES.offers");
    expect(index).toContain('offers: "/desig app/cadeau.png"');
    expect(index).toContain("SECTION_HEADER_IMAGES.trending");
    expect(index).toContain('trending: "/desig app/flamme.png"');
    expect(index).toContain("SECTION_HEADER_IMAGES.nearby");
    expect(index).toContain('nearby: "/desig app/chefsection2.png"');
    expect(solidarity).toContain("border-y border-pink-500/10");
    expect(features).toContain("border-y border-border/70");
    expect(features).toContain("border-primary/15 bg-primary/10");
  });

  it("keeps locally hosted 3D PNG illustrations for homepage section headers", () => {
    const requiredAssets = [
      "public/images/section-headers/heart-3d.png",
      "public/images/section-headers/pin-3d.png",
      "public/images/section-headers/plate-3d.png",
      "public/desig app/burger.png",
      "public/desig app/assiette.png",
      "public/desig app/calendrier.png",
      "public/desig app/chefsection.png",
      "public/desig app/cadeau.png",
      "public/images/section-headers/shopping-bags-3d.png",
      "public/images/section-headers/gift-3d.png",
      "public/desig app/flamme.png",
      "public/desig app/chefsection2.png",
    ];

    for (const asset of requiredAssets) {
      expect(existsSync(resolve(process.cwd(), asset))).toBe(true);
    }
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
