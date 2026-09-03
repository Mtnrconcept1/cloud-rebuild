import { describe, expect, it } from "vitest";

import {
  buildArticleDuplicatePlan,
  buildDomainIdentityOverrides,
  normalizeFinalDuplicateName,
} from "../../scripts/harden-seo-final-quality.mjs";

describe("SEO final quality hardening", () => {
  it("replaces a domain-shaped public name when its stem is the same legal venue name", () => {
    const rows = [{
      id: "zai",
      name: "zaïzaï.ch",
      legal_name: "Zaï Zaï",
      slug: "zai-zai",
      city: "Genève",
      address: "Passage de Saint-François 4",
      is_directory_listing: true,
    }];

    const overrides = buildDomainIdentityOverrides(rows);
    expect(overrides.get("/restaurants/geneve/r/zai-zai")).toEqual({
      oldName: "zaïzaï.ch",
      newName: "Zaï Zaï",
    });
  });

  it("does not replace an unrelated domain-shaped name", () => {
    const rows = [{
      id: "unrelated",
      name: "example.ch",
      legal_name: "Restaurant du Lac",
      slug: "restaurant-du-lac",
      city: "Genève",
      address: "Quai 1",
      is_directory_listing: true,
    }];
    expect(buildDomainIdentityOverrides(rows).size).toBe(0);
  });

  it("ignores only a leading article when comparing same-address duplicates", () => {
    expect(normalizeFinalDuplicateName("La Cantine des Commerçants", "Genève"))
      .toBe(normalizeFinalDuplicateName("Cantine des Commerçants", "Genève"));

    const rows = [
      {
        id: "canonical",
        name: "Cantine des Commerçants",
        legal_name: null,
        slug: "cantine-des-commercants",
        city: "Genève",
        address: "Avenue de Sainte-Clotilde 18",
        is_directory_listing: true,
      },
      {
        id: "duplicate",
        name: "La Cantine des Commerçants",
        legal_name: "TARAUD & Co",
        slug: "taraud-co",
        city: "Genève",
        address: "Avenue de Sainte-Clotilde 18",
        is_directory_listing: true,
      },
      {
        id: "other-address",
        name: "La Cantine des Commerçants - Plainpalais",
        legal_name: null,
        slug: "la-cantine-des-commercants-plainpalais",
        city: "Genève",
        address: "Boulevard Carl-Vogt 29",
        is_directory_listing: true,
      },
    ];

    const plan = buildArticleDuplicatePlan(rows, new Map());
    expect(plan.loserToWinner.get("/restaurants/geneve/r/taraud-co")?.winnerRoute)
      .toBe("/restaurants/geneve/r/cantine-des-commercants");
    expect(plan.loserToWinner.has("/restaurants/geneve/r/la-cantine-des-commercants-plainpalais"))
      .toBe(false);
  });
});
