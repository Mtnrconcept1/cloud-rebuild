import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin operations center", () => {
  it("is routed and listed behind the admin operations feature flag", () => {
    const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
    const adminHome = readFileSync(resolve(root, "src/pages/admin/AdminHome.tsx"), "utf8");

    expect(app).toContain('hasFeature("admin-operations-center")');
    expect(app).toContain("<FeatureSwitch enabled={adminOperationsCenterEnabled} fallback=\"/admin\"><AdminOperationsCenter /></FeatureSwitch>");
    expect(adminHome).toContain('feature: "admin-operations-center"');
  });

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
    expect(page).toContain('searchParams.get("view")');
    expect(page).toContain("setActiveView(requestedView as OperationCenterTab)");
  });

  it("requires a searchable, filtered and confirmed admin alert workflow", () => {
    const component = readFileSync(resolve(root, "src/components/admin/AdminUrgentActions.tsx"), "utf8");

    expect(component).toContain("admin_get_marketplace_alerts");
    expect(component).toContain("admin_reconcile_marketplace_alerts");
    expect(component).toContain("admin_update_marketplace_alert");
    expect(component).toContain("admin_take_marketplace_alert");
    expect(component).toContain("sourceWhitelist");
    expect(component).toContain("isSupportIncidentAlert");
    expect(component).toContain('alert.source === "support"');
    expect(component).toContain('alert.alert_key.startsWith("support:incident:")');
    expect(component).toContain('alert.entity_type === "support_incident"');
    expect(component).toContain("operationalAlerts");
    expect(component).toContain("statusFilter");
    expect(component).not.toContain("refetchInterval");
    expect(component).toContain("refetchOnWindowFocus: false");
    expect(component).toContain("Rechercher restaurant, client, ville, statut ou identifiant");
    expect(component).toContain("window.confirm");
    expect(component).toContain("marketplace alert reconciliation skipped");
    expect(component).toContain("getAdminUrgentActionsErrorMessage");
    expect(component).toContain("isExpanded");
    expect(component).toContain("setIsExpanded");
    expect(component).toContain("Résumé urgent");
    expect(component).toContain("Déplier");
    expect(component).toContain("Accès admin requis pour charger les actions urgentes.");
    expect(component).toContain("Note admin obligatoire pour résoudre/ignorer");
    expect(component).toContain("Alerte prise en charge");
    expect(component).toContain("Pris par moi");
    expect(component).toContain("Déjà pris");
    expect(component).toContain("isTakenByOtherAdmin");
    expect(component).toContain("actionDisabledByClaim");
  });
});
