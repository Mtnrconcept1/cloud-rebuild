import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const assetSize = (path: string) => statSync(resolve(root, "public", path)).size;

describe("TOK homepage Core Web Vitals safeguards", () => {
  it("loads only the matching responsive hero rather than eagerly preloading a fixed city", () => {
  const html = read("index.html");
  const hero = read("src/components/home/HeroSection.tsx");
  expect(html).not.toContain('href="/images/home/tok-geneve-mobile-fast.webp"');
  expect(html).not.toContain('href="/images/home/tok-leman-signature-fast.webp"');
  expect(hero).toContain("desktopImage");
  expect(hero).toContain('/images/home/tok-leman-signature.webp');
  expect(hero).not.toContain('/images/home/tok-leman-signature-fast.webp');
  expect(hero).toContain("mobileImage");
  expect(hero).toContain('loading="eager"');
  expect(hero).toContain('fetchpriority: "high"');
  expect(assetSize("images/home/tok-leman-signature.webp")).toBeLessThan(300_000);
  expect(assetSize("images/home/tok-geneve-mobile-fast.webp")).toBeLessThan(165_000);
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
    const app = read("src/App.tsx");
    const page = read("src/pages/Index.tsx");
    const section = read("src/components/home/RestaurantSection.tsx");

    expect(app).toContain("<AppLoadingScreen\n            fullScreen");
    expect(page).toContain("function ProgressiveOfferCountdown");
    expect(page).toContain("window.setInterval(() => setNowMs(Date.now()), 60_000)");
    expect(page).toContain("loading={isCatalogLoading}");
    expect(section).toContain('data-testid="home-restaurant-skeleton"');
    expect(section).toContain("aria-busy={loading && restaurants.length === 0}");
  });

  it("defers crisp, lightweight copy-safe panoramic WebP assets", () => {
    const headers = read("src/components/home/SectionShowcaseHeader.tsx");
    const categories = read("src/components/home/CuisineCategoryStrip.tsx");
    const page = read("src/pages/Index.tsx");

    expect(headers).toContain("IntersectionObserver");
    expect(headers).toContain('rootMargin: "600px 0px"');
    expect(headers).toContain("data-image-ready");
    expect(categories).toContain("/images/section-headers/tok-editorial-cuisine-full.webp");
    expect(page).toContain('local: "/images/section-headers/tok-editorial-geneva-full.webp"');
    expect(page).toContain('nearby: "/images/section-headers/tok-editorial-geneva-full.webp"');
    expect(assetSize("images/section-headers/tok-editorial-cuisine-full.webp")).toBeLessThan(230_000);
    expect(assetSize("images/section-headers/tok-editorial-geneva-full.webp")).toBeLessThan(230_000);
  });

  it("keeps Lighthouse-visible controls named, sized and contrast-safe", () => {
    const navbar = read("src/components/Navbar.tsx");
    const carousel = read("src/components/PromoCarousel.tsx");
    const card = read("src/components/RestaurantCard.tsx");
    const loyalty = read("src/components/LoyaltyStatus.tsx");
    const solidarity = read("src/components/home/SolidaritySection.tsx");

    expect(navbar).toContain("bg-orange-700");
    expect(carousel).toContain('aria-label="Promotion précédente"');
    expect(carousel).toContain('aria-label="Promotion suivante"');
    expect(carousel).toContain("bg-orange-700");
    expect(card).toContain("bg-orange-700 text-white hover:bg-orange-800");
    expect(card).toContain("bg-emerald-700 text-white");
    expect(card).toContain("remise ${discountShortLabel}");
    expect(loyalty).toContain('aria-label="Progression vers le niveau suivant"');
    expect(solidarity).toContain("width={1370}");
    expect(solidarity).toContain("height={1352}");
    expect(solidarity).toContain("height={1685}");
  });
});
