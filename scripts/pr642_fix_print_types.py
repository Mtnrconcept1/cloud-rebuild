from pathlib import Path

path = Path("src/components/dashboard/marketing-print/PrintComposerDialog.tsx")
source = path.read_text()

marker = '''type PrintableAsset = {
  id: string;
  name: string;
  url: string;
  widthPx: number;
  heightPx: number;
  mimeType: "image/jpeg" | "image/png";
  createdAt: string;
  sourceGenerationId: string | null;
  dedupeKey: string;
};
'''
replacement = marker + '''
type GeneratedAssetPrintRow = {
  id: string;
  asset_url: string | null;
  title: string | null;
  asset_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
  gallery_storage_bucket: string | null;
  gallery_storage_path: string | null;
};

function readGeneratedAssetId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).generated_asset_id;
  return typeof value === "string" && value ? value : null;
}
'''
if marker not in source:
    raise SystemExit("PrintableAsset marker missing")
source = source.replace(marker, replacement, 1)

old_queries = '''    supabase
      .from("restaurant_media")
      .select("id, media_url, alt_text, media_type, storage_bucket, storage_path, created_at, generated_asset_id:metadata->>generated_asset_id")
      .eq("restaurant_id", restaurantId)
      .in("media_type", ["photo_ai_tok", "marketing_brand_visual", "photo"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("ai_generated_assets")
      .select("id, asset_url, title, asset_type, storage_bucket, storage_path, created_at, gallery_storage_bucket:metadata->>gallery_storage_bucket, gallery_storage_path:metadata->>gallery_storage_path")
      .eq("restaurant_id", restaurantId)
      .eq("status", "stored")
      .order("created_at", { ascending: false })
      .limit(30),
'''
new_queries = '''    supabase
      .from("restaurant_media")
      .select("id, media_url, alt_text, media_type, storage_bucket, storage_path, created_at, metadata")
      .eq("restaurant_id", restaurantId)
      .in("media_type", ["photo_ai_tok", "marketing_brand_visual", "photo"])
      .order("created_at", { ascending: false })
      .limit(30),
    (supabase.from as any)("ai_generated_assets")
      .select("id, asset_url, title, asset_type, storage_bucket, storage_path, created_at, gallery_storage_bucket:metadata->>gallery_storage_bucket, gallery_storage_path:metadata->>gallery_storage_path")
      .eq("restaurant_id", restaurantId)
      .eq("status", "stored")
      .order("created_at", { ascending: false })
      .limit(30),
'''
if old_queries not in source:
    raise SystemExit("print query marker missing")
source = source.replace(old_queries, new_queries, 1)

old_media = '''  const restaurantMediaAssets = (await Promise.all((restaurantMediaResult.data || []).map(async (row) =>
    materializePrintableAsset({
      id: `media:${row.id}`,
      sourceGenerationId: typeof row.generated_asset_id === "string" ? row.generated_asset_id : null,
      name: row.alt_text || (row.media_type === "photo_ai_tok" ? "Création IA" : "Visuel restaurant"),
      mediaUrl: typeof row.media_url === "string" ? row.media_url : "",
      storageBucket: typeof row.storage_bucket === "string" ? row.storage_bucket : "",
      storagePath: typeof row.storage_path === "string" ? row.storage_path : "",
      createdAt: row.created_at,
      dedupeKey: typeof row.generated_asset_id === "string" && row.generated_asset_id ? `ai:${row.generated_asset_id}` : `media:${row.storage_bucket || ""}:${row.storage_path || row.id}`,
    })
  ))).filter((asset): asset is PrintableAsset => Boolean(asset));

  const generatedAssets = (await Promise.all((generatedResult.data || []).map(async (row) => {
'''
new_media = '''  const restaurantMediaAssets = (await Promise.all((restaurantMediaResult.data || []).map(async (row) => {
    const generatedAssetId = readGeneratedAssetId(row.metadata);
    return materializePrintableAsset({
      id: `media:${row.id}`,
      sourceGenerationId: generatedAssetId,
      name: row.alt_text || (row.media_type === "photo_ai_tok" ? "Création IA" : "Visuel restaurant"),
      mediaUrl: typeof row.media_url === "string" ? row.media_url : "",
      storageBucket: typeof row.storage_bucket === "string" ? row.storage_bucket : "",
      storagePath: typeof row.storage_path === "string" ? row.storage_path : "",
      createdAt: row.created_at,
      dedupeKey: generatedAssetId ? `ai:${generatedAssetId}` : `media:${row.storage_bucket || ""}:${row.storage_path || row.id}`,
    });
  }))).filter((asset): asset is PrintableAsset => Boolean(asset));

  const generatedRows = (generatedResult.data || []) as GeneratedAssetPrintRow[];
  const generatedAssets = (await Promise.all(generatedRows.map(async (row) => {
'''
if old_media not in source:
    raise SystemExit("print media mapping marker missing")
source = source.replace(old_media, new_media, 1)

path.write_text(source)
