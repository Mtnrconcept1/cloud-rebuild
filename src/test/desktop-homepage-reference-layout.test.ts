import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

describe("desktop homepage reference layout", () => {
  it("uses the dedicated dense desktop shell while preserving the mobile home hero", () => {
    const hero = read("src/components/home/HeroSection.tsx");
    const desktopHero = read("src/components/home/DesktopHomeHero.tsx");
    const navbar = read("src/components/Navbar.tsx");
    const connected = read("src/components/home/DesktopHomeExperienceConnected.tsx");

    expect(hero).toContain("DesktopHomeHero");
    expect(desktopHero).toContain("DesktopHomeExperienceConnected");
    expect(connected).toContain("DesktopHomeExperience");
    expect(hero).toContain('data-testid="mobile-hero-shell"');
    expect(navbar).toContain("DesktopHomeNavbar");
  });

  it("reuses the homepage React Query cache instead of adding a second catalogue request", () => {
    const connected = read("src/components/home/DesktopHomeExperienceConnected.tsx");

    expect(connected).toContain("useQueryClient");
    expect(connected).toContain('latestCachedRestaurantPool(queryClient, "home-candidate-pool")');
    expect(connected).toContain('latestCachedRestaurantPool(queryClient, "home-offer-candidate-pool")');
    expect(connected).not.toContain("search_restaurants_catalog_page");
    expect(connected).not.toContain("getSupabase");
  });

  it("keeps the Geneva hero headline as semantic HTML and uses the supplied optimized desktop artwork", () => {
    const desktopHero = read("src/components/home/DesktopHomeHero.tsx");

    expect(desktopHero).toContain("<h2");
    expect(desktopHero).toContain("GENÈVE");
    expect(desktopHero).toContain("À TABLE AVEC");
    expect(desktopHero).toContain("TOK !");
    expect(desktopHero).toContain("/images/home/tok-geneva-panorama.webp");
    expect(desktopHero).toContain("/images/home/tok-chef-desktop.webp");
    expect(existsSync(resolve(root, "public/images/home/tok-geneva-panorama.webp"))).toBe(true);
    expect(existsSync(resolve(root, "public/images/home/tok-chef-desktop.webp"))).toBe(true);
    expect(desktopHero).toContain('data-testid="desktop-home-hero"');
    expect(desktopHero).toContain("lg:block");
  });

  it("includes the compact offer rails, reservation panel and nearby panel from the desktop reference", () => {
    const experience = read("src/components/home/DesktopHomeExperience.tsx");

    expect(experience).toContain('data-testid="desktop-home-reference-shell"');
    expect(experience).toContain("Offres du moment");
    expect(experience).toContain("Les tables préférées des Genevois");
    expect(experience).toContain("Nos meilleures adresses");
    expect(experience).toContain("Réservez votre table");
    expect(experience).toContain("Restaurants à proximité");
    expect(experience).toContain("DesktopRestaurantCard");
    expect(experience).toContain("lg:block");
  });

  it("does not label ordinary restaurants as current offers when the offer pool is empty", () => {
    const experience = read("src/components/home/DesktopHomeExperience.tsx");

    expect(experience).toContain("const offerCards = uniqueCards(offers, [], 4);");
  });

  it("uses real restaurant coordinates in the nearby overview without inventing travel times", () => {
    const experience = read("src/components/home/DesktopHomeExperience.tsx");

    expect(experience).toContain("restaurant.latitude");
    expect(experience).toContain("restaurant.longitude");
    expect(experience).not.toContain("[18, 62]");
    expect(experience).not.toContain("Math.max(2, index * 2 + 2)");
    expect(experience).not.toContain(">9 min<");
    expect(experience).toContain("À proximité");
  });

  it("does not fabricate restaurant availability in the compact cards", () => {
    const card = read("src/components/home/DesktopRestaurantCard.tsx");

    expect(card).not.toContain("Table disponible");
    expect(card).toContain("Voir les créneaux");
    expect(card).toContain("restaurant.supports_reservation === true");
  });
});
