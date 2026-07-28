import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("responsive and SEO regression guards", () => {
  it("keeps the global layout fluid without duplicating safe-area padding", () => {
    const css = read("src/index.css");
    const tailwind = read("tailwind.config.ts");
    const bodyRule = css.match(/\n {2}body \{[\s\S]*?\n {2}\}/)?.[0] || "";

    expect(css).toContain("text-size-adjust: 100%");
    expect(css).toContain("min-inline-size: 0");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("min-height: 100dvh");
    expect(bodyRule).not.toContain("safe-area-inset");
    expect(tailwind).toContain('DEFAULT: "max(1rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))"');
    expect(tailwind).toContain('lg: "max(2rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))"');
  });

  it("constrains shared primitives to the viewport and keeps overlays above fixed chrome", () => {
    const card = read("src/components/ui/card.tsx");
    const dialog = read("src/components/ui/dialog.tsx");
    const sheet = read("src/components/ui/sheet.tsx");
    const alertDialog = read("src/components/ui/alert-dialog.tsx");
    const select = read("src/components/ui/select.tsx");
    const dropdown = read("src/components/ui/dropdown-menu.tsx");
    const tabs = read("src/components/ui/tabs.tsx");

    expect(card).toContain("min-w-0 max-w-full");
    expect(dialog).toContain("z-[1820]");
    expect(dialog).toContain("z-[1830]");
    expect(sheet).toContain("h-[100dvh]");
    expect(sheet).toContain("w-[min(24rem,calc(100vw-0.5rem))]");
    expect(alertDialog).toContain("z-[1850]");
    expect(select).toContain("max-h-[var(--radix-select-content-available-height)]");
    expect(dropdown).toContain("max-h-[var(--radix-dropdown-menu-content-available-height)]");
    expect(tabs).toContain("overflow-x-auto overscroll-x-contain");
  });

  it("keeps the homepage headline unique and prevents short-screen overlap", () => {
    const hero = read("src/components/home/HeroSection.tsx");
    const navbar = read("src/components/Navbar.tsx");
    const sectionHeaders = read("src/home-section-headers.css");

    expect(hero.match(/<h1/g)).toHaveLength(1);
    expect(hero).toContain("text-[clamp(1.78rem,9.4vw,2.34rem)]");
    expect(hero).toContain("mt-auto space-y-2");
    expect(hero).not.toContain("absolute inset-x-0 bottom-2 space-y-2");
    expect(navbar).toContain("sticky top-0");
    expect(navbar).not.toContain('<div className="h-16 md:hidden" aria-hidden="true" />');
    expect(navbar).toContain("Thème d’affichage");
    expect(sectionHeaders).toContain("@media (min-width: 380px)");
    expect(sectionHeaders).toContain("max-width: calc(100% - 6.5rem)");
  });

  it("labels dashboard table cards on mobile", () => {
    const support = read("src/pages/dashboard/DashboardSupport.tsx");
    const billing = read("src/pages/dashboard/DashboardAccountBilling.tsx");

    for (const label of ["Statut", "Priorité", "Catégorie", "Sujet", "Cible", "Dernière activité"]) {
      expect(support).toContain(`data-label="${label}"`);
    }
    for (const label of ["Date", "Outil", "Détail", "Dépense", "Coût estimé"]) {
      expect(billing).toContain(`data-label="${label}"`);
    }
  });

  it("keeps restaurant-list and restaurant-detail metadata ownership separate", () => {
    const app = read("src/App.tsx");
    const localRestaurants = read("src/pages/LocalRestaurants.tsx");
    const restaurantCard = read("src/components/RestaurantCard.tsx");
    const demoCatalog = read("src/lib/commercialDemoClientCatalog.ts");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const restaurantSlugs = read("src/lib/restaurantSlugs.ts");
    const prerender = read("scripts/prerender-seo.mjs");
    const detailBranch = localRestaurants.indexOf("if (resolvedRestaurantId)");
    const listingSeo = localRestaurants.lastIndexOf("<LocalRestaurantsSeo");

    expect(detailBranch).toBeGreaterThan(-1);
    expect(listingSeo).toBeGreaterThan(detailBranch);
    expect(app).toContain('/restaurants/:city/r/:restaurantSlug');
    expect(restaurantSlugs).toContain('RESTAURANT_DETAIL_PATH_SEGMENT = "r"');
    expect(prerender).toContain('/restaurants/${citySlug}/r/${restaurantSlug}');
    expect(localRestaurants).toContain("demoRestaurantBySlug");
    expect(demoCatalog).toContain("slug: slugifyRestaurantSegment(restaurant.name)");
    expect(localRestaurants).toContain("toAbsoluteSeoImage(restaurant.image_url)");
    expect(localRestaurants).toContain('lazy(() => import("./RestaurantDetail"))');
    expect(localRestaurants).not.toContain('import RestaurantDetail from "./RestaurantDetail"');
    expect(localRestaurants).not.toContain("restaurants.length === 0))");
    expect(restaurantCard).toContain("to={restaurantPath}");
    expect(restaurantCard).toContain("width={640}");
    expect(restaurantCard).toContain("height={400}");
    expect(restaurantDetail).toContain("buildRestaurantSeoPath(restaurant)");
    expect(restaurantDetail).toContain("path: restaurantCanonicalPath");
  });

  it("protects public metadata and private surfaces", () => {
    const html = read("index.html");
    const robots = read("public/robots.txt");
    const seoHook = read("src/hooks/useSeoMeta.ts");
    const prerender = read("scripts/prerender-seo.mjs");
    const notFound = read("src/pages/NotFound.tsx");
    const vercel = read("vercel.json");

    expect(html).toContain('name="robots"');
    expect(html).toContain('property="og:locale" content="fr_CH"');
    expect(robots).not.toContain("User-agent: Googlebot");
    expect(robots).not.toContain("Disallow:");
    expect(seoHook).toContain("snapshotManagedHead");
    expect(seoHook).toContain("restoreManagedHead(previousHead)");
    expect(seoHook).toContain("ensureSeoMetadataForRoute");
    expect(seoHook).toContain("tokSeoOwner");
    expect(notFound).toContain('robots: "noindex,nofollow,noarchive"');
    expect(vercel).toContain('"value": "admin.thetok.ch"');
    expect(vercel).toContain('"key": "X-Robots-Tag"');
    expect(vercel).toContain("espace-client");
    expect(prerender).toContain('path: "/cookies"');
    expect(prerender).toContain('path: "/conditions-restaurateurs"');
    expect(prerender).toContain('path: "/tok-pulse"');
    expect(prerender).toContain("restaurant.rating && Number(restaurant.review_count) > 0");
    expect(prerender).toContain("STRICT_DYNAMIC_SEO");
    expect(prerender).not.toContain("hasOfferCatalog: buildRestaurantOfferCatalog");
  });
});
