import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("admin query limits", () => {
  it("bounds high-volume admin catalog lists", () => {
    const catalog = read("src/pages/admin/AdminCatalog.tsx");

    for (const limit of [
      "ADMIN_CATALOG_CUISINES_LIMIT",
      "ADMIN_CATALOG_COLLECTIONS_LIMIT",
      "ADMIN_CATALOG_COLLECTION_LINKS_LIMIT",
      "ADMIN_CATALOG_RESTAURANTS_LIMIT",
    ]) {
      expect(catalog).toContain(limit);
      expect(catalog).toContain(`.limit(${limit})`);
    }
  });

  it("bounds admin operations filters and history tables", () => {
    const adminOrdersReservations = read("src/pages/admin/AdminOrdersReservations.tsx");

    expect(adminOrdersReservations).toContain("ADMIN_RESTAURANT_OPTIONS_LIMIT");
    expect(adminOrdersReservations).toContain(".limit(ADMIN_RESTAURANT_OPTIONS_LIMIT)");
    expect(adminOrdersReservations).toContain("ADMIN_HISTORY_PAGE_SIZE = 250");
    expect(adminOrdersReservations).toContain(".range(0, ADMIN_HISTORY_PAGE_SIZE - 1)");
    expect(adminOrdersReservations).toContain("RESERVATION_INVENTORY_HEALTH_LIMIT");
    expect(adminOrdersReservations).toContain(".limit(RESERVATION_INVENTORY_HEALTH_LIMIT)");
  });
});
