import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  const absolutePath = resolve(process.cwd(), path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("restaurant image metadata AI pipeline", () => {
  it("adds an asynchronous Supabase image analysis schema with strict RLS and worker RPCs", () => {
    const migration = readProjectFile("supabase/migrations/20260706192000_image_metadata_ai.sql");

    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(migration).toContain("INSERT INTO storage.buckets");
    expect(migration).toContain("'restaurant-images'");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_images");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.image_analysis_jobs");
    expect(migration).toContain("source_type text NOT NULL DEFAULT 'restaurant_gallery'");
    expect(migration).toContain("CHECK (source_type IN ('restaurant_gallery', 'actualites', 'marketing', 'other'))");
    expect(migration).toContain("source_table text");
    expect(migration).toContain("source_id uuid");
    expect(migration).toContain("source_context jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS restaurant_images_source_idx");
    expect(migration).toContain("search_text text NOT NULL DEFAULT ''");
    expect(migration).toContain("search_vector tsvector NOT NULL DEFAULT ''::tsvector");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.update_restaurant_images_search_fields");
    expect(migration).toContain("CREATE TRIGGER update_restaurant_images_search_fields_on_change");
    expect(migration).toContain("USING gin (search_vector)");
    expect(migration).toContain("USING hnsw (embedding extensions.vector_cosine_ops)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.claim_image_analysis_jobs");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.complete_image_analysis_job");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.fail_image_analysis_job");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.search_restaurant_images");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.match_restaurant_images");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.claim_image_analysis_jobs(text, integer) TO service_role");
    expect(migration).toContain("ALTER TABLE public.restaurant_images ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.image_analysis_jobs ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("public.auth_owns_restaurant(restaurant_id)");
    expect(migration).toContain("public.auth_is_admin()");
    expect(migration).not.toContain("WITH CHECK (true)");
  });

  it("exposes safe frontend helpers without leaking service-role credentials", () => {
    const uploadHelper = readProjectFile("src/lib/uploadRestaurantImage.ts");
    const searchHelper = readProjectFile("src/lib/searchRestaurantImages.ts");
    const dashboardPhotos = readProjectFile("src/pages/dashboard/DashboardPhotos.tsx");
    const socialFeedHook = readProjectFile("src/hooks/useSocialFeed.ts");

    expect(uploadHelper).toContain("assertSafeFileUpload");
    expect(uploadHelper).toContain("MAX_IMAGE_UPLOAD_BYTES");
    expect(uploadHelper).toContain("RESTAURANT_IMAGE_BUCKET");
    expect(uploadHelper).toContain('.from("restaurant_images")');
    expect(uploadHelper).toContain(".upsert");
    expect(uploadHelper).toContain("sourceType = \"restaurant_gallery\"");
    expect(uploadHelper).toContain("source_type: sourceType");
    expect(uploadHelper).toContain("source_context: sourceContext || {}");
    expect(uploadHelper).toContain('analysis_status: "pending"');
    expect(uploadHelper).not.toContain("SERVICE_ROLE");
    expect(uploadHelper).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    expect(searchHelper).toContain('rpc("search_restaurant_images"');
    expect(searchHelper).toContain('rpc("match_restaurant_images"');
    expect(dashboardPhotos).toContain("registerRestaurantImageForAnalysis");
    expect(socialFeedHook).toContain("registerActualitesImageAnalysisBestEffort");
    expect(socialFeedHook).toContain("ANALYZABLE_SOCIAL_IMAGE_MIME_TYPES");
    expect(socialFeedHook).toContain("sourceType: \"actualites\"");
    expect(socialFeedHook).toContain("sourceTable: \"social_posts\"");
    expect(socialFeedHook).toContain("sourceId: postId");
    expect(socialFeedHook).toContain("Actualites image analysis registration skipped");
  });

  it("adds a separate Ollama worker that claims, completes and fails jobs through service RPCs", () => {
    const rootPackageJson = readProjectFile("package.json");
    const workspace = readProjectFile("pnpm-workspace.yaml");
    const packageJson = readProjectFile("workers/image-ai-worker/package.json");
    const envExample = readProjectFile("workers/image-ai-worker/.env.example");
    const worker = readProjectFile("workers/image-ai-worker/index.js");
    const readinessCheck = readProjectFile("workers/image-ai-worker/check.mjs");
    const readme = readProjectFile("workers/image-ai-worker/README.md");

    expect(rootPackageJson).toContain('"image-ai-worker:check"');
    expect(rootPackageJson).toContain('"image-ai-worker:start"');
    expect(workspace).toContain('"workers/image-ai-worker"');
    expect(packageJson).toContain('"packageManager": "pnpm@10.28.1"');
    expect(packageJson).toContain('"check": "node check.mjs"');
    expect(packageJson).toContain('"@supabase/supabase-js"');
    expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY");
    expect(envExample).toContain("OLLAMA_VISION_MODEL=llava");
    expect(readinessCheck).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(readinessCheck).toContain("/api/tags");
    expect(readinessCheck).not.toContain("console.log(SUPABASE_SERVICE_ROLE_KEY");
    expect(readme).toContain("pnpm image-ai-worker:check");
    expect(readme).toContain("pnpm image-ai-worker:start");
    expect(worker).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(worker).toContain('persistSession: false');
    expect(worker).toContain('rpc("claim_image_analysis_jobs"');
    expect(worker).toContain('rpc("complete_image_analysis_job"');
    expect(worker).toContain('rpc("fail_image_analysis_job"');
    expect(worker).toContain("/api/generate");
    expect(worker).toContain("/api/embeddings");
    expect(worker).toContain(".download(storagePath)");
    expect(worker).toContain("result.embedding.length !== 384");
  });
});
