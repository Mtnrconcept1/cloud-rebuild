import { authenticateRequest, HttpError, jsonResponse, requireRestaurantAccess, writeAuditLog } from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { maybeUuid } from "../_shared/intelligence.ts";
import {
  normalizeTokVideoOptions, quoteTokVideo, readProviderVideoResponse,
  isSafeVideoDownloadUrl, type TokVideoOptions,
} from "../_shared/higgsfield-video.ts";
import { createHiggsfieldClient } from "npm:@higgsfield/client@0.2.6/v2";

const NAME = "ai-video-studio";
const BUCKET = "restaurant-ai-videos";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
type Actor = Awaited<ReturnType<typeof authenticateRequest>>;
type VideoJob = {
  id: string; restaurant_id: string; user_id: string; status: string;
  prompt: string; duration: number; resolution: string; aspect_ratio: string;
  credit_units: number; generate_audio: boolean; reference_media_id: string | null;
  provider_request_id: string | null; provider_model: string; storage_path: string | null;
  created_at: string; updated_at: string; error_code: string | null;
};

const reply = (value: Record<string, unknown>, status: number, cors: Record<string, string>) =>
  jsonResponse(value, status, cors);

function providerCredentials() {
  const value = Deno.env.get("HF_CREDENTIALS")?.trim() || Deno.env.get("HIGGSFIELD_API_KEY")?.trim() || "";
  if (!/^[^:\s]+:[^:\s]+$/.test(value)) throw new HttpError(503, "higgsfield_not_configured");
  return value;
}

function checkedRequestId(id: unknown) {
  const value = typeof id === "string" ? id.trim() : "";
  if (!/^[a-zA-Z0-9_-]{4,120}$/.test(value)) throw new HttpError(502, "video_provider_id_invalid");
  return value;
}

async function saveVideo(actor: Actor, job: VideoJob, videoUrl: string): Promise<VideoJob> {
  const customHosts = (Deno.env.get("HF_ALLOWED_MEDIA_HOSTS") || "")
    .split(",").map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9.-]+$/.test(item) && !item.startsWith("."));
  if (!isSafeVideoDownloadUrl(videoUrl, customHosts)) throw new HttpError(502, "video_provider_url_not_allowed");
  // Do not follow redirects from a privileged server-side download.
  const response = await fetch(videoUrl, { redirect: "error", signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new HttpError(502, "video_download_failed");
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_VIDEO_BYTES)
    throw new HttpError(413, "video_file_too_large");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_VIDEO_BYTES || buffer.byteLength === 0)
    throw new HttpError(413, "video_file_too_large");
  const path = job.restaurant_id + "/" + job.id + ".mp4";
  const { error: uploadError } = await actor.adminClient.storage.from(BUCKET)
    .upload(path, buffer, { contentType: "video/mp4", cacheControl: "3600", upsert: true });
  if (uploadError) throw new HttpError(502, "video_storage_failed");
  const { data, error } = await actor.adminClient.rpc("finish_restaurant_video_generation", {
    p_job_id: job.id, p_provider_request_id: job.provider_request_id,
    p_status: "completed", p_storage_path: path, p_error_code: null,
  });
  if (error || !data) throw new HttpError(502, "video_completion_persistence_failed");
  return data as VideoJob;
}

async function finishJob(actor: Actor, job: VideoJob, status: string, errorCode: string | null = null,
  providerRequestId: string | null = job.provider_request_id): Promise<VideoJob> {
  const { data, error } = await actor.adminClient.rpc("finish_restaurant_video_generation", {
    p_job_id: job.id, p_provider_request_id: providerRequestId,
    p_status: status, p_storage_path: null, p_error_code: errorCode,
  });
  if (error || !data) throw new HttpError(502, "video_status_persistence_failed");
  return data as VideoJob;
}

async function publicJob(actor: Actor, job: VideoJob): Promise<Record<string, unknown>> {
  let url: string | null = null;
  if (job.status === "completed" && job.storage_path) {
    const { data, error } = await actor.adminClient.storage.from(BUCKET)
      .createSignedUrl(job.storage_path, 3600);
    if (!error) url = data?.signedUrl || null;
  }
  return {
    id: job.id, status: job.status, prompt: job.prompt, duration: job.duration,
    resolution: job.resolution, aspectRatio: job.aspect_ratio,
    generateAudio: job.generate_audio, credits: job.credit_units,
    model: job.provider_model, referenceMediaId: job.reference_media_id,
    errorCode: job.error_code, createdAt: job.created_at,
    updatedAt: job.updated_at, videoUrl: url,
  };
}

