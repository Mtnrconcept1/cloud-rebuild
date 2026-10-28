import { createHash } from "node:crypto";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { HttpError, getEnv } from "../auth.ts";
import { readBoundedImageBody } from "../ai-image-response.ts";
import { sha256Hex } from "./security.ts";
import { buildNativePrintTemplate, hasArtworkOverlays, validateNativeArtwork, NATIVE_ARTWORK_VERSION } from "./artwork.ts";
import { reviewNativePrintArtwork } from "./artwork-review.ts";

export type ServerPrintProductSpec = {
  widthMm: number; heightMm: number; bleedMm: number; safeMarginMm: number;
  minimumDpi?: number; recommendedDpi?: number; printTechnology?: string | null;
};
const MM_TO_PT = 72 / 25.4;
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function assertTrustedAssetUrl(value: unknown) {
  let url: URL;
  try { url = new URL(String(value || "")); } catch { throw new HttpError(400, "PRINT_ASSET_URL_INVALID"); }
  if (url.protocol !== "https:") throw new HttpError(400, "PRINT_ASSET_HTTPS_REQUIRED");
  if (url.host !== new URL(getEnv("SUPABASE_URL")).host || !url.pathname.startsWith("/storage/v1/object/") || url.username || url.password) {
    throw new HttpError(400, "PRINT_ASSET_MUST_BE_PERSISTED");
  }
  return url.toString();
}

export async function buildPrintPdf(input: { document: unknown; spec: ServerPrintProductSpec; expectedSourceSha256: string }) {
  // Fail before fetching, decoding or charging the visual review. Old/malicious clients cannot re-enable overlays.
  if (hasArtworkOverlays(input.document)) throw new HttpError(422, "PRINT_NATIVE_ARTWORK_ONLY");
  const document = asRecord(input.document);
  const backgroundAsset = asRecord(document.background);
  const template = buildNativePrintTemplate(input.spec);
  const response = await fetch(assertTrustedAssetUrl(backgroundAsset.url), { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new HttpError(400, "PRINT_ASSET_UNAVAILABLE");
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "image/png" && contentType !== "image/jpeg") throw new HttpError(400, "PRINT_ASSET_FORMAT_UNSUPPORTED");
  const imageBytes = await readBoundedImageBody(response, MAX_SOURCE_IMAGE_BYTES, 15_000);
  if (!imageBytes.length) throw new HttpError(400, "PRINT_BACKGROUND_REQUIRED");
  const sourceSha256 = await sha256Hex(imageBytes);
  if (!input.expectedSourceSha256 || sourceSha256 !== input.expectedSourceSha256) throw new HttpError(409, "PRINT_SOURCE_CHANGED_REGENERATE");
  const pdf = await PDFDocument.create();
  const background = contentType === "image/png" ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
  // The original decoded pixels are authoritative, never a browser-declared DPI or resampled file.
  const geometry = validateNativeArtwork(background.width, background.height, template);
  if (!geometry.ready) throw new HttpError(422, geometry.blocking.map(issue => issue.message).join(" "), { preflight: geometry });
  const artworkReview = await reviewNativePrintArtwork({ bytes: imageBytes, contentType, width: background.width, height: background.height, template });
  if (!artworkReview.ready) throw new HttpError(422, artworkReview.blocking.map(issue => issue.message).join(" "), { preflight: artworkReview });
  const preflight = { ...geometry, nativeArtworkVersion: NATIVE_ARTWORK_VERSION, artworkReview,
    sourceSha256, nativeDimensions: { width: background.width, height: background.height },
    humanProofRequired: true, pdfStandard: "PDF 1.7 / RGB raster; not certified PDF/X-4" };

  const trimWidth = template.widthMm * MM_TO_PT;
  const trimHeight = template.heightMm * MM_TO_PT;
  const bleed = template.bleedMm * MM_TO_PT;
  const mediaWidth = template.mediaWidthMm * MM_TO_PT;
  const mediaHeight = template.mediaHeightMm * MM_TO_PT;
  const safe = template.safeMarginMm * MM_TO_PT;
  const page = pdf.addPage([mediaWidth, mediaHeight]);
  page.setMediaBox(0, 0, mediaWidth, mediaHeight);
  page.setBleedBox(0, 0, mediaWidth, mediaHeight);
  page.setCropBox(0, 0, mediaWidth, mediaHeight);
  page.setTrimBox(bleed, bleed, trimWidth, trimHeight);
  page.setArtBox(bleed + safe, bleed + safe, trimWidth - 2 * safe, trimHeight - 2 * safe);
  // Preserve proportions and every original pixel. The allowed <=1px rounding stays in the outer bleed.
  const scale = Math.min(mediaWidth / background.width, mediaHeight / background.height);
  const width = background.width * scale;
  const height = background.height * scale;
  page.drawImage(background, { x: (mediaWidth - width) / 2, y: (mediaHeight - height) / 2, width, height });
  // Title is metadata only; no text, logo, QR, colour rectangle or guide is drawn on the artwork.
  pdf.setTitle(String(document.title || "Création Marketing Studio").slice(0, 160));
  pdf.setProducer("TheTok Print Engine");
  pdf.setCreator("TheTok Marketing Studio");
  const bytes = new Uint8Array(await pdf.save({ useObjectStreams: true }));
  return { bytes, md5: createHash("md5").update(bytes).digest("hex"), sha256: await sha256Hex(bytes), preflight,
    productSpecSnapshot: { ...input.spec, safeMarginMm: template.safeMarginMm, minimumDpi: template.minimumDpi,
      recommendedDpi: template.recommendedDpi, mediaWidthMm: template.mediaWidthMm, mediaHeightMm: template.mediaHeightMm,
      pdfBoxes: ["MediaBox", "TrimBox", "BleedBox", "CropBox", "ArtBox"], nativeArtworkVersion: NATIVE_ARTWORK_VERSION } };
}
