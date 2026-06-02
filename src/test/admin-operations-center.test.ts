import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin operations center", () => {
  it("exposes live operational tabs backed by the marketplace alert queue", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminOperationsCenter.tsx"), "utf8");

    expect(page).toContain("Operations Center");
    expect(page).toContain("Live");
    expect(page).toContain("Paiements");
    expect(page).toContain("Remboursements");
    expect(page).toContain("Dispatch");
    expect(page).toContain("Réservations");
    expect(page).toContain("Historique");
    expect(page).toContain("sourceWhitelist");
    expect(page).toContain("paiements");
    expect(page).toContain("dispatch");
    expect(page).toContain("réservations");
  });

  it("requires a searchable, filtered and confirmed admin alert workflow", () => {
    const component = readFileSync(resolve(root, "src/components/admin/AdminUrgentActions.tsx"), "utf8");

    expect(component).toContain("admin_get_marketplace_alerts");
    expect(component).toContain("admin_update_marketplace_alert");
    expect(component).toContain("sourceWhitelist");
    expect(component).toContain("statusFilter");
    expect(component).not.toContain("refetchInterval");
    expect(component).toContain("refetchOnWindowFocus: false");
    expect(component).toContain("Rechercher restaurant, client, ville, statut ou identifiant");
    expect(component).toContain("window.confirm");
    expect(component).toContain("Note admin obligatoire pour résoudre/ignorer");
  });
});
