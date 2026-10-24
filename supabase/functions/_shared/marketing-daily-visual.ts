import { decodeBoundedImageBase64, readBoundedImageBody } from "./ai-image-response.ts";
import type { DailyMarketingBrief } from "./marketing-daily-editorial.ts";
import { buildTokMarketingImageForm, loadTokMarketingReferences } from "./marketing-visual.ts";
import { DAILY_IMAGE_MAX_BYTES, inspectTokDailyImage, type DailyImageQuality } from "./marketing-visual-quality.ts";

export type DailyVisualStorageClient = {
  storage: { from: (bucket: string) => {
    upload: (path: string, body: Uint8Array, options: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
    getPublicUrl: (path: string) => { data: { publicUrl: string } };
  } };
};

export type DailyVisualResult = { imageUrl: string; quality: DailyImageQuality; source: "created" | "recovered" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function recoverImage(url: string, timeoutMs: number): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Fixed project origin and a server-generated date/UUID path; no user URL or credential forwarding.
    const response = await fetch(url, { redirect: "error", signal: controller.signal, cache: "no-store" });
    if (response.status === 404) { void response.body?.cancel().catch(() => {}); return null; }
    if (response.status === 400) {
      // Supabase's public-object API uses HTTP 400 with an explicit 404 body for a missing key.
      const body = await readBoundedImageBody(response, 16_000, timeoutMs);
      let error: Record<string, unknown>;
      try { error = JSON.parse(new TextDecoder().decode(body)); } catch { throw new Error("marketing_daily_storage_unavailable"); }
      if (error?.statusCode === "404" && error.error === "not_found" && error.code === "NoSuchKey") return null;
      throw new Error("marketing_daily_storage_unavailable");
    }
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error("marketing_daily_storage_unavailable"); }
    return await readBoundedImageBody(response, DAILY_IMAGE_MAX_BYTES, timeoutMs);
  } finally { controller.abort(); clearTimeout(timer); }
}

async function requestDailyImage(
  brief: DailyMarketingBrief,
  apiKey: string,
  timeoutMs: number,
  attemptCount: number,
): Promise<Uint8Array> {
  // A rejected generation is not stored. Increase the visual buffer on retry
  // without weakening or skipping the independent image-quality review.
  const extraMargin = attemptCount >= 3 ? 22 : 18;
  const visualBrief = attemptCount > 1
    ? [
      `REPRISE ${attemptCount}/3 APRÈS REJET DU VISUEL : éloigner le logo principal, son liseré et sa bulle, tous les caractères du titre et le pied thetok.ch des quatre bords.`,
      `Laisser au moins ${extraMargin} % de marge autour de tous ces éléments essentiels. Aucun texte ni logo dans la bande extérieure ; les photos et fonds peuvent aller jusqu'aux bords.`,
      "Conserver exactement le titre et la charte TOK. N'utiliser qu'une seule image, sans mosaïque ni planche.",
      brief.visualPrompt,
    ].join("\n")
    : brief.visualPrompt;
  const body = await buildTokMarketingImageForm(visualBrief, "4:5");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body, signal: controller.signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error(`marketing_daily_image_http_${response.status}`);
    }
    const bytes = await readBoundedImageBody(response, 12_000_000, timeoutMs);
    let payload: { data?: Array<{ b64_json?: unknown }> };
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("marketing_daily_image_invalid"); }
    // One request, one native image. Never split a model-produced contact sheet into posts.
    if (!Array.isArray(payload?.data) || payload.data.length !== 1 || typeof payload.data[0]?.b64_json !== "string") {
      throw new Error("marketing_daily_image_count_invalid");
    }
    return decodeBoundedImageBase64(payload.data[0].b64_json, DAILY_IMAGE_MAX_BYTES);
  } finally { controller.abort(); clearTimeout(timer); }
}

/** A deterministic artifact survives an uncertain database acknowledgement without another image charge. */
export async function generateDailyMarketingVisual(client: DailyVisualStorageClient, options: {
  runId: string;
  brief: DailyMarketingBrief;
  apiKey: string;
  reviewModel: string;
  supabaseUrl: string;
  timeoutMs?: number;
  attemptCount?: number;
}): Promise<DailyVisualResult> {
  if (!options.apiKey) throw new Error("marketing_daily_key_missing");
  if (!options.reviewModel.trim() || options.reviewModel.length > 120) throw new Error("marketing_daily_review_model_missing");
  if (!UUID.test(options.runId) || !/^\d{4}-\d{2}-\d{2}$/.test(options.brief.localDate)) throw new Error("marketing_daily_run_invalid");
  if (options.attemptCount !== undefined
    && (!Number.isInteger(options.attemptCount) || options.attemptCount < 1 || options.attemptCount > 3)) {
    throw new Error("marketing_daily_run_invalid");
  }
  const origin = new URL(options.supabaseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new Error("marketing_daily_storage_url_invalid");
  }
  const path = `marketing-ai/tok-instagram/${options.brief.localDate}-${options.runId.toLowerCase()}.jpg`;
  const expectedUrl = `${origin.origin}/storage/v1/object/public/social-post-media/${path}`;
  const bucket = client.storage.from("social-post-media");
  if (bucket.getPublicUrl(path).data.publicUrl !== expectedUrl) throw new Error("marketing_daily_storage_url_invalid");
  const deadline = Date.now() + Math.max(1000, Math.min(options.timeoutMs ?? 120_000, 125_000));
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error("marketing_daily_timeout");
    return value;
  };
  const existing = await recoverImage(expectedUrl, Math.min(8000, remaining()));
  // Required for recovery too: never approve against a text-only description or missing masters.
  const references = await loadTokMarketingReferences();
  const imageBudget = Math.min(90_000, remaining() - 28_000);
  if (!existing && imageBudget <= 0) throw new Error("marketing_daily_timeout");
  const bytes = existing ?? await requestDailyImage(options.brief, options.apiKey, imageBudget, options.attemptCount ?? 1);
  const quality = await inspectTokDailyImage({ bytes, references, brief: options.brief,
    apiKey: options.apiKey, model: options.reviewModel, timeoutMs: Math.min(30_000, remaining()) });
  if (existing) return { imageUrl: expectedUrl, quality, source: "recovered" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const uploaded = await Promise.race([
      bucket.upload(path, bytes, { contentType: "image/jpeg", upsert: false }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("marketing_daily_storage_timeout")), Math.min(10_000, remaining())); }),
    ]);
    // A timeout/conflict is retried through recovery, never through overwrite or blind regeneration.
    if (uploaded.error) throw new Error("marketing_daily_storage_upload_failed");
  } finally { clearTimeout(timer); }
  return { imageUrl: expectedUrl, quality, source: "created" };
}
