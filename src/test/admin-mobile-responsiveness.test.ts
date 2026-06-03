import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("admin mobile responsiveness guards", () => {
  it("renders shared tables as labeled cards below md", () => {
    const table = readProjectFile("src/components/ui/table.tsx");

    expect(table).toContain("overflow-x-hidden md:overflow-auto");
    expect(table).toContain("max-md:block");
    expect(table).toContain("max-md:sr-only");
    expect(table).toContain("max-md:before:content-[attr(data-label)]");
    expect(table).toContain("max-md:[overflow-wrap:anywhere]");
  });

  it("labels dense admin order, reservation and refund table cells", () => {
    const page = readProjectFile("src/pages/admin/AdminOrdersReservations.tsx");

    for (const label of ["Date", "Commande", "Client", "Restaurant", "Détails", "Statut", "Montant", "Action", "Réservation", "Référence"]) {
      expect(page).toContain(`data-label="${label}"`);
    }

    expect(page).toContain("md:whitespace-nowrap");
    expect(page).toContain("md:text-right");
    expect(page).not.toContain('className="whitespace-nowrap text-sm text-muted-foreground"');
  });

  it("keeps audit log tables and admin cards from forcing mobile horizontal scroll", () => {
    const auditLogs = readProjectFile("src/pages/admin/AdminAuditLogs.tsx");
    const reviews = readProjectFile("src/pages/admin/AdminAvis.tsx");
    const launchPacks = readProjectFile("src/pages/admin/AdminLaunchPacks.tsx");

    expect(auditLogs).toContain("overflow-x-hidden md:overflow-x-auto");
    expect(auditLogs).toContain('data-label="Quand"');
    expect(auditLogs).toContain('data-label="Résumé"');
    expect(auditLogs).toContain("md:min-w-52");
    expect(auditLogs).not.toContain('className="min-w-52 font-medium"');

    expect(reviews).toContain("w-full min-w-0 flex-col gap-2 md:w-auto md:min-w-[260px]");
    expect(launchPacks).toContain("h-8 w-full text-xs sm:w-[140px]");
    expect(launchPacks).toContain("w-full sm:w-[160px]");
  });

  it("lets accounting invoice cards wrap values and action buttons on mobile", () => {
    const cockpit = readProjectFile("src/components/invoices/AccountingCockpit.tsx");
    const inflow = readProjectFile("src/pages/admin/AdminComptaInflow.tsx");
    const outflow = readProjectFile("src/pages/admin/AdminComptaOutflow.tsx");

    expect(cockpit).toContain("flex min-w-0 flex-col gap-2");
    expect(cockpit).toContain("break-words text-sm font-bold sm:whitespace-nowrap");

    expect(inflow).toContain("grid min-w-0 gap-2 text-xs sm:grid-cols-2");
    expect(inflow).toContain("h-auto min-h-[44px] max-w-full whitespace-normal");

    expect(outflow).toContain("break-words font-semibold text-foreground sm:whitespace-nowrap");
    expect(outflow).toContain("flex min-w-0 flex-wrap gap-2 sm:shrink-0");
    expect(outflow).toContain("h-auto min-h-[44px] max-w-full whitespace-normal");
  });
});
