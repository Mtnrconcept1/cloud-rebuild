from pathlib import Path

jobs_path = Path("src/lib/ai/aiCreationJobs.ts")
gallery_path = Path("src/components/dashboard/AiCreationsGallery.tsx")

jobs = jobs_path.read_text(encoding="utf-8")
gallery = gallery_path.read_text(encoding="utf-8")

old_row = '''// Columns read back from public.ai_generated_assets when recovering a lost job.
type StoredAssetRow = {
  id: string;
  asset_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  asset_type: string | null;
  model: string | null;
  title: string | null;
  created_at: string;
};'''
new_row = '''// Columns read back from public.ai_generated_assets when recovering a lost job
// or hydrating the durable Mes créations history.
type StoredAssetMetadata = {
  generation_seed?: unknown;
  marketing_asset_mode?: unknown;
  original_prompt?: unknown;
  format?: unknown;
  output_resolution?: unknown;
  gallery_storage_bucket?: unknown;
  gallery_storage_path?: unknown;
  dish_name?: unknown;
  tool?: unknown;
};

type StoredAssetRow = {
  id: string;
  user_id?: string | null;
  restaurant_id?: string | null;
  asset_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  asset_type: string | null;
  model: string | null;
  prompt?: string | null;
  title: string | null;
  status?: string | null;
  metadata?: StoredAssetMetadata | null;
  created_at: string;
};'''
if old_row not in jobs:
    raise SystemExit("StoredAssetRow anchor not found")
jobs = jobs.replace(old_row, new_row, 1)

history_impl = r'''
function readStoredMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferStoredAiCreationTool(asset: StoredAssetRow, metadata: StoredAssetMetadata): AiCreationTool {
  if (metadata.marketing_asset_mode === true) return "marketing_studio";
  if (metadata.tool === "marketing_studio" || metadata.tool === "photopro" || metadata.tool === "menu_photo" || metadata.tool === "advisor_photo") {
    return metadata.tool;
  }
  if (asset.asset_type === "menu_visual") return "photopro";
  return "unknown";
}

function buildPersistedAiCreationRecord(asset: StoredAssetRow): AiCreationRecord | null {
  const assetUrl = asset.asset_url?.trim() || "";
  const restaurantId = asset.restaurant_id?.trim() || "";
  if (!asset.id || !assetUrl || !restaurantId) return null;

  const metadata = asset.metadata || {};
  const prompt = asset.prompt?.trim() || readStoredMetadataString(metadata.original_prompt) || "";
  const title = readStoredMetadataString(metadata.dish_name) || asset.title?.trim() || "Création TOK";
  const generationSeed = readStoredMetadataString(metadata.generation_seed);
  const format = metadata.format === "square" || metadata.format === "portrait" || metadata.format === "landscape"
    ? metadata.format
    : undefined;
  const outputResolution = metadata.output_resolution === "web" || metadata.output_resolution === "studio" || metadata.output_resolution === "print"
    ? metadata.output_resolution
    : undefined;
  const imageModel = asset.model === "gpt-image-2" ? asset.model : undefined;
  const galleryStorageBucket = readStoredMetadataString(metadata.gallery_storage_bucket) || asset.storage_bucket;
  const galleryStoragePath = readStoredMetadataString(metadata.gallery_storage_path) || asset.storage_path;

  return {
    id: `persisted:${asset.id}`,
    restaurantId,
    userId: asset.user_id ?? null,
    tool: inferStoredAiCreationTool(asset, metadata),
    title,
    prompt,
    assetType: asset.asset_type as AiCreationRecord["assetType"],
    format,
    outputResolution,
    imageModel,
    generationSeed,
    sourceImageUrl: null,
    referenceImageUrls: [],
    referenceMediaIds: [],
    status: "completed",
    createdAt: asset.created_at,
    updatedAt: asset.created_at,
    completedAt: asset.created_at,
    originPathname: null,
    originContext: "server-history",
    errorMessage: null,
    galleryAdded: false,
    interrupted: false,
    result: {
      title,
      enhanced_prompt: prompt,
      edit_instructions: "",
      alt_text: title,
      publication_caption: "",
      checklist: [],
      style_tags: [],
      safety_notes: [],
      marketing_angles: [],
      assetId: asset.id,
      generated_image_url: asset.asset_url,
      gallery_image_url: asset.asset_url,
      storage_bucket: asset.storage_bucket ?? null,
      storage_path: asset.storage_path ?? null,
      gallery_storage_bucket: galleryStorageBucket ?? null,
      gallery_storage_path: galleryStoragePath ?? null,
      model: asset.model || "",
      created_at: asset.created_at,
      generation_seed: generationSeed,
      reference_folder: "",
      status: "stored",
    },
  };
}

export async function loadPersistedAiCreationRecords(input: {
  restaurantId?: string | null;
  userId?: string | null;
} = {}) {
  const restaurantId = input.restaurantId?.trim() || "";
  if (!restaurantId) return [];
  if (isCommercialDemoStorageKey(getAiCreationsStorageKey())) return [];

  const { data, error } = await getSupabase()
    .from("ai_generated_assets" as never)
    .select("id, user_id, restaurant_id, asset_url, storage_bucket, storage_path, asset_type, model, prompt, title, status, metadata, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "stored")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error || !Array.isArray(data)) return [];

  return (data as unknown as StoredAssetRow[])
    .map((asset) => buildPersistedAiCreationRecord(asset))
    .filter((record): record is AiCreationRecord => Boolean(record));
}

export function mergeAiCreationRecordSources(
  localRecords: AiCreationRecord[],
  persistedRecords: AiCreationRecord[],
) {
  const localAssetIds = new Set(
    localRecords
      .map((record) => record.result?.assetId)
      .filter((assetId): assetId is string => Boolean(assetId)),
  );
  const serverOnlyRecords = persistedRecords.filter((persisted) => {
    const persistedAssetId = persisted.result?.assetId;
    return !persistedAssetId || !localAssetIds.has(persistedAssetId);
  });

  return sortRecords([...localRecords, ...serverOnlyRecords]).slice(0, 120);
}
'''
marker = '\n}\n\n/**\n * Re-attaches images the Edge Function stored while the browser was away.'
if marker not in jobs:
    raise SystemExit("history insertion anchor not found")
