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
    expect(helper).toContain("findParsedStructuredOutput");
    expect(helper).toContain("extractJsonCandidate");
    expect(helper).toContain("stripMarkdownCodeFence");
    expect(helper).toContain("findBalancedJson");
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

  it("charges five ai_tools credits for every non-photo restaurant AI request", () => {
    for (const fn of ["ai-restaurant-agent", "ai-restaurant-tools", "restaurant-advisor", "generate-campaign", "floorplan-ai", "ai-accounting-agent"]) {
      const source = readProjectFile(`supabase/functions/${fn}/index.ts`);

      expect(source).toContain("ai_usage_logs");
      expect(source).toContain('credit_kind: "ai_tools"');
      expect(source).toContain("credit_units");
      expect(source).toContain("5");
    }

    const photoSource = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    expect(photoSource).toContain('credit_kind: "photo_retouch"');
    expect(photoSource).not.toContain('credit_kind: "ai_tools"');

    const migration = readProjectFile("supabase/migrations/20260615031500_campaign_credit_packs.sql");
    expect(migration).toContain("'ai-restaurant-agent', 'ai-restaurant-tools', 'restaurant-advisor', 'generate-campaign', 'floorplan-ai', 'ai-accounting-agent'");
    expect(migration).toContain("ul.metadata->>'credit_kind'");
    expect(migration).toContain("THEN 5 END");
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
    const client = readProjectFile("src/lib/ai/tokAiClient.ts");
    const studio = readProjectFile("src/components/dashboard/TokAiPhotoStudioV2.tsx");
    const marketingStudio = readProjectFile("src/components/dashboard/TokAiMarketingStudio.tsx");
    const secrets = readProjectFile("scripts/write-supabase-secrets-env.mjs");
    const workflow = readProjectFile(".github/workflows/deploy-production.yml");

    expect(source).toContain("normalizeImageQuality");
    expect(source).toContain("TOK_ALLOW_HIGH_IMAGE_QUALITY");
    expect(source).not.toContain('OPENAI_IMAGE_QUALITY")?.trim() || "high"');
    expect(source).toContain('return "medium"');
    expect(source).toContain('return "high"');
    expect(source).toContain("OPENAI_IMAGE_TIMEOUT_MS");
    expect(source).toContain("AbortController");
    expect(source).not.toContain("TOK_IMAGE_USE_AI_BRIEF");
    expect(source).toContain("TOK_IMAGE_FAST_INTERACTIVE");
    expect(source).toContain('const USE_FAST_INTERACTIVE_IMAGE = readEnvFlag("TOK_IMAGE_FAST_INTERACTIVE", false)');
    expect(source).toContain("buildMarketingImageRequestOptions");
    expect(source).not.toContain("FORCE_STRICT_SOURCE_EDIT ? false");
    expect(source).toContain("sourceImagePresent && USE_FAST_INTERACTIVE_IMAGE");
    expect(source).toContain("buildImageRequestOptions(format.size, Boolean(sourceImageUrl), outputConfig.outputQuality)");
    expect(source).toContain("buildMarketingImageRequestOptions(format.size, referenceImageUrls.length > 0, outputConfig.outputQuality)");
    expect(source).not.toContain("TOK_INTERACTIVE_IMAGE_QUALITY");
    expect(source).not.toContain("TOK_INTERACTIVE_IMAGE_SIZE");
    expect(source).toContain("gpt-image-2");
    expect(source).toContain("const INTERACTIVE_IMAGE_MODEL = IMAGE_MODEL;");
    expect(source).not.toContain("gpt-image-1-mini");
    expect(source).toContain('"low"');
    expect(source).toContain('"1024x1024"');
    expect(source).toContain("interactive_fast");
    expect(source).toContain("if (sourceImageUrl) {");
    expect(source).toContain("buildImageOnlyResult");
    expect(source).toContain("brief_source");
    expect(source).toContain('maxRequests: 20, windowSeconds: 600');
    expect(source).toContain('maxRequests: 60, windowSeconds: 600');
    expect(source).toContain('maxRequests: 180, windowSeconds: 60');
    expect(source).toContain("SOURCE_IMAGE_EDIT_PROMPT");
    expect(source).toContain("PREMIUM_SOURCE_IMAGE_EDIT_PROMPT");
    expect(source).toContain("buildPhotoStudioRetouchPrompt");
    expect(source).toContain("buildCompactPhotoStudioRetouchPrompt");
    expect(source).toContain("DEFAULT_PHOTO_STUDIO_STYLE");
    expect(source).toContain(".replace(/\\[TYPE_DE_PLAT\\]/g, dishLabel)");
    expect(source).toContain(".replace(/\\[STYLE_[^\\]]+\\]/g, DEFAULT_PHOTO_STUDIO_STYLE)");
    expect(source).toContain("avant/apres fidele");
    expect(source).toContain("PHOTO_STUDIO_RETOUCH_PROMPT");
    expect(source).toContain("photographie culinaire publicitaire haut de gamme");
    expect(source).toContain("conservant strictement le produit d'origine");
    expect(source).toContain("mêmes ingrédients visibles");
    expect(source).toContain("Supprimer les éléments parasites");
    expect(source).toContain("profondeur de champ élégante");
    expect(source).toContain("Ne pas ajouter de texte, logo ou éléments graphiques");
    expect(source).toContain("Préserver le cadrage et le ratio d'origine");
    expect(source).toContain("ne jamais ajouter de logo");
    expect(source).toContain("sans logo");
    expect(source).toContain("sans texte de marque");
    expect(source).toContain("SUPPORTED_SOURCE_IMAGE_MIME_TYPES");
    expect(source).toContain("getSourceImageFileName");
    expect(source).toContain("normalizeReferenceImageUrls");
    expect(source).toContain("callOpenAIImageEditWithReferences");
    expect(source).toContain("marketingAssetMode");
    expect(source).toContain("reference_image_urls");
    expect(source).toContain("reference-${index + 1}-${getSourceImageFileName(sourceBlob.type)}");
    expect(source).not.toContain("TOK_BRAND_LOGO_URL");
    expect(source).not.toContain("TOK_BRAND_LOGO_PROMPT");
    expect(source).not.toContain('form.append("image[]", logoBlob, "tok-logo.png")');
    expect(source).toContain("Interdiction explicite: ne pas ajouter de logo");
    expect(source).toContain('brand_overlay_positioning: "frontend_transparent_layer"');
    expect(source).toContain('brand_overlay_size: "180x180"');
    expect(source).toContain("strict_source_edit_no_generation_fallback");
    expect(source).toContain("generation_fallback_allowed: !sourceImageUrl");
    expect(source).toContain("let imageEditRetryUsed = false");
    expect(source).toContain("callOpenAIImageEditWithRetry");
    expect(source).toContain("shouldRetryImageEdit");
    expect(source).toContain("image_edit_retry");
    expect(source).not.toContain("image_edit_fallback");
    expect(source).not.toContain("image_edit_fallback: l'edition de l'image source a echoue");
    expect(source).not.toContain("source_image_edit_required");
    expect(source).not.toContain("createOpenAIResponse");
    expect(source).not.toContain("parseStructuredOutput");
    expect(source).not.toContain("maxOutputTokens");
    expect(source).not.toContain("OUTPUT_SCHEMA");
    expect(source).not.toContain("image_brief");
    expect(source).not.toContain("brief_only");
    expect(client).toContain("imageOnly?: boolean");
    expect(client).toContain('from "@/lib/session";');
    expect(client).toContain("invokeSupabaseFunction");
    expect(client).not.toContain("async function getAuthorizationHeader");
    expect(client).not.toContain("supabase.functions.invoke(functionName");
    expect(studio).toContain("image_edit_timeout");
    expect(studio).toContain("image_generation_timeout");
    expect(source).toContain("const imageOnly = true");
    expect(source).toContain("image_generation_required");
    expect(source).toContain('briefSource = marketingAssetMode ? "marketing_image_only" : "image_only"');
    expect(client).toContain("referenceImageUrls?: string[]");
    expect(client).toContain("marketingAssetMode?: boolean");
    expect(source).toContain('publication_caption: ""');
    expect(source).toContain("marketing_angles: []");
    expect(marketingStudio).toContain("functionsfetcherror");
    expect(marketingStudio).toContain("Failed to send a request to the Edge Function");

    for (const name of [
      "OPENAI_IMAGE_MODEL",
      "OPENAI_IMAGE_QUALITY",
      "OPENAI_IMAGE_TIMEOUT_MS",
      "TOK_IMAGE_USE_AI_BRIEF",
      "TOK_IMAGE_FAST_INTERACTIVE",
      "TOK_IMAGE_USE_SOURCE_EDIT",
      "TOK_INTERACTIVE_IMAGE_QUALITY",
      "TOK_INTERACTIVE_IMAGE_SIZE",
      "TOK_INTERACTIVE_IMAGE_TIMEOUT_MS",
      "TOK_ALLOW_HIGH_IMAGE_QUALITY",
      "TOK_AI_IMAGE_BUCKET",
      "TOK_GALLERY_IMAGE_BUCKET",
    ]) {
      expect(secrets).toContain(`"${name}"`);
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });

  it("uses the configured image 2 model for every image generation path", () => {
    const source = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    const secrets = readProjectFile("scripts/write-supabase-secrets-env.mjs");
    const workflow = readProjectFile(".github/workflows/deploy-production.yml");

    expect(source).toContain('const IMAGE_MODEL = "gpt-image-2";');
    expect(source).toContain("const INTERACTIVE_IMAGE_MODEL = IMAGE_MODEL;");
    expect(source).not.toContain('Deno.env.get("OPENAI_IMAGE_MODEL")');
    expect(source).not.toContain("gpt-image-1-mini");
    expect(source).not.toContain('Deno.env.get("TOK_INTERACTIVE_IMAGE_MODEL")');
    expect(secrets).not.toContain('"TOK_INTERACTIVE_IMAGE_MODEL"');
    expect(workflow).not.toContain("TOK_INTERACTIVE_IMAGE_MODEL");
  });

  it("prices gpt-image-2 output resolution with server-side photo credits", () => {
    const source = readProjectFile("supabase/functions/ai-image-enhance/index.ts");
    const client = readProjectFile("src/lib/ai/tokAiClient.ts");
    const pricing = readProjectFile("src/lib/ai/imagePricing.ts");
    const photoStudio = readProjectFile("src/components/dashboard/TokAiPhotoStudioV2.tsx");
    const marketingStudio = readProjectFile("src/components/dashboard/TokAiMarketingStudio.tsx");
    const migration = readMigrationContaining("ai_image_resolution_credit_pricing");

    for (const expected of [
      "USD_TO_CHF_RATE = 0.81",
      "PHOTO_CREDIT_CHF = 0.015",
      "GPT_IMAGE_2_TEXT_INPUT_USD_PER_TOKEN = 5 / 1_000_000",
      "GPT_IMAGE_2_IMAGE_INPUT_USD_PER_TOKEN = 8 / 1_000_000",
      "GPT_IMAGE_2_IMAGE_OUTPUT_USD_PER_TOKEN = 30 / 1_000_000",
      '"1024x1024": 0.211',
      '"1024x1536": 0.165',
      '"1536x1024": 0.165',
      "normalizeOutputResolution",
      "getImageOutputConfig",
      "credit_units_per_image",
      "output_resolution",
      "output_size",
      "output_quality",
    ]) {
      expect(source).toContain(expected);
    }

    expect(client).toContain("outputResolution?: TokImageOutputResolution");
    expect(pricing).toContain("TOK_IMAGE_OUTPUT_OPTIONS");
    expect(pricing).toContain("TOK_PHOTO_CREDIT_CHF = 0.015");
    expect(photoStudio).toContain("Resolution de sortie");
    expect(photoStudio).toContain("outputResolution: selectedOutputResolution");
    expect(marketingStudio).toContain("marketing-output-resolution");
    expect(marketingStudio).toContain("outputResolution");
    expect(migration).toContain("WHEN 'starter' THEN 24");
    expect(migration).toContain("WHEN 'pro' THEN 96");
    expect(migration).toContain("WHEN 'premium' THEN 240");
    expect(migration).toContain("WHEN 'elite' THEN 960");
    expect(migration).toContain("ai_photo_credits = 120");
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

  it("keeps an explicit AI schema cache refresh contract for production deploys", () => {
    const sql = readMigrationContaining("refresh_ai_schema_cache_contracts");

    expect(sql).toContain("to_regclass('public.ai_generated_assets')");
    expect(sql).toContain("to_regprocedure('public.check_restaurant_ai_quota(uuid,text,integer)')");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS provider text");
    expect(sql).toContain("ALTER COLUMN provider SET DEFAULT 'stripe'");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("routes the public support chat through the Supabase client AI function with user auth", () => {
    const supportChat = readProjectFile("src/components/SupportChat.tsx");
    const aiClient = readProjectFile("src/lib/ai/tokAiClient.ts");

    expect(supportChat).toContain("askClientSupport({");
    expect(supportChat).toContain("supportTicketId");
    expect(aiClient).toContain('"ai-client-support"');
    expect(aiClient).toContain("invokeSupabaseFunction");
    expect(supportChat).toContain("support_ai");
    expect(supportChat).not.toContain("supabase.auth.getSession");
    expect(supportChat).not.toContain("Authorization: `Bearer");
    expect(supportChat).not.toContain("/api/support-ai");
  });

  it("adds restaurateur-facing text and image tools to the existing AI dashboard", () => {
    const advisor = readProjectFile("src/pages/dashboard/DashboardAdvisor.tsx");

    expect(advisor).toContain("streamRestaurantAdvisor");
    expect(advisor).toContain("runRestaurantAgent");
    expect(advisor).toContain("generateTokDishImage");
    expect(advisor).toContain("Optimiser un plat");
    expect(advisor).toContain("Creer une campagne");
    expect(advisor).toContain("Ameliorer une photo");
    expect(advisor).toContain("generated_image_url");
    expect(advisor).toContain("imageOnly: true");
    expect(advisor).not.toContain("tool.endpoint");
    expect(advisor).not.toContain("supabase.auth.getSession");
    expect(advisor).not.toContain("**Prompt visuel**");
    expect(advisor).not.toContain("data.publication_caption");
  });
});
