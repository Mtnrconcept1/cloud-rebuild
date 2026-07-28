import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function readMigrationContaining(fragment: string) {
  const directory = resolve(root, "supabase/migrations");
  const file = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .find((name) => readFileSync(resolve(directory, name), "utf8").includes(fragment));
  if (!file) throw new Error(`Migration containing ${fragment} not found`);
  return readFileSync(resolve(directory, file), "utf8");
}

function readSourceTree(directory: string): string {
  return readdirSync(directory)
    .filter((name) => name !== "test")
    .flatMap((name) => {
      const path = resolve(directory, name);
      if (statSync(path).isDirectory()) return [readSourceTree(path)];
      return /\.(?:ts|tsx|js|jsx)$/.test(name) ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}

describe("commercial demo OpenAI policy", () => {
  const edge = read("supabase/functions/commercial-demo-ai/index.ts");
  const sharedPath = "supabase/functions/_shared/commercial-demo-ai.ts";
  const shared = existsSync(resolve(root, sharedPath)) ? read(sharedPath) : "";
  const server = `${shared}\n${edge}`;
  const migration = readMigrationContaining("commercial_demo_ai_requests");
  const workspaceMigration = read("supabase/migrations/20260715015956_commercial_demo_ai_workspaces.sql");
  const client = read("src/lib/commercialDemoAi.ts");
  const effects = read("src/lib/commercialDemoEffects.ts");
  const hostSecurity = read("src/lib/commercialDemoHostSecurity.ts");
  const creationJobs = read("src/lib/ai/aiCréationJobs.ts");
  const config = read("supabase/config.toml");

  it("exposes one exact Supabase Edge slug and never puts OpenAI credentials or calls in the browser", () => {
    expect(client).toContain('"commercial-demo-ai"');
    expect(effects).toContain('"commercial-demo-ai"');
    expect(hostSecurity).toContain('COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai"');
    expect(effects).not.toContain('"commercial-demo-ai-preview"');
    expect(hostSecurity).not.toContain('COMMERCIAL_DEMO_AI_FUNCTION = "commercial-demo-ai-preview"');

    const browserSources = readSourceTree(resolve(root, "src"));
    expect(browserSources).not.toMatch(/fetch\s*\(\s*["'`]https:\/\/api\.openai\.com/i);
    expect(browserSources).not.toMatch(/new\s+OpenAI\s*\(/);
    expect(browserSources).not.toContain("OPENAI_API_KEY");
    expect(client).not.toContain("api.openai.com");
    expect(server).toContain('Deno.env.get("OPENAI_API_KEY")');
    expect(server).toContain("https://api.openai.com/");
    expect(config).toMatch(/\[functions\.commercial-demo-ai\]\s*verify_jwt\s*=\s*false/);
  });

  it("derives the actor, session, restaurant mapping and feature entitlement on the server", () => {
    const authorizationContract = `${server}\n${migration}\n${workspaceMigration}`;
    expect(server).toMatch(/authenticateRequest\(req|auth\.getUser\(/);
    expect(server).toMatch(/authorization/i);
    expect(authorizationContract).toContain("commercial_demo_order_sessions");
    expect(authorizationContract).toContain("commercial_demo_accounts");
    expect(authorizationContract).toContain("commercial_user_id");
    expect(authorizationContract).toContain("demo_restaurant_id");
    expect(authorizationContract).toMatch(/active_features|is_feature_flag_active/);
    expect(authorizationContract).toContain("dashboard-advisor");
    expect(authorizationContract).toContain("ai_support_chat");
    expect(authorizationContract).toContain("dashboard-photos");
    expect(server).not.toMatch(/body\.(?:commercial_user_id|demo_restaurant_id|active_features|feature_flags)/);
    expect(server).not.toMatch(/body\[['"](?:commercial_user_id|demo_restaurant_id|active_features|feature_flags)['"]\]/);
  });

  it("stores only in demo tables and the private commercial-demo-ai bucket", () => {
    expect(migration).toContain("commercial_demo_ai_requests");
    expect(migration).toContain("commercial_demo_ai_conversations");
    expect(migration).toContain("commercial_demo_ai_messages");
    expect(migration).toContain("commercial_demo_ai_generations");
    expect(migration).toContain("commercial-demo-ai");
    expect(migration).toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
    expect(migration).toContain("SET public = false");
    expect(server).toContain('COMMERCIAL_DEMO_AI_BUCKET = "commercial-demo-ai"');
    expect(server).toContain(".from(COMMERCIAL_DEMO_AI_BUCKET)");
    expect(server).toMatch(/createSignedUrl\(/);

    for (const productionTarget of [
      "ai_conversations",
      "ai_generated_assets",
      "ai_generation_jobs",
      "ai_messages",
      "ai_usage_events",
      "ai_usage_logs",
      "financial_ledger",
      "restaurant_ai_subscriptions",
      "restaurant_credit_ledger",
      "restaurant_media",
    ]) {
      expect(server).not.toMatch(new RegExp(`\\.from\\(["']${productionTarget}["']\\)`, "i"));
      expect(migration).not.toMatch(new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:public\\.)?${productionTarget}\\b`, "i"));
    }
  });

  it("keeps commercial usage unlimited in TOK credits while recording real provider usage and cost", () => {
    expect(migration).toContain("input_tokens");
    expect(migration).toContain("output_tokens");
    expect(migration).toContain("estimated_cost_chf");
    expect(migration).toMatch(/CHECK\s*\(\s*credit_units\s*=\s*0\s*\)/i);
    expect(migration).not.toMatch(/CHECK\s*\(\s*estimated_cost_chf\s*=\s*0\s*\)/i);
    expect(server).toMatch(/usage\??\.(?:input_tokens|prompt_tokens)/);
    expect(server).toMatch(/usage\??\.(?:output_tokens|completion_tokens)/);
    expect(server).toContain("estimated_cost_chf");
    expect(server).toContain("credit_units: 0");
    expect(server).not.toContain("check_restaurant_ai_quota");
    expect(server).not.toContain("getRestaurantCreditPreflight");
    expect(server).not.toContain("consume_restaurant_credits");
    expect(server).not.toMatch(/(?:HttpError|Response)\s*\([^\n]*\b402\b/);
  });

  it("binds idempotency to a server hash and distinguishes replay, conflict and in-flight work", () => {
    expect(migration).toContain("request_id");
    expect(migration).toContain("payload_hash");
    expect(migration).toMatch(/UNIQUE[\s\S]{0,180}request_id/i);
    expect(migration).toContain("processing");
    expect(migration).toContain("completed");
    expect(migration).toContain("failed");
    expect(server).toMatch(/crypto\.subtle\.digest\(\s*["']SHA-256["']/);
    expect(server).not.toMatch(/body\.(?:payload_hash|request_hash)/);
    expect(server).toContain("payload_hash");
    expect(server).toContain("replayed");
    expect(server).toContain("409");
    expect(server).toMatch(/processing|in[_ -]?progress/i);
    expect(client).toContain("request_id");
    expect(client).toContain("const requestId = createRequestId()");
    expect(client).toContain("generation_seed: request.generationSeed || null");
    expect(client).not.toMatch(/requestId\s*=\s*[^\n]*generationSeed/);
  });

  it("bounds provider time and concurrent work without adding a business quota", () => {
    const runtimePolicy = `${server}\n${migration}`;
    expect(server).toMatch(/AbortController|AbortSignal\.timeout/);
    expect(server).toMatch(/setTimeout\(|AbortSignal\.timeout\(/);
    expect(server).toMatch(/TIMEOUT_MS/);
    expect(runtimePolicy).toMatch(/MAX_(?:CONCURRENT|IN_FLIGHT)|concurrent|in[_ -]?flight/i);
    expect(runtimePolicy).toContain("409");
    expect(runtimePolicy).not.toMatch(/status\s*:\s*402|new\s+HttpError\(\s*402/);
  });

  it("serializes concurrency atomically, owns the session exactly and cleans retained demo artifacts", () => {
    expect(migration).toContain("commercial-demo-ai-global-claim");
    expect(migration).toContain("commercial-demo-ai-session:");
    expect(migration).toContain("commercial_demo_ai_provider_failures");
    expect(migration).toMatch(/failure\.occurred_at > now\(\) - interval '90 seconds'/);
    expect(migration).toContain("commercial_demo_ai_storage_cleanup_queue");
    expect(migration).toContain("commercial_demo_ai_apply_retention");
    expect(migration).toContain("commercial_demo_ai_session_lifecycle_cleanup");
    expect(migration).toContain("commercial-demo-ai-storage-cleanup");
    expect(migration).toContain("cron.schedule");
    expect(migration).toContain("internal_cron_secret");
    expect(migration).toContain("maintenance_cleanup");
    expect(shared).toContain("session.commercial_user_id !== actor.userId");
    expect(shared).toContain("SIGNED_URL_TTL_SECONDS = 60 * 60");
    expect(edge).toContain('action === "maintenance_cleanup"');
    expect(edge).toContain('actor.authMode !== "scheduler_secret"');
  });

  it("supports the exact runtime actions and returns real URL-based image contracts", () => {
    for (const action of ["chat", "visual_generate", "visual_history"]) {
      expect(server).toContain(`"${action}"`);
      expect(client).toContain(`"${action}"`);
    }
    expect(server).toMatch(/unsupported|invalid_action|action_invalid|action.*required/i);
    for (const field of [
      "conversation_id",
      "reply",
      "tool",
      "model",
      "credit_units",
      "estimated_cost_chf",
      "created_at",
      "replayed",
      "generation_id",
      "prompt",
      "output_url",
      "output_mime_type",
      "format",
      "width",
      "height",
      "alt_text",
      "style",
    ]) {
      expect(server).toContain(field);
    }
    expect(client).toContain("output_url");
    expect(client).not.toContain("output_svg");
    expect(client).toContain('!value.trim().toLowerCase().startsWith("data:image/svg+xml")');
    expect(client).not.toContain("tok-demo-zero-cost-v1");
    expect(server).not.toContain("output_svg");
    expect(server).not.toContain("image/svg+xml");
    expect(server).not.toContain("tok-demo-zero-cost-v1");
  });

  it("validates and hashes bounded reference images before using the OpenAI edit endpoint", () => {
    expect(edge).toContain("MAX_REFERENCE_IMAGES = 3");
    expect(edge).toContain("MAX_REFERENCE_IMAGE_BYTES = 4 * 1024 * 1024");
    expect(edge).toContain("reference_images");
    expect(edge).toContain("IMAGE_EDITS_URL");
    expect(edge).toContain("new FormData");
    expect(edge).toMatch(/form\.append\(\s*"image\[\]"/);
    expect(edge).toContain("reference_image_mime_mismatch");
    expect(edge).toContain("sha256");
  });

  it("does not trust arbitrary Supabase-looking origins", () => {
    expect(effects).toContain("VITE_SUPABASE_URL");
    expect(hostSecurity).toContain("VITE_SUPABASE_URL");
    expect(effects).not.toContain('hostname.endsWith(".supabase.co")');
    expect(hostSecurity).not.toContain('hostname.endsWith(".supabase.co")');
  });

  it("does not persist transient source or signed output URLs in the commercial job ledger", () => {
    expect(creationJobs).toContain("getCommercialDemoAiRuntime()");
    expect(creationJobs).toContain("const storageKey = getAiCréationsStorageKey()");
    expect(creationJobs).toContain("upsertRecord(record, storageKey)");
    expect(creationJobs).toContain("}, storageKey) ||");
    expect(creationJobs).toContain("sourceImageUrl: null");
    expect(creationJobs).toContain("referenceImageUrls: []");
    expect(creationJobs).toContain("generated_image_url: null");
    expect(creationJobs).toContain("gallery_image_url: null");
  });
});
