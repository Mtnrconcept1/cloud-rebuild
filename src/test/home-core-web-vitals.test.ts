import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const assetSize = (path: string) => statSync(resolve(root, "public", path)).size;

describe("TOK homepage Core Web Vitals safeguards", () => {
  it("does not preload competing generic images when a canton is available", () => {
    const html = read("index.html");
    const hero = read("src/components/home/HeroSection.tsx");
    const css = read("src/components/home/HeroSection.css");
    expect(html).not.toContain('href="/images/home/tok-geneve-mobile-fast.webp"');
    expect(html).not.toContain('href="/images/home/tok-leman-signature-fast.webp"');
    expect(html).toContain('href="/images/section-headers/tok-editorial-cuisine-optimized.webp"');
    expect(hero).toContain('key={cantonImage ?? "default"}');
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain('fetchpriority: "high"');
    expect(css).not.toContain("url('/images/home/tok-leman-signature-fast.webp')");
  });

  it("serves lightweight editorial sections and prioritizes the visible LCP image", () => {
    const page = read("src/pages/Index.tsx");
    const cuisine = read("src/components/home/CuisineCategoryStrip.tsx");
    const header = read("src/components/home/SectionShowcaseHeader.tsx");
    for (const subject of ["cuisine", "feast", "gastronomy", "rewards", "geneva", "delivery", "evening", "reservation"]) {
      const asset = `images/section-headers/tok-editorial-${subject}-optimized.webp`;
      expect(existsSync(resolve(root, "public", asset))).toBe(true);
      expect(assetSize(asset)).toBeLessThan(90_000);
      expect(subject === "cuisine" ? cuisine : page).toContain(`/${asset}`);
    }
    expect(cuisine).toContain('imageLoading={homeVariant ? "eager" : "lazy"}');
    expect(cuisine).toContain('imageFetchPriority={homeVariant ? "high" : undefined}');
    expect(header).toContain("fetchpriority: imageFetchPriority");
  });

  it("keeps interaction affordances accessible to screen readers", () => {
    const promotions = read("src/components/PromoCarousel.tsx");
    const loyalty = read("src/components/LoyaltyStatus.tsx");
    expect(promotions).toContain('aria-label="Offre précédente"');
    expect(promotions).toContain('aria-label="Offre suivante"');
    expect(loyalty).toContain("aria-label={nextTierLabel");
  });

  it("uses a lightweight visible logo without changing the canonical app icon", () => {
    const brand = read("src/lib/tokLogo.ts");
    const hook = read("src/hooks/useTokLogo.ts");
    const navbar = read("src/components/Navbar.tsx");
    const footer = read("src/components/home/FooterSection.tsx");

    expect(brand).toContain('DEFAULT_TOK_LOGO_SRC = "/logotok.png"');
    expect(brand).toContain('OPTIMIZED_TOK_LOGO_SRC = "/images/home/tok-logo-ui.webp"');
    expect(assetSize("images/home/tok-logo-ui.webp")).toBeLessThan(25_000);
    expect(hook).toContain("/favicon-48x48.png");
    expect(hook).toContain("/favicon-180x180.png");
    expect(navbar).toContain("width={98} height={64}");
    expect(footer).toContain("width={62} height={40}");
  });

  it("uses resized cuisine thumbnails and lazy promotional imagery", () => {
    const categories = read("src/components/home/CuisineCategoryStrip.tsx");
    const carousel = read("src/components/PromoCarousel.tsx");
    const sources = [...categories.matchAll(/imageSrc: "(\/images\/miniatures\/[^"]+\.webp)"/g)];

    expect(sources).toHaveLength(39);
    for (const [, relativePath] of sources) {
      const path = relativePath.slice(1);
      expect(existsSync(resolve(root, "public", path))).toBe(true);
      expect(assetSize(path)).toBeLessThan(12_000);
    }

    expect(carousel).toContain('loading="lazy"');
    for (const image of ["lebanese-mezze", "mixed-grill-platter", "octopus-fine-dining"]) {
      expect(carousel).toContain(`/images/${image}-fast.webp`);
    }
    expect(read("src/index.css")).not.toContain("@import url('https://fonts.googleapis.com");
  });

  it("isolates live countdown updates and reserves stable dimensions during catalog loads", () => {
    const page = read("src/pages/Index.tsx");
    const section = read("src/components/home/RestaurantSection.tsx");

    expect(page).toContain("function ProgressiveOfferCountdown");
    expect(page).toContain("window.setInterval(() => setNowMs(Date.now()), 60_000)");
    expect(page).toContain("loading={isCatalogLoading}");
    expect(section).toContain('data-testid="home-restaurant-skeleton"');
    expect(section).toContain("aria-busy={loading && restaurants.length === 0}");
  });
});
