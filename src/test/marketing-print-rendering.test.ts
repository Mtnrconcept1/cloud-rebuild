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

describe("Marketing print raster preparation", () => {
  it("derives target pixels from provider bleed rather than a global 3mm constant", () => {
    const current = product({ category: "business_card", widthMm: 85, heightMm: 55, bleedMm: 5 });
    const plan = buildPrintRenderingPlan({
      asset: { widthPx: 1536, heightPx: 1024 },
      product: current,
      variant: current.variants[0],
    });

    expect(plan.target.print?.bleedMm).toBe(5);
    expect(plan.target).toMatchObject({ widthPx: 1123, heightPx: 768, targetDpi: 300 });
    expect(plan.blocked).toBe(false);
  });

  it("uses 150 DPI for posters and records the real source dimensions", () => {
    const current = product({ category: "poster", marketingToolId: "poster", widthMm: 297, heightMm: 420, bleedMm: 3 });
    const plan = buildPrintRenderingPlan({
      asset: { widthPx: 1024, heightPx: 1536 },
      product: current,
      variant: current.variants[0],
    });

    expect(plan.target).toMatchObject({ widthPx: 1790, heightPx: 2516, targetDpi: 150 });
    expect(plan.rendering).toMatchObject({
      targetWidthPx: 1790,
      targetHeightPx: 2516,
      targetDpi: 150,
      sourceWidthPx: 1024,
      sourceHeightPx: 1536,
      cropMode: "cover",
      strategy: "high_quality_resample",
    });
  });

  it("uses open-sheet geometry for folded print and keeps closed size as metadata", () => {
    const current = product({
      category: "folded_leaflet",
      marketingToolId: "folded_leaflet",
      widthMm: 296,
      heightMm: 210,
      bleedMm: 3,
      specifications: {
        "the exact width of the card in mm. after folding": "148",
        "the exact height of the card in mm. after folding": "210",
      },
    });
    const plan = buildPrintRenderingPlan({
      asset: { widthPx: 1536, heightPx: 1024 },
      product: current,
      variant: current.variants[0],
    });

    expect(plan.target.print).toMatchObject({
      widthMm: 296,
      heightMm: 210,
      foldedWidthMm: 148,
      foldedHeightMm: 210,
    });
    expect(plan.target).toMatchObject({ widthPx: 3567, heightPx: 2552, targetDpi: 300 });
  });

  it("blocks a target requiring more than the x2.5 crop-aware upscale ceiling", () => {
    const current = product({ category: "restaurant_menu", widthMm: 240, heightMm: 350, bleedMm: 3 });
    const plan = buildPrintRenderingPlan({
      asset: { widthPx: 1024, heightPx: 1536 },
      product: current,
      variant: current.variants[0],
    });

    expect(plan.rendering.upscaleFactor).toBeGreaterThan(2.5);
    expect(plan.blocked).toBe(true);
  });
});
