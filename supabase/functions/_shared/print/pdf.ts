import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";

import { HttpError, getEnv } from "../auth.ts";
import { sha256Hex } from "./security.ts";

type JsonRecord = Record<string, unknown>;

type ServerPrintDocument = {
  version: number;
  title: string;
  background: { url: string; mimeType: string; widthPx: number; heightPx: number };
  logo?: { url: string; mimeType: string; widthPx: number; heightPx: number } | null;
  texts?: Array<{
    id: string;
    kind: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    align?: "left" | "center" | "right";
    fontSizeMm?: number;
    weight?: "normal" | "bold";
    color?: string;
  }>;
  qr?: { value: string; x: number; y: number; size: number } | null;
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

function normalized(value: unknown) {
  return Math.max(0, Math.min(1, number(value)));
}

function parseHexColor(value: unknown) {
  const raw = String(value || "#111827").trim();
  const match = raw.match(/^#([0-9a-f]{6})$/i);
  if (!match) return rgb(17 / 255, 24 / 255, 39 / 255);
  const hex = match[1];
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
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
    texts: Array.isArray(record.texts) ? record.texts.map((entry) => {
      const text = asRecord(entry);
      return {
        id: String(text.id || crypto.randomUUID()),
        kind: String(text.kind || "body"),
        text: String(text.text || "").slice(0, 1000),
        x: normalized(text.x),
        y: normalized(text.y),
        width: normalized(text.width),
        height: normalized(text.height),
        align: text.align === "center" || text.align === "right" ? text.align : "left",
        fontSizeMm: Math.max(1.8, Math.min(20, number(text.fontSizeMm, 4))),
        weight: text.weight === "bold" ? "bold" : "normal",
        color: String(text.color || "#111827"),
      };
    }) : [],
    qr: null,
    layout: asRecord(record.layout),
  };
  if (!document.background.url) throw new HttpError(400, "PRINT_BACKGROUND_REQUIRED");

  const qr = asRecord(record.qr);
  if (Object.keys(qr).length > 0) {
    const value = String(qr.value || "").trim();
    if (!/^https?:\/\//i.test(value)) throw new HttpError(400, "PRINT_QR_INVALID");
    document.qr = {
      value,
      x: normalized(qr.x),
      y: normalized(qr.y),
      size: normalized(qr.size),
    };
  }
  return document;
}

function buildServerPreflight(document: ServerPrintDocument, spec: ServerPrintProductSpec) {
  const blocking: Array<{ code: string; message: string }> = [];
  if (!(spec.widthMm > 0 && spec.heightMm > 0 && spec.bleedMm >= 0 && spec.safeMarginMm >= 0)) {
    blocking.push({ code: "invalid_product_spec", message: "Spécification produit invalide." });
  }
  const mediaWidthMm = spec.widthMm + 2 * spec.bleedMm;
  const mediaHeightMm = spec.heightMm + 2 * spec.bleedMm;
  const dpiX = document.background.widthPx / (mediaWidthMm / 25.4);
  const dpiY = document.background.heightPx / (mediaHeightMm / 25.4);
  if (Math.min(dpiX, dpiY) < 150) {
    blocking.push({ code: "resolution_too_low", message: "Résolution insuffisante pour l’impression." });
  }
  const safeX = spec.safeMarginMm / spec.widthMm;
  const safeY = spec.safeMarginMm / spec.heightMm;
  for (const text of document.texts || []) {
    if (!text.text.trim()) continue;
    if (text.x < safeX || text.y < safeY || text.x + text.width > 1 - safeX || text.y + text.height > 1 - safeY) {
      blocking.push({ code: "text_outside_safe_area", message: "Un texte est trop proche de la coupe." });
      break;
    }
  }
  if (document.qr) {
    const qrMm = document.qr.size * Math.min(spec.widthMm, spec.heightMm);
    if (qrMm < 18) blocking.push({ code: "qr_too_small", message: "QR code trop petit." });
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

function drawImageCover(page: any, image: any, pageWidth: number, pageHeight: number) {
  const sourceRatio = image.width / image.height;
  const targetRatio = pageWidth / pageHeight;
  let width = pageWidth;
  let height = pageHeight;
  if (sourceRatio > targetRatio) width = height * sourceRatio;
  else height = width / sourceRatio;
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });
}

function wrapText(text: string, maxChars: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 12);
}

async function drawQr(page: any, value: string, x: number, y: number, size: number) {
  const qr: any = QRCode.create(value, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const cell = size / count;
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      page.drawRectangle({
        x: x + column * cell,
        y: y + (count - row - 1) * cell,
        width: cell + 0.05,
        height: cell + 0.05,
        color: rgb(0, 0, 0),
      });
    }
  }
}

