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
    expect(html).toContain("tok - réservez, commandez et trouvez");
    expect(html).toContain("restaurants pas chers");
    expect(html).toContain("genève");
    expect(html).not.toContain('name="keywords"');
  });

  it("keeps static SEO copy free of mojibake", () => {
    const html = read("index.html");
    const prerender = read("scripts/prerender-seo.mjs");

    expect(html).not.toMatch(MOJIBAKE_PATTERN);
    expect(prerender).not.toMatch(MOJIBAKE_PATTERN);
    expect(html).toContain("TOK - Réservez, commandez et trouvez");
    expect(html).toContain("Réservation restaurant");
    expect(html).toContain("villes suisses");
  });

  it("publishes sitemap and robots entries for public local and B2B pages", () => {
    const robots = read("public/robots.txt");
    const sitemapIndex = read("public/sitemap.xml");
    const pagesSitemap = read("public/sitemap-pages.xml");
    const restaurantSitemap = read("public/sitemap-restaurants.xml");
    const actualitesSitemap = read("public/sitemap-actualites.xml");
    const prerender = read("scripts/prerender-seo.mjs");
    const vercel = read("vercel.json");

    expect(robots).toContain("User-agent: Googlebot");
    expect(robots).toContain("User-agent: OAI-SearchBot");
    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("User-agent: CCBot");
    expect(robots).toMatch(/^Disallow: \/$/m);
    expect(robots).toContain("Sitemap: https://www.thetok.ch/sitemap.xml");
    expect(vercel).toContain('"key": "X-Robots-Tag"');
    expect(vercel).toContain("marketing");
    expect(vercel).toContain("memoire-tok");
    expect(sitemapIndex).toContain("https://www.thetok.ch/sitemap-pages.xml");
    expect(sitemapIndex).toContain("https://www.thetok.ch/sitemap-actualites.xml");
    expect(pagesSitemap).toContain("https://www.thetok.ch/restaurateurs/geneve");
    expect(pagesSitemap).toContain("https://www.thetok.ch/restaurateurs/alternative-commission-couvert");
    expect(pagesSitemap).toContain("https://www.thetok.ch/miamz-solidaires");
    expect(pagesSitemap).toContain("https://www.thetok.ch/aide");
    expect(pagesSitemap).toContain("https://www.thetok.ch/contact");
    expect(actualitesSitemap).toContain("https://www.thetok.ch/actualites");
    expect(restaurantSitemap).toContain("<urlset");
    expect(prerender).toContain('fileName: "sitemap-restaurants.xml"');
    expect(prerender).toContain("MIN_LOCAL_RESTAURANTS");
    expect(prerender).toContain("MIN_SPECIALIZED_LOCAL_RESTAURANTS");
    expect(prerender).toContain("extractRestaurantCuisineSlugs");
    expect(prerender).toContain("LOCAL_INTENTS");
    expect(prerender).toContain("inventoryCount");
    expect([pagesSitemap, restaurantSitemap, actualitesSitemap].join("\n")).not.toMatch(
      /https:\/\/www\.thetok\.ch\/(?:admin|marketing|dashboard|courier|auth|panier|profil|memoire-tok|notifications|commandes|reservations|points-cadeau)(?:\/|<)/,
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
    expect(prerender).toContain('"/memoire-tok"');
    expect(prerender).toContain('"/espaces"');
    expect(prerender).toContain('"/r"');
    expect(prerender).toContain("createClient");
    expect(prerender).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(prerender).toContain('type="application/ld+json"');
    expect(prerender).toContain("SearchAction");
    expect(prerender).toContain("FAQPage");
    expect(prerender).toContain("Commission par couvert restaurant : alternative et comparatif marge");
    expect(prerender).toContain("no-show, groupes, coût d'acquisition");
    expect(prerender).toContain("Logiciel restaurateur à Genève");
    expect(prerender).toContain("Logiciel restaurateur pour réservations, commandes, anti-gaspi");
    expect(prerender).not.toMatch(/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  });

  it("renders meaningful static public content inside the initial app root", () => {
    const prerender = read("scripts/prerender-seo.mjs");

    expect(prerender).toContain("staticContent");
    expect(prerender).toContain('id="tok-prerendered-content"');
    expect(prerender).toContain('<section id="tok-prerendered-content" data-prerendered="true"');
    expect(prerender).toContain('`<div id="root">${renderStaticContent(page)}</div>`');
    expect(prerender).not.toContain("<noscript><section");
    expect(prerender).toContain("La plateforme restaurateur pour transformer la demande locale à Genève.");
    expect(prerender).toContain("Plan d'activation Genève");
    expect(prerender).toContain("Modules restaurateur");
    expect(prerender).toContain("Transformez votre fiche Google Business en canal direct.");
    expect(prerender).toContain("Checklist de bascule");
    expect(prerender).toContain("Commission par couvert : comparez avant de choisir.");
    expect(prerender).toContain("Scénarios chiffrés");
    expect(prerender).toContain("BreadcrumbList");
    expect(prerender).not.toContain('document.getElementById("tok-prerendered-content")');
    expect(prerender).not.toContain("page.lastmod || today");
    expect(prerender).toContain("const lastmod = normalizeSitemapDate(page.lastmod)");
    expect(prerender).toContain("itemListElement: restaurants.slice(0, 100)");
    expect(prerender).toContain('writeIfDirectoryExists(DIST_DIR, "404.html", renderNotFoundHtml(baseHtml))');
    expect(prerender).toContain("noindex,nofollow,noarchive");
    expect(prerender).toContain('html.replace(/\\s*<link\\s+rel="canonical"');
    expect(prerender).not.toContain(
      '<noscript><main><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p></main></noscript>',
    );
  });

  it("wires indexable city and cuisine pages with Restaurant structured data", () => {
    const app = read("src/App.tsx");
    const page = read("src/pages/LocalRestaurants.tsx");
    const restaurantCard = read("src/components/RestaurantCard.tsx");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const restaurantEntity = read("src/lib/seo/restaurantEntity.mjs");
    const seo = read("src/hooks/useSeoMeta.ts");

    expect(app).toContain('/restaurants/:city');
    expect(app).toContain('/restaurants/:city/:category');
    expect(app).toContain('/restaurateurs/geneve');
    expect(app).toContain('/restaurateurs/alternative-commission-couvert');
    expect(app).toContain('/miamz-solidaires');
    expect(page).toContain('"@type": "Restaurant"');
    expect(page).toContain('"@type": "ItemList"');
    expect(page).toContain("DISTRICT_LABELS");
    expect(page).toContain("INTENT_LABELS");
    expect(page).toContain("CATEGORY_ALIASES");
    expect(page).toContain("MIN_SPECIALIZED_LOCAL_RESTAURANTS");
    expect(page).toContain("Restaurants à");
    expect(page).toContain("Découvrez");
    expect(page).toContain("search_restaurant_discovery_catalog");
    expect(page).toContain('lazy(() => import("./RestaurantDetail"))');
    expect(page).not.toContain("restaurants.length === 0))");
    expect(page).toContain("hasConfirmedEmptyInventory");
    expect(page).toContain("unknownListingRoute");
    expect(page).toContain("isSuccess: isListingSuccess");
    expect(page).toContain('"noindex,follow,noarchive"');
    expect(restaurantCard).toContain("to={restaurantPath}");
    expect(restaurantCard).toContain('data-card-action="restaurant-link"');
    expect(restaurantCard).not.toContain('`/restaurant/${id}?reserve=true');
    expect(restaurantDetail).toContain("useSeoMeta");
    expect(restaurantDetail).toContain("buildRestaurantSeoModel");
    expect(restaurantDetail).toContain("jsonLd: restaurantSeoModel?.jsonLd || null");
    expect(restaurantDetail).toContain("<nav aria-label=");
    expect(restaurantEntity).toContain("export function buildRestaurantSeoModel");
    expect(restaurantEntity).toContain('"@type": "Restaurant"');
    expect(restaurantEntity).toContain('"@type": "WebPage"');
    expect(restaurantEntity).toContain('"@type": "BreadcrumbList"');
    expect(restaurantEntity).toContain('"@type": "Menu"');
    expect(seo).toContain("link[rel='canonical']");
    expect(seo).toContain("property='og:url'");
    expect(seo).toContain("https://www.thetok.ch");
    expect(seo).toContain('"/espaces"');
    expect(seo).toContain('"/r"');
  });
});
