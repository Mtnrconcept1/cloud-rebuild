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
  it("exposes filters, sorting and three presentation modes on restaurant menu items", () => {
    const source = readProjectFile("src/components/dashboard/RestaurantMenuCatalog.tsx");
    const page = readProjectFile("src/pages/dashboard/DashboardMenu.tsx");
    const styles = readProjectFile("src/components/dashboard/RestaurantWorkspacePages.css");
    for (const token of [
      "visibleMenuItems.map", "selectedCategory", "menuAvailability",
      "menuSearch.trim()", "menuSortKey", "menuSortDirection",
      "OperationViewToggle", "data-view={menuViewMode}",
      "onToggleAvailability(item.id", "onEdit(item)", "onDelete(item.id)",
    ]) {
      expect(source).toContain(token);
    }
    expect(page).toContain("RestaurantMenuCatalog");
    expect(styles).toContain('tok-menu-items[data-view="gallery"]');
    expect(styles).toContain('tok-menu-items[data-view="list"]');
  });

  it("filters shared notification history before progressive display and preserves read actions", () => {
    const source = readProjectFile("src/components/notifications/NotificationHistoryList.tsx");
    for (const token of [
      "notificationSearch", "notificationReadFilter", "notificationSortKey",
      "notificationSortDirection", "notificationViewMode", "SortControls",
      "OperationViewToggle", "filteredNotifications.slice(0, visibleLimit)",
      "visibleNotifications.length < filteredNotifications.length",
      "markNotificationRead(notification.id)", "markAllRead()",
    ]) {
      expect(source).toContain(token);
    }
  });

  it("provides client review search, sorting and three layouts without removing restaurant replies", () => {
    const source = readProjectFile("src/pages/ClientReviews.tsx");
    for (const token of [
      "reviewSearch", "reviewSortKey", "reviewSortDirection", "reviewViewMode",
      "SortControls", "OperationViewToggle", "firstRestaurant(review.restaurants)",
      'reviewViewMode === "gallery"', 'reviewViewMode === "list"',
      'reviewViewMode === "details"', "replies.map((reply)",
      'to="/recherche"',
    ]) {
      expect(source).toContain(token);
    }
  });

});
