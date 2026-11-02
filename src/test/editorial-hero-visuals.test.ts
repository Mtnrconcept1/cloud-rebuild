import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getCustomerDashboardVisual, getRestaurantDashboardVisual } from "@/lib/dashboardVisuals";
import { EDITORIAL_ROUTE_HEROES, getEditorialHeroVisual } from "@/lib/editorialHeroVisuals";

const restaurantRoutes = [
  "/dashboard", "/dashboard/restaurant", "/dashboard/advisor", "/dashboard/menu",
  "/dashboard/reservations", "/dashboard/commandes", "/dashboard/recommandations",
  "/dashboard/performances", "/dashboard/comparaison", "/dashboard/avis", "/dashboard/compta",
  "/dashboard/factures", "/dashboard/factures/entrees", "/dashboard/factures/sorties",
  "/dashboard/factures/parametres", "/dashboard/mon-compte-facturation", "/dashboard/offres",
  "/dashboard/ventes-flash", "/dashboard/formules", "/dashboard/photos", "/dashboard/promotions",
  "/dashboard/campagne-overview", "/dashboard/reseaux-sociaux", "/dashboard/actualites",
  "/dashboard/campagnes", "/dashboard/campaign-studio", "/dashboard/crm", "/dashboard/notifications",
  "/dashboard/support", "/dashboard/service", "/dashboard/equipe", "/dashboard/plan-salle",
  "/dashboard/plan-salle-v2", "/dashboard/guide", "/dashboard/tok-connect",
] as const;

const clientRoutes = [
  "/mon-espace", "/reservations", "/commandes", "/panier", "/mes-avis", "/anti-gaspi",
  "/ventes-flash", "/actualites", "/chefs-table", "/zero-attente", "/creneaux-garantis",
  "/flex-prix-bas", "/match-groupes", "/multi-stop", "/multi-restaurant", "/garantie-qualite",
  "/budget-auto", "/tok-one", "/abonnement", "/points-cadeau", "/tok-pulse",
  "/miamz-solidaires", "/notifications", "/memoire-tok", "/contact", "/commande/confirmation",
  "/profil?tab=infos", "/profil?tab=favoris", "/profil?tab=abonnement", "/profil?tab=fidelite",
] as const;

function expectExistingPublicAsset(asset: string) {
  expect(asset.startsWith("/images/")).toBe(true);
  expect(existsSync(path.resolve(process.cwd(), "public", asset.slice(1))), asset).toBe(true);
}

describe("route-specific editorial hero visuals", () => {
  it("assigns a distinct hero to every restaurant page", () => {
    const heroes = restaurantRoutes.map((route) => {
      const hero = getRestaurantDashboardVisual(route)?.hero;
      expect(hero, route).toBeTruthy();
      expectExistingPublicAsset(hero!);
      return hero!;
    });
    expect(new Set(heroes).size).toBe(restaurantRoutes.length);
  });

  it("assigns a distinct hero to every client page", () => {
    const heroes = clientRoutes.map((route) => {
      const [pathname, query = ""] = route.split("?");
      const hero = getCustomerDashboardVisual(pathname, query ? `?${query}` : "")?.hero;
      expect(hero, route).toBeTruthy();
      expectExistingPublicAsset(hero!);
      return hero!;
    });
    expect(new Set(heroes).size).toBe(clientRoutes.length);
  });

  it("resolves generated contextual heroes outside the client and restaurant spaces", () => {
    const generatedHeroDirectory = path.resolve(process.cwd(), "public/images/tok-refonte/heroes");
    const generatedHeroes = readdirSync(generatedHeroDirectory)
      .filter((name) => name.endsWith(".webp"))
      .map((name) => path.join(generatedHeroDirectory, name));
    expect(generatedHeroes).toHaveLength(11);
    expect(new Set(generatedHeroes.map((file) => createHash("sha256").update(readFileSync(file)).digest("hex"))).size)
      .toBe(generatedHeroes.length);
    const editorialHeroes = Object.entries(EDITORIAL_ROUTE_HEROES);
    expect(new Set(editorialHeroes.map(([, hero]) => hero)).size).toBe(editorialHeroes.length);
    for (const [route, hero] of editorialHeroes) {
      expect(getEditorialHeroVisual(route), route).toBe(hero);
      expectExistingPublicAsset(hero);
    }
  });
});
