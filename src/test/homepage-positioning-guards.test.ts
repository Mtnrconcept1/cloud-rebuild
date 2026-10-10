import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("homepage positioning guards", () => {
  it("keeps the homepage focused on the three public TOK pillars", () => {
    const hero = read("src/components/home/HeroSection.tsx");
    const css = read("src/index.css");
    const features = read("src/components/home/FeaturesSection.tsx");
    const index = read("src/pages/Index.tsx");

    expect(hero.match(/<h1/g)).toHaveLength(1);
    expect(hero).toContain("Miamz");
    expect(hero).toContain('role="search"');
    expect(hero).toContain("Restaurateur");
    expect(hero).not.toContain('new URLSearchParams({ city: "Genève" })');
    expect(css).toContain("prefers-reduced-motion");
    expect(features).toContain("PRIMARY_PILLARS");
    expect(features).toContain("Zéro attente");
    expect(features).toContain("Offres anti-gaspi & Tables du Chef");
    expect(features).toContain("Miamz solidaires");
    expect(index).toContain("Pour ce soir");
    expect(index).toContain("Sélection variée du soir");
    expect(index).toContain("Des adresses à découvrir");
    expect(index).toContain("À ne pas manquer");
  });

  it("keeps restaurateur packs as a softer B2B tunnel before direct checkout", () => {
    const packs = read("src/pages/PacksRestaurateur.tsx");

    expect(packs).toContain("Abonnements Fair Growth");
    expect(packs).toContain("Recharges de crédits TOK");
    expect(packs).toContain("restaurant_subscription_plans");
    expect(packs).toContain("restaurant_credit_packs");
    expect(packs).not.toContain('checkout_kind: "launch-pack"');
  });

  it("preserves discovery, promotions and community content in the editorial homepage", () => {
    const index = read("src/pages/Index.tsx");
    const restaurantSection = read("src/components/home/RestaurantSection.tsx");
    expect(restaurantSection).toContain("sponsoredCampaignId={r.campaign_id || undefined}");
    expect(restaurantSection).toContain("supportsReservation=");
    expect(index).toContain("<CuisineCategoryStrip");
    expect(index).toContain("<PromoCarousel");
    expect(index).toContain("<NearbyRestaurantsMap");
    expect(index).toContain("<SolidaritySection");
    expect(index).toContain("<FeaturesSection activeFeatures={activeFeatures}");
  });

  it("keeps public discovery rails visible for signed-in users", () => {
    const index = read("src/pages/Index.tsx");

    expect(index).toContain("const showSecondaryRail = secondaryRail.restaurants.length > 0;");
    expect(index).toContain("const showTrendingRail = trendingCards.length > 0;");
    expect(index).not.toContain("const showSecondaryRail = secondaryRail.restaurants.length > 0 && (!user");
    expect(index).not.toContain("const showTrendingRail = trendingCards.length > 0 && (!user");
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
      "public/images/home/tok-geneve-desktop-reference.jpg",
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
    expect(hero).toContain('to="/restaurateurs/geneve"');
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
