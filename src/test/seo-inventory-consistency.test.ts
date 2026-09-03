import { describe, expect, it } from "vitest";

import {
  reconcileCityInventoryHtml,
  removeDemotedCitiesFromSitemap,
} from "../../scripts/harden-seo-inventory-consistency.mjs";

function cityHtml() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: 5,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "A", url: "https://www.thetok.ch/restaurants/geneve/r/a", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/a", name: "A", servesCuisine: "Italien" } },
      { "@type": "ListItem", position: 2, name: "B", url: "https://www.thetok.ch/restaurants/geneve/r/b", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/b", name: "B", servesCuisine: "Sushi" } },
      { "@type": "ListItem", position: 3, name: "Duplicate", url: "https://www.thetok.ch/restaurants/geneve/r/duplicate", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/duplicate", name: "Duplicate" } },
    ],
  };
  return `<!doctype html><html><head><meta name="robots" content="index,follow"><script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body><p>5 adresses actives sont répertoriées sur cette page.</p><section><h2>Restaurants disponibles</h2><ul><li>A — Italien</li><li>B — Sushi</li><li>Duplicate</li></ul></section></body></html>`;
}

describe("SEO inventory consistency", () => {
  it("synchronizes city counts and visible listings with final indexable restaurant routes", () => {
    const allowed = new Set([
      "/restaurants/geneve/r/a",
      "/restaurants/geneve/r/b",
      "/restaurants/geneve/r/c",
      "/restaurants/geneve/r/d",
    ]);
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 4, allowed, { minimum: 3 });
    const parsed = JSON.parse(rewritten.match(/<script id="tok-page-json-ld"[^>]*>([\s\S]*?)<\/script>/)?.[1] || "null");

    expect(parsed.numberOfItems).toBe(4);
    expect(parsed.itemListElement).toHaveLength(2);
    expect(parsed.itemListElement.map((item: { position: number }) => item.position)).toEqual([1, 2]);
    expect(rewritten).toContain("4 adresses actives sont répertoriées sur cette page.");
    expect(rewritten).toContain("A — Italien");
    expect(rewritten).toContain("B — Sushi");
    expect(rewritten).not.toContain("<li>Duplicate</li>");
    expect(rewritten).toContain('content="index,follow"');
  });

  it("demotes a city that falls below the minimum only after final detail deduplication", () => {
    const allowed = new Set(["/restaurants/geneve/r/a", "/restaurants/geneve/r/b"]);
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 2, allowed, { minimum: 3 });
    expect(rewritten).toContain('content="noindex,follow,noarchive"');
    expect(rewritten).toContain("2 adresses actives sont répertoriées sur cette page.");
  });

  it("uses correct singular grammar for a one-address residual city page", () => {
    const allowed = new Set(["/restaurants/geneve/r/a"]);
    const rewritten = reconcileCityInventoryHtml(cityHtml(), 1, allowed, { minimum: 3 });
    expect(rewritten).toContain("1 adresse active est répertoriée sur cette page.");
  });

  it("removes only newly demoted city pages from the restaurant sitemap", () => {
    const xml = `<urlset><url><loc>https://www.thetok.ch/restaurants/geneve</loc></url><url><loc>https://www.thetok.ch/restaurants/lausanne</loc></url><url><loc>https://www.thetok.ch/restaurants/geneve/r/a</loc></url></urlset>`;
    const rewritten = removeDemotedCitiesFromSitemap(xml, new Set(["/restaurants/lausanne"]));
    expect(rewritten).toContain("/restaurants/geneve</loc>");
    expect(rewritten).toContain("/restaurants/geneve/r/a");
    expect(rewritten).not.toContain("/restaurants/lausanne");
  });
});
