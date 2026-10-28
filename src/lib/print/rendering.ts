import {
  buildPrintMarketingOutputTargets,
  calculateMarketingOutputPlan,
  type MarketingPrintCatalogProductInput,
} from "@/lib/marketing/outputGeometry";
import type { PrintProductSpec, PrintRenderingMetadata } from "@/lib/print/document";

export type PrintRenderingProduct = Omit<MarketingPrintCatalogProductInput, "variants"> & {
  variants: PrintProductSpec[];
};

export function buildPrintRenderingPlan(input: {
  asset: { widthPx: number; heightPx: number };
  product: PrintRenderingProduct;
  variant: PrintProductSpec;
}) {
  const [target] = buildPrintMarketingOutputTargets([{
    ...input.product,
    variants: [{
      ...input.variant,
      specifications: input.variant.specifications || {},
    }],
  }]);
  if (!target || !target.print || !target.targetDpi) {
    throw new Error("PRINT_RENDERING_TARGET_UNAVAILABLE");
  }
  const plan = calculateMarketingOutputPlan(input.asset.widthPx, input.asset.heightPx, target);
  const rendering: PrintRenderingMetadata = {
    targetWidthPx: input.asset.widthPx,
    targetHeightPx: input.asset.heightPx,
    targetDpi: Math.floor(Math.min(input.asset.widthPx / (input.variant.widthMm + input.variant.bleedMm * 2), input.asset.heightPx / (input.variant.heightMm + input.variant.bleedMm * 2)) * 25.4),
    sourceWidthPx: input.asset.widthPx,
    sourceHeightPx: input.asset.heightPx,
    upscaleFactor: plan.upscaleFactor,
    cropMode: "none",
    strategy: "native_artwork",
  };
  return {
    target,
    crop: plan.crop,
    quality: plan.quality,
    blocked: plan.quality === "upscale_blocked",
    rendering,
  };
}
