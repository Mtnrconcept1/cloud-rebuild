import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isSafeVideoDownloadUrl,
  classifyHiggsfieldSubmissionError,
  normalizeTokVideoOptions,
  quoteTokVideo,
  readProviderVideoResponse,
  assertConfirmedTokVideoQuote, buildTokVideoProviderInput, isOwnedVideoImageReference,
  TOK_VIDEO_MODEL_REFERENCE,
} from "../../supabase/functions/_shared/higgsfield-video";

const base = {
  prompt: "Une scène publicitaire cinématographique de notre restaurant gastronomique.",
  duration: 5,
  resolution: "720p",
  aspectRatio: "9:16",
  generateAudio: true,
  referenceMediaId: "1d90fa0e-9226-48b6-a75b-981a7ca8b60f",
};
const secondPhoto = "1d90fa0e-9226-48b6-a75b-981a7ca8b610";
const logoId = "1d90fa0e-9226-48b6-a75b-981a7ca8b611";
const brand = { ...base, duration: 10, generateAudio: false,
  referenceMediaIds: [base.referenceMediaId, secondPhoto], logoMediaId: logoId, allowInterpretation: true };

describe("Higgsfield video price and validation", () => {
  it("only accepts supported formats and realistic prompts", () => {
    expect(normalizeTokVideoOptions(base)).toMatchObject(base);
    expect(() => normalizeTokVideoOptions({ ...base, duration: 31 })).toThrow("video_duration_invalid");
    expect(() => normalizeTokVideoOptions({ ...base, duration: 0 })).toThrow("video_duration_invalid");
    expect(() => normalizeTokVideoOptions({ ...base, resolution: "4k" })).toThrow("video_resolution_invalid");
    expect(() => normalizeTokVideoOptions({ ...base, prompt: "short" })).toThrow("video_prompt_invalid");
    expect(() => normalizeTokVideoOptions({ ...base, referenceMediaId: "https://unsafe.example/" }))
      .toThrow("video_reference_invalid");
  });

  it("rounds once after currency conversion and caps debit by a confirmed quote", () => {
    const options = normalizeTokVideoOptions(base);
    const price = quoteTokVideo(options);
    expect(price.credits).toBe(Math.ceil(5 * 0.393 * 0.81 / 0.009));
    expect(price.maxChargedChf).toBe(Number((price.credits * 0.009).toFixed(2)));
    expect(quoteTokVideo({ ...options, duration: 10 }).credits).toBeGreaterThan(price.credits);
    expect(quoteTokVideo({ ...options, resolution: "480p" }).credits).toBeLessThan(price.credits);
    const multi = quoteTokVideo(normalizeTokVideoOptions(brand));
    expect(multi).toMatchObject({ credits: 417, model: TOK_VIDEO_MODEL_REFERENCE });
    expect(() => assertConfirmedTokVideoQuote({ confirmedCredits: 416, confirmedModel: multi.model }, multi)).toThrow("video_quote_changed");
    expect(() => assertConfirmedTokVideoQuote({ confirmedCredits: 417, confirmedModel: "other" }, multi)).toThrow("video_quote_changed");
    expect(() => assertConfirmedTokVideoQuote({ confirmedCredits: 417, confirmedModel: multi.model }, multi)).not.toThrow();
  });

  it("requires explicitly selected, distinct sources without a text-only fallback", () => {
    expect(() => normalizeTokVideoOptions({ ...base, referenceMediaId: null })).toThrow("video_reference_required");
    expect(() => normalizeTokVideoOptions({ ...brand, referenceMediaIds: [] })).toThrow("video_references_invalid");
    expect(() => normalizeTokVideoOptions({ ...brand, referenceMediaIds: [secondPhoto, secondPhoto] })).toThrow("video_references_invalid");
    expect(() => normalizeTokVideoOptions({ ...brand, referenceMediaIds: Array.from({ length: 7 }, (_, i) => `1d90fa0e-9226-48b6-a75b-981a7ca8b60${i}`) })).toThrow("video_references_invalid");
    expect(() => normalizeTokVideoOptions({ ...brand, logoMediaId: secondPhoto })).toThrow("video_logo_invalid");
    expect(() => normalizeTokVideoOptions({ ...brand, allowInterpretation: false })).toThrow("video_interpretation_consent_required");
    expect(() => normalizeTokVideoOptions({ ...brand, duration: 5 })).toThrow("video_reel_format_required");
    expect(normalizeTokVideoOptions({ ...brand, generateAudio: undefined }).generateAudio).toBe(false);
  });

  it("passes only ordered photographs and the separate identity reference to the provider", () => {
    const urls = ["https://storage.example/plat.jpg", "https://storage.example/salle.jpg"];
    const input = buildTokVideoProviderInput(normalizeTokVideoOptions(brand), urls, "https://storage.example/logo.png");
    expect(input).toMatchObject({ image_urls: [...urls, "https://storage.example/logo.png"], duration: 10,
      aspect_ratio: "9:16", resolution: "720p", output_format: "mp4", generate_audio: false });
    expect(input.prompt).toContain("Do not add, replace or invent food");
    expect(input.prompt).toContain("Do not generate text, subtitles, logos or speech");
    expect(input).not.toHaveProperty("image_url");
    expect(() => buildTokVideoProviderInput(normalizeTokVideoOptions(brand), urls.slice(0, 1))).toThrow("video_reference_unavailable");
    expect(() => buildTokVideoProviderInput(normalizeTokVideoOptions(brand), urls)).toThrow("video_reference_unavailable");
    expect(() => buildTokVideoProviderInput(normalizeTokVideoOptions({ ...brand, logoMediaId: null }), urls, "https://storage.example/unselected-logo.png")).toThrow("video_reference_unavailable");
  });

  it("rejects another tenant, private buckets, traversal and non-image media", () => {
    const media = { restaurant_id: "restaurant-a", storage_bucket: "restaurant-images", storage_path: "restaurant-a/photo.jpg", media_type: "photo" };
    expect(isOwnedVideoImageReference(media, "restaurant-a")).toBe(true);
    for (const invalid of [
      { ...media, restaurant_id: "restaurant-b" }, { ...media, storage_bucket: "private-documents" },
      { ...media, storage_path: "restaurant-b/photo.jpg" }, { ...media, storage_path: "restaurant-a/../b.jpg" },
      { ...media, media_type: "video" }, { ...media, storage_path: "restaurant-a/image.svg" },
    ]) expect(isOwnedVideoImageReference(invalid, "restaurant-a")).toBe(false);
  });

  it("recognizes terminal provider responses without inferring success from HTTP 200", () => {
    expect(readProviderVideoResponse({ status: "completed", request_id: "req-1", video: { url: "https://cdn.higgsfield.ai/video.mp4" } }))
      .toMatchObject({ status: "completed", requestId: "req-1" });
    expect(readProviderVideoResponse({ status: "failed" }).status).toBe("failed");
    expect(readProviderVideoResponse({ status: "nsfw" }).status).toBe("nsfw");
    expect(readProviderVideoResponse({ status: "canceled" }).status).toBe("canceled");
    expect(readProviderVideoResponse({ status: "ok" }).status).toBe("unknown");
  });

  it("distinguishes confirmed provider refusals from ambiguous timeouts", () => {
    expect(classifyHiggsfieldSubmissionError({ statusCode: 401 })).toMatchObject({
      confirmedRejected: true, code: "video_provider_auth_failed", statusCode: 401,
    });
    expect(classifyHiggsfieldSubmissionError({ statusCode: 403 })).toMatchObject({
      confirmedRejected: true, code: "video_provider_access_denied",
    });
    expect(classifyHiggsfieldSubmissionError({ statusCode: 422 })).toMatchObject({
      confirmedRejected: true, code: "video_provider_invalid_input",
    });
    expect(classifyHiggsfieldSubmissionError({ name: "AuthenticationError" })).toMatchObject({
      confirmedRejected: true, statusCode: 401,
    });
    expect(classifyHiggsfieldSubmissionError({ statusCode: 502 }).confirmedRejected).toBe(false);
    expect(classifyHiggsfieldSubmissionError(new Error("timeout")).confirmedRejected).toBe(false);
  });

  it("rejects SSRF and attacker-controlled URLs during archival", () => {
    expect(isSafeVideoDownloadUrl("https://cdn.higgsfield.ai/clip.mp4")).toBe(true);
    expect(isSafeVideoDownloadUrl("https://cdn.cloudfront.net/clip.mp4")).toBe(true);
    expect(isSafeVideoDownloadUrl("https://higgsfield.ai.evil.com/clip.mp4")).toBe(false);
    expect(isSafeVideoDownloadUrl("https://127.0.0.1/private")).toBe(false);
    expect(isSafeVideoDownloadUrl("http://cdn.higgsfield.ai/video.mp4")).toBe(false);
    expect(isSafeVideoDownloadUrl("https://name:password@higgsfield.ai/video.mp4")).toBe(false);
  });
});

