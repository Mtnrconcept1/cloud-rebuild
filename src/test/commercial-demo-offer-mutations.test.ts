import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";

function expectGuardBefore(source: string, guard: string, productionCall: string) {
  const productionCallIndex = source.indexOf(productionCall);
  const guardIndex = source.lastIndexOf(guard, productionCallIndex);

  expect(guardIndex).toBeGreaterThanOrEqual(0);
  expect(productionCallIndex).toBeGreaterThan(guardIndex);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("commercial demo offer mutations", () => {
  it("persists isolated tool state per commercial demo session", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    writeCommercialDemoToolState("session-a", "anti-waste-offers", [{ id: "offer-a" }]);
    writeCommercialDemoToolState("session-b", "anti-waste-offers", [{ id: "offer-b" }]);
    writeCommercialDemoToolState("session-a", "flash-sales", [{ id: "flash-a" }]);

    expect(readCommercialDemoToolState("session-a", "anti-waste-offers", [])).toEqual([{ id: "offer-a" }]);
    expect(readCommercialDemoToolState("session-b", "anti-waste-offers", [])).toEqual([{ id: "offer-b" }]);
    expect(readCommercialDemoToolState("session-a", "flash-sales", [])).toEqual([{ id: "flash-a" }]);
    expect(readCommercialDemoToolState("session-b", "flash-sales", [])).toEqual([]);
  });

  it("keeps anti-waste reads and CRUD local before every production operation", () => {
    const source = readFileSync("src/pages/dashboard/DashboardOffres.tsx", "utf8");

    expect(source).toContain('const COMMERCIAL_DEMO_OFFERS_TOOL = "anti-waste-offers"');
    expect(source).toContain("buildCommercialDemoOfferSeed(commercialDemoFrame.snapshot)");
    expect(source).toContain("getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot, restaurantId)");
    expect(source).toContain('"menu-items"');
    expect(source).toContain("readCommercialDemoToolState(");
    expect(source).toContain("writeCommercialDemoToolState(sessionId, COMMERCIAL_DEMO_OFFERS_TOOL, next)");
    expect(source).toContain('["dashboard-offers", selectedId, demoSessionId]');
    expect(source).toContain('["menu-items-for-offers", restaurantId, demoSessionId]');

    expectGuardBefore(source, "if (isCommercialDemo && commercialDemoFrame)", '.from("anti_waste_offers" as any)');
    expectGuardBefore(source, "if (isCommercialDemo && commercialDemoFrame)", '.from("menu_items")');
    expect(source.match(/const updated = updateCommercialDemoOffers/g) ?? []).toHaveLength(2);
    expectGuardBefore(source, "if (isCommercialDemo) {", '"restaurant_update_anti_waste_offer_status"');
    expectGuardBefore(source, "if (isCommercialDemo) {", '"restaurant_archive_anti_waste_offer"');
    expectGuardBefore(source, "if (isCommercialDemo) {", '"restaurant_upsert_anti_waste_offer"');
  });

  it("keeps flash-sale reads and CRUD local before every production operation", () => {
    const source = readFileSync("src/pages/dashboard/DashboardVentesFlash.tsx", "utf8");

    expect(source).toContain('const COMMERCIAL_DEMO_FLASH_SALES_TOOL = "flash-sales"');
    expect(source).toContain("buildCommercialDemoFlashSaleSeed(commercialDemoFrame.snapshot)");
    expect(source).toContain("getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot, restaurantId)");
    expect(source).toContain('"menu-items"');
    expect(source).toContain("readCommercialDemoToolState(");
    expect(source).toContain("writeCommercialDemoToolState(sessionId, COMMERCIAL_DEMO_FLASH_SALES_TOOL, next)");
    expect(source).toContain('["dashboard-flash-sales", selectedId, demoSessionId]');
    expect(source).toContain('["menu-items-for-flash", restaurantId, demoSessionId]');

    expectGuardBefore(source, "if (isCommercialDemo && commercialDemoFrame)", '.from("flash_sales" as any)');
    expectGuardBefore(source, "if (isCommercialDemo && commercialDemoFrame)", '.from("menu_items")');
    expect(source.match(/const updated = updateCommercialDemoSales/g) ?? []).toHaveLength(2);
    expectGuardBefore(source, "if (isCommercialDemo) {", '"restaurant_update_flash_sale_status"');
    expectGuardBefore(source, "if (isCommercialDemo) {", '"restaurant_archive_flash_sale"');
    expectGuardBefore(source, "if (isCommercialDemo) {", '"restaurant_upsert_flash_sale"');
  });
});