async function loadJob(actor: Actor, restaurantId: string, jobId: string): Promise<VideoJob> {
  const { data, error } = await actor.adminClient.from("restaurant_video_generations")
    .select("*").eq("id", jobId).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw new HttpError(502, "video_job_lookup_failed");
  if (!data) throw new HttpError(404, "video_job_not_found");
  return data as VideoJob;
}

async function pollProvider(actor: Actor, job: VideoJob) {
  if (!job.provider_request_id || ["completed", "failed"].includes(job.status)) return job;
  let response: Response;
  try {
    response = await fetch(
      "https://api.higgsfield.ai/requests/" + encodeURIComponent(job.provider_request_id) + "/status",
      { headers: { Authorization: "Key " + providerCredentials() }, signal: AbortSignal.timeout(25_000) },
    );
  } catch {
    // A timeout does not prove failure; do not refund or resubmit.
    return job;
  }
  if (!response.ok) return job;
  const provider = readProviderVideoResponse(await response.json().catch(() => null));
  if (provider.requestId && provider.requestId !== job.provider_request_id) return job;
  if (provider.status === "failed" || provider.status === "nsfw")
    return finishJob(actor, job, "failed", "video_provider_failed");
  if (provider.status === "completed") {
    if (!provider.url) return finishJob(actor, job, "archiving");
    const archivingJob = await finishJob(actor, job, "archiving");
    return saveVideo(actor, archivingJob, provider.url);
  }
  if (provider.status === "queued" || provider.status === "in_progress")
    return finishJob(actor, job, provider.status);
  return job;
}

async function imageReferenceUrl(actor: Actor, restaurantId: string, mediaId: string | null) {
  if (!mediaId) return null;
  const { data: item, error } = await actor.adminClient.from("restaurant_media")
    .select("id, restaurant_id, media_url, storage_bucket, storage_path")
    .eq("id", mediaId).eq("restaurant_id", restaurantId).maybeSingle();
  if (error || !item) throw new HttpError(400, "video_reference_not_found");
  if (item.storage_bucket && item.storage_path) {
    const { data, error: signError } = await actor.adminClient.storage
      .from(item.storage_bucket).createSignedUrl(item.storage_path, 1800);
    if (signError || !data?.signedUrl) throw new HttpError(400, "video_reference_unavailable");
    return data.signedUrl;
  }
  const url = typeof item.media_url === "string" ? item.media_url : "";
  if (!url.startsWith("https://")) throw new HttpError(400, "video_reference_unavailable");
  return url;
}

function providerInput(options: TokVideoOptions,
  brand: { name: string; city?: string | null; cuisine_type?: string | null },
  referenceUrl: string | null) {
  const brief = [
    "Publicite video pour le restaurant " + brand.name + ".",
    brand.city ? "Ville: " + brand.city + "." : "",
    brand.cuisine_type ? "Cuisine: " + brand.cuisine_type + "." : "",
    "Une seule scene publicitaire de qualite cinematographique, coherente avec l'identite du restaurant.",
    "Ne pas inventer de logo, de tarifs ou d'informations commerciales.",
    options.prompt,
  ].filter(Boolean).join("\n");
  const base = {
    prompt: brief, duration: options.duration, resolution: options.resolution,
    generate_audio: options.generateAudio, output_format: "mp4",
  };
  if (referenceUrl) return { ...base, image_url: referenceUrl };
  return { ...base, aspect_ratio: options.aspectRatio };
}

