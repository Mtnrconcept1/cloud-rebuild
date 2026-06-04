import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("quality guarantee governance", () => {
  it("does not expose a local fake QR validation workflow", () => {
    const page = read("src/pages/GarantieQualite.tsx");

    expect(page).toContain("quality_guarantee");
    expect(page).toContain("server_verified_checkout");
    expect(page).toContain("Verification rattachee a la commande");
    expect(page).not.toContain("Simuler le scan");
    expect(page).not.toContain("setScanned");
    expect(page).not.toContain("QR Scan simulation");
  });

  it("keeps the guarantee fee recomputed in server-side checkout pricing", () => {
    const pricing = read("supabase/functions/_shared/order-pricing.ts");
    const checkout = read("supabase/functions/create-checkout/index.ts");

    expect(pricing).toContain("QUALITY_GUARANTEE_FEE");
    expect(pricing).toContain("metadata.quality_guarantee");
    expect(pricing).toContain('item.menu_item_id === "garantie-qualite-fee"');
    expect(checkout).toContain("pricing.qualityFee");
    expect(checkout).toContain("Garantie qualite");
  });
});
