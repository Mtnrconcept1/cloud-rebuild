import { describe, expect, it } from "vitest";

import {
  applyDirectoryQualityToHtml,
  applyDirectoryQualityToSitemap,
  buildDirectoryQualityPlan,
} from "../../scripts/harden-seo-directory-quality.mjs";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  name: "Restaurant Test",
  legal_name: "Restaurant Test",
  slug: "restaurant-test",
  city: "Genève",
  image_url: null,
  is_directory_listing: true,
  directory_public_name_source: "og_site_name",
  directory_public_name_source_url: "https://restaurant-test.ch/",
  ...overrides,
});

describe("SEO directory quality hardening", () => {
  it("repairs remaining site-title artefacts even when the fallback contains a legal suffix", () => {
    const plan = buildDirectoryQualityPlan([
      row({ name: "Monsite 1", legal_name: "Lucha Libre", slug: "lucha-libre" }),
      row({ name: "Titre de votre site", legal_name: "Poulet 22 SARL", slug: "poulet-22-sarl", city: "Meyrin" }),
      row({ name: "SushiZen | Site officiel du groupe", legal_name: "Sushi Zen SA", slug: "sushi-zen-sa", city: "Vésenaz" }),
    ]);

    expect(plan.nameOverrides.get("/restaurants/geneve/r/lucha-libre")?.newName).toBe("Lucha Libre");
    expect(plan.nameOverrides.get("/restaurants/meyrin/r/poulet-22-sarl")?.newName).toBe("Poulet 22");
    expect(plan.nameOverrides.get("/restaurants/vesenaz/r/sushi-zen-sa")?.newName).toBe("Sushi Zen");
  });

  it("marks a reused cross-site placeholder image as unsafe but keeps a chain image on one source host", () => {
    const generic = "https://static.parastorage.com/services/restaurant-menus-showcase-ooi/common/media/menus_side_image.jpeg";
    const chain = "https://images.squarespace-cdn.com/brand/logo.png";
    const plan = buildDirectoryQualityPlan([
      row({ slug: "a", name: "A", legal_name: "A", image_url: generic, directory_public_name_source_url: "https://a.ch" }),
      row({ slug: "b", name: "B", legal_name: "B", image_url: generic, directory_public_name_source_url: "https://b.ch" }),
      row({ slug: "c", name: "C", legal_name: "C", image_url: generic, directory_public_name_source_url: "https://c.ch" }),
      row({ slug: "chain-1", name: "Chain", legal_name: "Chain", image_url: chain, directory_public_name_source_url: "https://chain.ch" }),
      row({ slug: "chain-2", name: "Chain", legal_name: "Chain", image_url: chain, directory_public_name_source_url: "https://chain.ch" }),
      row({ slug: "chain-3", name: "Chain", legal_name: "Chain", image_url: chain, directory_public_name_source_url: "https://chain.ch" }),
    ]);

    expect(plan.unsafeImageRoutes.has("/restaurants/geneve/r/a")).toBe(true);
    expect(plan.unsafeImageRoutes.has("/restaurants/geneve/r/b")).toBe(true);
    expect(plan.unsafeImageRoutes.has("/restaurants/geneve/r/c")).toBe(true);
    expect(plan.unsafeImageRoutes.has("/restaurants/geneve/r/chain-1")).toBe(false);
  });

  it("removes unsafe structured images and replaces unsafe social images with the TOK fallback", () => {
    const route = "/restaurants/geneve/r/shogun";
    const plan = {
      nameOverrides: new Map(),
      unsafeImageRoutes: new Set([route]),
      genericImageUrls: new Set(),
    };
    const html = `<!doctype html><html><head><meta property="og:image" content="https://moto911.com/wrong.jpg"><meta name="twitter:image" content="https://moto911.com/wrong.jpg"><script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "@id": `https://www.thetok.ch${route}`,
      name: "Shogun",
      image: "https://moto911.com/wrong.jpg",
    })}</script></head><body></body></html>`;

    const rewritten = applyDirectoryQualityToHtml(html, route, plan);
    expect(rewritten).toContain('content="https://www.thetok.ch/fond3.png"');
    expect(rewritten).not.toContain('"image":"https://moto911.com/wrong.jpg"');
  });

  it("removes unsafe image entries from the restaurant sitemap and fixes image titles by route", () => {
    const route = "/restaurants/geneve/r/le-samourai";
    const plan = {
      nameOverrides: new Map([[route, { oldName: "Monsite", newName: "Le Samouraï" }]]),
      unsafeImageRoutes: new Set([route]),
      genericImageUrls: new Set(),
    };
    const xml = `<?xml version="1.0"?><urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><url><loc>https://www.thetok.ch${route}</loc><image:image><image:loc>https://bad.example/x.jpg</image:loc><image:title>Monsite à Genève | TOK</image:title></image:image></url></urlset>`;
    const rewritten = applyDirectoryQualityToSitemap(xml, plan);
    expect(rewritten).not.toContain("<image:image>");
    expect(rewritten).not.toContain("Monsite");
  });
});
