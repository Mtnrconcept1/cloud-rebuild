from pathlib import Path


def replace_required(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text()
    if old not in source:
        raise SystemExit(f"missing marker in {path}: {old[:160]!r}")
    target.write_text(source.replace(old, new, 1))


replace_required(
    "src/test/commercial-demo-ai-workspaces.test.ts",
    '''    expect(photoStudio.indexOf("if (isCommercialDemo && commercialDemoFrame)", photoStudio.indexOf("const addToGallery")))
      .toBeLessThan(photoStudio.indexOf('.from("restaurant_media")', photoStudio.indexOf("const addToGallery")));''',
    '''    const addToGalleryStart = photoStudio.indexOf("const addToGallery");
    const demoGalleryBranch = photoStudio.indexOf("if (isCommercialDemo && commercialDemoFrame)", addToGalleryStart);
    const governedGalleryCall = photoStudio.indexOf("addAiCreationToRestaurantGallery", addToGalleryStart);
    expect(demoGalleryBranch).toBeGreaterThanOrEqual(0);
    expect(governedGalleryCall).toBeGreaterThanOrEqual(0);
    expect(demoGalleryBranch).toBeLessThan(governedGalleryCall);
    expect(photoStudio).not.toContain('supabase.from("restaurant_media").insert({');''',
)

media_test = Path("src/test/restaurant-media-governance.test.ts")
source = media_test.read_text()
old_const = '    const aiFunction = read("supabase/functions/ai-image-enhance/index.ts");'
new_const = old_const + '\n    const governance = read("supabase/functions/restaurant-media-governance/index.ts");'
if old_const not in source:
    raise SystemExit("restaurant media governance const marker missing")
source = source.replace(old_const, new_const, 1)
old_assertions = '''    expect(photoStudio).toContain("gallery_storage_bucket");
    expect(photoStudio).toContain("gallery_storage_path");'''
new_assertions = '''    expect(photoStudio).toContain("addAiCreationToRestaurantGallery");
    expect(photoStudio).not.toContain('supabase.from("restaurant_media").insert({');
    expect(governance).toContain("storage_bucket: RESTAURANT_MEDIA_BUCKET");
    expect(governance).toContain("storage_path: targetPath");
    expect(governance).toContain("gallery_storage_bucket: RESTAURANT_MEDIA_BUCKET");
    expect(governance).toContain("gallery_storage_path: targetPath");'''
if old_assertions not in source:
    raise SystemExit("restaurant media governance photoStudio assertions missing")
source = source.replace(old_assertions, new_assertions, 1)
media_test.write_text(source)
