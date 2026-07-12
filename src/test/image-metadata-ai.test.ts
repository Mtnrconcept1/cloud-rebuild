import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function projectPath(path: string) {
  return resolve(process.cwd(), path);
}

function readProjectFile(path: string) {
  const absolutePath = projectPath(path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("restaurant image metadata and Actualites indexing", () => {
  it("derives trusted media relationships server-side and removes arbitrary client registration", () => {
    const migration = readProjectFile("supabase/migrations/20260712014949_actualites_image_indexing_security.sql");
    const dashboardPhotos = readProjectFile("src/pages/dashboard/DashboardPhotos.tsx");
    const imageUpload = readProjectFile("src/components/ImageUpload.tsx");
    const socialFeed = readProjectFile("src/hooks/useSocialFeed.ts");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS social_post_media_id uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS restaurant_media_id uuid");
    expect(migration).toContain("restaurant_images_social_post_media_id_fkey");
    expect(migration).toContain("restaurant_images_restaurant_media_id_fkey");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.prepare_actualites_media_for_indexing");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.sync_actualites_media_image_index");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.prepare_restaurant_media_for_indexing");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.sync_restaurant_media_image_index");
    expect(migration).toContain("o.bucket_id = 'social-post-media'");
    expect(migration).toContain("NEW.media_path NOT LIKE v_post.restaurant_id::text");
    expect(migration).toContain("NEW.storage_bucket IS DISTINCT FROM 'restaurant-images'");
    expect(migration).toContain("NEW.storage_path NOT LIKE NEW.restaurant_id::text");
    expect(migration).toContain("REVOKE ALL ON TABLE public.restaurant_images FROM PUBLIC, anon, authenticated");
    expect(migration).not.toContain("GRANT INSERT, UPDATE, DELETE ON public.restaurant_images TO authenticated");

    expect(existsSync(projectPath("src/lib/uploadRestaurantImage.ts"))).toBe(false);
    expect(socialFeed).not.toContain("registerRestaurantImageForAnalysis");
    expect(socialFeed).not.toContain("registerActualitesImageAnalysisBestEffort");
    expect(dashboardPhotos).not.toContain("registerRestaurantImageForAnalysis");
    expect(dashboardPhotos).toContain('bucket="restaurant-images"');
    expect(dashboardPhotos).toContain("pathPrefix={selectedId}");
    expect(imageUpload).toContain("pathPrefix?: string");
    expect(imageUpload).toContain("createImagePath(pathPrefix || userData.user.id, file)");
  });

  it("provides immediate free contextual SEO metadata and global public search", () => {
    const migration = readProjectFile("supabase/migrations/20260712014949_actualites_image_indexing_security.sql");

    expect(migration).toContain("'provider', 'contextual'");
    expect(migration).toContain("'visual_analysis_available_via', jsonb_build_array('ollama')");
    expect(migration).not.toMatch(/openai/i);
    expect(migration).toContain("UPDATE public.social_post_media");
    expect(migration).toContain("SET alt_text = alt_text");
    expect(migration).toContain("v_body := regexp_replace(coalesce(v_post.body, ''), '#[[:alnum:]_]+'");
    expect(migration).toContain("v_alt_text := regexp_replace(v_alt_text, '#[[:alnum:]_]+'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.search_actualites_posts");
    expect(migration).toContain("p.visibility = 'public'");
    expect(migration).toContain("websearch_to_tsquery('french'");
    expect(migration).toContain("extensions.unaccent");
    expect(migration).toContain("similarity(");
    expect(migration).toContain("strpos(lower(extensions.unaccent");
    expect(migration).not.toContain("LIKE '%' || v_query_unaccented");
    expect(migration).toContain("count(*) OVER () AS match_count");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.search_actualites_posts(text, integer, integer) TO anon, authenticated");
    expect(migration).toContain("CREATE POLICY \"restaurant_images_public_actualites_select\"");
    expect(migration).toContain("CREATE POLICY \"social_media_public_select\"");
  });

  it("keeps contextual results searchable while Ollama retries and finalizes all rows atomically", () => {
    const migration = readProjectFile("supabase/migrations/20260712014949_actualites_image_indexing_security.sql");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.fail_image_analysis_job");
    expect(migration).toContain("WHEN v_contextual THEN 'completed'");
    expect(migration).toContain("WHEN coalesce(i.ai_metadata ->> 'provider', 'contextual') = 'contextual'");
    expect(migration).toContain("CREATE FUNCTION public.complete_image_analysis_job");
    expect(migration).toContain("completed_image_id uuid");
    expect(migration).toContain("GET DIAGNOSTICS v_row_count = ROW_COUNT");
    expect(migration).toContain("social_post_media_completion_failed");
    expect(migration).toContain("restaurant_media_completion_failed");
    expect(migration).toContain("image_analysis_job_completion_failed");
    expect(migration).toContain("RETURN QUERY SELECT p_image_id, v_media_id, 'completed'::text");
    expect(migration).toContain("coalesce((SELECT auth.role()), '') <> 'service_role'");
    expect(migration).toContain("IF NEW.storage_bucket = 'restaurant-images' THEN");
    expect(migration).toContain("VALUES (v_image_id, 'completed', now())");
  });

  it("deploys a hardened, contextual-by-default Edge Function without trusting client paths", () => {
    const edgeFunction = readProjectFile("supabase/functions/analyze-restaurant-image/index.ts");

    expect(edgeFunction).toContain("authenticateRequest(req, { allowServiceRole: true, allowSchedulerSecret: true })");
    expect(edgeFunction).toContain('|| "contextual"');
    expect(edgeFunction).toContain("only_image_id_is_accepted");
    expect(edgeFunction).toContain("social_post_media_id,restaurant_media_id");
    expect(edgeFunction).toContain("loadTrustedImageContext");
    expect(edgeFunction).toContain("verified_media_source_required");
    expect(edgeFunction).toContain('provider: ANALYSIS_PROVIDER');
    expect(edgeFunction).toContain("estimated_cost_chf: ANALYSIS_PROVIDER === \"openai\"");
    expect(edgeFunction).toContain("image_analysis_completion_not_confirmed");
    expect(edgeFunction).not.toContain("syncActualitesMediaMetadata");
    expect(edgeFunction).not.toContain("image.source_context");
    expect(edgeFunction).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("ships a self-hosted Ollama worker with strict validation and no paid API dependency", () => {
    const packageJson = readProjectFile("workers/image-ai-worker/package.json");
    const envExample = readProjectFile("workers/image-ai-worker/.env.example");
    const config = readProjectFile("workers/image-ai-worker/config.js");
    const worker = readProjectFile("workers/image-ai-worker/index.js");
    const metadata = readProjectFile("workers/image-ai-worker/metadata.js");
    const ollama = readProjectFile("workers/image-ai-worker/ollama.js");
    const dockerfile = readProjectFile("workers/image-ai-worker/Dockerfile");
    const compose = readProjectFile("workers/image-ai-worker/docker-compose.yml");
    const readme = readProjectFile("workers/image-ai-worker/README.md");

    expect(packageJson).toContain('"test": "node --test *.test.mjs"');
    expect(envExample).toContain("OLLAMA_VISION_MODEL=qwen2.5vl:3b");
    expect(envExample).toContain("OLLAMA_EMBEDDING_MODEL=all-minilm");
    expect(config).toContain('"http://127.0.0.1:11434"');
    expect(worker).toContain('provider: "ollama"');
    expect(worker).toContain("estimated_cost_chf: 0");
    expect(worker).toContain('rpc("claim_image_analysis_jobs"');
    expect(worker).toContain('rpc("complete_image_analysis_job"');
    expect(worker).toContain('rpc("fail_image_analysis_job"');
    expect(worker).toContain("completion_status");
    expect(metadata).toContain("additionalProperties: false");
    expect(metadata).toContain("detectImageMime");
    expect(metadata).toContain("validateClaimAgainstImage");
    expect(metadata).toContain("alt_text must be a natural description without hashtags");
    expect(ollama).toContain("/api/generate");
    expect(ollama).toContain("/api/embed");
    expect(ollama).toContain("/api/embeddings");
    expect(dockerfile).toContain("USER node");
    expect(compose).toContain("model-init:");
    expect(compose).toContain("condition: service_completed_successfully");
    expect(readme).toContain("sans API d’IA payante");
    expect(readme).toContain("/readyz");
  });
});