jobs = jobs.replace(marker, '\n}\n\n' + history_impl + '\n/**\n * Re-attaches images the Edge Function stored while the browser was away.', 1)

old_import = '''  getAiCreationImageUrl,
  getAiCreationRecords,
  markAiCreationAddedToGallery,
  subscribeAiCreationRecords,'''
new_import = '''  getAiCreationImageUrl,
  getAiCreationRecords,
  loadPersistedAiCreationRecords,
  markAiCreationAddedToGallery,
  mergeAiCreationRecordSources,
  subscribeAiCreationRecords,'''
if old_import not in gallery:
    raise SystemExit("gallery import anchor not found")
gallery = gallery.replace(old_import, new_import, 1)

old_state = '''  const { toast } = useToast();
  const [records, setRecords] = useState<AiCreationRecord[]>(() => getAiCreationRecords());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<AiCreationRecord | null>(null);

  useEffect(() => subscribeAiCreationRecords(setRecords), []);

  // Leaving the app aborts an in-flight generation, but the Edge Function still
  // stores the visual and charges the credits. Re-attach those so a paid image is
  // never silently lost.
  useAiCreationRecovery(restaurantId, userId);

  const restaurantRecords = useMemo(() => {
    if (!restaurantId) return [];
    return records.filter((record) => record.restaurantId === restaurantId);
  }, [records, restaurantId]);'''
new_state = '''  const { toast } = useToast();
  const [localRecords, setLocalRecords] = useState<AiCreationRecord[]>(() => getAiCreationRecords());
  const [persistedRecords, setPersistedRecords] = useState<AiCreationRecord[]>([]);
  const [persistedLoading, setPersistedLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<AiCreationRecord | null>(null);

  useEffect(() => subscribeAiCreationRecords(setLocalRecords), []);

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) {
      setPersistedRecords([]);
      setPersistedLoading(false);
      return () => { cancelled = true; };
    }

    setPersistedLoading(true);
    void loadPersistedAiCreationRecords({ restaurantId, userId })
      .then((nextRecords) => {
        if (!cancelled) setPersistedRecords(nextRecords);
      })
      .finally(() => {
        if (!cancelled) setPersistedLoading(false);
      });

    return () => { cancelled = true; };
  }, [restaurantId, userId]);

  // Leaving the app aborts an in-flight generation, but the Edge Function still
  // stores the visual and charges the credits. Re-attach those so a paid image is
  // never silently lost.
  useAiCreationRecovery(restaurantId, userId);

  const records = useMemo(
    () => mergeAiCreationRecordSources(localRecords, persistedRecords),
    [localRecords, persistedRecords],
  );
  const localRecordIds = useMemo(() => new Set(localRecords.map((record) => record.id)), [localRecords]);
  const restaurantRecords = useMemo(() => {
    if (!restaurantId) return [];
    return records.filter((record) => record.restaurantId === restaurantId);
  }, [records, restaurantId]);'''
if old_state not in gallery:
    raise SystemExit("gallery state anchor not found")
gallery = gallery.replace(old_state, new_state, 1)

gallery = gallery.replace('''      markAiCreationAddedToGallery(record.id);
      onGalleryUpdated();''', '''      if (localRecordIds.has(record.id)) {
        markAiCreationAddedToGallery(record.id);
      } else {
        setPersistedRecords((current) => current.map((item) => (
          item.id === record.id ? { ...item, galleryAdded: true } : item
        )));
      }
      onGalleryUpdated();''', 1)

gallery = gallery.replace('''      {!restaurantRecords.length ? (''', '''      {!persistedLoading && !restaurantRecords.length ? (''', 1)

gallery = gallery.replace('''          const generationSeed = record.generationSeed || record.result?.generation_seed || "";

          return (''', '''          const generationSeed = record.generationSeed || record.result?.generation_seed || "";
          const isLocalRecord = localRecordIds.has(record.id);

          return (''', 1)

old_delete = '''                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => deleteCreation(record)}
                    disabled={addingId === record.id}
                    className="min-h-10 gap-2 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                    aria-label={`Supprimer ${record.title} de Mes creations`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>'''
new_delete = '''                  {isLocalRecord && !record.result?.assetId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => deleteCreation(record)}
                      disabled={addingId === record.id}
                      className="min-h-10 gap-2 border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                      aria-label={`Supprimer ${record.title} de Mes creations`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </Button>
                  ) : null}'''
if old_delete not in gallery:
    raise SystemExit("gallery delete button anchor not found")
gallery = gallery.replace(old_delete, new_delete, 1)

jobs_path.write_text(jobs, encoding="utf-8")
gallery_path.write_text(gallery, encoding="utf-8")
