import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("dashboard overview summaries", () => {
  it("surfaces the key restaurant overview metrics and compact Google configured state", () => {
    const dashboard = read("src/pages/dashboard/DashboardHome.tsx");
    const overview = read("src/components/dashboard/RestaurantDashboardHomeView.tsx");
    const googleCard = read("src/components/dashboard/GoogleBusinessBookingCard.tsx");

    expect(dashboard).toContain("dashboard-today-revenue");
    expect(dashboard).toContain("dashboard-active-campaigns-count");
    expect(overview).toContain("Commandes à venir");
    expect(overview).toContain("Réservations à venir");
    expect(overview).toContain("Chiffre d'affaires du jour");
    expect(overview).toContain("Campagnes pub actives");
    expect(overview).toContain("/fondbanniere.png");
    expect(overview).toContain("/chef3.png");
    expect(overview).toContain("Mettre mon restaurant en avant");

    expect(googleCard).toContain('if (isConfigured)');
    expect(googleCard).toContain("Bouton google configuré");
    expect(googleCard).toContain("Vu");
    expect(googleCard).toContain("Réservations Google");
  });
});
