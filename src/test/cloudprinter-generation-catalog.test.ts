import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Cloudprinter generation catalog", () => {
  it("keeps non-orderable mapped geometry available to Marketing Studio", () => {
    const edge = read("supabase/functions/print-catalog/index.ts");
    const client = read("src/lib/print/client.ts");
    const controls = read("src/components/dashboard/marketing-print/MarketingOutputControls.tsx");

    expect(edge).toContain('action === "generation_catalog"');
    expect(edge).toContain('const includeInactiveMapped = action === "generation_catalog"');
    expect(edge).toContain("print_product_id");
    expect(edge).toContain("geometryMatchesLogicalProduct");
    expect(edge).toContain("selectGenerationVariant");
    expect(client).toContain("getPrintGenerationCatalog");
    expect(client).toContain('action: "generation_catalog"');
    expect(controls).toContain("getPrintGenerationCatalog");
    expect(controls).not.toContain("getPrintCatalog(String(restaurantId))");
  });

  it("uses a non-zero safe-area fallback when Cloudprinter omits it", () => {
    const edge = read("supabase/functions/print-catalog/index.ts");
    expect(edge).toContain("function toNumber(value: unknown, fallback = 0)");
    expect(edge).toContain('value === null || value === undefined || value === ""');
    expect(edge).toContain("safeMarginMm: Math.max(0, toNumber(variant.safe_margin_mm, 3))");
  });

  it("persists the expanded logical TheTok print catalog without seeding provider mappings", () => {
    const migration = read("supabase/migrations/20260908034500_expand_cloudprinter_logical_catalog.sql");

    for (const slug of [
      "business-card-55x85",
      "business-card-55x55",
      "menu-dl-98x210",
      "folded-menu-a6",
      "folded-menu-a5",
      "calendar-desk-a5",
      "calendar-wall-a4",
      "calendar-wall-a3",
    ]) {
      expect(migration).toContain(`'${slug}'`);
    }
    expect(migration).not.toContain("print_provider_products");
    expect(migration).not.toContain("businesscard_ss_");
    expect(migration).not.toContain("card_flat_");
    expect(migration).not.toContain("calendar_wall_int_");
  });
});
