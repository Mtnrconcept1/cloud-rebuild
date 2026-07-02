import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const MOJIBAKE_PATTERN = new RegExp([
  "\\u00c3\\u0192",
  "\\u00c3\\u201a",
  "\\u00c3\\u00a2\\u00e2\\u201a\\u00ac\\u00e2\\u201e\\u00a2",
  "\\u00c3\\u00a2\\u00e2\\u201a\\u00ac\\u00c5\\u201c",
  "\\u00c3\\u00a2\\u00e2\\u201a\\u00ac",
  "\\u00ef\\u00bf\\u00bd",
].join("|"));

describe("SEO growth readiness", () => {
  it("keeps the public shell indexable with thetok.ch canonical and OpenGraph URLs", () => {
    const html = read("index.html").toLowerCase();

    expect(html).not.toContain("noindex");
    expect(html).toContain('rel="canonical" href="https://www.thetok.ch/"');
    expect(html).toContain('property="og:url" content="https://www.thetok.ch/"');
    expect(html).toContain('property="og:image" content="https://www.thetok.ch/fond3.png"');
    expect(html).toContain("tok - réservez, commandez et profitez");
    expect(html).toContain("restaurant genève");
    expect(html).toContain("miamz solidaires");
  });

  it("keeps static SEO copy free of mojibake", () => {
    const html = read("index.html");
    const prerender = read("scripts/prerender-seo.mjs");

    expect(html).not.toMatch(MOJIBAKE_PATTERN);
    expect(prerender).not.toMatch(MOJIBAKE_PATTERN);
    expect(html).toContain("TOK - Réservez, commandez et profitez");
    expect(html).toContain("réservation restaurant");
    expect(html).toContain("Miamz");
    expect(html).toContain("Suisse romande");
  });

  it("publishes sitemap and robots entries for public local and B2B pages", () => {
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");

    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toContain("Sitemap: https://www.thetok.ch/sitemap.xml");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /dashboard");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/geneve");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/lausanne");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/geneve/pizza");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/geneve/eaux-vives");
    expect(sitemap).toContain("https://www.thetok.ch/restaurants/geneve/plainpalais");
    expect(sitemap).toContain("https://www.thetok.ch/restaurateurs/geneve");
    expect(sitemap).toContain("https://www.thetok.ch/restaurateurs/alternative-commission-couvert");
    expect(sitemap).toContain("https://www.thetok.ch/miamz-solidaires");
    expect(sitemap).toContain("https://www.thetok.ch/aide");
    expect(sitemap).toContain("https://www.thetok.ch/contact");
    expect(sitemap).not.toMatch(
      /https:\/\/www\.thetok\.ch\/(?:admin|dashboard|courier|auth|panier|profil|notifications|commandes|reservations|points-cadeau)(?:\/|<)/,
    );
  });

  it("wires production build to static prerendering without private Supabase keys", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const prerender = read("scripts/prerender-seo.mjs");

    expect(pkg.scripts["build:prod"]).toContain("vite build --mode production && node ./scripts/prerender-seo.mjs");
    expect(pkg.scripts["seo:sitemap"]).toContain("prerender-seo.mjs --public-only");
    expect(prerender).toContain("PRIVATE_ROUTE_PREFIXES");
    expect(prerender).toContain('"/admin"');
    expect(prerender).toContain('"/dashboard"');
    expect(prerender).toContain("createClient");
    expect(prerender).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(prerender).toContain('type="application/ld+json"');
    expect(prerender).toContain("SearchAction");
    expect(prerender).toContain("FAQPage");
    expect(prerender).toContain("Commission par couvert restaurant : alternative et comparatif marge");
    expect(prerender).toContain("no-show, groupes, coût d'acquisition");
    expect(prerender).toContain("Logiciel restaurateur à Genève");
    expect(prerender).toContain("Logiciel restaurateur pour réservations, commandes, anti-gaspi");
    expect(prerender).toContain("toCanonicalAssetUrl");
    expect(prerender).toContain('url.pathname.startsWith("/storage/v1/object/public/")');
    expect(prerender).toContain("image: toCanonicalAssetUrl(restaurant.image_url || DEFAULT_IMAGE)");
    expect(prerender).not.toMatch(/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  });

  it("renders meaningful static B2B content beyond a minimal noscript fallback", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    expect(prerender).toContain("staticContent");
    expect(prerender).toContain('id="tok-prerendered-content"');
    expect(prerender).toContain('<noscript><section id="tok-prerendered-content"');
    expect(prerender).toContain("La plateforme restaurateur pour transformer la demande locale à Genève.");
    expect(prerender).toContain("Plan d'activation Genève");
    expect(prerender).toContain("Modules restaurateur");
    expect(prerender).toContain("Transformez votre fiche Google Business en canal direct.");
    expect(prerender).toContain("Checklist de bascule");
    expect(prerender).toContain("Commission par couvert : comparez avant de choisir.");
    expect(prerender).toContain("Scénarios chiffrés");
    expect(prerender).toContain("BreadcrumbList");
    expect(prerender).not.toContain('document.getElementById("tok-prerendered-content")');
    expect(prerender).not.toContain(
      '<noscript><main><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p></main></noscript>',
    );
  });

  it("wires indexable city and cuisine pages with Restaurant structured data", () => {
    const app = read("src/App.tsx");
    const page = read("src/pages/LocalRestaurants.tsx");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const seo = read("src/hooks/useSeoMeta.ts");

    expect(app).toContain('/restaurants/:city');
    expect(app).toContain('/restaurants/:city/:category');
    expect(app).toContain('/restaurateurs/geneve');
    expect(app).toContain('/restaurateurs/alternative-commission-couvert');
    expect(app).toContain('/miamz-solidaires');
    expect(page).toContain('"@type": "Restaurant"');
    expect(page).toContain('"@type": "ItemList"');
    expect(page).toContain("DISTRICT_LABELS");
    expect(page).toContain("Restaurants à");
    expect(page).toContain("Découvrez");
    expect(page).toContain("search_restaurants_catalog");
    expect(restaurantDetail).toContain("useSeoMeta");
    expect(restaurantDetail).toContain("buildRestaurantDetailJsonLd");
    expect(restaurantDetail).toContain('"@type": "Restaurant"');
    expect(restaurantDetail).toContain("const restaurantPath = canonicalPath || `/restaurant/${restaurantId}`");
    expect(restaurantDetail).toContain("buildCanonicalUrl(restaurantPath)");
    expect(restaurantDetail).toContain("buildCanonicalAssetUrl(heroImage)");
    expect(seo).toContain("link[rel='canonical']");
    expect(seo).toContain("property='og:url'");
    expect(seo).toContain("buildCanonicalAssetUrl");
    expect(seo).toContain("toTokPublicAssetUrl(path, path || \"/fond3.png\")");
    expect(seo).toContain("https://www.thetok.ch");
  });
});
