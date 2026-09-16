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

  it("reacts to the homepage cache and hydrates a bounded photo-backed Geneva pool when it is under-filled", () => {
    const connected = read("src/components/home/DesktopHomeExperienceConnected.tsx");

    expect(connected).toContain("useQueryClient");
    expect(connected).toContain("queryClient.getQueryCache().subscribe");
    expect(connected).toContain('latestCachedRestaurantPool(queryClient, "home-candidate-pool")');
    expect(connected).toContain('latestCachedRestaurantPool(queryClient, "home-offer-candidate-pool")');
    expect(connected).toContain("sectionSize: 6");
    expect(connected).toContain("trendingSize: 8");
    expect(connected).toContain("DESKTOP_GENEVA_PAGE_SIZE = 54");
    expect(connected).toContain("TARGET_GENEVA_VISUALS = 8");
    expect(connected).toContain("MAX_GENEVA_CANDIDATE_PAGES = 4");
    expect(connected).toContain("search_restaurants_catalog_page");
    expect(connected).toContain('p_city: "Genève"');
    expect(connected).toContain("p_limit: DESKTOP_GENEVA_PAGE_SIZE");
    expect(connected).toContain("p_offset: offset");
    expect(connected).toContain("hasRestaurantVisual");
    expect(connected).toContain("cachedGenevaVisuals.length < TARGET_GENEVA_VISUALS");
    expect(connected).toContain("visualCandidates");
    expect(connected).toContain("catalogue={visualCandidates}");
  });

  it("uses stable TOK artwork rather than the broken desktop-only asset pair", () => {
    const desktopHero = read("src/components/home/DesktopHomeHero.tsx");

    expect(desktopHero).toContain("<h2");
    expect(desktopHero).toContain("GENÈVE");
    expect(desktopHero).toContain("À TABLE AVEC");
    expect(desktopHero).toContain("TOK !");
    expect(desktopHero).toContain("/chefbg.webp");
    expect(existsSync(resolve(root, "public/chefbg.webp"))).toBe(true);
    expect(desktopHero).not.toContain("/images/home/tok-geneva-panorama.webp");
    expect(desktopHero).not.toContain("/images/home/tok-chef-desktop.webp");
    expect(existsSync(resolve(root, "public/images/home/tok-geneva-panorama.webp"))).toBe(false);
    expect(existsSync(resolve(root, "public/images/home/tok-chef-desktop.webp"))).toBe(false);
  });

  it("reuses the application cuisine strip, reservation calendar and restaurant card", () => {
    const experience = read("src/components/home/DesktopHomeExperience.tsx");

    expect(experience).toContain("CuisineCategoryStrip");
    expect(experience).toContain('from "@/components/RestaurantCard"');
    expect(experience).toContain('from "@/components/ui/calendar"');
    expect(experience).toContain("isReservationCalendarDateDisabled");
    expect(experience).toContain("locale={fr}");
    expect(experience).not.toContain("DesktopRestaurantCard");
    expect(existsSync(resolve(root, "src/components/home/DesktopRestaurantCard.tsx"))).toBe(false);
  });

  it("fills the desktop home with multiple grounded restaurant rails", () => {
    const experience = read("src/components/home/DesktopHomeExperience.tsx");

    expect(experience).toContain('data-testid="desktop-home-reference-shell"');
    expect(experience).toContain("Offres du moment");
    expect(experience).toContain("Les tables préférées des Genevois");
    expect(experience).toContain("Autour de Genève");
    expect(experience).toContain("Pour ce midi");
    expect(experience).toContain("Ce soir à Genève");
    expect(experience).toContain("Nos meilleures adresses");
    expect(experience).toContain("Restaurants à proximité");
    expect(experience).toContain("FULL_RAIL_SIZE = 8");
    expect(experience).toContain("DENSE_RAIL_SIZE = 6");
  });

  it("does not label ordinary restaurants as current offers when the offer pool is empty", () => {
    const experience = read("src/components/home/DesktopHomeExperience.tsx");

    expect(experience).toContain("const offerCards = uniqueCards([offers], DENSE_RAIL_SIZE);");
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
});
