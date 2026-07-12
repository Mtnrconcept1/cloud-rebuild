import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeImageWithOllama,
  fetchJsonWithRetry,
  generateEmbeddingWithOllama,
} from "./ollama.js";

function validMetadata(overrides = {}) {
  return {
    description: "Une assiette de pâtes fraîches servie sur une table de restaurant.",
    short_description: "Assiette de pâtes fraîches sur une table.",
    alt_text: "Assiette de pâtes fraîches garnie de tomates et de basilic.",
    seo_title: "Pâtes fraîches au restaurant",
    seo_description: "Une assiette de pâtes fraîches avec tomates et basilic dans un cadre de restaurant convivial.",
    detected_objects: ["assiette", "fourchette"],
    food_items: ["pâtes"],
    ingredients: ["tomates", "basilic"],
    cuisine_types: ["italienne"],
    moods: ["convivial"],
    colors: ["rouge", "vert"],
    hashtags: ["#patesfraiches", "#restaurantgeneve"],
    image_type: "plat",
    is_food_photo: true,
    has_people: false,
    has_logo: false,
    has_text: false,
    quality_score: 8.5,
    ...overrides,
  };
}

const config = {
  ollamaUrl: "http://ollama:11434",
  ollamaApiKey: "",
  visionModel: "qwen2.5vl:3b",
  embeddingModel: "all-minilm",
  ollamaKeepAlive: "10m",
  ollamaVisionTimeoutMs: 1000,
  ollamaEmbeddingTimeoutMs: 1000,
  httpRetryAttempts: 2,
  retryBaseMs: 0,
  expectedEmbeddingDimensions: 384,
};

test("retries transient Ollama HTTP failures with bounded attempts", async () => {
  let calls = 0;
  const result = await fetchJsonWithRetry("http://ollama/api/tags", {}, {
    timeoutMs: 1000,
    attempts: 2,
    retryBaseMs: 0,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ models: [] }), { status: 200 });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { models: [] });
});

test("requests a schema-constrained local vision result", async () => {
  let requestBody;
  const metadata = await analyzeImageWithOllama(config, "base64-image", null, {
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ response: JSON.stringify(validMetadata()) }), { status: 200 });
    },
  });
  assert.equal(requestBody.model, "qwen2.5vl:3b");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.format.additionalProperties, false);
  assert.equal(metadata.alt_text.includes("#"), false);
});

test("uses the modern embed endpoint and validates 384 dimensions", async () => {
  const urls = [];
  const embedding = await generateEmbeddingWithOllama(config, "texte de recherche", {
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ embeddings: [Array(384).fill(0.01)] }), { status: 200 });
    },
  });
  assert.equal(urls[0], "http://ollama:11434/api/embed");
  assert.equal(embedding.length, 384);
});

test("falls back to legacy /api/embeddings only when /api/embed is unavailable", async () => {
  const urls = [];
  const embedding = await generateEmbeddingWithOllama({ ...config, httpRetryAttempts: 1 }, "texte", {
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.endsWith("/api/embed")) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ embedding: Array(384).fill(0.02) }), { status: 200 });
    },
  });
  assert.deepEqual(urls, ["http://ollama:11434/api/embed", "http://ollama:11434/api/embeddings"]);
  assert.equal(embedding.length, 384);
});