async function start(actor: Actor, restaurantId: string, body: Record<string, unknown>,
  brand: { name: string; city?: string | null; cuisine_type?: string | null }) {
  let options: TokVideoOptions;
  try { options = normalizeTokVideoOptions(body); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "video_parameters_invalid"); }
  const key = maybeUuid(body.idempotencyKey);
  if (!key) throw new HttpError(400, "video_idempotency_required");
  const credentials = providerCredentials(); // Fail before reserving any TOK credits.
  const quote = quoteTokVideo(options);
  const referenceUrl = await imageReferenceUrl(actor, restaurantId, options.referenceMediaId);
  const { data, error } = await actor.adminClient.rpc("reserve_restaurant_video_generation", {
    p_restaurant_id: restaurantId, p_user_id: actor.userId, p_idempotency_key: key,
    p_prompt: options.prompt, p_duration: options.duration, p_resolution: options.resolution,
    p_aspect_ratio: options.aspectRatio, p_generate_audio: options.generateAudio,
    p_reference_media_id: options.referenceMediaId, p_credit_units: quote.credits,
  });
  if (error || !data) {
    const message = String(error?.message || "");
    if (/credits exhausted|credit/i.test(message)) throw new HttpError(402, "ai_credits_exhausted");
    if (/video_daily_limit|video_generation_already_active|idempotency_conflict/.test(message))
      throw new HttpError(409, message.split(":")[0]);
    throw new HttpError(502, "video_reservation_failed");
  }
  const job = data as VideoJob;
  const { data: claimed, error: claimError } = await actor.adminClient
    .rpc("claim_restaurant_video_submission", { p_job_id: job.id });
  if (claimError) throw new HttpError(502, "video_submission_claim_failed");
  if (claimed !== true) return { job: await publicJob(actor, job), reused: true };

  // EdgeRuntime.waitUntil keeps the provider submission alive after the HTTP response
  // (tab close, browser navigation, mobile sleep). The database is the source of truth.
  const submission = (async () => {
    let current = job;
    try {
      const client = createHiggsfieldClient({
        credentials, maxRetries: 0, timeout: 28_000,
      });
      const response = await client.subscribe(quote.model, {
        input: providerInput(options, brand, referenceUrl), withPolling: false,
      });
      const provider = readProviderVideoResponse(response);
      const id = checkedRequestId(provider.requestId);
      if (provider.status === "failed" || provider.status === "nsfw") {
        current = await finishJob(actor, current, "failed", "video_provider_failed", id);
      } else {
        current = await finishJob(actor, current, "queued", null, id);
        if (provider.status === "completed" && provider.url) {
          current = await saveVideo(actor, await finishJob(actor, current, "archiving"), provider.url);
        }
      }
    } catch (error) {
      // A lost response may have incurred provider charges. Only confirmed 4xx rejections refund.
      const statusCode = error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode) : null;
      const rejected = (statusCode != null && [400, 401, 403, 422].includes(statusCode)) ||
        (error instanceof Error && error.name === "AuthenticationError");
      current = await finishJob(actor, current, rejected ? "failed" : "needs_review",
        rejected ? "video_provider_rejected" : "video_submission_unconfirmed");
    }
    await writeAuditLog({
      adminClient: actor.adminClient, functionName: NAME,
      status: current.status === "failed" ? "failure" : "success",
      action: "start", actor, targetEntityType: "restaurant_video_generations",
      targetEntityId: current.id, metadata: { restaurant_id: restaurantId, job_status: current.status },
    });
  })().catch(() => {
    // Keep the credit reservation for reconciliation on unexpected database failures.
    console.error("[ai-video-studio] submission_persistence_failed");
  });
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(submission);
  else await submission; // Allows local Deno testing without the Supabase runtime.
  return { job: await publicJob(actor, job), reused: false };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405, cors);
  try {
    const actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new HttpError(400, "video_invalid_body");
    const input = body as Record<string, unknown>;
    const restaurantId = maybeUuid(input.restaurantId);
    if (!restaurantId) throw new HttpError(400, "restaurant_required");
    const restaurant = await requireRestaurantAccess(actor, restaurantId);
    const action = typeof input.action === "string" ? input.action : "";
    const limiter = createRateLimiter(actor.adminClient, NAME);
    const scope = action === "status" ? "poll" : "interactive";
    await limiter.consume("user:" + actor.userId + ":" + scope,
      { maxRequests: scope === "poll" ? 600 : 90, windowSeconds: 3600 });
    await limiter.consume("restaurant:" + restaurantId + ":" + scope,
      { maxRequests: scope === "poll" ? 900 : 120, windowSeconds: 3600 });
    if (action === "quote") {
      let options: TokVideoOptions;
      try { options = normalizeTokVideoOptions(input); }
      catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "video_parameters_invalid"); }
      if (options.referenceMediaId) await imageReferenceUrl(actor, restaurantId, options.referenceMediaId);
      return reply({ quote: quoteTokVideo(options) }, 200, cors);
    }
    if (action === "start") return reply(await start(actor, restaurantId, input, restaurant), 200, cors);
    if (action === "list") {
      const { data, error } = await actor.adminClient.from("restaurant_video_generations")
        .select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(20);
      if (error) throw new HttpError(502, "video_history_failed");
      return reply({ jobs: await Promise.all((data || []).map((job: VideoJob) => publicJob(actor, job))) }, 200, cors);
    }
    if (action === "status") {
      const jobId = maybeUuid(input.jobId);
      if (!jobId) throw new HttpError(400, "video_job_id_invalid");
      let job = await loadJob(actor, restaurantId, jobId);
      if (job.provider_request_id && !["completed", "failed"].includes(job.status)) {
        try { job = await pollProvider(actor, job); }
        catch { job = await loadJob(actor, restaurantId, jobId); }
      }
      return reply({ job: await publicJob(actor, job) }, 200, cors);
    }
    throw new HttpError(400, "video_action_invalid");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.message : "video_internal_error";
    return reply({ error: code }, status, cors);
  }
});