export async function buildPrintPdf(input: {
  document: unknown;
  spec: ServerPrintProductSpec;
}) {
  const document = validateDocument(input.document);
  const preflight = buildServerPreflight(document, input.spec);
  if (!preflight.ready) throw new HttpError(422, "PRINT_PREFLIGHT_FAILED", { preflight });

  const trimWidth = input.spec.widthMm * MM_TO_PT;
  const trimHeight = input.spec.heightMm * MM_TO_PT;
  const bleed = input.spec.bleedMm * MM_TO_PT;
  const mediaWidth = trimWidth + 2 * bleed;
  const mediaHeight = trimHeight + 2 * bleed;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([mediaWidth, mediaHeight]);
  page.setMediaBox(0, 0, mediaWidth, mediaHeight); // MediaBox
  page.setBleedBox(0, 0, mediaWidth, mediaHeight); // BleedBox
  page.setCropBox(0, 0, mediaWidth, mediaHeight); // CropBox
  page.setTrimBox(bleed, bleed, trimWidth, trimHeight); // TrimBox
  const safe = input.spec.safeMarginMm * MM_TO_PT;
  page.setArtBox(bleed + safe, bleed + safe, Math.max(1, trimWidth - 2 * safe), Math.max(1, trimHeight - 2 * safe));

  const backgroundSource = await fetchTrustedImage(document.background);
  const background = backgroundSource.contentType === "image/png"
    ? await pdf.embedPng(backgroundSource.bytes)
    : await pdf.embedJpg(backgroundSource.bytes);
  drawImageCover(page, background, mediaWidth, mediaHeight);

  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const element of document.texts || []) {
    if (!element.text.trim()) continue;
    const boxX = bleed + element.x * trimWidth;
    const boxTop = bleed + element.y * trimHeight;
    const boxWidth = Math.max(1, element.width * trimWidth);
    const boxHeight = Math.max(1, element.height * trimHeight);
    const fontSize = Math.max(5, (element.fontSizeMm || 4) * MM_TO_PT);
    const font = element.weight === "bold" ? boldFont : regularFont;
    const lines = wrapText(element.text, Math.max(8, Math.floor(boxWidth / Math.max(fontSize * 0.52, 1))));
    const lineHeight = fontSize * 1.15;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const measured = font.widthOfTextAtSize(line, fontSize);
      const x = element.align === "center"
        ? boxX + Math.max(0, (boxWidth - measured) / 2)
        : element.align === "right"
        ? boxX + Math.max(0, boxWidth - measured)
        : boxX;
      const y = mediaHeight - bleed - boxTop - lineHeight * (index + 1);
      if (y < mediaHeight - bleed - boxTop - boxHeight) break;
      page.drawText(line, { x, y, size: fontSize, font, color: parseHexColor(element.color) });
    }
  }

  if (document.qr) {
    const size = document.qr.size * Math.min(trimWidth, trimHeight);
    const x = bleed + document.qr.x * trimWidth;
    const y = mediaHeight - bleed - document.qr.y * trimHeight - size;
    page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) });
    await drawQr(page, document.qr.value, x, y, size);
  }

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
