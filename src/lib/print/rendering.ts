import {
  buildPrintMarketingOutputTargets,
  MAX_PRINT_UPSCALE_FACTOR,
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
  const sourceRatio = input.asset.widthPx / input.asset.heightPx;
  const targetRatio = target.widthPx / target.heightPx;
  if (Math.abs(sourceRatio / targetRatio - 1) > 0.001) {
    throw new Error("PRINT_NATIVE_IMAGE_RATIO_MISMATCH_REGENERATE_WITH_TARGET_FORMAT");
  }
  const upscaleFactor = Math.max(
    target.widthPx / input.asset.widthPx,
    target.heightPx / input.asset.heightPx,
  );
  const quality = upscaleFactor <= 1
    ? "native_or_downscale" as const
    : upscaleFactor <= MAX_PRINT_UPSCALE_FACTOR ? "upscale_allowed" as const : "upscale_blocked" as const;
  const crop = {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: input.asset.widthPx,
    sourceHeight: input.asset.heightPx,
  };
  const rendering: PrintRenderingMetadata = {
    targetWidthPx: target.widthPx,
    targetHeightPx: target.heightPx,
    targetDpi: target.targetDpi,
    sourceWidthPx: input.asset.widthPx,
    sourceHeightPx: input.asset.heightPx,
    upscaleFactor,
    cropMode: "none",
    strategy: "high_quality_resample",
  };
  return {
    target,
    crop,
    quality,
    blocked: quality === "upscale_blocked",
    rendering,
  };
}
