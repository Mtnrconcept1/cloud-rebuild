import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { sortByColumn, type SortColumn } from "@/lib/listSorting";

const root = process.cwd();
const readProjectFile = (path: string) => readFileSync(resolve(root, path), "utf8");

type DemoRow = {
  id: string;
  date: string;
  name: string;
  amount: number;
};

const demoColumns: SortColumn<DemoRow>[] = [
  { key: "date", label: "Date", type: "date", getValue: (row) => row.date },
  { key: "name", label: "Nom", type: "text", getValue: (row) => row.name },
  { key: "amount", label: "Montant", type: "number", getValue: (row) => row.amount },
];

describe("shared list sorting controls", () => {
  const rows: DemoRow[] = [
    { id: "b", date: "2026-06-02T10:00:00Z", name: "Burger", amount: 12 },
    { id: "a", date: "2026-06-01T10:00:00Z", name: "Asado", amount: 30 },
    { id: "c", date: "2026-06-03T10:00:00Z", name: "Cafe", amount: 8 },
  ];

  it("sorts list rows by date, text and number in both directions", () => {
    expect(sortByColumn(rows, demoColumns, { key: "date", direction: "desc" }).map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(sortByColumn(rows, demoColumns, { key: "name", direction: "asc" }).map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(sortByColumn(rows, demoColumns, { key: "amount", direction: "asc" }).map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("wires column and direction sorting into the main order and reservation lists", () => {
    const touchedPages = [
      "src/pages/dashboard/DashboardCommandes.tsx",
      "src/pages/dashboard/DashboardReservations.tsx",
      "src/pages/Commandes.tsx",
      "src/pages/Reservations.tsx",
      "src/pages/admin/AdminOrdersReservations.tsx",
    ].map(readProjectFile);

    for (const source of touchedPages) {
      expect(source).toContain("SortControls");
      expect(source).toContain("sortByColumn");
      expect(source).toContain("direction={");
    }
  });
});
