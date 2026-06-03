import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("SEO growth readiness", () => {
  it("keeps the public shell indexable with thetok.ch canonical and OpenGraph URLs", () => {
    const html = read("index.html").toLowerCase();

    expect(html).not.toContain("noindex");
    expect(html).toContain('rel="canonical" href="https://www.thetok.ch/"');
    expect(html).toContain('property="og:url" content="https://www.thetok.ch/"');
    expect(html).toContain('property="og:image" content="https://www.thetok.ch/fond3.png"');
  });

  it("keeps static SEO copy free of mojibake", () => {
    const html = read("index.html");

    expect(html).not.toMatch(/Ã|Â|â€™|â€œ|â€|�/);
    expect(html).toContain("Tok — Commandez malin, mangez bien");
    expect(html).toContain("fidélité");
    expect(html).toContain("zéro déchet");
    expect(html).toContain("jusqu&#39;à -70%");
  });

  it("publishes sitemap and robots entries for local restaurant pages", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");

    expect(robots).not.toContain("Disallow: /");
    expect(robots).toContain("Sitemap: https://www.thetok.ch/sitemap.xml");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/geneve");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/lausanne");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/geneve/pizza");
  });

  it("wires indexable city and cuisine pages with Restaurant structured data", () => {
    const app = read("src/App.tsx");
    const page = read("src/pages/LocalRestaurants.tsx");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const seo = read("src/hooks/useSeoMeta.ts");

    expect(app).toContain('/restaurants/:city');
    expect(app).toContain('/restaurants/:city/:category');
    expect(page).toContain('"@type": "Restaurant"');
    expect(page).toContain('"@type": "ItemList"');
    expect(page).toContain("search_restaurants_catalog");
    expect(restaurantDetail).toContain("useSeoMeta");
    expect(restaurantDetail).toContain("buildRestaurantDetailJsonLd");
    expect(restaurantDetail).toContain('"@type": "Restaurant"');
    expect(restaurantDetail).toContain("buildCanonicalUrl(`/restaurant/${restaurantId}`)");
    expect(seo).toContain("link[rel='canonical']");
    expect(seo).toContain("property='og:url'");
    expect(seo).toContain("https://www.thetok.ch");
  });
});
