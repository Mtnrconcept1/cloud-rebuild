import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("accounting dashboard clarity and responsiveness", () => {
  it("shows accessible category breakdowns on admin and restaurant overviews", () => {
    const breakdown = readProjectFile("src/components/invoices/AccountingBreakdownCard.tsx");
    const admin = readProjectFile("src/pages/admin/AdminCompta.tsx");
    const adminShared = readProjectFile("src/pages/admin/adminComptaShared.ts");
    const restaurant = readProjectFile("src/pages/dashboard/DashboardFactures.tsx");
    const restaurantShared = readProjectFile("src/pages/dashboard/dashboardFacturesShared.ts");

    expect(breakdown).toContain('role="progressbar"');
    expect(breakdown).toContain("aria-valuenow");
    expect(breakdown).toContain("Aucun mouvement dans cette catégorie");
    expect(breakdown).toContain("min-w-0 overflow-hidden");

    expect(admin).toContain("D'où viennent les recettes Tok");
    expect(admin).toContain("Dépenses réelles et engagements");
    expect(admin).toContain("Commissions marketplace");
    expect(admin).toContain("Part développeur réservée");
    expect(admin).toContain("Charges marketing enregistrées");
    expect(admin).toContain("Reste pilotable après politiques");
    expect(admin).toContain("- developerReservedShare");
    expect(adminShared).toContain("admin_platform_finance_monthly_snapshot");
    expect(adminShared).toContain('Intl.NumberFormat("fr-CH"');
    expect(restaurantShared).toContain('Intl.NumberFormat("fr-CH"');

    expect(restaurant).toContain("Vos recettes par activité");
    expect(restaurant).toContain("Vos coûts Tok en préparation");
    expect(restaurant).toContain("Frais fixes de réservation");
  });

  it("renders every invoice history as one responsive card list without horizontal scrolling", () => {
    const paths = [
      "src/pages/admin/AdminComptaInflow.tsx",
      "src/pages/admin/AdminComptaOutflow.tsx",
      "src/pages/dashboard/DashboardFacturesInflow.tsx",
      "src/pages/dashboard/DashboardFacturesOutflow.tsx",
    ];

    paths.forEach((path) => {
      const source = readProjectFile(path);

      expect(source).toContain("function InvoiceListItem");
      expect(source).toContain('className="space-y-3"');
      expect(source).not.toContain('@/components/ui/table');
      expect(source).not.toContain("overflow-x-auto");
    });

    const adminOutflow = readProjectFile("src/pages/admin/AdminComptaOutflow.tsx");
    const restaurantInflow = readProjectFile("src/pages/dashboard/DashboardFacturesInflow.tsx");
    expect(adminOutflow).toContain('role="region"');
    expect(adminOutflow).toContain("aria-expanded");
    expect(restaurantInflow).toContain('role="region"');
    expect(restaurantInflow).toContain("aria-controls");

    const payableDocument = readProjectFile("src/components/invoices/TokPayableInvoiceDocument.tsx");
    expect(payableDocument).toContain('className="space-y-3"');
    expect(payableDocument).not.toContain("md:hidden");
    expect(payableDocument).not.toContain("overflow-x-auto");
  });

  it("presents invoice statuses in plain French", () => {
    const status = readProjectFile("src/lib/invoicePresentation.ts");

    for (const label of ["Payée", "En retard", "Brouillon", "Annulée", "À régler", "À traiter"]) {
      expect(status).toContain(label);
    }
  });

  it("routes the accounting shortcut to the accounting dashboard and names it clearly", () => {
    const app = readProjectFile("src/App.tsx");
    const layout = readProjectFile("src/components/DashboardLayout.tsx");

    expect(app).toContain('path="/dashboard/compta"');
    expect(app).toContain('dashboardFacturesEnabled ? "/dashboard/factures"');
    expect(layout).toContain('title: "Finances"');
    expect(layout).toContain('label: "Comptabilité & factures"');
  });
});
