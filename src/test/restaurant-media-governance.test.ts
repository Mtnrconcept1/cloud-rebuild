import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function findMigration() {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const candidate = readdirSync(migrationsDir)
    .filter((file) => file.endsWith("_restaurant_media_governance.sql"))
    .sort()
    .at(-1);

  expect(candidate, "restaurant media governance migration should exist").toBeTruthy();
  const path = resolve(migrationsDir, candidate || "");
  expect(existsSync(path), "restaurant media governance migration should be readable").toBe(true);
  return readFileSync(path, "utf8");
}

describe("restaurant media governance", () => {
  it("moves cover selection to an atomic RPC instead of three frontend writes", () => {
    const dashboardPhotos = read("src/pages/dashboard/DashboardPhotos.tsx");
    const client = read("src/lib/restaurantMediaGovernance.ts");
    const migration = findMigration();

    expect(client).toContain("restaurant_set_cover_media");
    expect(dashboardPhotos).toContain("setRestaurantCoverMedia");
    expect(dashboardPhotos).not.toMatch(/from\("restaurant_media"\)\.update\(\{\s*is_cover:\s*false\s*\}/);
    expect(dashboardPhotos).not.toMatch(/from\("restaurant_media"\)\.update\(\{\s*is_cover:\s*true\s*\}/);
    expect(dashboardPhotos).not.toMatch(/from\("restaurants"\)\.update\(\{\s*image_url:/);

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.restaurant_set_cover_media");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("UPDATE public.restaurant_media");
    expect(migration).toContain("UPDATE public.restaurants");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.restaurant_set_cover_media(uuid) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.restaurant_set_cover_media(uuid) TO authenticated");
  });

  it("deletes owned gallery metadata through an Edge Function and removes the Storage object server-side", () => {
    const dashboardPhotos = read("src/pages/dashboard/DashboardPhotos.tsx");
    const client = read("src/lib/restaurantMediaGovernance.ts");
    const edgeFunction = read("supabase/functions/restaurant-media-governance/index.ts");
    const config = read("supabase/config.toml");
    const migration = findMigration();

    expect(config).toContain("[functions.restaurant-media-governance]");
    expect(config).toMatch(
      /\[functions\.restaurant-media-governance\]\s+verify_jwt\s*=\s*false/i,
    );
    expect(client).toContain('"restaurant-media-governance"');
    expect(client).toContain('action: "delete_media"');
    expect(dashboardPhotos).toContain("deleteRestaurantMedia");
    expect(dashboardPhotos).not.toContain('from("restaurant_media").delete()');
    expect(dashboardPhotos).not.toMatch(/from\("restaurants"\)\.update\(\{\s*image_url:\s*null\s*\}/);

    expect(edgeFunction).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(edgeFunction).toContain("restaurant_delete_media_metadata");
    expect(edgeFunction).toContain("isStorageCleanupAllowed");
    expect(edgeFunction).toContain("storagePath.startsWith");
    expect(edgeFunction).toContain("storage.from(storageBucket).remove([storagePath])");
    expect(edgeFunction).toContain("if (storageBucket && storagePath && shouldRemoveStorage)");
    expect(edgeFunction).toContain("writeAuditLog");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.restaurant_delete_media_metadata");
    expect(migration).toContain("DELETE FROM public.restaurant_media");
    expect(migration).toContain("storage_bucket");
    expect(migration).toContain("storage_path");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.restaurant_delete_media_metadata(uuid) TO authenticated");
  });

  it("persists upload storage metadata for raw and generated gallery photos", () => {
    const imageUpload = read("src/components/ImageUpload.tsx");
    const dashboardPhotos = read("src/pages/dashboard/DashboardPhotos.tsx");
    const photoStudio = read("src/components/dashboard/TokAiPhotoStudioV2.tsx");
    const aiClient = read("src/lib/ai/tokAiClient.ts");
    const aiFunction = read("supabase/functions/ai-image-enhance/index.ts");
    const governance = read("supabase/functions/restaurant-media-governance/index.ts");
    const types = read("src/integrations/supabase/types.ts");
    const migration = findMigration();

    expect(imageUpload).toContain("storageBucket");
    expect(imageUpload).toContain("storagePath");
    expect(imageUpload).toContain("onChange(data.publicUrl, { storageBucket: bucket, storagePath: filePath })");
    expect(dashboardPhotos).toContain("storage_bucket");
    expect(dashboardPhotos).toContain("storage_path");
    expect(photoStudio).toContain("addAiCreationToRestaurantGallery");
    expect(photoStudio).not.toContain('supabase.from("restaurant_media").insert({');
    expect(governance).toContain("storage_bucket: RESTAURANT_MEDIA_BUCKET");
    expect(governance).toContain("storage_path: targetPath");
    expect(governance).toContain("gallery_storage_bucket: RESTAURANT_MEDIA_BUCKET");
    expect(governance).toContain("gallery_storage_path: targetPath");
    expect(aiClient).toContain("gallery_storage_bucket: string | null");
    expect(aiClient).toContain("gallery_storage_path: string | null");
    expect(aiFunction).toContain("gallery_storage_bucket: generated?.gallery_storage_bucket");
    expect(aiFunction).toContain("gallery_storage_path: generated?.gallery_storage_path");
    expect(types).toContain("storage_bucket: string | null");
    expect(types).toContain("storage_path: string | null");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS storage_bucket text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS storage_path text");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
