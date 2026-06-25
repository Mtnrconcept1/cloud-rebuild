import {
  generateTokDishImage,
  type TokImageFormat,
  type TokImageGenerationRequest,
  type TokImageGenerationResult,
} from "@/lib/ai/tokAiClient";
import type { TokImageOutputResolution } from "@/lib/ai/imagePricing";
import { formatAiImageGenerationError } from "@/lib/publicErrorMessages";

export const AI_CREATION_COMPLETED_EVENT = "tok-ai-creation-completed";
export const AI_CREATION_FAILED_EVENT = "tok-ai-creation-failed";

const AI_CREATIONS_STORAGE_KEY = "tok-ai-creations-v1";

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
};

type AiCreationListener = (records: AiCreationRecord[]) => void;

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

function readRecords() {
  if (!hasBrowserStorage()) return [];
  return sortRecords(parseStoredRecords(window.localStorage.getItem(AI_CREATIONS_STORAGE_KEY)));
}

function writeRecords(records: AiCreationRecord[]) {
  if (!hasBrowserStorage()) return;
  window.localStorage.setItem(AI_CREATIONS_STORAGE_KEY, JSON.stringify(sortRecords(records).slice(0, 120)));
}

function emitRecords() {
  const records = readRecords();
  listeners.forEach((listener) => listener(records));
}

function ensureStorageListener() {
  if (storageListenerReady || typeof window === "undefined") return;
  storageListenerReady = true;
  window.addEventListener("storage", (event) => {
    if (event.key === AI_CREATIONS_STORAGE_KEY) emitRecords();
  });
}

function upsertRecord(nextRecord: AiCreationRecord) {
  const records = readRecords();
  const index = records.findIndex((record) => record.id === nextRecord.id);
  if (index >= 0) {
    records[index] = nextRecord;
  } else {
    records.unshift(nextRecord);
  }
  writeRecords(records);
  emitRecords();
}

function patchRecord(id: string, patch: Partial<AiCreationRecord>) {
  const records = readRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;

  const nextRecord = {
    ...records[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  records[index] = nextRecord;
  writeRecords(records);
  emitRecords();
  return nextRecord;
}

function getErrorMessage(error: unknown) {
  return formatAiImageGenerationError(error);
}

function dispatchAiCreationEvent(eventName: string, record: AiCreationRecord) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AiCreationRecord>(eventName, { detail: record }));
}

export function getAiCreationRecords() {
  ensureStorageListener();
  return readRecords();
}

export function subscribeAiCreationRecords(listener: AiCreationListener) {
  ensureStorageListener();
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

  upsertRecord(record);

  const promise = generateTokDishImage(input.request)
    .then((result) => {
      const completed = patchRecord(id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
        errorMessage: null,
      }) || {
        ...record,
        status: "completed" as const,
        completedAt: new Date().toISOString(),
        result,
      };
      dispatchAiCreationEvent(AI_CREATION_COMPLETED_EVENT, completed);
      return result;
    })
    .catch((error) => {
      const failed = patchRecord(id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: getErrorMessage(error),
      }) || {
        ...record,
        status: "failed" as const,
        completedAt: new Date().toISOString(),
        errorMessage: getErrorMessage(error),
      };
      dispatchAiCreationEvent(AI_CREATION_FAILED_EVENT, failed);
      throw error;
    })
    .finally(() => {
      activeJobs.delete(id);
    });

  activeJobs.set(id, promise);

  return { record, promise };
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
