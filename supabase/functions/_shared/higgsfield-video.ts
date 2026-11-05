/** Pure, provider-safe video inputs. Importable by Vitest and Supabase Edge. */
export const TOK_VIDEO_MODEL_TEXT = "bytedance/seedance-2.5/text-to-video";
export const TOK_VIDEO_MODEL_IMAGE = "bytedance/seedance-2.5/image-to-video";

export type TokVideoOptions = {
  prompt: string;
  duration: 5 | 10;
  resolution: "480p" | "720p";
  aspectRatio: "16:9" | "9:16" | "1:1";
  generateAudio: boolean;
  referenceMediaId: string | null;
};

export function normalizeTokVideoOptions(value: unknown): TokVideoOptions {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  const duration = Number(record.duration);
  const resolution = record.resolution;
  const aspectRatio = record.aspectRatio;
  const referenceMediaId = record.referenceMediaId;
  if (prompt.length < 12 || prompt.length > 1000) throw new Error("video_prompt_invalid");
  if (duration !== 5 && duration !== 10) throw new Error("video_duration_invalid");
  if (resolution !== "480p" && resolution !== "720p") throw new Error("video_resolution_invalid");
  if (aspectRatio !== "16:9" && aspectRatio !== "9:16" && aspectRatio !== "1:1") {
    throw new Error("video_aspect_ratio_invalid");
  }
  if (record.generateAudio !== undefined && typeof record.generateAudio !== "boolean") {
    throw new Error("video_audio_invalid");
  }
  if (referenceMediaId != null &&
    (typeof referenceMediaId !== "string" ||
     !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(referenceMediaId))) {
    throw new Error("video_reference_invalid");
  }
  return {
    prompt,
    duration,
    resolution,
    aspectRatio,
    generateAudio: record.generateAudio !== false,
    referenceMediaId: typeof referenceMediaId === "string" ? referenceMediaId : null,
  };
}

/** Conservative ceiling based on the provider's documented maximum USD rates.
 * Billable units are rounded once, after currency conversion, with no unapproved markup.
 */
export function quoteTokVideo(options: TokVideoOptions) {
  const image = Boolean(options.referenceMediaId);
  const usdPerSecond = options.resolution === "720p"
    ? (image ? 0.393 : 0.3236)
    : (image ? 0.1748 : 0.144);
  const estimatedProviderUsd = usdPerSecond * options.duration;
  const estimatedProviderChf = estimatedProviderUsd * 0.81;
  const creditUnits = Math.ceil(estimatedProviderChf / 0.009);
  return {
    credits: creditUnits,
    estimatedProviderChf: Number(estimatedProviderChf.toFixed(2)),
    maxChargedChf: Number((creditUnits * 0.009).toFixed(2)),
    model: image ? TOK_VIDEO_MODEL_IMAGE : TOK_VIDEO_MODEL_TEXT,
  };
}

export function readProviderVideoResponse(value: unknown) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = record.status;
  const requestId = typeof record.request_id === "string" ? record.request_id : "";
  const video = record.video && typeof record.video === "object" ? record.video as Record<string, unknown> : {};
  const url = typeof video.url === "string" ? video.url : "";
  return {
    requestId,
    status: status === "queued" || status === "in_progress" ||
      status === "completed" || status === "failed" || status === "nsfw" ? status : "unknown",
    url,
  };
}

export function isSafeVideoDownloadUrl(raw: string, additionalHosts: string[] = []) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    if (/^(localhost|.*\.localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(host)) return false;
    const allowed = ["higgsfield.ai", "cloudfront.net", "amazonaws.com", "r2.dev", ...additionalHosts];
    return allowed.some((root) => host === root || host.endsWith("." + root));
  } catch {
    return false;
  }
}

/**
 * Classifies the documented HTTP rejection, never a provider's raw response body.
 * A network timeout/5xx may have submitted a paid job: it is NOT refundable yet.
 */
export function classifyHiggsfieldSubmissionError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const reported = typeof record.statusCode === "number" ? record.statusCode : 0;
  const statusCode = reported >= 100 && reported <= 599
    ? reported : record.name === "AuthenticationError" ? 401 : 0;
  switch (statusCode) {
    case 400: case 422:
      return { confirmedRejected: true, code: "video_provider_invalid_input", statusCode };
    case 401:
      return { confirmedRejected: true, code: "video_provider_auth_failed", statusCode };
    case 403:
      return { confirmedRejected: true, code: "video_provider_access_denied", statusCode };
    case 404:
      return { confirmedRejected: true, code: "video_provider_endpoint_missing", statusCode };
    case 429:
      return { confirmedRejected: true, code: "video_provider_rate_limited", statusCode };
    default:
      return { confirmedRejected: false, code: "video_submission_unconfirmed", statusCode };
  }
}
