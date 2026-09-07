from pathlib import Path


def replace_required(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text()
    if old not in source:
        raise SystemExit(f"missing contract marker in {path}: {old[:140]!r}")
    target.write_text(source.replace(old, new, 1))


replace_required(
    "src/test/ai-gallery-print-media-contract.test.ts",
    "    expect(governance).toContain('storage.from(\"restaurant-images\").upload(targetPath');",
    "    expect(governance).toContain('storage.from(\"restaurant-images\").upload(');\n"
    "    expect(governance).toContain('targetPath,');",
)

photo_test = Path("src/test/photo-studio-persistence.test.ts")
source = photo_test.read_text()

old_const = '  const aiImageFunction = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-enhance/index.ts"), "utf8");'
new_const = old_const + '\n  const mediaGovernance = readFileSync(resolve(process.cwd(), "supabase/functions/restaurant-media-governance/index.ts"), "utf8");'
if old_const not in source:
    raise SystemExit("photo persistence governance const marker missing")
source = source.replace(old_const, new_const, 1)

old_gallery_test = '''  it("adds generated images to the gallery through a stable public gallery URL", () => {
    expect(source).toContain("result.gallery_image_url");
    expect(source).toContain("media_url: result.gallery_image_url");
    expect(source).toContain("storage_bucket: result.gallery_storage_bucket");
    expect(source).toContain("storage_path: result.gallery_storage_path");
    expect(source).toContain("metadata: buildRestaurantMediaAiMetadata");
    expect(source).not.toContain("media_url: result.generated_image_url");
  });'''
new_gallery_test = '''  it("adds generated images to the gallery through the governed server adoption path", () => {
    expect(source).toContain("addAiCreationToRestaurantGallery");
    expect(source).toContain("assetId: result.assetId");
    expect(source).not.toContain('supabase.from("restaurant_media").insert({');
    expect(mediaGovernance).toContain('action === "add_ai_creation_to_gallery"');
    expect(mediaGovernance).toContain('storage_bucket: RESTAURANT_MEDIA_BUCKET');
    expect(mediaGovernance).toContain('storage_path: targetPath');
    expect(mediaGovernance).toContain('gallery_image_url: galleryImageUrl');
    expect(source).not.toContain("media_url: result.generated_image_url");
  });'''
if old_gallery_test not in source:
    raise SystemExit("photo persistence gallery test marker missing")
source = source.replace(old_gallery_test, new_gallery_test, 1)

old_metadata = '    expect(aiCreationsGallery).toContain("metadata: buildRestaurantMediaAiMetadata");'
new_metadata = '''    expect(mediaGovernance).toContain("metadata: mediaMetadata");
    expect(mediaGovernance).toContain("generated_asset_id: asset.id");
    expect(mediaGovernance).toContain("ai_model: asset.model");
    expect(mediaGovernance).toContain("tok_watermark_required: tokWatermarkRequired");'''
if old_metadata not in source:
    raise SystemExit("photo persistence metadata marker missing")
source = source.replace(old_metadata, new_metadata, 1)

old_creation_contract = '''    expect(aiCreationsGallery).toContain('from("restaurant_media").insert');
    expect(aiCreationsGallery).toContain("media_url: imageUrl");
    expect(aiCreationsGallery).toContain('media_type: "photo_ai_tok"');'''
new_creation_contract = '''    expect(aiCreationsGallery).toContain("addAiCreationToRestaurantGallery");
    expect(aiCreationsGallery).toContain("assetId");
    expect(aiCreationsGallery).not.toContain('from("restaurant_media").insert');
    expect(mediaGovernance).toContain('.from("restaurant_media")');
    expect(mediaGovernance).toContain('.insert({');
    expect(mediaGovernance).toContain('media_type: "photo_ai_tok"');'''
if old_creation_contract not in source:
    raise SystemExit("photo persistence creation contract marker missing")
source = source.replace(old_creation_contract, new_creation_contract, 1)

photo_test.write_text(source)
