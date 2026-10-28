import { describe, expect, it } from "vitest";

import {
  DIGITAL_MARKETING_OUTPUT_TARGETS,
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

  it("requests native, bleed-inclusive business-card pixels without inventing resolution", () => {
    const [target] = buildPrintMarketingOutputTargets([printProduct({ category: "business_card", marketingToolId: "business_card", widthMm: 85, heightMm: 55, bleedMm: 3 })]);
    expect(target.widthPx % 16).toBe(0);
    expect(target.heightPx % 16).toBe(0);
    expect(target.widthPx / (91 / 25.4)).toBeGreaterThanOrEqual(299.5);
    expect(target.nativeWidthPx).toBe(target.widthPx);
    const plan = calculateMarketingOutputPlan(target.widthPx, target.heightPx, target);
    expect(plan.upscaleFactor).toBe(1);
    expect(plan.crop).toEqual({ sourceX: 0, sourceY: 0, sourceWidth: target.widthPx, sourceHeight: target.heightPx });
    expect(plan.quality).toBe("native_or_downscale");
  });
  it.each([[210, 297], [297, 420]])("rejects an old bucket for %s×%s instead of cropping/upscaling it", (widthMm, heightMm) => {
    const [target] = buildPrintMarketingOutputTargets([printProduct({ category: "poster", marketingToolId: "poster", widthMm, heightMm, bleedMm: 3 })]);
    const old = calculateMarketingOutputPlan(1024, 1536, target);
    expect(old.quality).toBe("upscale_blocked");
    expect(old.upscaleFactor).toBe(1);
    expect(old.crop.sourceWidth).toBe(1024);
    expect(old.crop.sourceHeight).toBe(1536);
    expect(target.targetDpi).toBeLessThan(300);
    expect(calculateMarketingOutputPlan(target.widthPx, target.heightPx, target).quality).toBe("native_or_downscale");
  });
  it("does not expose folded or multi-page templates as a single native picture", () => {
    expect(buildPrintMarketingOutputTargets([printProduct({ category: "folded_leaflet", marketingToolId: "folded_leaflet", widthMm: 296, heightMm: 210, bleedMm: 3 })])).toEqual([]);
    const product = printProduct({ category: "flyer", marketingToolId: "flyer", widthMm: 105, heightMm: 148, bleedMm: 3 });
    product.variants[0].printableSides = 2;
    expect(buildPrintMarketingOutputTargets([product])).toEqual([]);
  });
});
