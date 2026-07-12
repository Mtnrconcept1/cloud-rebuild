import "dotenv/config";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import {
  METADATA_SCHEMA_VERSION,
  buildSearchText,
  detectImageMime,
  sanitizeTrustedContext,
  validateClaimAgainstImage,
} from "./metadata.js";
import {
  analyzeImageWithOllama,
  checkOllamaModels,
  generateEmbeddingWithOllama,
} from "./ollama.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CommitUncertainError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommitUncertainError";
  }
}

class RpcRejectedError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "RpcRejectedError";
    this.code = code;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

function createRuntimeState() {
  return {
    startedAt: new Date().toISOString(),
    supabaseReady: false,
    ollamaReady: false,
    processing: 0,
    lastSuccessAt: null,
    lastError: null,
    shuttingDown: false,
  };
}

function createSupabase(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function withAbortSignal(timeoutMs, operation) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function claimJobs(supabase, config) {
  return withAbortSignal(config.supabaseTimeoutMs, async (signal) => {
    const { data, error } = await supabase.rpc("claim_image_analysis_jobs", {
      p_worker_id: config.workerId,
      p_limit: config.batchSize,
    }).abortSignal(signal);
    if (error) throw new Error(`Could not claim image analysis jobs: ${error.message}`);
    return Array.isArray(data) ? data : [];
  });
}

async function loadAuthoritativeImage(supabase, imageId, config) {
  return withAbortSignal(config.supabaseTimeoutMs, async (signal) => {
    const { data, error } = await supabase
      .from("restaurant_images")
      .select("id,restaurant_id,uploaded_by,bucket,storage_path,source_type,source_table,source_id,mime_type,size_bytes,analysis_status,ai_metadata")
      .eq("id", imageId)
      .maybeSingle()
      .abortSignal(signal);
    if (error) throw new Error(`Could not load authoritative image: ${error.message}`);
    if (!data) throw new Error("Claimed image no longer exists.");
    return data;
  });
}

async function downloadAndValidateImage(supabase, image, config) {
  const storagePath = image.storage_path;
  const blob = await withAbortSignal(config.downloadTimeoutMs, async (signal) => {
    const { data, error } = await supabase.storage
      .from(image.bucket)
      .download(storagePath, {}, { signal, cache: "no-store" });
    if (error || !data) throw new Error(`Image download failed: ${error?.message || "unknown error"}`);
    return data;
  });

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.byteLength) throw new Error("Image is empty.");
  if (bytes.byteLength > config.maxImageBytes) throw new Error(`Image exceeds ${config.maxImageBytes} bytes.`);
  if (image.size_bytes != null && Number(image.size_bytes) !== bytes.byteLength) {
    throw new Error("Downloaded image size does not match its authoritative metadata.");
  }
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime) throw new Error("Unsupported image signature; expected JPEG, PNG or WebP.");
  const declaredMime = String(image.mime_type || blob.type || "").toLowerCase().split(";")[0];
  if (declaredMime && declaredMime !== detectedMime) throw new Error("Image MIME type does not match its binary signature.");

  return {
    base64: Buffer.from(bytes).toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType: detectedMime,
    sizeBytes: bytes.byteLength,
  };
}

function completionPayload(job, metadata, embedding, analysis, config, trustedContext) {
  return {
    p_job_id: job.job_id,
    p_image_id: job.image_id,
    p_description: metadata.description,
    p_short_description: metadata.short_description,
    p_alt_text: metadata.alt_text,
    p_seo_title: metadata.seo_title,
    p_seo_description: metadata.seo_description,
    p_detected_objects: metadata.detected_objects,
    p_food_items: metadata.food_items,
    p_ingredients: metadata.ingredients,
    p_cuisine_types: metadata.cuisine_types,
    p_moods: metadata.moods,
    p_colors: metadata.colors,
    p_hashtags: metadata.hashtags,
    p_image_type: metadata.image_type,
    p_is_food_photo: metadata.is_food_photo,
    p_has_people: metadata.has_people,
    p_has_logo: metadata.has_logo,
    p_has_text: metadata.has_text,
    p_quality_score: metadata.quality_score,
    p_ai_metadata: {
      ...metadata,
      schema_version: METADATA_SCHEMA_VERSION,
      provider: "ollama",
      model: config.visionModel,
      embedding_model: config.embeddingModel,
      generated_by: "tok-image-ai-worker",
      input_sha256: analysis.sha256,
      input_mime_type: analysis.mimeType,
      input_size_bytes: analysis.sizeBytes,
      trusted_context: trustedContext,
      generated_at: new Date().toISOString(),
      estimated_cost_chf: 0,
    },
    p_embedding: `[${embedding.join(",")}]`,
  };
}

function retryDelay(baseMs, attempt) {
  return Math.min(30000, baseMs * (2 ** Math.max(0, attempt - 1))) + Math.floor(Math.random() * 250);
}

export async function completeJob(supabase, payload, config) {
  let lastError;
  for (let attempt = 1; attempt <= config.httpRetryAttempts; attempt += 1) {
    try {
      await withAbortSignal(config.supabaseTimeoutMs, async (signal) => {
        const { data, error } = await supabase.rpc("complete_image_analysis_job", payload).abortSignal(signal);
        if (error) throw new RpcRejectedError(`Could not complete image analysis job: ${error.message}`, error.code);
        const completion = Array.isArray(data) && data.length === 1 ? data[0] : null;
        if (
          !completion
          || completion.completed_image_id !== payload.p_image_id
          || !new Set(["completed", "already_completed"]).has(completion.completion_status)
          || (completion.completed_media_id != null && !UUID_PATTERN.test(String(completion.completed_media_id)))
        ) {
          throw new Error("complete_image_analysis_job returned an invalid completion receipt.");
        }
      });
      return;
    } catch (error) {
      lastError = error;
      if (error instanceof RpcRejectedError) break;
      if (attempt < config.httpRetryAttempts) await sleep(retryDelay(config.retryBaseMs, attempt));
    }
  }

  const row = await loadAuthoritativeImage(supabase, payload.p_image_id, config).catch(() => null);
  if (row?.analysis_status === "completed" && row.ai_metadata?.input_sha256 === payload.p_ai_metadata.input_sha256) return;
  if (lastError instanceof RpcRejectedError) throw lastError;
  throw new CommitUncertainError(errorMessage(lastError));
}

