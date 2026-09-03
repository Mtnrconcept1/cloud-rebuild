import { describe, expect, it } from "vitest";

import {
  __seoTrustInternals,
  applySeoTrustSignalsToHtml,
  applyTemplateLastmodFloor,
  sanitizeStructuredData,
} from "../../scripts/harden-seo-trust-signals.mjs";

describe("SEO trust signals hardening", () => {
  it("limits home and search copy to the inventory that is actually indexable", () => {
    const home = `<!doctype html><html><head><title>TOK - Réservez, commandez et trouvez un restaurant en Suisse</title><meta name="description" content="old"><meta property="og:title" content="old"><meta property="og:description" content="old"><meta name="twitter:title" content="old"><meta name="twitter:description" content="old"><link rel="canonical" href="https://www.thetok.ch/"></head><body><h1>Réservez un restaurant à Genève et dans les communes couvertes par TOK</h1></body></html>`;
    const search = `<!doctype html><html><head><title>Recherche restaurants à Genève et en Suisse romande | TOK</title><meta name="description" content="old"><meta property="og:title" content="old"><meta property="og:description" content="old"><meta name="twitter:title" content="old"><meta name="twitter:description" content="old"><link rel="canonical" href="https://www.thetok.ch/recherche"></head><body></body></html>`;

    const hardenedHome = applySeoTrustSignalsToHtml(home);
    const hardenedSearch = applySeoTrustSignalsToHtml(search);

    expect(hardenedHome).toContain(`<title>${__seoTrustInternals.ROOT_TITLE}</title>`);
    expect(hardenedHome).toContain("Restaurants à Genève et dans les communes genevoises");
    expect(hardenedHome).not.toContain("restaurant en Suisse");
    expect(hardenedSearch).toContain(`<title>${__seoTrustInternals.SEARCH_TITLE}</title>`);
    expect(hardenedSearch).not.toContain("Suisse romande");
  });

  it("neutralizes unverified booking and ordering claims on directory city and cuisine pages", () => {
    const city = `<!doctype html><html><head><title>Restaurant à Carouge : réserver une table | TOK</title><meta name="description" content="Trouvez un restaurant à Carouge avec TOK : comparez les cuisines, les services de réservation, la commande et les offres locales."><meta property="og:title" content="Restaurant à Carouge : réserver une table | TOK"><meta property="og:description" content="old"><meta name="twitter:title" content="old"><meta name="twitter:description" content="old"><link rel="canonical" href="https://www.thetok.ch/restaurants/carouge"></head><body><h1>Restaurants à Carouge : réservation, commande et bonnes adresses</h1></body></html>`;
    const pizza = `<!doctype html><html><head><title>Pizzeria à Genève : les meilleures adresses | TOK</title><meta name="description" content="Trouvez une pizzeria à Genève, comparez les adresses disponibles et réservez une table ou commandez sur TOK."><meta property="og:title" content="old"><meta property="og:description" content="old"><meta name="twitter:title" content="old"><meta name="twitter:description" content="old"><link rel="canonical" href="https://www.thetok.ch/restaurants/geneve/pizza"></head><body><h1>Pizzerias à Genève : les meilleures adresses à réserver</h1></body></html>`;

    const hardenedCity = applySeoTrustSignalsToHtml(city);
    const hardenedPizza = applySeoTrustSignalsToHtml(pizza);

    expect(hardenedCity).toContain("Restaurants à Carouge : bonnes adresses | TOK");
    expect(hardenedCity).toContain("adresses, cuisines et services disponibles");
    expect(hardenedCity).not.toContain("réserver une table | TOK");
    expect(hardenedPizza).toContain("Pizzerias à Genève : adresses et services | TOK");
    expect(hardenedPizza).toContain("Pizzerias à Genève : adresses et services disponibles");
    expect(hardenedPizza).not.toContain("meilleures adresses");
  });

  it("removes generic TOK artwork from Restaurant JSON-LD and normalizes priceRange", () => {
    const structured = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          primaryImageOfPage: { "@type": "ImageObject", url: "https://www.thetok.ch/fond3.png" },
        },
        {
          "@type": "Restaurant",
          name: "Le Jardin de Pinchat",
          image: ["https://www.thetok.ch/fond3.png"],
          priceRange: "CHF CHF",
        },
      ],
    };

    const hardened = sanitizeStructuredData(structured) as Record<string, unknown>;
    const payload = JSON.stringify(hardened);
    expect(payload).not.toContain("fond3.png");
    expect(payload).not.toContain("CHF CHF");
    expect(payload).toContain('"priceRange":"$$"');
  });

  it("turns empty local pages into nofollow without changing indexable pages", () => {
    const noindex = `<!doctype html><html><head><meta name="robots" content="noindex,follow,noarchive"><link rel="canonical" href="https://www.thetok.ch/restaurants/lausanne"></head><body></body></html>`;
    const indexable = `<!doctype html><html><head><meta name="robots" content="index,follow"><link rel="canonical" href="https://www.thetok.ch/restaurants/carouge"></head><body></body></html>`;
    expect(applySeoTrustSignalsToHtml(noindex)).toContain('content="noindex,nofollow,noarchive"');
    expect(applySeoTrustSignalsToHtml(indexable)).toContain('content="index,follow"');
  });

  it("floors sitemap lastmod at the template release date without faking freshness forever", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://www.thetok.ch/restaurants/carouge</loc><lastmod>2026-09-02</lastmod></url><url><loc>https://www.thetok.ch/restaurants/geneve</loc><lastmod>2026-09-05</lastmod></url></urlset>`;
    const hardened = applyTemplateLastmodFloor(xml, { allUrls: true });
    expect(hardened).toContain("<lastmod>2026-09-03</lastmod>");
    expect(hardened).toContain("<lastmod>2026-09-05</lastmod>");
  });
});
