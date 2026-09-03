import { describe, expect, it } from "vitest";

import {
  applyPublicNameOverridesToHtml,
  buildUmbrellaNameSet,
  chooseEffectiveDirectoryName,
  decodeDirectoryText,
} from "../../scripts/harden-seo-public-names.mjs";

const directoryRow = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  name: "Restaurant Test",
  legal_name: "Restaurant Test",
  slug: "restaurant-test",
  city: "Genève",
  is_directory_listing: true,
  directory_public_name_source: "og_site_name",
  directory_public_name_source_url: "https://restaurant-test.ch",
  ...overrides,
});

describe("SEO public directory name hardening", () => {
  it("decodes common HTML entities before exposing a restaurant name", () => {
    expect(decodeDirectoryText("Caf&eacute;-Restaurant La Caf")).toBe("Café-Restaurant La Caf");
  });

  it("falls back to a non-corporate establishment name for objective web artefacts", () => {
    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "Monsite",
      legal_name: "Le Samouraï",
      slug: "le-samourai",
    }))).toBe("Le Samouraï");

    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "Mamasan Web",
      legal_name: "Mamasan - Pâquis",
      slug: "mamasan-paquis-1c1d4df5",
    }))).toBe("Mamasan - Pâquis");

    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "zaïzaï.ch",
      legal_name: "Zaï Zaï",
      slug: "zai-zai",
    }))).toBe("Zaï Zaï");
  });

  it("fixes a proprietor captured as Restaurant JSON-LD only when the venue identity is independently supported", () => {
    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "Romain Vuilleumier",
      legal_name: "La Voile",
      slug: "la-voile",
      directory_public_name_source: "jsonld_restaurant",
    }))).toBe("La Voile");
  });

  it("does not replace valid trading names with legal entities or people", () => {
    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "Giardino Romano",
      legal_name: "FATOREST SA",
      slug: "fatorest-sa",
      directory_public_name_source: "jsonld_restaurant",
    }))).toBe("Giardino Romano");

    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "Café Babel",
      legal_name: "Bernard Julien",
      slug: "bernard-julien",
    }))).toBe("Café Babel");

    expect(chooseEffectiveDirectoryName(directoryRow({
      name: "Black Tap Craft Burgers & Beer",
      legal_name: "Black Tap",
      slug: "black-tap",
      directory_public_name_source: "jsonld_restaurant",
    }))).toBe("Black Tap Craft Burgers & Beer");
  });

  it("detects a website umbrella name reused across unrelated establishments", () => {
    const rows = [
      directoryRow({ id: "a", name: "Swisscanonica", legal_name: "Le Cellier", slug: "le-cellier" }),
      directoryRow({ id: "b", name: "Swisscanonica", legal_name: "Breaktime", slug: "breaktime" }),
      directoryRow({ id: "c", name: "Swisscanonica", legal_name: "CANO'CAFÉ - Arrivée", slug: "cano-cafe-arrivee" }),
    ];
    const umbrellas = buildUmbrellaNameSet(rows);
    expect(umbrellas.has("swisscanonica")).toBe(true);
    expect(chooseEffectiveDirectoryName(rows[0], umbrellas)).toBe("Le Cellier");
  });

  it("rewrites route-aware anchors, JSON-LD and the visible restaurant list without confusing repeated names", () => {
    const overrides = new Map([
      ["/restaurants/geneve/r/le-cellier", { oldName: "Swisscanonica", newName: "Le Cellier" }],
      ["/restaurants/geneve/r/breaktime", { oldName: "Swisscanonica", newName: "Breaktime" }],
    ]);
    const html = `<!doctype html><html><head><script id="tok-page-json-ld" type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 2,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Swisscanonica", url: "https://www.thetok.ch/restaurants/geneve/r/le-cellier", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/le-cellier", name: "Swisscanonica", servesCuisine: "Suisse" } },
        { "@type": "ListItem", position: 2, name: "Swisscanonica", url: "https://www.thetok.ch/restaurants/geneve/r/breaktime", item: { "@type": "Restaurant", "@id": "https://www.thetok.ch/restaurants/geneve/r/breaktime", name: "Swisscanonica", servesCuisine: "Cafe" } },
      ],
    })}</script></head><body><section><h2>Restaurants disponibles</h2><ul><li>Swisscanonica — Suisse</li><li>Swisscanonica — Cafe</li></ul></section><nav><a href="/restaurants/geneve/r/le-cellier">Swisscanonica</a><a href="/restaurants/geneve/r/breaktime">Swisscanonica</a></nav></body></html>`;

    const rewritten = applyPublicNameOverridesToHtml(html, "/restaurants/geneve", overrides);
    expect(rewritten).toContain("Le Cellier — Suisse");
    expect(rewritten).toContain("Breaktime — Cafe");
    expect(rewritten).toContain('href="/restaurants/geneve/r/le-cellier">Le Cellier</a>');
    expect(rewritten).toContain('href="/restaurants/geneve/r/breaktime">Breaktime</a>');
    expect(rewritten).toContain('"name":"Le Cellier"');
    expect(rewritten).toContain('"name":"Breaktime"');
  });
});
