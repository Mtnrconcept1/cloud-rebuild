import { buildTokMarketingVisualPrompt, TOK_MARKETING_REFERENCES } from "./marketing-brand.ts";
import type { MarketingPostFormat } from "./marketing-ai-plan.ts";

const REFERENCE_ORIGIN = "https://www.thetok.ch";
const MAX_REFERENCE_BYTES = 2_000_000;
const MAX_OUTPUT_BYTES = 8_000_000;
let referenceCache: Promise<Blob[]> | undefined;

async function readBounded(response: Response, maximum: number): Promise<Uint8Array> {
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new Error("marketing_image_response_invalid");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new Error("marketing_image_response_too_large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function loadReferences(): Promise<Blob[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await Promise.all(TOK_MARKETING_REFERENCES.map(async (reference) => {
      // No user-controlled URL, redirects, credentials or Authorization header.
      const response = await fetch(`${REFERENCE_ORIGIN}${reference.path}`, {
        redirect: "error", signal: controller.signal,
      });
      const bytes = await readBounded(response, MAX_REFERENCE_BYTES);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== reference.sha256) throw new Error("marketing_brand_reference_changed");
      return new Blob([bytes], { type: "image/jpeg" });
    }));
  } finally {
    controller.abort();
    clearTimeout(timeout);
  }
}

export async function buildTokMarketingImageForm(
  prompt: string,
  format?: MarketingPostFormat,
): Promise<FormData> {
  referenceCache ??= loadReferences().catch((error) => { referenceCache = undefined; throw error; });
  const references = await referenceCache;
  const form = new FormData();
  form.set("model", "gpt-image-2");
  form.set("prompt", buildTokMarketingVisualPrompt(prompt));
  form.set("size", format === "9:16"
    ? "1024x1536"
    : format === "16:9"
      ? "1536x1024"
      : format === "1:1"
        ? "1024x1024"
        : "1024x1280");
  form.set("output_format", "jpeg");
  form.set("output_compression", "90");
  form.set("n", "1");
  // gpt-image-2 processes references at high fidelity; input_fidelity is not needed.
  references.forEach((blob, index) => form.append("image[]", blob, `${TOK_MARKETING_REFERENCES[index].id}.jpg`));
  return form;
}

type VisualStorageClient = {
  storage: { from: (bucket: string) => {
    upload: (path: string, body: Uint8Array, options: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    getPublicUrl: (path: string) => { data: { publicUrl: string } };
  } };
};

/** A failed reference/edit leaves a draft without an image; never fall back to unbranded generation. */
export async function generateCampaignVisual(
  adminClient: VisualStorageClient,
  options: {
    prompt: string;
    campaignSlug: string;
    index: number;
    apiKey: string;
    format?: MarketingPostFormat;
    timeoutMs?: number;
  },
): Promise<string | null> {
  if (!options.apiKey || !options.prompt.trim()) return null;
  try {
    const body = await buildTokMarketingImageForm(options.prompt, options.format);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(options.timeoutMs ?? 90_000, 90_000)));
    let payload: { data?: Array<{ b64_json?: string }> };
    try {
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${options.apiKey}` }, body,
      });
      payload = JSON.parse(new TextDecoder().decode(await readBounded(response, 12_000_000)));
    } finally {
      clearTimeout(timeout);
    }
    const encoded = payload?.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || encoded.length > 11_000_000) return null;
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length < 4 || bytes.length > MAX_OUTPUT_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
    const slug = options.campaignSlug.replace(/[^a-z0-9-]/gi, "").slice(0, 48) || "campagne";
    const path = `marketing-ai/${slug}/${Date.now()}-${options.index}.jpg`;
    const bucket = adminClient.storage.from("social-post-media");
    const { error } = await bucket.upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    return error ? null : bucket.getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}
