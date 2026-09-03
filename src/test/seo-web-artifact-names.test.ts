import { describe, expect, it } from "vitest";

import {
  applyWebArtifactOverridesToSitemap,
  buildWebArtifactNameOverrides,
  isObjectiveWebNameArtifact,
} from "../../scripts/harden-seo-web-artifact-names.mjs";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  name: "Restaurant Test",
  legal_name: "Restaurant Test",
  slug: "restaurant-test",
  city: "Genève",
  is_directory_listing: true,
  directory_public_name_source: "og_site_name",
  ...overrides,
});

describe("SEO objective web-name artefacts", () => {
  it("recognizes site labels without treating normal restaurant names as artefacts", () => {
    for (const value of [
      "Mamasan Web",
      "Site Web KINAKO",
      "Monsite 1",
      "Titre de votre site",
      "www.tacorico.ch",
      "JARDIN-PINCHAT.ch",
      "SushiZen | Site officiel du groupe",
    ]) {
      expect(isObjectiveWebNameArtifact(value), value).toBe(true);
    }
    expect(isObjectiveWebNameArtifact("Meltd Home Burgers")).toBe(false);
    expect(isObjectiveWebNameArtifact("Giardino Romano")).toBe(false);
  });

  it("uses a cleaned establishment fallback for branch/site artefacts", () => {
    const overrides = buildWebArtifactNameOverrides([
      row({ name: "Mamasan Web", legal_name: "Mamasan - Pâquis", slug: "mamasan-paquis-1c1d4df5" }),
      row({ name: "Site Web KINAKO", legal_name: "Kinako", slug: "kinako" }),
      row({ name: "Titre de votre site", legal_name: "Poulet 22 SARL", slug: "poulet-22-sarl", city: "Meyrin" }),
      row({ name: "SushiZen | Site officiel du groupe", legal_name: "Sushi Zen SA", slug: "sushi-zen-sa", city: "Vésenaz" }),
    ]);

    expect(overrides.get("/restaurants/geneve/r/mamasan-paquis-1c1d4df5")?.newName).toBe("Mamasan - Pâquis");
    expect(overrides.get("/restaurants/geneve/r/kinako")?.newName).toBe("Kinako");
    expect(overrides.get("/restaurants/meyrin/r/poulet-22-sarl")?.newName).toBe("Poulet 22");
    expect(overrides.get("/restaurants/vesenaz/r/sushi-zen-sa")?.newName).toBe("Sushi Zen");
  });

  it("decodes a broken entity from source metadata even when the semantic name is otherwise valid", () => {
    const overrides = buildWebArtifactNameOverrides([
      row({ name: "Caf&eacute;-Restaurant La Caf", legal_name: "La Caf'", slug: "la-caf", city: "Chêne-Bourg", directory_public_name_source: "application_name" }),
    ]);
    expect(overrides.get("/restaurants/chene-bourg/r/la-caf")?.newName).toBe("Café-Restaurant La Caf");
  });

  it("does not expose a person fallback for an objective website artefact", () => {
    const overrides = buildWebArtifactNameOverrides([
      row({ name: "Monsite", legal_name: "Bernard Julien", slug: "bernard-julien" }),
    ]);
    expect(overrides.size).toBe(0);
  });

  it("updates the route-specific sitemap image title", () => {
    const route = "/restaurants/geneve/r/mamasan-paquis-1c1d4df5";
    const overrides = new Map([[route, { oldName: "Mamasan Web", newName: "Mamasan - Pâquis" }]]);
    const xml = `<urlset><url><loc>https://www.thetok.ch${route}</loc><image:image><image:title>Mamasan Web à Genève | TOK</image:title></image:image></url></urlset>`;
    const rewritten = applyWebArtifactOverridesToSitemap(xml, overrides);
    expect(rewritten).toContain("Mamasan - Pâquis à Genève | TOK");
    expect(rewritten).not.toContain("Mamasan Web");
  });
});
