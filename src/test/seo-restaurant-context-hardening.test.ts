import { describe, expect, it } from "vitest";

import {
  buildNearbyContextEntries,
  haversineKm,
  insertNearbyContext,
  renderNearbyContext,
} from "../../scripts/harden-seo-restaurant-context.mjs";

describe("SEO restaurant local context", () => {
  it("computes geographic distance from public coordinates", () => {
    const distance = haversineKm(
      { latitude: 46.2044, longitude: 6.1432 },
      { latitude: 46.2000, longitude: 6.1500 },
    );
    expect(distance).toBeGreaterThan(0.6);
    expect(distance).toBeLessThan(0.9);
  });

  it("keeps only nearby indexable candidates in the same commune and sorts them by distance", () => {
    const current = {
      route: "/restaurants/geneve/r/current",
      city: "geneve",
      name: "Current",
      geo: { latitude: 46.2044, longitude: 6.1432 },
    };
    const candidates = [
      current,
      { route: "/restaurants/geneve/r/far", city: "geneve", name: "Far", geo: { latitude: 46.25, longitude: 6.20 } },
      { route: "/restaurants/carouge/r/other-city", city: "carouge", name: "Other city", geo: { latitude: 46.2045, longitude: 6.1433 } },
      { route: "/restaurants/geneve/r/second", city: "geneve", name: "Second", geo: { latitude: 46.2030, longitude: 6.1450 } },
      { route: "/restaurants/geneve/r/first", city: "geneve", name: "First", geo: { latitude: 46.2040, longitude: 6.1440 } },
    ];

    const nearby = buildNearbyContextEntries(current, candidates, { maxNearby: 4, maxKm: 3 });
    expect(nearby.map((entry) => entry.name)).toEqual(["First", "Second"]);
  });

  it("renders factual linked context only when at least two nearby addresses exist", () => {
    expect(renderNearbyContext([{ route: "/a", name: "A", distanceKm: 0.3 }])).toBe("");
    const rendered = renderNearbyContext([
      { route: "/restaurants/geneve/r/a", name: "A", distanceKm: 0.31 },
      { route: "/restaurants/geneve/r/b", name: "B", distanceKm: 1.24 },
    ]);
    expect(rendered).toContain("Autres restaurants géolocalisés à proximité");
    expect(rendered).toContain("A</a> — environ 300 m");
    expect(rendered).toContain("B</a> — environ 1,2 km");
    expect(rendered).toContain("distances sont calculées à vol d’oiseau");
  });

  it("inserts the context before the existing useful-links navigation without duplicating it", () => {
    const html = '<section id="tok-prerendered-content"><h1>Restaurant</h1><nav aria-label="Liens utiles TOK"><a href="/recherche">Recherche</a></nav></section>';
    const context = '<section id="tok-nearby-seo-context"><h2>Autres restaurants</h2></section>';
    const rewritten = insertNearbyContext(html, context);
    expect(rewritten.indexOf("tok-nearby-seo-context")).toBeLessThan(rewritten.indexOf("Liens utiles TOK"));
    expect(insertNearbyContext(rewritten, context)).toBe(rewritten);
  });
});
