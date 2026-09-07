import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("TOK AI gallery storage contract", () => {
  it("stores new public AI gallery copies in the governed restaurant-images namespace", () => {
    const edge = readProjectFile("supabase/functions/ai-image-enhance/index.ts");

    expect(edge).toContain('TOK_GALLERY_IMAGE_BUCKET")?.trim() || "restaurant-images"');
    expect(edge).toContain('const galleryPath = `${restaurantId}/ai-gallery/${id}.png`;');
    expect(edge).toContain("storage.from(GALLERY_BUCKET).upload(galleryPath");
  });

  it("adopts legacy generated assets through the server before inserting restaurant_media", () => {
    const governance = readProjectFile("supabase/functions/restaurant-media-governance/index.ts");
    const galleryClient = readProjectFile("src/lib/ai/restaurantGallery.ts");
    const creations = readProjectFile("src/components/dashboard/AiCreationsGallery.tsx");
    const photoPro = readProjectFile("src/components/dashboard/TokAiPhotoStudioV2.tsx");

    expect(governance).toContain('action === "add_ai_creation_to_gallery"');
    expect(governance).toContain('.from("ai_generated_assets")');
    expect(governance).toContain('storage.from(sourceBucket).download(sourcePath)');
    expect(governance).toContain('storage.from("restaurant-images").upload(');
    expect(governance).toContain('targetPath,');
    expect(governance).toContain('.from("restaurant_media")');
    expect(governance).toContain('.insert({');
    expect(governance).toContain('targetPath = `${restaurantId}/ai-gallery/${assetId}.png`');

    expect(galleryClient).toContain('invokeSupabaseFunction<AddAiCreationToGalleryResult>');
    expect(galleryClient).toContain('"restaurant-media-governance"');
    expect(galleryClient).toContain('action: "add_ai_creation_to_gallery"');
    expect(creations).toContain("addAiCreationToRestaurantGallery");
    expect(photoPro).toContain("addAiCreationToRestaurantGallery");
    expect(creations).not.toContain('supabase.from("restaurant_media").insert({');
    expect(photoPro).not.toContain('supabase.from("restaurant_media").insert({');
  });
});

describe("TheTok Print AI creation discovery", () => {
  it("loads persisted AI generations as printable assets without requiring gallery publication first", () => {
    const composer = readProjectFile("src/components/dashboard/marketing-print/PrintComposerDialog.tsx");

    expect(composer).toContain('(supabase.from as any)("ai_generated_assets")');
    expect(composer).toContain('metadata->>gallery_storage_bucket');
    expect(composer).toContain('metadata->>gallery_storage_path');
    expect(composer).toContain("mergePrintableAssets");
    expect(composer).toContain("restaurantMediaAssets");
    expect(composer).toContain("generatedAssets");
  });
});
