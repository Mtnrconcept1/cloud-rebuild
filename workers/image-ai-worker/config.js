const DEFAULT_ALLOWED_BUCKETS = ["restaurant-images", "social-post-media"];

function readInteger(env, name, fallback, { min, max }) {
  const raw = env[name];
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function readUrl(env, name, fallback) {
  const raw = String(env[name] || fallback).trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return raw;
}

function readRequired(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readHealthHost(env) {
  const host = String(env.HEALTH_HOST || "127.0.0.1").trim().toLowerCase();
  if (!new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0", "::"]).has(host)) {
    throw new Error("HEALTH_HOST must be a local or wildcard bind address.");
  }
  return host;
}

function readBuckets(env) {
  const buckets = String(env.ALLOWED_STORAGE_BUCKETS || DEFAULT_ALLOWED_BUCKETS.join(","))
    .split(",")
    .map((bucket) => bucket.trim())
    .filter(Boolean);

  if (!buckets.length || buckets.some((bucket) => !/^[a-z0-9][a-z0-9._-]{0,62}$/i.test(bucket))) {
    throw new Error("ALLOWED_STORAGE_BUCKETS contains an invalid bucket name.");
  }
  return new Set(buckets);
}

export function loadConfig(env = process.env) {
  const supabaseUrl = readUrl(env, "SUPABASE_URL", "");
  const supabaseServiceRoleKey = readRequired(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!/^(?:eyJ|sb_secret_)/.test(supabaseServiceRoleKey)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a service-role JWT or an sb_secret_ key.");
  }
  const ollamaUrl = readUrl(env, "OLLAMA_URL", "http://127.0.0.1:11434");
  const ollamaApiKey = String(env.OLLAMA_API_KEY || "").trim();
  const ollamaHost = new URL(ollamaUrl).hostname;
  if (ollamaApiKey && new URL(ollamaUrl).protocol !== "https:" && !new Set(["127.0.0.1", "localhost", "ollama"]).has(ollamaHost)) {
    throw new Error("A remote OLLAMA_API_KEY may only be sent over HTTPS.");
  }

  return Object.freeze({
    supabaseUrl,
    supabaseServiceRoleKey,
    workerId: String(env.WORKER_ID || "tok-image-worker-1").trim().slice(0, 120),
    ollamaUrl,
    ollamaApiKey,
    visionModel: String(env.OLLAMA_VISION_MODEL || "qwen2.5vl:3b").trim(),
    embeddingModel: String(env.OLLAMA_EMBEDDING_MODEL || "all-minilm").trim(),
    ollamaKeepAlive: String(env.OLLAMA_KEEP_ALIVE || "10m").trim(),
    allowedStorageBuckets: readBuckets(env),
    maxImageBytes: readInteger(env, "MAX_IMAGE_BYTES", 8 * 1024 * 1024, {
      min: 1024,
      max: 16 * 1024 * 1024,
    }),
    expectedEmbeddingDimensions: readInteger(env, "EMBEDDING_DIMENSIONS", 384, { min: 1, max: 4096 }),
    pollIntervalMs: readInteger(env, "POLL_INTERVAL_MS", 5000, { min: 500, max: 60000 }),
    batchSize: readInteger(env, "BATCH_SIZE", 1, { min: 1, max: 25 }),
    downloadTimeoutMs: readInteger(env, "DOWNLOAD_TIMEOUT_MS", 30000, { min: 1000, max: 300000 }),
    ollamaVisionTimeoutMs: readInteger(env, "OLLAMA_VISION_TIMEOUT_MS", 300000, { min: 5000, max: 900000 }),
    ollamaEmbeddingTimeoutMs: readInteger(env, "OLLAMA_EMBEDDING_TIMEOUT_MS", 60000, { min: 1000, max: 300000 }),
    supabaseTimeoutMs: readInteger(env, "SUPABASE_TIMEOUT_MS", 20000, { min: 1000, max: 120000 }),
    httpRetryAttempts: readInteger(env, "HTTP_RETRY_ATTEMPTS", 3, { min: 1, max: 5 }),
    retryBaseMs: readInteger(env, "RETRY_BASE_MS", 1000, { min: 0, max: 30000 }),
    jobRetryBaseMs: readInteger(env, "JOB_RETRY_BASE_MS", 5000, { min: 0, max: 60000 }),
    healthHost: readHealthHost(env),
    healthPort: readInteger(env, "HEALTH_PORT", 8080, { min: 1, max: 65535 }),
  });
}
