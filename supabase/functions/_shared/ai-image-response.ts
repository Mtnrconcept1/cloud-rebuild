/** Bounds apply while reading, even when Content-Length is missing or false. */
export const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
// At most two 18 MiB images encoded in base64, plus bounded JSON/usage fields.
export const MAX_IMAGE_RESPONSE_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 * 2 + 64 * 1024;

export class ImageBodyError extends Error {
  constructor(public readonly code: "image_body_too_large" | "image_body_timeout" | "image_invalid_payload") {
    super(code);
    this.name = "ImageBodyError";
  }
}

export async function readBoundedImageBody(response: Response, maxBytes = MAX_IMAGE_BYTES, timeoutMs = 30_000) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    // Cancellation is best effort; do not await a malicious stream's cancel.
    void response.body?.cancel().catch(() => {});
    throw new ImageBodyError("image_body_too_large");
  }
  if (!response.body) throw new ImageBodyError("image_invalid_payload");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ImageBodyError("image_body_timeout")), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ImageBodyError("image_body_too_large");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function readBoundedImageJson(response: Response, timeoutMs = 30_000): Promise<unknown> {
  const bytes = await readBoundedImageBody(response, MAX_IMAGE_RESPONSE_BYTES, timeoutMs);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ImageBodyError("image_invalid_payload");
  }
}

export function decodeBoundedImageBase64(base64: string, maxBytes = MAX_IMAGE_BYTES) {
  // Reject before atob allocates a second copy of a large untrusted payload.
  if (base64.length > Math.ceil(maxBytes / 3) * 4) throw new ImageBodyError("image_body_too_large");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const firstPadding = base64.indexOf("=");
  if (base64.length === 0 || base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)
    || firstPadding !== (padding ? base64.length - padding : -1)) {
    throw new ImageBodyError("image_invalid_payload");
  }
  const decodedLength = base64.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) throw new ImageBodyError("image_body_too_large");
  const binary = atob(base64);
  // Avoid TypedArray.from(string): its iterable path can allocate a temporary
  // array of millions of characters in addition to the decoded image.
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
