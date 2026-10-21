/** Dependency-free contract shared by the plain Node BFF, browser and Deno worker. */
export type MarketingContentReviewTargetType = "campaign" | "item";
export type MarketingContentReviewStatus = "queued" | "waiting_items" | "waiting_visuals" | "delivering" | "pending"
  | "approved" | "rejected" | "expired" | "failed" | "delivery_unknown" | "stale" | "not_requested" | "cancelled";
export type MarketingContentReviewRequest = {
  action: "content_review_status"; targetType: MarketingContentReviewTargetType; targetId: string;
} | {
  action: "content_review_retry"; targetType: MarketingContentReviewTargetType; targetId: string;
  expectedRevision: number; expectedReviewId: string | null;
};

export class MarketingContentReviewInputError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** This public contract never accepts content, credentials or a Telegram destination. */
export function parseMarketingContentReviewRequest(input: unknown): MarketingContentReviewRequest {
  const fail = (): never => { throw new MarketingContentReviewInputError("Demande de validation du contenu invalide."); };
  if (!object(input)) return fail();
  const retry = input.action === "content_review_retry";
  const keys = ["action", "targetType", "targetId", ...(retry ? ["expectedRevision", "expectedReviewId"] : [])];
  if ((!retry && input.action !== "content_review_status") || Object.keys(input).length !== keys.length
    || Object.keys(input).some(key => !keys.includes(key))
    || (input.targetType !== "campaign" && input.targetType !== "item")
    || typeof input.targetId !== "string" || !UUID.test(input.targetId)) return fail();
  if (retry && (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1
    || (input.expectedReviewId !== null && (typeof input.expectedReviewId !== "string" || !UUID.test(input.expectedReviewId))))) return fail();
  return retry
    ? { action: "content_review_retry", targetType: input.targetType, targetId: input.targetId,
      expectedRevision: input.expectedRevision as number, expectedReviewId: input.expectedReviewId as string | null }
    : { action: "content_review_status", targetType: input.targetType, targetId: input.targetId };
}
