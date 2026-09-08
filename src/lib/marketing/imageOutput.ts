import {
  MAX_MARKETING_OUTPUT_PIXELS,
  calculateMarketingOutputPlan,
  type MarketingOutputTarget,
} from "@/lib/marketing/outputGeometry";

export type MarketingOutputMimeType = "image/png" | "image/jpeg";

export function assertMarketingOutputDimensions(widthPx: number, heightPx: number) {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new Error("INVALID_MARKETING_OUTPUT_DIMENSIONS");
  }
  const width = Math.round(widthPx);
  const height = Math.round(heightPx);
  if (width * height > MAX_MARKETING_OUTPUT_PIXELS) {
    throw new Error("MARKETING_OUTPUT_TOO_LARGE");
  }
  return { widthPx: width, heightPx: height };
}

function slugifyFilePart(value: string) {
  return String(value || "visuel")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "visuel";
}

export function marketingOutputFileName(
  baseName: string,
  target: MarketingOutputTarget,
  extension: "png" | "jpg" = "png",
) {
  return `${slugifyFilePart(baseName)}-${slugifyFilePart(target.id)}-${target.widthPx}x${target.heightPx}.${extension}`;
}

async function loadImageFromBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("MARKETING_OUTPUT_IMAGE_DECODE_FAILED"));
      image.src = objectUrl;
    });
    return image;
  } finally {
    // The decoded image keeps its data after load. Releasing the object URL here
    // prevents large print rasters from leaking memory during repeated exports.
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: MarketingOutputMimeType, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("MARKETING_OUTPUT_ENCODING_FAILED"));
    }, mimeType, quality);
  });
}

export async function renderMarketingOutputBlob(input: {
  sourceUrl: string;
  target: MarketingOutputTarget;
  mimeType?: MarketingOutputMimeType;
  jpegQuality?: number;
}) {
  const targetDimensions = assertMarketingOutputDimensions(input.target.widthPx, input.target.heightPx);
  const response = await fetch(input.sourceUrl, { method: "GET", credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(`MARKETING_OUTPUT_SOURCE_FETCH_FAILED_${response.status}`);
  const sourceBlob = await response.blob();
  if (!sourceBlob.type.startsWith("image/")) throw new Error("MARKETING_OUTPUT_SOURCE_NOT_IMAGE");
  const image = await loadImageFromBlob(sourceBlob);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("MARKETING_OUTPUT_SOURCE_DIMENSIONS_MISSING");

  const plan = calculateMarketingOutputPlan(sourceWidth, sourceHeight, input.target);
  const canvas = document.createElement("canvas");
  canvas.width = targetDimensions.widthPx;
  canvas.height = targetDimensions.heightPx;
  const context = canvas.getContext("2d", { alpha: input.mimeType !== "image/jpeg" });
  if (!context) throw new Error("MARKETING_OUTPUT_CANVAS_UNAVAILABLE");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    plan.crop.sourceX,
    plan.crop.sourceY,
    plan.crop.sourceWidth,
    plan.crop.sourceHeight,
    0,
    0,
    targetDimensions.widthPx,
    targetDimensions.heightPx,
  );

  const mimeType = input.mimeType || "image/png";
  const blob = await canvasToBlob(canvas, mimeType, Math.min(1, Math.max(0.7, input.jpegQuality ?? 0.94)));
  return {
    blob,
    mimeType,
    widthPx: targetDimensions.widthPx,
    heightPx: targetDimensions.heightPx,
    sourceWidthPx: sourceWidth,
    sourceHeightPx: sourceHeight,
    upscaleFactor: plan.upscaleFactor,
    quality: plan.quality,
  };
}

export async function downloadMarketingOutput(input: {
  sourceUrl: string;
  target: MarketingOutputTarget;
  baseName: string;
  mimeType?: MarketingOutputMimeType;
}) {
  const rendered = await renderMarketingOutputBlob(input);
  const extension = rendered.mimeType === "image/jpeg" ? "jpg" : "png";
  const objectUrl = URL.createObjectURL(rendered.blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = marketingOutputFileName(input.baseName, input.target, extension);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  return rendered;
}