describe("Higgsfield tenant and idempotency contracts", () => {
  const root = process.cwd();
  const sql = readFileSync(join(root, "supabase/migrations/20261104220801_tok_higgsfield_video_studio.sql"), "utf8");
  const edge = readFileSync(join(root, "supabase/functions/ai-video-studio/index.ts"), "utf8");
  const ui = readFileSync(join(root, "src/components/dashboard/TokAiMarketingStudio.tsx"), "utf8");

  it("reserves credits in one transaction, with a unique request key and no double submission", () => {
    expect(sql).toContain("UNIQUE (restaurant_id, idempotency_key)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("claim_restaurant_video_submission");
    expect(sql).toContain("status = 'reserved'");
    expect(sql).toContain("status = 'failure'");
    expect(sql).toContain("IF v_job.status IN ('completed','failed') THEN RETURN v_job");
    expect(edge).toContain("if (claimed !== true)");
    expect(edge).toContain("withPolling: false");
    expect(edge).toContain("EdgeRuntime.waitUntil");
    expect(edge).toContain("maxRetries: 0");
  });

  it("isolates tenants and secrets, with a private video bucket and authenticated owner-only access", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT ON public.restaurant_video_generations TO authenticated");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated");
    expect(sql).toContain("public.auth_owns_restaurant(restaurant_id)");
    expect(sql).toContain("'restaurant-ai-videos', false");
    expect(edge).toContain("requireRestaurantAccess(actor, restaurantId)");
    expect(edge).toContain('item.storage_bucket === "restaurant-images"');
    expect(edge).toContain("getPublicUrl(item.storage_path)");
    expect(edge).toContain('.eq("restaurant_id", restaurantId)');
    expect(edge).toContain('Deno.env.get("HF_CREDENTIALS")');
    expect(edge).not.toContain("VITE_HF_CREDENTIALS");
    expect(ui).toContain('lazy(() => import("./TokAiVideoStudio"))');
  });

  it("does not refund ambiguous failures or resubmit jobs after network interruption", () => {
    expect(classifyHiggsfieldSubmissionError(new Error("timeout")).code).toBe("video_submission_unconfirmed");
    expect(edge).toContain('diagnosis.confirmedRejected ? "failed" : "needs_review"');
    expect(edge).toContain("A timeout does not prove failure");
    expect(edge).toContain("if (!response.ok) return job");
    expect(sql).toContain("stale_video_provider_response");
  });
});
