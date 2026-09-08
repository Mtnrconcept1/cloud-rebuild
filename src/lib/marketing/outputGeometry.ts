import type { TokImageFormat } from "../ai/tokAiClient";

export type MarketingOutputDestination = "digital" | "print";
export type MarketingOutputQuality = "native_or_downscale" | "upscale_allowed" | "upscale_blocked";

export type MarketingOutputTarget = {
  id: string;
  destination: MarketingOutputDestination;
  label: string;
  group: string;
  widthPx: number;
  heightPx: number;
  ratioLabel: string;
  nativeFormat: TokImageFormat;
  nativeWidthPx: number;
  nativeHeightPx: number;
  platform?: string;
  targetDpi?: number;
  print?: {
    productId: string;
    providerProductId: string;
    providerReference: string;
    marketingToolId: string | null;
    category: string;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeMarginMm: number;
    foldedWidthMm: number | null;
    foldedHeightMm: number | null;
    printableSides: number;
    minimumQuantity: number;
    quantityStep: number;
  };
};

export type MarketingPrintCatalogProductInput = {
  id: string;
  slug: string;
  displayName: string;
  category: string;
  marketingToolId?: string | null;
  description?: string | null;
  variants: Array<{
    productId: string;
    providerProductId: string;
    providerReference: string;
    displayName: string;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeMarginMm: number;
    printableSides: number;
    orientation: string | null;
    printTechnology: string | null;
    minimumQuantity: number;
    quantityStep: number;
    options: Array<Record<string, unknown>>;
    specifications?: Record<string, unknown>;
  }>;
};

export const MAX_PRINT_UPSCALE_FACTOR = 2.5;
export const MAX_MARKETING_OUTPUT_PIXELS = 20_000_000;

const NATIVE_SIZE: Record<TokImageFormat, { width: number; height: number }> = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
};

function digitalTarget(input: {
  id: string;
  label: string;
  group: string;
  platform: string;
  widthPx: number;
  heightPx: number;
  ratioLabel: string;
}): MarketingOutputTarget {
  const nativeFormat = chooseNativeFormat(input.widthPx, input.heightPx);
  const native = NATIVE_SIZE[nativeFormat];
  return {
    ...input,
    destination: "digital",
    nativeFormat,
    nativeWidthPx: native.width,
    nativeHeightPx: native.height,
  };
}

export const DIGITAL_MARKETING_OUTPUT_TARGETS: MarketingOutputTarget[] = [
  digitalTarget({
    id: "thetok-hero",
    label: "TheTok · Hero 16:9",
    group: "TheTok",
    platform: "TheTok",
    widthPx: 1600,
    heightPx: 900,
    ratioLabel: "16:9",
  }),
  digitalTarget({
    id: "thetok-card",
    label: "TheTok · Carte 4:3",
    group: "TheTok",
    platform: "TheTok",
    widthPx: 1200,
    heightPx: 900,
    ratioLabel: "4:3",
  }),
  digitalTarget({
    id: "thetok-square",
    label: "TheTok · Carré 1:1",
    group: "TheTok",
    platform: "TheTok",
    widthPx: 1200,
    heightPx: 1200,
    ratioLabel: "1:1",
  }),
  digitalTarget({
    id: "social-story",
    label: "Story / Reel / TikTok · 9:16",
    group: "Réseaux sociaux",
    platform: "Instagram / TikTok",
    widthPx: 1080,
    heightPx: 1920,
    ratioLabel: "9:16",
  }),
  digitalTarget({
    id: "social-portrait",
    label: "Feed vertical · 4:5",
    group: "Réseaux sociaux",
    platform: "Instagram / LinkedIn",
    widthPx: 1080,
    heightPx: 1350,
    ratioLabel: "4:5",
  }),
  digitalTarget({
    id: "social-square",
    label: "Feed carré · 1:1",
    group: "Réseaux sociaux",
    platform: "Instagram / LinkedIn / Facebook",
    widthPx: 1080,
    heightPx: 1080,
    ratioLabel: "1:1",
  }),
  digitalTarget({
    id: "social-landscape",
    label: "Social horizontal · 16:9",
    group: "Réseaux sociaux",
    platform: "X / Facebook",
    widthPx: 1600,
    heightPx: 900,
    ratioLabel: "16:9",
  }),
  digitalTarget({
    id: "linkedin-link",
    label: "LinkedIn / lien · 1.91:1",
    group: "Réseaux sociaux",
    platform: "LinkedIn",
    widthPx: 1200,
    heightPx: 627,
    ratioLabel: "1.91:1",
  }),
  digitalTarget({
    id: "youtube-thumbnail",
    label: "YouTube miniature · 16:9",
    group: "Réseaux sociaux",
    platform: "YouTube",
    widthPx: 1280,
    heightPx: 720,
    ratioLabel: "16:9",
  }),
];

export function chooseNativeFormat(width: number, height: number): TokImageFormat {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "square";
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.02) return "square";
  return width > height ? "landscape" : "portrait";
}

function printDpi(category: string, marketingToolId?: string | null) {
  const normalized = `${category} ${marketingToolId || ""}`.toLowerCase();
  if (/(poster|large_poster|calendar|banner|pos_display|large format|wall)/.test(normalized)) return 150;
  return 300;
}

function millimetersToPixels(mm: number, dpi: number) {
  return Math.ceil((mm / 25.4) * dpi);
}

