import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicLabels = [
  "src/components/Navbar.tsx",
  "src/pages/ChefsTable.tsx",
  "src/components/ChefTableSlotDialog.tsx",
  "src/components/CustomerDashboardLayout.tsx",
  "src/pages/ClientDashboardHome.tsx",
  "src/pages/Reservations.tsx",
  "src/pages/Panier.tsx",
  "src/pages/Profil.tsx",
  "src/pages/TokOne.tsx",
  "src/pages/TokPulse.tsx",
  "src/pages/Aide.tsx",
  "src/components/ReservationDetailModal.tsx",
  "src/components/PromoCarousel.tsx",
  "src/pages/admin/AdminHome.tsx",
  "src/pages/admin/DropsManagement.tsx",
  "src/components/admin/AdminMobileNavigation.tsx",
  "src/pages/admin/adminComptaShared.ts",
  "src/pages/dashboard/DashboardReservations.tsx",
  "src/pages/dashboard/DashboardMenu.tsx",
  "src/pages/dashboard/dashboardFacturesShared.ts",
  "src/lib/comptaCommissionSources.ts",
  "src/lib/subscriptionEntitlements.ts",
  "src/lib/featureCatalog.ts",
  "src/hooks/useSeoMeta.ts",
] as const;

describe("La Tok d’Or public naming", () => {
  it.each(publicLabels)("uses La Tok d’Or in %s, not the retired product name", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    const visibleSource = file === "src/pages/ChefsTable.tsx"
      ? source.split("\n").filter((line) => !line.includes("La Table du Chef|La Tok d’Or")).join("\n")
      : source;
    expect(visibleSource).not.toMatch(/\b(?:La )?Table du Chef\b/i);
    expect(source).toContain("La Tok d’Or");
  });

  it("preserves stable feature IDs, routing and historic basket names", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/ChefsTable.tsx"), "utf8");
    const flags = readFileSync(resolve(process.cwd(), "src/lib/featureVisibility.ts"), "utf8");
    expect(page).toContain('feature: "chefs_table"');
    expect(page).toContain('topic", "chefs_table"');
    expect(page).toContain('La Table du Chef|La Tok d’Or');
    expect(flags).toContain('feature: "chefs-table"');
    expect(flags).toContain("la table du chef");
  });
});
