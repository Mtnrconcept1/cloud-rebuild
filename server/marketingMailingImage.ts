import { inflateSync } from "node:zlib";
import { decode as decodeJpeg } from "jpeg-js";

export const MAX_MAILING_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_MAILING_IMAGE_SIDE = 8192;
export const MAX_MAILING_IMAGE_PIXELS = 16 * 1024 * 1024;

export class MailingImageInputError extends Error {
  constructor(message = "Importez une image JPEG ou PNG valide de 3 Mo maximum.") {
    super(message);
    this.name = "MailingImageInputError";
  }
}

export interface ValidatedMailingImage {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  width: number;
  height: number;
}

function invalid(): never { throw new MailingImageInputError(); }

function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > MAX_MAILING_IMAGE_SIDE || height > MAX_MAILING_IMAGE_SIDE
    || width * height > MAX_MAILING_IMAGE_PIXELS) {
    throw new MailingImageInputError("L’image doit mesurer au maximum 8 192 pixels par côté et 16 mégapixels. Importez une image de plus petite résolution.");
  }
  return { width, height };
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes: Buffer, from: number, until: number): number {
  let crc = 0xffffffff;
  for (let offset = from; offset < until; offset += 1) crc = CRC_TABLE[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate the PNG container and its complete, bounded raster stream. */
function pngDimensions(bytes: Buffer) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) invalid();
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = -1;
  let interlace = 0;
  let palette = false;
  let ended = false;
  let imageDataEnded = false;
  const compressed: Buffer[] = [];
  let chunkCount = 0;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length || ++chunkCount > 10_000) invalid();
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length || !/^[A-Za-z]{4}$/.test(kind)
      || (bytes[offset + 6] & 32) !== 0
      || crc32(bytes, offset + 4, end) !== bytes.readUInt32BE(end)) invalid();
    if (chunkCount === 1 && kind !== "IHDR") invalid();
    if (kind === "IHDR") {
      if (chunkCount !== 1 || length !== 13) invalid();
      width = bytes.readUInt32BE(start);
      height = bytes.readUInt32BE(start + 4);
      dimensions(width, height);
      depth = bytes[start + 8];
      color = bytes[start + 9];
      interlace = bytes[start + 12];
      const validDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!validDepths[color]?.includes(depth) || bytes[start + 10] !== 0
        || bytes[start + 11] !== 0 || interlace > 1) invalid();
    } else if (kind === "PLTE") {
      if (palette || compressed.length || length < 3 || length > 768 || length % 3 !== 0
        || color === 0 || color === 4 || (color === 3 && length / 3 > 2 ** depth)) invalid();
      palette = true;
    } else if (kind === "IDAT") {
      if (imageDataEnded || (color === 3 && !palette)) invalid();
      compressed.push(bytes.subarray(start, end));
    } else if (kind === "IEND") {
      if (length !== 0 || !compressed.length || end + 4 !== bytes.length) invalid();
      ended = true;
    } else {
      if (compressed.length) imageDataEnded = true;
      // APNG and unknown critical chunks require decoders outside this format.
      if (["acTL", "fcTL", "fdAT"].includes(kind) || (bytes[offset + 4] & 32) === 0) invalid();
    }
    offset = end + 4;
  }
  if (!ended) invalid();
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const passes = interlace === 0 ? [[0, 0, 1, 1]] : [
    [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
    [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
  ];
  const rasterPasses = passes.map(([x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx));
    const rows = Math.max(0, Math.ceil((height - y) / dy));
    return { rows: columns ? rows : 0, rowBytes: Math.ceil(columns * channels[color] * depth / 8) };
  });
  const expected = rasterPasses.reduce((sum, pass) => sum + pass.rows * (pass.rowBytes + 1), 0);
  if (expected > 64 * 1024 * 1024) {
    throw new MailingImageInputError("Cette image demande trop de mémoire. Importez une image de plus petite résolution.");
  }
  let raster: Buffer;
  try { raster = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 }); }
  catch { return invalid(); }
  if (raster.length !== expected) invalid();
  let rowOffset = 0;
  for (const pass of rasterPasses) {
    for (let row = 0; row < pass.rows; row += 1) {
      if (raster[rowOffset] > 4) invalid();
      rowOffset += pass.rowBytes + 1;
    }
  }
  return dimensions(width, height);
}

/** Inspect dimensions before admitting a memory-bounded, strict JPEG decode. */
function jpegDimensions(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalid();
  let offset = 2;
  let frame: { width: number; height: number } | undefined;
  let scans = 0;
  let ended = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalid();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frame || scans === 0 || offset !== bytes.length) invalid();
      ended = true;
      break;
    }
    if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0x01
      || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (frame || length < 11 || bytes[offset + 2] !== 8) invalid();
      const components = bytes[offset + 7];
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) invalid();
      frame = dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4) {
      invalid();
    }
    offset = end;
    if (marker === 0xda) {
      if (!frame || length < 8 || length !== 6 + 2 * bytes[end - length + 2]) invalid();
      scans += 1;
      // Stuffed FF00 and restart markers belong to entropy data. The next
      // ordinary marker is parsed by the outer loop, including progressive scans.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        let next = offset + 1;
        while (next < bytes.length && bytes[next] === 0xff) next += 1;
        if (next >= bytes.length) invalid();
        if (bytes[next] === 0 || (bytes[next] >= 0xd0 && bytes[next] <= 0xd7)) {
          offset = next + 1;
          continue;
        }
        break;
      }
    }
  }
  if (!ended || !frame) invalid();
  try {
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: false,
      tolerantDecoding: false,
      maxResolutionInMP: MAX_MAILING_IMAGE_PIXELS / 1_000_000,
      maxMemoryUsageInMB: 128,
    });
    if (decoded.width !== frame.width || decoded.height !== frame.height
      || decoded.data.length !== frame.width * frame.height * 3) invalid();
  } catch (error) {
    if (error instanceof Error && /maxMemoryUsageInMB|memory/i.test(error.message)) {
      throw new MailingImageInputError("Cette image demande trop de mémoire. Importez une image de plus petite résolution.");
    }
    return invalid();
  }
  return frame;
}

/** No URL fetch or re-encoding: the approved bytes are the bytes stored. */
export function validateMailingImage(contentType: unknown, imageBase64: unknown): ValidatedMailingImage {
  if ((contentType !== "image/jpeg" && contentType !== "image/png")
    || typeof imageBase64 !== "string" || imageBase64.length === 0
    || imageBase64.length > Math.ceil(MAX_MAILING_IMAGE_BYTES / 3) * 4
    || imageBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(imageBase64)) invalid();
  const padding = imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0;
  if (imageBase64.indexOf("=") !== (padding ? imageBase64.length - padding : -1)) invalid();
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length > MAX_MAILING_IMAGE_BYTES || bytes.toString("base64") !== imageBase64) invalid();
  const size = contentType === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
  return { bytes, contentType, extension: contentType === "image/png" ? "png" : "jpg", ...size };
}
