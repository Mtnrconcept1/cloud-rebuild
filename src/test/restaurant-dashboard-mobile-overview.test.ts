import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("restaurant mobile dashboard overview", () => {
  it("renders the compact mobile overview with live restaurant data and dedicated navigation", () => {
    const overview = read("src/components/dashboard/RestaurantDashboardHomeView.tsx");
    const mobileChrome = read("src/components/dashboard/RestaurantDashboardHomeView.css");

    expect(overview).toContain("data-mobile-restaurant-overview");
    expect(overview).toContain("Votre Dashboard");
    expect(overview).toContain("Réservations");
    expect(overview).toContain("Commandes");
    expect(overview).toContain("Performances");
    expect(overview).toContain("Menu du Jour");
    expect(overview).toContain("Démarrer la campagne");

    expect(overview).toContain('to: "/dashboard/menu"');
    expect(overview).toContain('to: "/dashboard/commandes"');
    expect(overview).toContain('to: "/dashboard/campagnes"');
    expect(overview).toContain('to: "/dashboard/mon-compte-facturation"');

    expect(overview).toContain("dashboard-mobile-today-reservations");
    expect(overview).toContain("dashboard-mobile-menu-items");
    expect(overview).toContain("dashboard-mobile-ready-orders");
    expect(overview).toContain("commercialDemoFrame.snapshot.catalog_items");

    expect(mobileChrome).toContain(":has([data-mobile-restaurant-overview])");
    expect(mobileChrome).toContain('aria-label="Retour à l\'écran précédent"');
    expect(mobileChrome).toContain("restaurant-mobile-menu-trigger");
    expect(mobileChrome).toContain("env(safe-area-inset-bottom");
  });
});
