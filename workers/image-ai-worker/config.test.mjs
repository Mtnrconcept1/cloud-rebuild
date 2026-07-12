import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

const baseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test-only",
};

test("defaults to local Ollama and free open models", () => {
  const config = loadConfig(baseEnv);
  assert.equal(config.ollamaUrl, "http://127.0.0.1:11434");
  assert.equal(config.visionModel, "qwen2.5vl:3b");
  assert.equal(config.embeddingModel, "all-minilm");
  assert.deepEqual([...config.allowedStorageBuckets], ["restaurant-images", "social-post-media"]);
  assert.equal("openAiApiKey" in config, false);
});

test("accepts legacy JWT service keys but rejects public or malformed credentials", () => {
  assert.doesNotThrow(() => loadConfig({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "eyJ-test-only" }));
  assert.throws(() => loadConfig({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_test" }), /service-role JWT/);
  assert.throws(() => loadConfig({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "" }), /required/);
});

test("rejects unsafe limits and bucket names before starting", () => {
  assert.throws(() => loadConfig({ ...baseEnv, MAX_IMAGE_BYTES: "999999999" }), /MAX_IMAGE_BYTES/);
  assert.throws(() => loadConfig({ ...baseEnv, ALLOWED_STORAGE_BUCKETS: "restaurant-images,../private" }), /invalid bucket/);
  assert.throws(() => loadConfig({ ...baseEnv, OLLAMA_URL: "file:///tmp/ollama" }), /HTTP or HTTPS/);
  assert.throws(() => loadConfig({ ...baseEnv, OLLAMA_URL: "http://ollama.example.com", OLLAMA_API_KEY: "secret" }), /over HTTPS/);
});
