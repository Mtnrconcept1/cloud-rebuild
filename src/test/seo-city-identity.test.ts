import { describe, expect, it } from "vitest";

import {
  cityLabel,
  citySlug,
  isCanonicalCitySpelling,
  pickOneRestaurantPerPath,
  winsCityPathConflict,
} from "../lib/seo/cityIdentity.mjs";

describe("identité de commune SEO", () => {
  it("réunit les orthographes d'une même commune sous une seule URL", () => {
    // « Carouge » et « Carouge GE » produisaient deux pages locales concurrentes.
    expect(citySlug("Carouge GE")).toBe("carouge");
    expect(citySlug("Carouge")).toBe("carouge");
    // La ligature ne se décompose pas en NFD : elle produisait le slug cassé « vand-uvres ».
    expect(citySlug("Vandœuvres")).toBe("vandoeuvres");
    expect(citySlug("Vandoeuvres")).toBe("vandoeuvres");
    expect(citySlug("Corsier GE")).toBe("corsier");
  });

  it("ne tronque une commune que sur un suffixe cantonal terminal", () => {
    for (const city of [
      "Genève",
      "Saint-Gall",
      "Chêne-Bougeries",
      "Le Grand-Saconnex",
      "Aire-la-Ville",
      "La Croix-de-Rozon",
      "Plan-les-Ouates",
      "Athenaz (Avusy)",
      "Yverdon-les-Bains",
    ]) {
      expect(cityLabel(city), `${city} ne doit pas être tronquée`).toBe(city);
      expect(isCanonicalCitySpelling(city)).toBe(true);
    }
    expect(citySlug("Saint-Gall")).toBe("saint-gall");
    expect(citySlug("Athenaz (Avusy)")).toBe("athenaz-avusy");
  });

  it("garde l'orthographe canonique comme titulaire de l'URL", () => {
    expect(isCanonicalCitySpelling("Carouge")).toBe(true);
    expect(isCanonicalCitySpelling("Carouge GE")).toBe(false);
    expect(winsCityPathConflict({ city: "Carouge", id: "z" }, { city: "Carouge GE", id: "a" })).toBe(true);
    expect(winsCityPathConflict({ city: "Carouge GE", id: "a" }, { city: "Carouge", id: "z" })).toBe(false);
  });

  it("départage deux orthographes canoniques de façon reproductible", () => {
    // À égalité, l'identifiant tranche : deux builds successifs doivent choisir la même fiche.
    expect(winsCityPathConflict({ city: "Carouge", id: "a" }, { city: "Carouge", id: "b" })).toBe(true);
    expect(winsCityPathConflict({ city: "Carouge", id: "b" }, { city: "Carouge", id: "a" })).toBe(false);
  });

  it("ne conserve qu'une fiche par URL sans en perdre silencieusement", () => {
    const entries = [
      { id: "2", city: "Carouge GE", slug: "le-jardin-de-pinchat" },
      { id: "1", city: "Carouge", slug: "le-jardin-de-pinchat" },
      { id: "3", city: "Carouge", slug: "le-bouchon" },
    ];
    const byPath = pickOneRestaurantPerPath(
      entries,
      (entry) => `/restaurants/${citySlug(entry.city)}/r/${entry.slug}`,
    );

    expect(byPath.size).toBe(2);
    // La fiche à l'orthographe canonique l'emporte, quel que soit l'ordre de lecture.
    expect(byPath.get("/restaurants/carouge/r/le-jardin-de-pinchat")?.id).toBe("1");
    expect(byPath.get("/restaurants/carouge/r/le-bouchon")?.id).toBe("3");
  });
});
