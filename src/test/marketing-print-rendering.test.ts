import { describe, expect, it } from "vitest";

import { buildPrintRenderingPlan } from "@/lib/print/rendering";

const product = (input: {
  category: string;
  marketingToolId?: string | null;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  specifications?: Record<string, unknown>;
}) => ({
  id: "product-id",
  slug: "product-test",
  displayName: "Produit test",
  category: input.category,
  marketingToolId: input.marketingToolId || null,
  description: null,
  variants: [{
    productId: "product-id",
    providerProductId: "provider-id",
    providerReference: "reference-id",
    displayName: "Produit test",
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    bleedMm: input.bleedMm,
    safeMarginMm: 4,
    printableSides: 1,
    orientation: null,
    printTechnology: null,
    minimumQuantity: 1,
    quantityStep: 1,
    options: [],
    specifications: input.specifications || {},
  }],
});

describe("Marketing native print preparation", () => {
  it("uses provider-specific bleed and preserves every original pixel", () => {
    const current = product({ category: "business_card", widthMm: 85, heightMm: 55, bleedMm: 5 });
    const plan = buildPrintRenderingPlan({ asset: { widthPx: 1520, heightPx: 1040 }, product: current, variant: current.variants[0] });
    expect(plan.target.print?.bleedMm).toBe(5);
    expect(plan.rendering).toMatchObject({ sourceWidthPx: 1520, sourceHeightPx: 1040, targetWidthPx: 1520, targetHeightPx: 1040, cropMode: "none", strategy: "native_artwork", upscaleFactor: 1 });
    expect(plan.blocked).toBe(false);
  });
  it("reports real low DPI and blocks a poster bucket without resampling", () => {
    const current = product({ category: "poster", widthMm: 297, heightMm: 420, bleedMm: 3 });
    const plan = buildPrintRenderingPlan({ asset: { widthPx: 1024, heightPx: 1536 }, product: current, variant: current.variants[0] });
    expect(plan.blocked).toBe(true);
    expect(plan.rendering.targetDpi).toBeLessThan(150);
    expect(plan.rendering.upscaleFactor).toBe(1);
    expect(plan.rendering.targetWidthPx).toBe(1024);
  });
  it("refuses a folded support instead of flattening its template", () => {
    const current = product({ category: "folded_leaflet", widthMm: 296, heightMm: 210, bleedMm: 3 });
    expect(() => buildPrintRenderingPlan({ asset: { widthPx: 1536, heightPx: 1024 }, product: current, variant: current.variants[0] })).toThrow("PRINT_RENDERING_TARGET_UNAVAILABLE");
  });
});
