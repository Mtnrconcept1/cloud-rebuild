import { OUTPUT_SCHEMA, buildVisionPrompts, extractStrictJson, validateMetadata } from "./metadata.js";

export class OllamaHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "OllamaHttpError";
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildHeaders(config, extra = {}) {
  return {
    Accept: "application/json",
    ...extra,
    ...(config.ollamaApiKey ? { Authorization: `Bearer ${config.ollamaApiKey}` } : {}),
  };
}

function shouldRetry(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || error instanceof TypeError) return true;
  return error instanceof OllamaHttpError && new Set([408, 409, 425, 429, 500, 502, 503, 504]).has(error.status);
}

export async function fetchJsonWithRetry(url, init, {
  timeoutMs,
  attempts,
  retryBaseMs,
  fetchImpl = fetch,
  sleepImpl = sleep,
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) throw new Error("Ollama response is unexpectedly large.");
      if (!response.ok) throw new OllamaHttpError(`Ollama HTTP ${response.status}: ${text.slice(0, 500)}`, response.status);
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("Ollama returned invalid JSON at the HTTP layer.");
      }
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const jitter = Math.floor(Math.random() * Math.max(50, retryBaseMs));
      await sleepImpl(Math.min(30000, retryBaseMs * (2 ** (attempt - 1))) + jitter);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function hasModel(models, expected) {
  return models.some((model) => model === expected || model.startsWith(`${expected}:`) || expected.startsWith(`${model}:`));
}

export async function checkOllamaModels(config, options = {}) {
  const payload = await fetchJsonWithRetry(`${config.ollamaUrl}/api/tags`, {
    headers: buildHeaders(config),
  }, {
    timeoutMs: Math.min(config.ollamaEmbeddingTimeoutMs, 15000),
    attempts: Math.min(config.httpRetryAttempts, 2),
    retryBaseMs: config.retryBaseMs,
    ...options,
  });
  const models = Array.isArray(payload.models)
    ? payload.models.map((model) => String(model?.name || model?.model || "")).filter(Boolean)
    : [];
  const missing = [config.visionModel, config.embeddingModel].filter((model) => !hasModel(models, model));
  if (missing.length) throw new Error(`Missing Ollama model(s): ${missing.join(", ")}.`);
  return models;
}

export async function analyzeImageWithOllama(config, base64Image, trustedContext = null, options = {}) {
  const prompts = buildVisionPrompts(trustedContext);
  const payload = await fetchJsonWithRetry(`${config.ollamaUrl}/api/generate`, {
    method: "POST",
    headers: buildHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      model: config.visionModel,
      system: prompts.system,
      prompt: prompts.prompt,
      images: [base64Image],
      stream: false,
      format: OUTPUT_SCHEMA,
      keep_alive: config.ollamaKeepAlive,
      options: { temperature: 0, num_predict: 1400 },
    }),
  }, {
    timeoutMs: config.ollamaVisionTimeoutMs,
    attempts: config.httpRetryAttempts,
    retryBaseMs: config.retryBaseMs,
    ...options,
  });
  return validateMetadata(extractStrictJson(payload.response));
}

function validateEmbedding(embedding, expectedDimensions) {
  if (!Array.isArray(embedding) || embedding.length !== expectedDimensions) {
    throw new Error(`Invalid embedding dimension: ${Array.isArray(embedding) ? embedding.length : "none"}. Expected ${expectedDimensions}.`);
  }
  if (embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Ollama embedding contains a non-finite value.");
  }
  return embedding;
}

export async function generateEmbeddingWithOllama(config, text, options = {}) {
  const requestOptions = {
    timeoutMs: config.ollamaEmbeddingTimeoutMs,
    attempts: config.httpRetryAttempts,
    retryBaseMs: config.retryBaseMs,
    ...options,
  };
  const common = {
    method: "POST",
    headers: buildHeaders(config, { "Content-Type": "application/json" }),
  };

  try {
    const result = await fetchJsonWithRetry(`${config.ollamaUrl}/api/embed`, {
      ...common,
      body: JSON.stringify({ model: config.embeddingModel, input: text, truncate: true, keep_alive: config.ollamaKeepAlive }),
    }, requestOptions);
    return validateEmbedding(result.embeddings?.[0], config.expectedEmbeddingDimensions);
  } catch (error) {
    if (!(error instanceof OllamaHttpError) || error.status !== 404) throw error;
  }

  // Compatibility with older Ollama releases that only expose /api/embeddings.
  const result = await fetchJsonWithRetry(`${config.ollamaUrl}/api/embeddings`, {
    ...common,
    body: JSON.stringify({ model: config.embeddingModel, prompt: text, keep_alive: config.ollamaKeepAlive }),
  }, requestOptions);
  return validateEmbedding(result.embedding, config.expectedEmbeddingDimensions);
}

