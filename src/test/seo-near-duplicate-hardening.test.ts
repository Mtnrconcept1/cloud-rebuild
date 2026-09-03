import { describe, expect, it } from "vitest";

import {
  buildNearDuplicatePlan,
  demoteNearDuplicateHtml,
  normalizeNearDuplicateName,
  removeNearDuplicatesFromSitemap,
} from "../../scripts/harden-seo-near-duplicates.mjs";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  name: "Restaurant Test",
  legal_name: "Restaurant Test",
  slug: "restaurant-test",
  city: "Genève",
  address: "Rue de Test 1",
  is_directory_listing: true,
  directory_public_name_source: "og_site_name",
  directory_public_name_source_url: "https://restaurant-test.ch",
  ...overrides,
});

describe("SEO near-duplicate hardening", () => {
  it("normalizes only neutral venue descriptors and city suffixes", () => {
    expect(normalizeNearDuplicateName("Brasserie Lipp Genève", "Genève")).toBe("lipp");
    expect(normalizeNearDuplicateName("Brasserie Lipp", "Genève")).toBe("lipp");
    expect(normalizeNearDuplicateName("A-NAM Restaurant", "Genève")).toBe("a nam");
    expect(normalizeNearDuplicateName("Thai Food Corner", "Genève")).toBe("thai food corner");
  });

  it("groups same-address descriptive variants but keeps unrelated venues separate", () => {
    const plan = buildNearDuplicatePlan([
      row({ id: "bombay-1", name: "Bombay", legal_name: "Bombay", slug: "bombay", address: "Rue de Berne 11" }),
      row({ id: "bombay-2", name: "Bombay Restaurant", legal_name: "Bombay Restaurant", slug: "bombay-restaurant", address: "Rue de Berne 11" }),
      row({ id: "thai", name: "Thai Food Corner", legal_name: "Thai Food Corner", slug: "thai-food-corner", address: "Rue de Berne 11" }),
    ]);

    expect(plan.loserToWinner.get("/restaurants/geneve/r/bombay-restaurant")?.winnerRoute).toBe("/restaurants/geneve/r/bombay");
    expect(plan.loserToWinner.has("/restaurants/geneve/r/thai-food-corner")).toBe(false);
  });

  it("chooses the slug closest to the effective restaurant name as canonical", () => {
    const plan = buildNearDuplicatePlan([
      row({ id: "legacy", name: "Giardino Romano", legal_name: "FATOREST SA", slug: "fatorest-sa", address: "Rue de Saint-Jean 30A", directory_public_name_source: "jsonld_restaurant" }),
      row({ id: "semantic", name: "Giardino Romano", legal_name: "Giardino Romano", slug: "giardino-romano", address: "Rue de Saint-Jean 30A", directory_public_name_source: "og_site_name" }),
    ]);

    expect(plan.loserToWinner.get("/restaurants/geneve/r/fatorest-sa")?.winnerRoute).toBe("/restaurants/geneve/r/giardino-romano");
    expect(plan.loserToWinner.has("/restaurants/geneve/r/giardino-romano")).toBe(false);
  });

  it("uses corrected effective names before grouping, preventing Swisscanonica airport false merges", () => {
    const plan = buildNearDuplicatePlan([
      row({ id: "a", name: "Swisscanonica", legal_name: "All You Need Bar & Shop", slug: "all-you-need-bar-shop", address: "Route de l'Aéroport 15" }),
      row({ id: "b", name: "Swisscanonica", legal_name: "Breaktime", slug: "breaktime", address: "Route de l'Aéroport 15" }),
      row({ id: "c", name: "Swisscanonica", legal_name: "CANO'CAFÉ - Arrivée", slug: "cano-cafe-arrivee", address: "Route de l'Aéroport 15" }),
      row({ id: "d", name: "Swisscanonica", legal_name: "Soho Coffee Shop", slug: "soho-coffee-shop", address: "Route de l'Aéroport 15" }),
    ]);

    expect(plan.loserToWinner.size).toBe(0);
  });

  it("groups objective web artefacts with their corrected sibling name", () => {
    const plan = buildNearDuplicatePlan([
      row({ id: "m1", name: "Mamasan - Vernier", legal_name: "Mamasan - Vernier", slug: "mamasan-vernier-172a0351", city: "Vernier", address: "Chemin de Champ-Claude 1A" }),
      row({ id: "m2", name: "Mamasan Web", legal_name: "Mamasan - Vernier", slug: "mamasan-vernier-b315506b", city: "Vernier", address: "Chemin de Champ-Claude 1A" }),
    ]);

    expect(plan.loserToWinner.size).toBe(1);
    const [loserRoute, duplicate] = [...plan.loserToWinner.entries()][0];
    expect([loserRoute, duplicate.winnerRoute].sort()).toEqual([
      "/restaurants/vernier/r/mamasan-vernier-172a0351",
      "/restaurants/vernier/r/mamasan-vernier-b315506b",
    ].sort());
  });

  it("demotes the loser with noindex and a canonical winner while removing structured data", () => {
    const loserRoute = "/restaurants/geneve/r/bombay-restaurant";
    const winnerRoute = "/restaurants/geneve/r/bombay";
    const plan = {
      loserToWinner: new Map([[loserRoute, { winnerRoute, winnerName: "Bombay", loserName: "Bombay Restaurant" }]]),
      groupCount: 1,
    };
    const html = `<!doctype html><html><head><meta name="robots" content="index,follow"><link rel="canonical" href="https://www.thetok.ch${loserRoute}"><meta property="og:url" content="https://www.thetok.ch${loserRoute}"><script id="tok-page-json-ld" type="application/ld+json">{"@type":"Restaurant"}</script></head><body></body></html>`;
    const rewritten = demoteNearDuplicateHtml(html, loserRoute, plan);

    expect(rewritten).toContain('content="noindex,follow,noarchive"');
    expect(rewritten).toContain(`rel="canonical" href="https://www.thetok.ch${winnerRoute}"`);
    expect(rewritten).toContain(`property="og:url" content="https://www.thetok.ch${winnerRoute}"`);
    expect(rewritten).not.toContain("tok-page-json-ld");
  });

  it("removes loser URLs from the restaurant sitemap while keeping the canonical winner", () => {
    const loserRoute = "/restaurants/geneve/r/bombay-restaurant";
    const winnerRoute = "/restaurants/geneve/r/bombay";
    const plan = {
      loserToWinner: new Map([[loserRoute, { winnerRoute, winnerName: "Bombay", loserName: "Bombay Restaurant" }]]),
      groupCount: 1,
    };
    const xml = `<urlset><url><loc>https://www.thetok.ch${winnerRoute}</loc></url><url><loc>https://www.thetok.ch${loserRoute}</loc></url></urlset>`;
    const rewritten = removeNearDuplicatesFromSitemap(xml, plan);

    expect(rewritten).toContain(winnerRoute);
    expect(rewritten).not.toContain(loserRoute);
  });
});
