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
    const googleCard = read("src/components/dashboard/GoogleBusinessBookingCard.tsx");

    expect(dashboard).toContain("dashboard-today-revenue");
    expect(dashboard).toContain("dashboard-active-campaigns-count");
    expect(dashboard).toContain("Commandes à venir");
    expect(dashboard).toContain("Réservations à venir");
    expect(dashboard).toContain("Chiffre d'affaires du jour");
    expect(dashboard).toContain("Campagnes pub actives");
    expect(dashboard).toContain("/fondbanniere.png");
    expect(dashboard).toContain("/chef3.png");
    expect(dashboard).toContain("Mettre mon restaurant en avant");

    expect(googleCard).toContain('if (isConfigured)');
    expect(googleCard).toContain("Bouton google configuré");
    expect(googleCard).toContain("Vu");
    expect(googleCard).toContain("Réservations Google");
  });
});
