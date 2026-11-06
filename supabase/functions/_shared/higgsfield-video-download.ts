/** Bounded server-side media download. Never buffer an unbounded provider body. */
export function tokVideoOutputFileSpec(value: unknown) {
  if (value == null || value === "mp4") return { format: "mp4" as const, extension: "mp4", contentType: "video/mp4" };
  if (value === "mov") return { format: "mov" as const, extension: "mov", contentType: "video/quicktime" };
  throw new Error("video_output_format_invalid");
}

/** The reader stops at the actual byte limit, even if Content-Length is absent
 * or incorrect. Container sniffing rejects HTML/JSON returned by expired CDN
 * links; it does not pretend to fully decode or validate a video rendition.
 */
export async function readBoundedTokVideo(response: Response, maxBytes: number, outputFormat: "mp4" | "mov") {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 16) throw new Error("video_download_limit_invalid");
  const declaredSize = response.headers.get("content-length");
  if (declaredSize && Number(declaredSize) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("video_file_too_large");
  }
  const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const expectedMime = tokVideoOutputFileSpec(outputFormat).contentType;
  if (mime && mime !== expectedMime && mime !== "application/octet-stream" && mime !== "binary/octet-stream") {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("video_download_invalid");
  }
  if (!response.body) throw new Error("video_download_invalid");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - size) {
        await reader.cancel().catch(() => undefined);
        throw new Error("video_file_too_large");
      }
      size += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size < 16) throw new Error("video_download_invalid");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  chunks.length = 0;
  const box = String.fromCharCode(...bytes.subarray(4, 8));
  // Both MP4 and modern MOV are ISO BMFF containers. Legacy QuickTime also
  // permits a leading wide/mdat/moov box instead of ftyp.
  if (box !== "ftyp" && (outputFormat !== "mov" || !["wide", "mdat", "moov"].includes(box))) {
    throw new Error("video_download_invalid");
  }
  if (box === "ftyp") {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if ((outputFormat === "mov") !== (brand === "qt  ")) throw new Error("video_download_format_mismatch");
  }
  return bytes;
}
