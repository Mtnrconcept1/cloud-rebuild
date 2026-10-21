import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import {
  parseMarketingContentReviewRequest,
  type ContentReviewTargetType,
  type MarketingContentReviewStatus,
} from "../../supabase/functions/_shared/marketing-content-review";

export type MarketingContentReviewTarget = {
  targetType: ContentReviewTargetType;
  targetId: string;
};

export type MarketingContentReviewFailureCode = "content_review_document_too_large" | "content_review_visual_missing"
  | "content_review_visual_invalid" | "content_review_text_missing" | "content_review_items_missing"
  | "content_review_snapshot_invalid" | "content_review_budget_exhausted" | "content_review_telegram_rejected"
  | "content_review_delivery_unknown";

export type MarketingContentReviewState = MarketingContentReviewTarget & {
  revision: number | null;
  status: MarketingContentReviewStatus;
  updatedAt: string | null;
  review: {
    id: string;
    status: MarketingContentReviewStatus;
    createdAt: string;
    expiresAt: string | null;
    decidedAt: string | null;
    deliveryComplete: boolean;
    messageCount: number;
    errorCode?: MarketingContentReviewFailureCode | null;
  } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<MarketingContentReviewStatus>([
  "queued", "waiting_items", "waiting_visuals", "delivering", "pending", "approved", "rejected",
  "expired", "failed", "delivery_unknown", "stale", "not_requested", "cancelled",
]);
const FAILURE_CODES = new Set<MarketingContentReviewFailureCode>([
  "content_review_document_too_large", "content_review_visual_missing", "content_review_visual_invalid",
  "content_review_text_missing", "content_review_items_missing", "content_review_snapshot_invalid",
  "content_review_budget_exhausted", "content_review_telegram_rejected", "content_review_delivery_unknown",
]);

function invalidResponse(): never {
  throw new Error("Le statut de validation Telegram n’a pas pu être confirmé. Actualisez pour réessayer.");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}

function status(value: unknown): MarketingContentReviewStatus {
  if (typeof value !== "string" || !STATUSES.has(value as MarketingContentReviewStatus)) return invalidResponse();
  return value as MarketingContentReviewStatus;
}

function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) return invalidResponse();
  return value;
}

function normalizeState(value: unknown, target: MarketingContentReviewTarget): MarketingContentReviewState {
  const row = record(value);
  // Even a valid response must belong to the exact requested campaign or item.
  if (row.target_type !== target.targetType || typeof row.target_id !== "string"
    || row.target_id.toLowerCase() !== target.targetId.toLowerCase()) return invalidResponse();
  const currentStatus = status(row.status);
  let revision: number | null = null;
  if (row.revision !== null) {
    if (typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 0) return invalidResponse();
    revision = row.revision;
  }
  if (currentStatus !== "not_requested" && (revision === null || revision === 0)) return invalidResponse();

  let review: MarketingContentReviewState["review"] = null;
  if (row.review !== null) {
    const candidate = record(row.review);
    if (typeof candidate.id !== "string" || !UUID.test(candidate.id)
      || typeof candidate.delivery_complete !== "boolean"
      || typeof candidate.message_count !== "number" || !Number.isSafeInteger(candidate.message_count)
      || candidate.message_count < 0) return invalidResponse();
    const createdAt = date(candidate.created_at);
    if (!createdAt) return invalidResponse();
    review = {
      id: candidate.id.toLowerCase(), status: status(candidate.status), createdAt,
      expiresAt: date(candidate.expires_at), decidedAt: date(candidate.decided_at),
      deliveryComplete: candidate.delivery_complete, messageCount: candidate.message_count,
      errorCode: FAILURE_CODES.has(candidate.last_error_code as MarketingContentReviewFailureCode)
        ? candidate.last_error_code as MarketingContentReviewFailureCode : null,
    };
  }
  if (currentStatus === "approved" && (!review || review.status !== "approved" || !review.deliveryComplete)) return invalidResponse();

  return {
    targetType: target.targetType, targetId: target.targetId.toLowerCase(), revision,
    status: currentStatus, updatedAt: date(row.updated_at), review,
  };
}

export async function loadMarketingContentReview(target: MarketingContentReviewTarget, signal?: AbortSignal): Promise<MarketingContentReviewState> {
  const request = parseMarketingContentReviewRequest({ ...target, action: "content_review_status" });
  const response = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST", body: request, requireCsrf: true, signal,
  });
  return normalizeState(response, request);
}

export async function retryMarketingContentReview(
  target: MarketingContentReviewTarget & { expectedRevision: number; expectedReviewId: string | null },
  signal?: AbortSignal,
): Promise<MarketingContentReviewState> {
  const request = parseMarketingContentReviewRequest({ ...target, action: "content_review_retry" });
  const response = await marketingBffRequest<unknown>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST", body: request, requireCsrf: true, signal,
  });
  return normalizeState(response, request);
}