async function failJob(supabase, job, error, config) {
  const failure = errorMessage(error).slice(0, 2000);
  try {
    await withAbortSignal(config.supabaseTimeoutMs, async (signal) => {
      const { error: rpcError } = await supabase.rpc("fail_image_analysis_job", {
        p_job_id: job.job_id,
        p_image_id: job.image_id,
        p_error: failure,
      }).abortSignal(signal);
      if (rpcError) throw rpcError;
    });
  } catch (rpcError) {
    console.error(JSON.stringify({ event: "job_fail_rpc_error", job_id: job.job_id, error: errorMessage(rpcError) }));
  }
}

async function processJob(supabase, job, config) {
  const image = await loadAuthoritativeImage(supabase, job.image_id, config);
  validateClaimAgainstImage(job, image, config.allowedStorageBuckets);
  const trustedContext = sanitizeTrustedContext(job);
  const analysis = await downloadAndValidateImage(supabase, image, config);
  const metadata = await analyzeImageWithOllama(config, analysis.base64, trustedContext);
  const embedding = await generateEmbeddingWithOllama(config, buildSearchText(metadata, trustedContext));
  await completeJob(supabase, completionPayload(job, metadata, embedding, analysis, config, trustedContext), config);
  return { imageId: job.image_id, sha256: analysis.sha256 };
}

async function probeSupabase(supabase, config) {
  await withAbortSignal(config.supabaseTimeoutMs, async (signal) => {
    const { error } = await supabase.from("restaurant_images").select("id").limit(1).abortSignal(signal);
    if (error) throw error;
  });
}

async function probeDependencies(supabase, config, state) {
  const [database, ollama] = await Promise.allSettled([
    probeSupabase(supabase, config),
    checkOllamaModels(config),
  ]);
  state.supabaseReady = database.status === "fulfilled";
  state.ollamaReady = ollama.status === "fulfilled";
  if (database.status === "rejected" || ollama.status === "rejected") {
    state.lastError = [database, ollama]
      .filter((result) => result.status === "rejected")
      .map((result) => errorMessage(result.reason))
      .join("; ");
  }
}

function startHealthServer(config, state) {
  const server = createServer((request, response) => {
    const ready = state.supabaseReady && state.ollamaReady && !state.shuttingDown;
    const isHealth = request.url === "/healthz";
    const isReady = request.url === "/readyz";
    const status = isHealth ? (state.shuttingDown ? 503 : 200) : isReady ? (ready ? 200 : 503) : 404;
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({
      ok: status === 200,
      ready,
      supabase: state.supabaseReady,
      ollama: state.ollamaReady,
      processing: state.processing,
      started_at: state.startedAt,
      last_success_at: state.lastSuccessAt,
    }));
  });
  server.listen(config.healthPort, "0.0.0.0");
  return server;
}

export async function runWorker(config = loadConfig()) {
  const supabase = createSupabase(config);
  const state = createRuntimeState();
  const server = startHealthServer(config, state);
  const failures = new Map();
  let loopFailures = 0;

  const stop = () => {
    state.shuttingDown = true;
    server.close();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  await probeDependencies(supabase, config, state);
  const probeTimer = setInterval(() => void probeDependencies(supabase, config, state), 60000);
  probeTimer.unref();

  console.log(JSON.stringify({
    event: "worker_started",
    worker_id: config.workerId,
    provider: "ollama",
    vision_model: config.visionModel,
    embedding_model: config.embeddingModel,
    paid_api: false,
  }));

  while (!state.shuttingDown) {
    try {
      const jobs = await claimJobs(supabase, config);
      state.supabaseReady = true;
      loopFailures = 0;
      if (!jobs.length) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      for (const job of jobs) {
        if (state.shuttingDown) break;
        state.processing += 1;
        try {
          const result = await processJob(supabase, job, config);
          failures.delete(job.image_id);
          state.ollamaReady = true;
          state.lastSuccessAt = new Date().toISOString();
          state.lastError = null;
          console.log(JSON.stringify({ event: "job_completed", job_id: job.job_id, image_id: result.imageId, sha256: result.sha256 }));
        } catch (error) {
          state.lastError = errorMessage(error);
          console.error(JSON.stringify({ event: "job_failed", job_id: job.job_id, image_id: job.image_id, error: state.lastError }));
          if (!(error instanceof CommitUncertainError)) await failJob(supabase, job, error, config);
          const count = (failures.get(job.image_id) || 0) + 1;
          failures.set(job.image_id, count);
          await sleep(retryDelay(config.jobRetryBaseMs, count));
        } finally {
          state.processing -= 1;
        }
      }
    } catch (error) {
      loopFailures += 1;
      state.supabaseReady = false;
      state.lastError = errorMessage(error);
      console.error(JSON.stringify({ event: "worker_loop_error", error: state.lastError }));
      await sleep(retryDelay(config.pollIntervalMs, loopFailures));
    }
  }

  clearInterval(probeTimer);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  runWorker().catch((error) => {
    console.error(JSON.stringify({ event: "worker_fatal", error: errorMessage(error) }));
    process.exitCode = 1;
  });
}
