import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant dashboard campaign unification", () => {
  it("keeps campaigns and advanced campaigns on one restaurateur dashboard page", () => {
    const app = read("src/App.tsx");
    const layout = read("src/components/DashboardLayout.tsx");
    const campaigns = read("src/pages/dashboard/DashboardCampagnes.tsx");

    expect(layout).toContain('to: "/dashboard/campagnes", label: "Campagnes"');
    expect(layout).not.toContain("Campagnes avancees");
    expect(layout).not.toContain("Campagnes avancées");

    expect(app).toContain('path="/dashboard/campagne-overview" element={<Navigate to="/dashboard/campagnes" replace />}');
    expect(campaigns).toContain("Vue globale des campagnes");
    expect(campaigns).toContain("Campagnes actives");
    expect(campaigns).toContain("Historique des campagnes");
    expect(campaigns).toContain("selectedCampaign");
    expect(campaigns).toContain("Détail de campagne");
    expect(campaigns).toContain("CPC moyen");
    expect(campaigns).toContain("Coût global");
    expect(campaigns).toContain("Conversions");
    expect(campaigns).toContain("Impressions");
  });
  it("allows 250 characters on restaurant card campaign copy", () => {
    const campaigns = read("src/pages/dashboard/DashboardCampagnes.tsx");

    expect(campaigns).toContain("const copyLimit = 250;");
    expect(campaigns).not.toContain('placementSelection.banner ? 250 : 100');
  });

});
