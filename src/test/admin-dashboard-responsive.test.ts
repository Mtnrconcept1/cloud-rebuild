import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("responsive admin dashboard design", () => {
  it("groups every admin tool into the six approved categories", () => {
    const home = read("src/pages/admin/AdminHome.tsx");

    for (const category of [
      "Utilisateurs, Partenaires et équipe",
      "Réservations & services",
      "Clients & marketing",
      "Finances & abonnements",
      "Sécurité & assistance",
      "Plateforme & outils",
    ]) {
      expect(home).toContain(`title: "${category}"`);
    }

    expect(home).toContain('toolTitles: ["Utilisateurs", "Restaurants", "Dossiers d\'inscription", "Profils livreurs", "Comptes commerciaux", "TOK Équipe"]');
    expect(home).toContain("OPTIMIZED_TOK_LOGO_SRC");
  });

  it("provides a compact desktop grid and a mobile category detail sheet", () => {
    const home = read("src/pages/admin/AdminHome.tsx");
    const navigation = read("src/components/admin/AdminMobileNavigation.tsx");
    const app = read("src/App.tsx");

    expect(home).toContain("hidden grid-cols-3 gap-3 xl:grid");
    expect(home).toContain("xl:hidden");
    expect(home).toContain('placeholder="Rechercher dans cette catégorie…"');
    expect(navigation).toContain('aria-label="Navigation admin mobile"');
    expect(navigation).toContain("md:hidden");
    expect(navigation).toContain("hidden w-20");
    expect(app).toContain("md:pl-20");
  });
});
