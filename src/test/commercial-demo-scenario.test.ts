import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("commercial demo restaurant scenarios", () => {
  const scenario = read("src/components/dashboard/CommercialDemoScenario.tsx");
  const home = read("src/pages/dashboard/DashboardHome.tsx");
  const orders = read("src/pages/dashboard/DashboardCommandes.tsx");
  const reservations = read("src/pages/dashboard/DashboardReservations.tsx");
  const accounting = read("src/pages/dashboard/DashboardFactures.tsx");

  it("routes demo accounts away from every live operational page", () => {
    expect(home).toContain("isDemoMode ? <CommercialDemoHome /> : <LiveDashboard />");
    expect(orders).toContain("isDemoMode ? <CommercialDemoOrders /> : <LiveDashboardCommandes />");
    expect(reservations).toContain("isDemoMode ? <CommercialDemoReservations /> : <LiveDashboardReservations />");
    expect(accounting).toContain("isDemoMode ? <CommercialDemoAccounting /> : <LiveDashboardFactures />");
  });

  it("keeps the scenario independent from database and external operations", () => {
    for (const forbiddenCall of [
      "supabase",
      "useQuery(",
      "useMutation(",
      "invokeSupabaseFunction",
      "dispatchQueuedNotifications",
      "processRefund",
      "fetch(",
      "axios",
      "localStorage",
      "sessionStorage",
    ]) {
      expect(scenario).not.toContain(forbiddenCall);
    }
  });

  it("labels examples and explains the safety boundary", () => {
    expect(scenario).toContain("100 % simulé");
    expect(scenario).toContain("Aucune commande, réservation, notification ou opération financière réelle n'est créée");
    expect(scenario).toContain("action locale uniquement");
  });

  it("supports local order and reservation demonstrations with reset", () => {
    expect(scenario).toContain("setOrders((current)");
    expect(scenario).toContain("setReservations((current)");
    expect(scenario).toContain("Réinitialiser le scénario");
    expect(scenario).toContain("Confirmer (démo)");
    expect(scenario).toContain("Annuler (démo)");
    expect(scenario).toContain("Export désactivé en démo");
    expect(scenario).toContain('status: "delivering"');
    expect(scenario).not.toContain('dateAt(0, 0, 0).toISOString().slice(0, 10)');
  });
});
