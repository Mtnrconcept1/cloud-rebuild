import * as React from "react";

import {
  generateTokDishImage,
  type TokImageFormat,
  type TokImageGenerationRequest,
  type TokImageGenerationResult,
} from "@/lib/ai/tokAiClient";
import type { TokImageModel, TokImageOutputResolution } from "@/lib/ai/imagePricing";
import { formatAiImageGenerationError } from "@/lib/publicErrorMessages";
import { getCommercialDemoAiRuntime } from "@/lib/commercialDemoAi";
import { getSupabase } from "@/integrations/supabase/client";

export const AI_CREATION_COMPLETED_EVENT = "tok-ai-creation-completed";
export const AI_CREATION_FAILED_EVENT = "tok-ai-creation-failed";

const AI_CREATIONS_STORAGE_KEY = "tok-ai-creations-v1";

function getAiCreationsStorageKey() {
  const runtime = getCommercialDemoAiRuntime();
  return runtime
    ? `${AI_CREATIONS_STORAGE_KEY}:commercial-demo:${runtime.sessionId}:${runtime.surface}`
    : AI_CREATIONS_STORAGE_KEY;
}

function isCommercialDemoStorageKey(storageKey: string) {
  return storageKey.startsWith(`${AI_CREATIONS_STORAGE_KEY}:commercial-demo:`);
}

export type AiCreationTool =
  | "marketing_studio"
  | "photopro"
  | "menu_photo"
  | "advisor_photo"
  | "unknown";

export type AiCreationStatus = "running" | "completed" | "failed";

export type AiCreationRecord = {
  id: string;
  restaurantId: string;
  userId?: string | null;
  tool: AiCreationTool;
  title: string;
  prompt: string;
  assetType?: TokImageGenerationRequest["assetType"];
  format?: TokImageFormat;
  outputResolution?: TokImageOutputResolution;
  imageModel?: TokImageModel;
  generationSeed?: string | null;
  sourceImageUrl?: string | null;
  referenceImageUrls?: string[];
  referenceMediaIds?: string[];
  status: AiCreationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  originPathname?: string | null;
  originContext?: string | null;
  result?: TokImageGenerationResult | null;
  errorMessage?: string | null;
  galleryAdded?: boolean;
  // Set when the request was cut short by leaving the page rather than by a real
  // generation error: the Edge Function usually finished and stored the asset,
  // so the record stays eligible for recovery from the server.
  interrupted?: boolean;
};

type AiCreationListener = (records: AiCreationRecord[]) => void;

// Columns read back from public.ai_generated_assets when recovering a lost job
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
};

type StartAiCreationJobInput = {
  restaurantId: string;
  userId?: string | null;
  tool: AiCreationTool;
  title: string;
  request: TokImageGenerationRequest;
};

type AiCreationJob = {
  record: AiCreationRecord;
  promise: Promise<TokImageGenerationResult>;
};

const listeners = new Set<AiCreationListener>();
const activeJobs = new Map<string, Promise<TokImageGenerationResult>>();
let storageListenerReady = false;
let activeAiCreationContext: string | null = null;
let beforeUnloadListenerActive = false;
const STALE_RUNNING_THRESHOLD_MS = 10 * 60 * 1000;
const INTERRUPTED_MESSAGE = "La génération a été interrompue par un changement de page.";

function hasBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createAiCreationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `ai-creation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseStoredRecords(raw: string | null): AiCreationRecord[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === "string") : [];
  } catch {
    return [];
  }
}

function sortRecords(records: AiCreationRecord[]) {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function readRecords(storageKey = getAiCreationsStorageKey()) {
  if (!hasBrowserStorage()) return [];
  return sortRecords(parseStoredRecords(window.localStorage.getItem(storageKey)));
}

function writeRecords(records: AiCreationRecord[], storageKey = getAiCreationsStorageKey()) {
  if (!hasBrowserStorage()) return;
  const safeRecords = isCommercialDemoStorageKey(storageKey)
    ? records.map((record) => ({
      ...record,
      // Blob URLs and signed Storage URLs are transient bearer-like values.
      // Durable commercial visual history is restored from the Edge Function.
      sourceImageUrl: null,
      referenceImageUrls: [],
      referenceMediaIds: [],
      result: record.result
        ? {
          ...record.result,
          generated_image_url: null,
          gallery_image_url: null,
        }
        : record.result,
    }))
    : records;
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(sortRecords(safeRecords).slice(0, 120)),
  );
}

function emitRecords(storageKey = getAiCreationsStorageKey()) {
  // Listeners belong to the currently mounted surface. A late completion from
  // an unmounted commercial frame must update only its captured storage scope.
  if (storageKey !== getAiCreationsStorageKey()) return;
  const records = readRecords(storageKey);
  listeners.forEach((listener) => listener(records));
}

function ensureStorageListener() {
  if (storageListenerReady || typeof window === "undefined") return;
  storageListenerReady = true;
  window.addEventListener("storage", (event) => {
    if (event.key === getAiCreationsStorageKey()) emitRecords();
  });
}

function handleBeforeUnload(e: BeforeUnloadEvent) { e.preventDefault(); }

function syncBeforeUnloadListener() {
  if (typeof window === "undefined") return;
  const shouldBeActive = activeJobs.size > 0;
  if (shouldBeActive && !beforeUnloadListenerActive) {
    window.addEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadListenerActive = true;
  } else if (!shouldBeActive && beforeUnloadListenerActive) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadListenerActive = false;
  }
}

function reclaimStaleRunningRecords(storageKey = getAiCreationsStorageKey()) {
  const records = parseStoredRecords(
    hasBrowserStorage() ? window.localStorage.getItem(storageKey) : null,
  );
  const now = Date.now();
  let changed = false;
  const cleaned = records.map((record) => {
    if (record.status !== "running") return record;
    if (activeJobs.has(record.id)) return record;
    if (now - new Date(record.createdAt).getTime() < STALE_RUNNING_THRESHOLD_MS) return record;
    changed = true;
    return {
      ...record,
      status: "failed" as const,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      interrupted: true,
      errorMessage: INTERRUPTED_MESSAGE,
    };
  });
  if (changed) writeRecords(cleaned, storageKey);
}

function buildRecoveredResult(
  record: AiCreationRecord,
  asset: StoredAssetRow,
): TokImageGenerationResult {
  // The Edge Function stores the gallery-ready URL in asset_url, so it fills both
  // URL slots. The narrative fields were only ever in the lost response body.
  return {
    title: asset.title || record.title,
    enhanced_prompt: record.prompt,
    edit_instructions: "",
    alt_text: asset.title || record.title,
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
    gallery_storage_bucket: asset.storage_bucket ?? null,
    gallery_storage_path: asset.storage_path ?? null,
    model: asset.model || record.imageModel || "",
    created_at: asset.created_at,
    reference_folder: "",
    status: "stored",
  };
}


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

/**
 * Re-attaches images the Edge Function stored while the browser was away.
 *
 * Leaving the app aborts the request, but the function keeps running, writes the
 * asset and charges the credits. Without this the visual is invisible and paid
 * for. Matching is by restaurant, asset type and creation time, and an asset
 * already referenced by another record is never claimed twice.
 */
export async function recoverInterruptedAiCreations(input: {
  restaurantId?: string | null;
  userId?: string | null;
} = {}) {
  if (!hasBrowserStorage()) return 0;
  const storageKey = getAiCreationsStorageKey();
  // Commercial demo visuals are deliberately not persisted in this table.
  if (isCommercialDemoStorageKey(storageKey)) return 0;

  const stored = readRecords(storageKey);
  const interrupted = stored.filter((record) => record.interrupted === true && !record.result);
  if (!interrupted.length) return 0;

  // Each record carries its own restaurant, so recovery works even before the
  // caller has resolved one, and a caller that passes one stays scoped to it.
  const restaurantIds = input.restaurantId
    ? [input.restaurantId]
    : Array.from(new Set(interrupted.map((record) => record.restaurantId).filter(Boolean)));

  let total = 0;
  for (const restaurantId of restaurantIds) {
    total += await recoverForRestaurant(restaurantId, storageKey);
  }
  return total;
}

async function recoverForRestaurant(restaurantId: string, storageKey: string) {
  const stored = readRecords(storageKey);
  const pending = stored.filter(
    (record) => record.restaurantId === restaurantId && record.interrupted === true && !record.result,
  );
  if (!pending.length) return 0;

  const since = pending.reduce(
    (earliest, record) => (record.createdAt < earliest ? record.createdAt : earliest),
    pending[0].createdAt,
  );

  const { data, error } = await getSupabase()
    .from("ai_generated_assets" as never)
    .select("id, asset_url, storage_bucket, storage_path, asset_type, model, title, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "stored")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(60);
  if (error || !Array.isArray(data)) return 0;

  const assets = data as unknown as StoredAssetRow[];
  const claimed = new Set(
    stored.map((record) => record.result?.assetId).filter((id): id is string => Boolean(id)),
  );
  let recovered = 0;

  for (const record of pending) {
    // A small negative skew absorbs clock drift between the browser and Postgres.
    const notBefore = new Date(record.createdAt).getTime() - 60_000;
    const match = assets.find((asset) => (
      !claimed.has(asset.id)
      && Boolean(asset.asset_url)
      && (!record.assetType || asset.asset_type === record.assetType)
      && new Date(asset.created_at).getTime() >= notBefore
    ));
    if (!match) continue;

    claimed.add(match.id);
    const restored = patchRecord(record.id, {
      status: "completed",
      interrupted: false,
      errorMessage: null,
      completedAt: match.created_at,
      result: buildRecoveredResult(record, match),
    }, storageKey);
    if (!restored) continue;

    dispatchAiCreationEvent(AI_CREATION_COMPLETED_EVENT, restored);
    recovered += 1;
  }

  return recovered;
}

function upsertRecord(nextRecord: AiCreationRecord, storageKey = getAiCreationsStorageKey()) {
  const records = readRecords(storageKey);
  const index = records.findIndex((record) => record.id === nextRecord.id);
  if (index >= 0) {
    records[index] = nextRecord;
  } else {
    records.unshift(nextRecord);
  }
  writeRecords(records, storageKey);
  emitRecords(storageKey);
}

function patchRecord(
  id: string,
  patch: Partial<AiCreationRecord>,
  storageKey = getAiCreationsStorageKey(),
) {
  const records = readRecords(storageKey);
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  const nextRecord = {
    ...records[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  records[index] = nextRecord;
  writeRecords(records, storageKey);
  emitRecords(storageKey);
  return nextRecord;
}

function getErrorMessage(error: unknown) {
  return formatAiImageGenerationError(error);
}

// A backgrounded tab or a locked phone drops the connection, which surfaces as an
// abort or a transport error rather than a rejection from the Edge Function. The
// generation itself usually completed, so these stay eligible for recovery.
function isInterruptedError(error: unknown) {
  if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error || "");
  return /load failed|failed to fetch|network\s?error|connection was lost|network connection|aborted|timeout/i
    .test(message);
}

function dispatchAiCreationEvent(eventName: string, record: AiCreationRecord) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AiCreationRecord>(eventName, { detail: record }));
}

export function getAiCreationRecords() {
  ensureStorageListener();
  reclaimStaleRunningRecords();
  return readRecords();
}

export function subscribeAiCreationRecords(listener: AiCreationListener) {
  ensureStorageListener();
  reclaimStaleRunningRecords();
  listeners.add(listener);
  listener(readRecords());

  return () => {
    listeners.delete(listener);
  };
}

export function setActiveAiCreationContext(context: string | null) {
  activeAiCreationContext = context;
}

export function getActiveAiCreationContext() {
  return activeAiCreationContext;
}

export async function requestAiCreationNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function startTokImageCreationJob(input: StartAiCreationJobInput): AiCreationJob {
  // Capture the scope before any asynchronous work. The frame dataset may be
  // removed while OpenAI is still generating.
  const storageKey = getAiCreationsStorageKey();
  const now = new Date().toISOString();
  const id = createAiCreationId();
  const originPathname = typeof window !== "undefined" ? window.location.pathname : null;
  const record: AiCreationRecord = {
    id,
    restaurantId: input.restaurantId,
    userId: input.userId ?? null,
    tool: input.tool,
    title: input.title,
    prompt: input.request.prompt,
    assetType: input.request.assetType,
    format: input.request.format,
    outputResolution: input.request.outputResolution,
    imageModel: input.request.imageModel,
    generationSeed: input.request.generationSeed ?? null,
    sourceImageUrl: input.request.sourceImageUrl ?? null,
    referenceImageUrls: input.request.referenceImageUrls ?? [],
    referenceMediaIds: input.request.referenceMediaIds ?? [],
    status: "running",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    originPathname,
    originContext: activeAiCreationContext,
    result: null,
    errorMessage: null,
    galleryAdded: false,
  };

  upsertRecord(record, storageKey);

  const promise = generateTokDishImage(input.request)
    .then((result) => {
      const completed = patchRecord(id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
        generationSeed: result.generation_seed ?? record.generationSeed ?? null,
        errorMessage: null,
      }, storageKey) || {
        ...record,
        status: "completed" as const,
        completedAt: new Date().toISOString(),
        result,
        generationSeed: result.generation_seed ?? record.generationSeed ?? null,
      };
      dispatchAiCreationEvent(AI_CREATION_COMPLETED_EVENT, completed);
      return result;
    })
    .catch((error) => {
      const interrupted = isInterruptedError(error);
      const errorMessage = interrupted ? INTERRUPTED_MESSAGE : getErrorMessage(error);
      const failed = patchRecord(id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        interrupted,
        errorMessage,
      }, storageKey) || {
        ...record,
        status: "failed" as const,
        completedAt: new Date().toISOString(),
        interrupted,
        errorMessage,
      };
      dispatchAiCreationEvent(AI_CREATION_FAILED_EVENT, failed);
      throw error;
    })
    .finally(() => {
      activeJobs.delete(id);
      syncBeforeUnloadListener();
    });

  activeJobs.set(id, promise);
  syncBeforeUnloadListener();

  return { record, promise };
}

/**
 * Arms recovery for a surface that can start image generations.
 *
 * Runs once on mount, which covers a full page reload, and again whenever the
 * tab becomes visible, which covers switching away and back without a reload.
 */
export function useAiCreationRecovery(restaurantId?: string | null, userId?: string | null) {
  React.useEffect(() => {
    let cancelled = false;
    const recover = () => {
      if (cancelled || typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      void recoverInterruptedAiCreations({ restaurantId, userId });
    };
    recover();
    document.addEventListener("visibilitychange", recover);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", recover);
    };
  }, [restaurantId, userId]);
}

export function markAiCreationAddedToGallery(id: string) {
  return patchRecord(id, { galleryAdded: true });
}

export function deleteAiCreationRecord(id: string) {
  const records = readRecords();
  const nextRecords = records.filter((record) => record.id !== id);
  if (nextRecords.length === records.length) return false;

  writeRecords(nextRecords);
  emitRecords();
  return true;
}

export function getAiCreationImageUrl(record: AiCreationRecord) {
  return record.result?.gallery_image_url || record.result?.generated_image_url || "";
}

export function hasActiveAiCreationJob(id: string) {
  return activeJobs.has(id);
}
