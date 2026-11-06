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
  TOK_VIDEO_MODEL_REFERENCE, tokVideoRequestOptions, tokVideoEstimatedDimensions, TOK_VIDEO_MAX_MARKETING_CREDITS,
} from "../../supabase/functions/_shared/higgsfield-video";
import {
  DEFAULT_TOK_VIDEO_MARKETING_SETTINGS, TOK_VIDEO_DURATIONS, TOK_VIDEO_RESOLUTIONS, TOK_VIDEO_ASPECT_RATIOS,
} from "../../supabase/functions/_shared/higgsfield-marketing-settings";

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
const marketing = { ...brand, outputFormat: "mp4", bitrateMode: "standard", marketing: DEFAULT_TOK_VIDEO_MARKETING_SETTINGS };

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
    expect(classifyHiggsfieldSubmissionError({ statusCode: 423 })).toMatchObject({
      confirmedRejected: true, code: "video_provider_temporarily_blocked",
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

describe("Marketing Studio v2 paid request contract", () => {
  it("accepts each documented duration, resolution and ratio with a bounded variable quote", () => {
    const prices: number[] = [];
    for (const duration of TOK_VIDEO_DURATIONS) for (const resolution of TOK_VIDEO_RESOLUTIONS) {
      for (const aspectRatio of TOK_VIDEO_ASPECT_RATIOS) {
        const options = normalizeTokVideoOptions({ ...marketing, duration, resolution, aspectRatio });
        const quote = quoteTokVideo(options);
        expect(quote.model).toBe(TOK_VIDEO_MODEL_REFERENCE);
        expect(Number.isInteger(quote.credits)).toBe(true);
        expect(quote.credits).toBeGreaterThan(0);
        expect(quote.credits).toBeLessThanOrEqual(TOK_VIDEO_MAX_MARKETING_CREDITS);
        expect(tokVideoRequestOptions(options)).toMatchObject({ version: 2, duration, resolution, aspectRatio });
        prices.push(quote.credits);
      }
    }
    expect(prices).toHaveLength(486);
    expect(Math.max(...prices)).toBe(4043);
    expect(quoteTokVideo(normalizeTokVideoOptions(marketing)).credits).toBe(417);
    expect(quoteTokVideo(normalizeTokVideoOptions({ ...marketing, duration: 30, resolution: "1080p", aspectRatio: "21:9" })))
      .toMatchObject({ credits: 4043, estimatedProviderChf: 36.39, maxChargedChf: 36.39 });
    expect(tokVideoEstimatedDimensions({ resolution: "480p", aspectRatio: "16:9" }))
      .toEqual({ width: 864, height: 480 });
  });

  it.each([
    [{ duration: 3 }, "video_duration_invalid"], [{ duration: 30.5 }, "video_duration_invalid"],
    [{ duration: "10" }, "video_duration_invalid"], [{ resolution: "2160p" }, "video_resolution_invalid"],
    [{ aspectRatio: "auto" }, "video_aspect_ratio_invalid"], [{ outputFormat: "webm" }, "video_output_format_invalid"],
    [{ bitrateMode: "ultra" }, "video_bitrate_invalid"], [{ allowInterpretation: false }, "video_interpretation_consent_required"],
  ])("rejects unsupported values before any paid reservation: %j", (patch, code) => {
    expect(() => normalizeTokVideoOptions({ ...marketing, ...patch })).toThrow(code);
  });

  it("uses only already selected restaurant references for product, presenter and opening/closing roles", () => {
    for (const key of ["avatarMediaId", "productMediaId", "startImageMediaId", "endImageMediaId"]) {
      expect(() => normalizeTokVideoOptions({ ...marketing, marketing: { ...marketing.marketing, [key]: logoId } }))
        .toThrow("video_marketing_reference_invalid");
      expect(normalizeTokVideoOptions({ ...marketing, marketing: { ...marketing.marketing, [key]: secondPhoto } }).marketing)
        .toHaveProperty(key, secondPhoto);
    }
    expect(normalizeTokVideoOptions({ ...marketing, referenceMediaIds: undefined }).referenceMediaIds)
      .toEqual([base.referenceMediaId]);
  });

  it("requires native audio to match the explicit audio choice", () => {
    expect(() => normalizeTokVideoOptions({ ...marketing, generateAudio: true })).toThrow("video_audio_mode_mismatch");
    expect(() => normalizeTokVideoOptions({ ...marketing, marketing: { ...marketing.marketing, audioMode: "ambient" } }))
      .toThrow("video_audio_mode_mismatch");
    expect(() => normalizeTokVideoOptions({ ...marketing, generateAudio: true,
      marketing: { ...marketing.marketing, audioMode: "voiceover", voiceoverText: "" } })).toThrow("video_voiceover_required");
    expect(normalizeTokVideoOptions({ ...marketing, generateAudio: true,
      marketing: { ...marketing.marketing, audioMode: "voiceover", voiceoverText: "Bienvenue chez nous." } }).generateAudio).toBe(true);
  });

  it("sends supported generation parameters and explicit marketing directions, never proprietary Marketing Studio IDs", () => {
    const options = normalizeTokVideoOptions({ ...marketing, duration: 15, resolution: "1080p", aspectRatio: "4:3",
      outputFormat: "mov", bitrateMode: "high", generateAudio: true,
      marketing: { ...marketing.marketing, creativeFormat: "ugc", productMediaId: base.referenceMediaId,
        avatarMediaId: secondPhoto, startImageMediaId: secondPhoto, endImageMediaId: base.referenceMediaId,
        audioMode: "voiceover", language: "de", voiceoverText: "Willkommen bei uns.", callToAction: "Menu à 20 CHF" } });
    const input = buildTokVideoProviderInput(options, ["https://storage.example/plat.jpg", "https://storage.example/equipe.jpg"],
      "https://storage.example/logo.png");
    expect(input).toMatchObject({ duration: 15, resolution: "1080p", aspect_ratio: "4:3", output_format: "mov",
      bitrate_mode: "high", generate_audio: true });
    expect(input.prompt).toContain("Use image 2 as the opening visual reference");
    expect(input.prompt).toContain("Use image 1 as the closing visual reference");
    expect(input.prompt).toContain("voiceover in German");
    expect(input.prompt).toContain('"Willkommen bei uns."');
    expect(input.prompt).toContain('"Menu à 20 CHF"');
    expect(input.prompt).toContain("Never invent offers, prices or claims");
    expect(input.prompt).toContain("Do not regenerate logos");
    expect(input.prompt).not.toContain("Do not generate text, subtitles, logos or speech");
    for (const key of ["mode", "preset_id", "hook_id", "setting_id", "product_ids", "avatar_ids"]) {
      expect(input).not.toHaveProperty(key);
    }
    const snapshot = tokVideoRequestOptions(options);
    expect(snapshot).toMatchObject({ version: 2, duration: 15, resolution: "1080p", aspectRatio: "4:3",
      outputFormat: "mov", bitrateMode: "high", marketing: options.marketing });
    expect(() => assertConfirmedTokVideoQuote({ confirmedCredits: 417, confirmedModel: TOK_VIDEO_MODEL_REFERENCE }, quoteTokVideo(options)))
      .toThrow("video_quote_changed");
  });

  it("does not change the old single-reference and ten-second reel contracts", () => {
    expect(tokVideoRequestOptions(normalizeTokVideoOptions(brand))).toEqual({ version: 1,
      referenceMediaIds: brand.referenceMediaIds, logoMediaId: logoId, allowInterpretation: true });
    expect(quoteTokVideo(normalizeTokVideoOptions(base)).credits).toBe(177);
    expect(quoteTokVideo(normalizeTokVideoOptions(brand)).credits).toBe(417);
    expect(() => normalizeTokVideoOptions({ ...brand, duration: 15 })).toThrow("video_duration_invalid");
    expect(() => normalizeTokVideoOptions({ ...brand, resolution: "1080p" })).toThrow("video_resolution_invalid");
    expect(() => normalizeTokVideoOptions({ ...brand, outputFormat: "mov" })).toThrow("video_output_format_invalid");
  });
});

describe("Higgsfield tenant and idempotency contracts", () => {
  const root = process.cwd();
  const sql = readFileSync(join(root, "supabase/migrations/20261104220801_tok_higgsfield_video_studio.sql"), "utf8");
  const edge = readFileSync(join(root, "supabase/functions/ai-video-studio/index.ts"), "utf8");
  const submission = readFileSync(join(root, "supabase/functions/_shared/higgsfield-video-submission.ts"), "utf8");
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

  it("does not refund ambiguous failures or start a different paid job after network interruption", () => {
    expect(classifyHiggsfieldSubmissionError(new Error("timeout")).code).toBe("video_submission_unconfirmed");
    expect(submission).toContain('diagnosis.confirmedRejected ? "failed" : "needs_review"');
    expect(edge).toContain('headers: { "Idempotency-Key": job.id }');
    expect(edge).toContain("A timeout does not prove failure");
    expect(edge).toContain('if (!response.ok) throw new HttpError(502, "video_provider_status_unavailable")');
    expect(sql).toContain("stale_video_provider_response");
  });
});
