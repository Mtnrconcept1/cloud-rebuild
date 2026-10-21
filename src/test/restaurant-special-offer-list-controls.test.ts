import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("restaurant special offer list controls", () => {
  it("filters, sorts and changes anti-waste offer layouts without changing merchant actions", () => {
    const source = read("src/pages/dashboard/DashboardOffres.tsx");
    for (const item of [
      "offerSearch", "offerStatus", "offerTypeFilter", "offerSortKey", "offerSortDirection",
      "offerViewMode", "SortControls", "OperationViewToggle", "visibleOffers.map",
      "isSpecialOfferEffectivelyActive(offer)", "isSpecialOfferSoldOut(offer)",
      "toggleActive(offer.id", "deleteOffer(offer.id)",
    ]) {
      expect(source).toContain(item);
    }
    expect(source).toContain('offerViewMode === "gallery"');
    expect(source).toContain('offerTypeFilter !== "all"');
  });

  it("filters and sorts flash sales while retaining stock protection and actions", () => {
    const source = read("src/pages/dashboard/DashboardVentesFlash.tsx");
    for (const item of [
      "saleSearch", "saleStatus", "saleSortKey", "saleSortDirection",
      "saleViewMode", "SortControls", "OperationViewToggle", "visibleSales.map",
      "isSpecialOfferEffectivelyActive(sale)", "isSpecialOfferSoldOut(sale)",
      "toggleActive(sale.id", "deleteSale(sale.id)",
    ]) {
      expect(source).toContain(item);
    }
    expect(source).toContain('saleViewMode === "gallery"');
    expect(source).toContain('saleStatus === "sold_out"');
  });
});