function normalizedSpecs(specifications: Record<string, unknown> | undefined) {
  return new Map(
    Object.entries(specifications || {}).map(([key, value]) => [key.trim().toLowerCase(), String(value ?? "").trim()]),
  );
}

function foldedDimension(specifications: Record<string, unknown> | undefined, axis: "width" | "height") {
  const specs = normalizedSpecs(specifications);
  const exact = [
    `the exact ${axis} of the card in mm. after folding`,
    `the exact ${axis} of the item in mm. after folding`,
    `the exact ${axis} of the product in mm. after folding`,
  ];
  for (const key of exact) {
    const parsed = Number(specs.get(key));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const pattern = new RegExp(`^the exact ${axis} of the .+ in mm\\.? after folding$`, "i");
  for (const [key, value] of specs.entries()) {
    if (!pattern.test(key)) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function compactRatio(width: number, height: number) {
  const ratio = width / height;
  const common: Array<[number, string]> = [
    [16 / 9, "16:9"],
    [9 / 16, "9:16"],
    [4 / 3, "4:3"],
    [3 / 4, "3:4"],
    [4 / 5, "4:5"],
    [5 / 4, "5:4"],
    [1, "1:1"],
    [1.91, "1.91:1"],
  ];
  const match = common.find(([value]) => Math.abs(value - ratio) <= 0.01);
  return match?.[1] || `${width}:${height}`;
}

export function buildPrintMarketingOutputTargets(
  products: MarketingPrintCatalogProductInput[],
): MarketingOutputTarget[] {
  const targets: MarketingOutputTarget[] = [];
  for (const product of products || []) {
    for (const variant of product.variants || []) {
      const widthMm = Number(variant.widthMm);
      const heightMm = Number(variant.heightMm);
      const bleedMm = Math.max(0, Number(variant.bleedMm) || 0);
      if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) continue;
      const targetDpi = printDpi(product.category, product.marketingToolId);
      const fullWidthMm = widthMm + bleedMm * 2;
      const fullHeightMm = heightMm + bleedMm * 2;
      const widthPx = millimetersToPixels(fullWidthMm, targetDpi);
      const heightPx = millimetersToPixels(fullHeightMm, targetDpi);
      if (widthPx * heightPx > MAX_MARKETING_OUTPUT_PIXELS) continue;
      const nativeFormat = chooseNativeFormat(widthPx, heightPx);
      const native = NATIVE_SIZE[nativeFormat];
      const foldedWidthMm = foldedDimension(variant.specifications, "width");
      const foldedHeightMm = foldedDimension(variant.specifications, "height");
      const foldedSuffix = foldedWidthMm && foldedHeightMm
        ? ` · fermé ${foldedWidthMm}×${foldedHeightMm} mm`
        : "";
      targets.push({
        id: `print:${variant.providerProductId}`,
        destination: "print",
        label: `${product.displayName} · à plat ${widthMm}×${heightMm} mm${foldedSuffix}`,
        group: "Impression Cloudprinter",
        widthPx,
        heightPx,
        ratioLabel: compactRatio(widthPx, heightPx),
        nativeFormat,
        nativeWidthPx: native.width,
        nativeHeightPx: native.height,
        targetDpi,
        print: {
          productId: product.id,
          providerProductId: variant.providerProductId,
          providerReference: variant.providerReference,
          marketingToolId: product.marketingToolId || null,
          category: product.category,
          widthMm,
          heightMm,
          bleedMm,
          safeMarginMm: Math.max(0, Number(variant.safeMarginMm) || 0),
          foldedWidthMm,
          foldedHeightMm,
          printableSides: Math.max(1, Math.round(Number(variant.printableSides) || 1)),
          minimumQuantity: Math.max(1, Math.round(Number(variant.minimumQuantity) || 1)),
          quantityStep: Math.max(1, Math.round(Number(variant.quantityStep) || 1)),
        },
      });
    }
  }
  return targets;
}

export type CoverCrop = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

export function calculateCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CoverCrop {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("INVALID_MARKETING_OUTPUT_GEOMETRY");
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const sourceCropWidth = sourceHeight * targetRatio;
    return {
      sourceX: (sourceWidth - sourceCropWidth) / 2,
      sourceY: 0,
      sourceWidth: sourceCropWidth,
      sourceHeight,
    };
  }
  const sourceCropHeight = sourceWidth / targetRatio;
  return {
    sourceX: 0,
    sourceY: (sourceHeight - sourceCropHeight) / 2,
    sourceWidth,
    sourceHeight: sourceCropHeight,
  };
}

export function calculateMarketingOutputPlan(
  sourceWidth: number,
  sourceHeight: number,
  target: MarketingOutputTarget,
) {
  const crop = calculateCoverCrop(sourceWidth, sourceHeight, target.widthPx, target.heightPx);
  const scaleX = target.widthPx / crop.sourceWidth;
  const scaleY = target.heightPx / crop.sourceHeight;
  const upscaleFactor = Math.max(scaleX, scaleY);
  const quality: MarketingOutputQuality = upscaleFactor <= 1
    ? "native_or_downscale"
    : upscaleFactor <= MAX_PRINT_UPSCALE_FACTOR
      ? "upscale_allowed"
      : "upscale_blocked";
  return {
    crop,
    upscaleFactor,
    quality,
    sourceWidth,
    sourceHeight,
    targetWidth: target.widthPx,
    targetHeight: target.heightPx,
  };
}
