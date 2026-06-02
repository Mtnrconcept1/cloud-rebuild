import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function readMigrationContaining(slug: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .find((name) => name.includes(slug));

  expect(migrationName, `migration containing ${slug} should exist`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, migrationName!), "utf8");
}

describe("TOK AI tools foundation", () => {
  it("adds governed AI persistence tables with RLS, grants and storage", () => {
    const sql = readMigrationContaining("tok_ai_tools");

    for (const table of [
      "ai_conversations",
      "ai_messages",
      "ai_usage_logs",
      "ai_generated_assets",
      "ai_safety_rules",
      "restaurant_ai_profiles",
      "restaurant_ai_subscriptions",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
      expect(sql).toMatch(new RegExp(`GRANT\\s+SELECT`, "i"));
    }

    expect(sql).toContain("public.auth_owns_restaurant");
    expect(sql).toContain("public.has_role");
    expect(sql).toContain("ai-generated-assets");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("centralizes OpenAI calls in a Supabase-only helper using Responses API and structured outputs", () => {
    const helper = readProjectFile("supabase/functions/_shared/openai.ts");

    expect(helper).toContain("OPENAI_API_KEY");
    expect(helper).toContain("OPENAI_MODEL");
    expect(helper).toContain("gpt-5.5");
    expect(helper).toContain("https://api.openai.com/v1/responses");
    expect(helper).toContain("store: false");
    expect(helper).toContain("text");
    expect(helper).toContain("json_schema");
    expect(helper).toContain("extractOutputText");
    expect(helper).not.toContain("VITE_OPENAI");
  });

  it("exposes four authenticated AI edge functions with rate limits, audit logs and usage logs", () => {
    for (const fn of ["ai-client-chat", "ai-restaurant-tools", "ai-image-enhance", "ai-admin-support"]) {
      const source = readProjectFile(`supabase/functions/${fn}/index.ts`);

      expect(source).toContain("authenticateRequest");
      expect(source).toContain("createRateLimiter");
      expect(source).toContain("writeAuditLog");
      expect(source).toContain("ai_usage_logs");
      expect(source).toContain("OPENAI_API_KEY");
      expect(source).not.toContain("VITE_OPENAI");
    }

    const config = readProjectFile("supabase/config.toml");
    for (const fn of ["ai-client-chat", "ai-restaurant-tools", "ai-image-enhance", "ai-admin-support"]) {
      expect(config).toContain(`[functions.${fn}]`);
      expect(config).toMatch(new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt\\s*=\\s*false`, "i"));
    }
  });

  it("keeps generated image storage on the governed private bucket by default", () => {
    const source = readProjectFile("supabase/functions/ai-image-enhance/index.ts");

    expect(source).toContain('TOK_AI_IMAGE_BUCKET")?.trim() || "ai-generated-assets"');
    expect(source).toContain('storage.from(IMAGE_BUCKET).createSignedUrl');
  });

  it("returns a stable public gallery URL for restaurateur photo gallery inserts", () => {
    const source = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    const client = readProjectFile("src/lib/ai/tokAiClient.ts");
    const studio = readProjectFile("src/components/dashboard/TokAiPhotoStudioV2.tsx");

    expect(source).toContain('TOK_GALLERY_IMAGE_BUCKET")?.trim() || "images"');
    expect(source).toContain("storage.from(GALLERY_BUCKET).upload");
    expect(source).toContain("gallery_image_url");
    expect(client).toContain("gallery_image_url: string | null");
    expect(studio).toContain("media_url: result.gallery_image_url");
    expect(studio).not.toContain("media_url: result.generated_image_url");
  });

  it("keeps interactive photo generation inside Supabase Edge timeout budgets", () => {
    const source = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    const secrets = readProjectFile("scripts/write-supabase-secrets-env.mjs");
    const workflow = readProjectFile(".github/workflows/deploy-production.yml");

    expect(source).toContain("normalizeImageQuality");
    expect(source).toContain("TOK_ALLOW_HIGH_IMAGE_QUALITY");
    expect(source).not.toContain('OPENAI_IMAGE_QUALITY")?.trim() || "high"');
    expect(source).toContain("OPENAI_IMAGE_TIMEOUT_MS");
    expect(source).toContain("AbortController");
    expect(source).toContain("TOK_IMAGE_USE_AI_BRIEF");
    expect(source).toContain("buildFallbackImageResult");
    expect(source).toContain("brief_source");

    for (const name of [
      "OPENAI_IMAGE_MODEL",
      "OPENAI_IMAGE_QUALITY",
      "OPENAI_IMAGE_TIMEOUT_MS",
      "TOK_IMAGE_USE_AI_BRIEF",
      "TOK_ALLOW_HIGH_IMAGE_QUALITY",
      "TOK_AI_IMAGE_BUCKET",
      "TOK_GALLERY_IMAGE_BUCKET",
    ]) {
      expect(secrets).toContain(`"${name}"`);
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });

  it("uses optimized WebP food references for the TOK photo studio style memory", () => {
    const source = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    const referencesDir = resolve(root, "public/tok-reference-food-webp");
    const references = readdirSync(referencesDir).filter((name) => name.endsWith(".webp"));

    expect(source).toContain('TOK_REFERENCE_FOLDER = "/tok-reference-food-webp"');
    expect(references).toHaveLength(13);
    expect(references.every((name) => name.endsWith(".webp"))).toBe(true);
  });

  it("adds an idempotent recovery migration for applied-but-missing AI schema", () => {
    const sql = readMigrationContaining("restore_tok_ai_schema");

    for (const table of [
      "ai_conversations",
      "ai_usage_logs",
      "ai_generated_assets",
      "restaurant_ai_profiles",
      "ai_support_tickets",
      "ai_restaurant_tasks",
      "ai_admin_events",
      "ai_accounting_insights",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}`, "i"));
    }

    expect(sql).toContain("ai-generated-assets");
    expect(sql).toContain("public.check_restaurant_ai_quota");
    expect(sql).toContain("public.get_restaurant_ai_usage");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("routes the public support chat through the Supabase client AI function with user auth", () => {
    const supportChat = readProjectFile("src/components/SupportChat.tsx");

    expect(supportChat).toContain("ai-client-chat");
    expect(supportChat).toContain("supabase.auth.getSession");
    expect(supportChat).toContain("Authorization");
    expect(supportChat).toContain("support_ai");
    expect(supportChat).not.toContain("/api/support-ai");
  });

  it("adds restaurateur-facing text and image tools to the existing AI dashboard", () => {
    const advisor = readProjectFile("src/pages/dashboard/DashboardAdvisor.tsx");

    expect(advisor).toContain("ai-restaurant-tools");
    expect(advisor).toContain("ai-image-enhance");
    expect(advisor).toContain("Optimiser un plat");
    expect(advisor).toContain("Créer une campagne");
    expect(advisor).toContain("Améliorer une photo");
  });
});
