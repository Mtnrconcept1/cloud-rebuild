import { describe, expect, it } from "vitest";

import {
  DIGITAL_MARKETING_OUTPUT_TARGETS,
  MAX_PRINT_UPSCALE_FACTOR,
  buildPrintMarketingOutputTargets,
  calculateMarketingOutputPlan,
} from "@/lib/marketing/outputGeometry";

function digitalTarget(id: string) {
  const target = DIGITAL_MARKETING_OUTPUT_TARGETS.find((item) => item.id === id);
  if (!target) throw new Error(`Missing digital target ${id}`);
  return target;
}

const printProduct = (input: {
  category: string;
  marketingToolId: string;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMarginMm?: number;
  specifications?: Record<string, unknown>;
}) => ({
  id: `product-${input.widthMm}x${input.heightMm}`,
  slug: `product-${input.widthMm}x${input.heightMm}`,
  displayName: "Produit test",
  category: input.category,
  marketingToolId: input.marketingToolId,
  description: null,
  variants: [{
    productId: `product-${input.widthMm}x${input.heightMm}`,
    providerProductId: `provider-${input.widthMm}x${input.heightMm}`,
    providerReference: `ref-${input.widthMm}x${input.heightMm}`,
    displayName: "Produit test",
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    bleedMm: input.bleedMm,
    safeMarginMm: input.safeMarginMm ?? 3,
    printableSides: 1,
    orientation: input.widthMm > input.heightMm ? "Landscape" : "Portrait",
    printTechnology: "Digital Toner",
    minimumQuantity: 1,
    quantityStep: 10,
    options: [],
    specifications: input.specifications ?? {},
  }],
});

describe("Marketing Studio output geometry", () => {
  it("exposes exact digital targets independently from Cloudprinter", () => {
    expect(digitalTarget("social-story")).toMatchObject({
      widthPx: 1080,
      heightPx: 1920,
      ratioLabel: "9:16",
      nativeFormat: "portrait",
    });
    expect(digitalTarget("thetok-hero")).toMatchObject({
      widthPx: 1600,
      heightPx: 900,
      ratioLabel: "16:9",
      nativeFormat: "landscape",
    });
    expect(digitalTarget("thetok-card")).toMatchObject({ widthPx: 1200, heightPx: 900, ratioLabel: "4:3" });
    expect(digitalTarget("social-square")).toMatchObject({ widthPx: 1080, heightPx: 1080, ratioLabel: "1:1", nativeFormat: "square" });
    expect(digitalTarget("social-portrait")).toMatchObject({ widthPx: 1080, heightPx: 1350, ratioLabel: "4:5" });
    expect(digitalTarget("linkedin-link")).toMatchObject({ widthPx: 1200, heightPx: 627, ratioLabel: "1.91:1" });
    expect(digitalTarget("youtube-thumbnail")).toMatchObject({ widthPx: 1280, heightPx: 720, ratioLabel: "16:9" });
  });

  it("keeps an 85x55 business card native at 300 DPI with provider bleed", () => {
    const [target] = buildPrintMarketingOutputTargets([
      printProduct({ category: "business_card", marketingToolId: "business_card", widthMm: 85, heightMm: 55, bleedMm: 3 }),
    ] as any);

    expect(target).toMatchObject({
      destination: "print",
      widthPx: 1075,
      heightPx: 721,
      targetDpi: 300,
      nativeFormat: "landscape",
    });
    const plan = calculateMarketingOutputPlan(1536, 1024, target);
    expect(plan.upscaleFactor).toBeLessThanOrEqual(1);
    expect(plan.quality).toBe("native_or_downscale");
  });

  it("allows an A4 hand-held menu up to the x2.5 print ceiling", () => {
    const [target] = buildPrintMarketingOutputTargets([
      printProduct({ category: "restaurant_menu", marketingToolId: "restaurant_menu", widthMm: 210, heightMm: 297, bleedMm: 3 }),
    ] as any);

    expect(target).toMatchObject({ widthPx: 2552, heightPx: 3579, targetDpi: 300, nativeFormat: "portrait" });
    const plan = calculateMarketingOutputPlan(1024, 1536, target);
    expect(plan.upscaleFactor).toBeGreaterThan(2.4);
    expect(plan.upscaleFactor).toBeLessThanOrEqual(MAX_PRINT_UPSCALE_FACTOR);
    expect(plan.quality).toBe("upscale_allowed");
  });

  it("uses 150 DPI for an A3 poster viewed at distance", () => {
    const [target] = buildPrintMarketingOutputTargets([
      printProduct({ category: "poster", marketingToolId: "poster", widthMm: 297, heightMm: 420, bleedMm: 3 }),
    ] as any);

    expect(target).toMatchObject({ widthPx: 1790, heightPx: 2516, targetDpi: 150, nativeFormat: "portrait" });
  });

  it("uses the open trimmed spread while exposing the closed folded size", () => {
    const [target] = buildPrintMarketingOutputTargets([
      printProduct({
        category: "folded_leaflet",
        marketingToolId: "folded_leaflet",
        widthMm: 296,
        heightMm: 210,
        bleedMm: 3,
        specifications: {
          "the exact width of the card in mm. after folding": "148",
          "the exact height of the card in mm. after folding": "210",
        },
      }),
    ] as any);

    expect(target).toMatchObject({
      widthPx: 3567,
      heightPx: 2552,
      targetDpi: 300,
      nativeFormat: "landscape",
      print: {
        widthMm: 296,
        heightMm: 210,
        foldedWidthMm: 148,
        foldedHeightMm: 210,
      },
    });
  });

  it("blocks print targets whose required crop-aware upscale exceeds x2.5", () => {
    const [target] = buildPrintMarketingOutputTargets([
      printProduct({ category: "restaurant_menu", marketingToolId: "restaurant_menu", widthMm: 300, heightMm: 500, bleedMm: 3 }),
    ] as any);
    const plan = calculateMarketingOutputPlan(1024, 1536, target);
    expect(plan.upscaleFactor).toBeGreaterThan(MAX_PRINT_UPSCALE_FACTOR);
    expect(plan.quality).toBe("upscale_blocked");
  });
});
