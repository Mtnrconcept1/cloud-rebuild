import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("special offer server pricing validation", () => {
  it("revalidates anti-waste and flash-sale stock, windows and order modes server-side", () => {
    const pricing = read("supabase/functions/_shared/order-pricing.ts");

    expect(pricing).toContain("validateAntiWasteOfferAvailability");
    expect(pricing).toContain("validateFlashSaleAvailability");
    expect(pricing).toContain("sumQuantitiesByMetadata");
    expect(pricing).toContain("quantity_available, available_date, pickup_start, pickup_end");
    expect(pricing).toContain("quantity_available, sale_date, sale_start, sale_end, delivery_available, takeaway_available");
    expect(pricing).toContain("Stock anti-gaspi insuffisant pour cette offre");
    expect(pricing).toContain("Stock vente flash insuffisant pour cette offre");
    expect(pricing).toContain("Vente flash expiree ou pas encore active");
    expect(pricing).toContain("Cette vente flash n'est pas disponible en livraison");
    expect(pricing).toContain("Cette vente flash n'est pas disponible a l'emporter");
  });
});
