const MAX_SOURCE_PIXELS = 20_000_000;
export const MAX_REEL_IMAGE_EDGE = 1440;

/** Read dimensions before decoding; reject oversized compressed images without allocating their pixels. */
export function readReelImageDimensions(buffer: ArrayBuffer): { width: number; height: number } {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const ascii = (offset: number, length: number) => String.fromCharCode(...data.subarray(offset, offset + length));
  const checked = (width: number, height: number) => {
    if (!width || !height || width * height > MAX_SOURCE_PIXELS) {
      throw new Error("Cette image est trop grande. Importez une version de 20 mégapixels maximum.");
    }
    return { width, height };
  };
  if (data.length >= 24 && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === "IHDR") {
    return checked(view.getUint32(16), view.getUint32(20));
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= data.length) {
      if (data[offset++] !== 0xff) break;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > data.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 7) {
        return checked(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += size;
    }
  }
  if (data.length >= 20 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= data.length;) {
      const kind = ascii(offset, 4);
      const size = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (start + size > data.length) break;
      const uint24 = (at: number) => data[at] | data[at + 1] << 8 | data[at + 2] << 16;
      if (kind === "VP8X" && size >= 10) return checked(uint24(start + 4) + 1, uint24(start + 7) + 1);
      if (kind === "VP8L" && size >= 5 && data[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        return checked((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      if (kind === "VP8 " && size >= 10 && data[start + 3] === 0x9d && data[start + 4] === 0x01 && data[start + 5] === 0x2a) {
        return checked(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      }
      offset = start + size + (size % 2);
    }
  }
  throw new Error("Image illisible. Importez une image JPEG, PNG ou WebP valide.");
}

export function boundedReelImageSize(width: number, height: number) {
  if (width < 1 || height < 1 || !Number.isFinite(width * height)) throw new Error("Dimensions d'image invalides.");
  const scale = Math.min(1, MAX_REEL_IMAGE_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
