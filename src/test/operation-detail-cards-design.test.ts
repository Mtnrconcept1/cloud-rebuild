import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("operation detail card design guards", () => {
  it("keeps restaurant order detail cards separated and non-redundant", () => {
    const source = read("src/pages/dashboard/DashboardCommandes.tsx");

    expect(source).toContain("overflow-hidden rounded-2xl border border-l-4 bg-card");
    expect(source).toContain("Articles</p>");
    expect(source).toContain("Canal</p>");
    expect(source).toContain("flex min-w-0 flex-wrap gap-2 sm:justify-end xl:min-w-[24rem]");
    expect(source).not.toContain("Total client</p>");
    expect(source).toContain("space-y-2 rounded-xl border bg-background/80 p-3");
  });

  it("keeps restaurant reservation detail cards readable by service and amount", () => {
    const source = read("src/pages/dashboard/DashboardReservations.tsx");

    expect(source).toContain("rounded-2xl border border-l-4 bg-card shadow-sm");
    expect(source).toContain("rounded-2xl border bg-card/70 p-3 shadow-sm sm:p-4");
    expect(source).toContain("grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3");
    expect(source).toContain("grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-3");
    expect(source).toContain("Service</p>");
    expect(source).toContain("Montant</p>");
    expect(source).not.toContain("Total : {Number(reservation.total_amount).toFixed(2)} CHF");
  });

  it("keeps client and admin operation details visually separated", () => {
    const clientOrders = read("src/pages/Commandes.tsx");
    const clientReservations = read("src/pages/Reservations.tsx");
    const adminSheet = read("src/components/admin/AdminOperationDetailSheet.tsx");

    expect(clientOrders).toContain("space-y-3 rounded-2xl border bg-background/80 p-4 shadow-sm");
    expect(clientReservations).toContain("space-y-4 border-t bg-muted/10 p-4");
    expect(adminSheet).toContain("sm:max-w-[720px]");
    expect(adminSheet).toContain("rounded-xl border bg-background p-3 shadow-sm");
  });
});
