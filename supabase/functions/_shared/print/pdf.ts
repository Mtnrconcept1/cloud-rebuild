import { createHash } from "node:crypto";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

import { HttpError, getEnv } from "../auth.ts";
import { sha256Hex } from "./security.ts";

type JsonRecord = Record<string, unknown>;

type ServerPrintDocument = {
  version: number;
  title: string;
  background: { url: string; mimeType: string; widthPx: number; heightPx: number };
  layout?: { orientation?: string; backgroundPosition?: string; overlayOpacity?: number };
};

export type ServerPrintProductSpec = {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  printTechnology?: string | null;
};

const MM_TO_PT = 72 / 25.4;
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assertTrustedAssetUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "PRINT_ASSET_URL_INVALID");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "PRINT_ASSET_HTTPS_REQUIRED");

  const supabaseUrl = getEnv("SUPABASE_URL");
  let supabaseHost = "";
  try {
    supabaseHost = new URL(supabaseUrl).host;
  } catch {
    throw new HttpError(503, "SUPABASE_URL_INVALID");
  }
  if (url.host !== supabaseHost || !url.pathname.startsWith("/storage/v1/object/")) {
    throw new HttpError(400, "PRINT_ASSET_MUST_BE_PERSISTED");
  }
  return url.toString();
}

async function fetchTrustedImage(asset: { url: string; mimeType: string }) {
  const url = assertTrustedAssetUrl(asset.url);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new HttpError(400, "PRINT_ASSET_UNAVAILABLE");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_SOURCE_IMAGE_BYTES) throw new HttpError(413, "PRINT_ASSET_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new HttpError(413, "PRINT_ASSET_TOO_LARGE");
  }
  const contentType = (response.headers.get("content-type") || asset.mimeType || "").split(";")[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new HttpError(400, "PRINT_ASSET_FORMAT_UNSUPPORTED");
  }
  return { bytes, contentType };
}

function validateDocument(input: unknown): ServerPrintDocument {
  const record = asRecord(input);
  // Compatibility fields may be present as empty values, but overlays are
  // categorically forbidden in print exports: every mark belongs to the native image.
  if ((record.texts != null && (!Array.isArray(record.texts) || record.texts.length !== 0))
    || record.qr != null || record.logo != null) {
    throw new HttpError(400, "PRINT_NATIVE_IMAGE_ONLY");
  }
  const background = asRecord(record.background);
  const document: ServerPrintDocument = {
    version: number(record.version, 1),
    title: String(record.title || "Création Marketing Studio").trim().slice(0, 160),
    background: {
      url: String(background.url || "").trim(),
      mimeType: String(background.mimeType || "").trim().toLowerCase(),
      widthPx: Math.max(1, Math.round(number(background.widthPx))),
      heightPx: Math.max(1, Math.round(number(background.heightPx))),
    },

  };
  if (!document.background.url) throw new HttpError(400, "PRINT_BACKGROUND_REQUIRED");

  return document;
}

function buildServerPreflight(document: ServerPrintDocument, spec: ServerPrintProductSpec) {
  const blocking: Array<{ code: string; message: string }> = [];
  if (!(spec.widthMm > 0 && spec.heightMm > 0 && spec.bleedMm >= 0 && spec.safeMarginMm >= 0)) {
    blocking.push({ code: "invalid_product_spec", message: "Spécification produit invalide." });
  }
  const mediaWidthMm = spec.widthMm + 2 * spec.bleedMm;
  const mediaHeightMm = spec.heightMm + 2 * spec.bleedMm;
  // The browser prepares a raster including bleed. Allow pixel rounding, but
  // never silently crop a differently shaped uploaded image into the PDF.
  const sourceRatio = document.background.widthPx / document.background.heightPx;
  const targetRatio = mediaWidthMm / mediaHeightMm;
  if (Math.abs(sourceRatio / targetRatio - 1) > 0.001) {
    blocking.push({ code: "background_format_mismatch", message: "Le format du visuel ne correspond pas au format d’impression." });
  }
  const dpiX = document.background.widthPx / (mediaWidthMm / 25.4);
  const dpiY = document.background.heightPx / (mediaHeightMm / 25.4);
  if (Math.min(dpiX, dpiY) < 150) {
    blocking.push({ code: "resolution_too_low", message: "Résolution insuffisante pour l’impression." });
  }
  return {
    blocking,
    warnings: Math.min(dpiX, dpiY) < 250 && Math.min(dpiX, dpiY) >= 150
      ? [{ code: "resolution_below_recommended", message: "Résolution sous 250 dpi." }]
      : [],
    effectiveResolutionDpi: { x: dpiX, y: dpiY },
    ready: blocking.length === 0,
  };
}

export async function buildPrintPdf(input: {
  document: unknown;
  spec: ServerPrintProductSpec;
}) {
  const document = validateDocument(input.document);
  const pdf = await PDFDocument.create();
  const backgroundSource = await fetchTrustedImage(document.background);
  const background = backgroundSource.contentType === "image/png"
    ? await pdf.embedPng(backgroundSource.bytes)
    : await pdf.embedJpg(backgroundSource.bytes);
  // Uploaded bytes are authoritative; client-supplied pixel dimensions can lie.
  const preflight = buildServerPreflight({
    ...document,
    background: { ...document.background, widthPx: background.width, heightPx: background.height },
  }, input.spec);
  if (!preflight.ready) throw new HttpError(422, "PRINT_PREFLIGHT_FAILED", { preflight });

  const trimWidth = input.spec.widthMm * MM_TO_PT;
  const trimHeight = input.spec.heightMm * MM_TO_PT;
  const bleed = input.spec.bleedMm * MM_TO_PT;
  const mediaWidth = trimWidth + 2 * bleed;
  const mediaHeight = trimHeight + 2 * bleed;

  const page = pdf.addPage([mediaWidth, mediaHeight]);
  page.setMediaBox(0, 0, mediaWidth, mediaHeight); // MediaBox
  page.setBleedBox(0, 0, mediaWidth, mediaHeight); // BleedBox
  page.setCropBox(0, 0, mediaWidth, mediaHeight); // CropBox
  page.setTrimBox(bleed, bleed, trimWidth, trimHeight); // TrimBox
  const safe = input.spec.safeMarginMm * MM_TO_PT;
  page.setArtBox(bleed + safe, bleed + safe, Math.max(1, trimWidth - 2 * safe), Math.max(1, trimHeight - 2 * safe));

  // The image already includes the full bleed. Avoid any secondary cover crop
  // that could cut native text or logos situated near the edge.
  page.drawImage(background, { x: 0, y: 0, width: mediaWidth, height: mediaHeight });

  pdf.setTitle(document.title);
  pdf.setProducer("TheTok Print Engine");
  pdf.setCreator("TheTok Marketing Studio");
  const bytes = new Uint8Array(await pdf.save({ useObjectStreams: true }));
  const md5 = createHash("md5").update(bytes).digest("hex");
  const sha256 = await sha256Hex(bytes);

  return {
    bytes,
    md5,
    sha256,
    preflight,
    productSpecSnapshot: {
      ...input.spec,
      mediaWidthMm: input.spec.widthMm + 2 * input.spec.bleedMm,
      mediaHeightMm: input.spec.heightMm + 2 * input.spec.bleedMm,
      pdfBoxes: ["MediaBox", "TrimBox", "BleedBox", "CropBox", "ArtBox"],
    },
  };
}
