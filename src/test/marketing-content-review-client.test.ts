import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMarketingContentReview, retryMarketingContentReview, type MarketingContentReviewTarget } from "@/marketing/contentReviewClient";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";

vi.mock("@/marketing/marketingBffClient", () => ({
  MARKETING_BFF_ENDPOINTS: { orchestrator: "/api/marketing/orchestrator" }, marketingBffRequest: vi.fn(),
}));

const target: MarketingContentReviewTarget = { targetType: "campaign", targetId: "b286ddc7-7335-4fd2-a633-000000000001" };
const otherId = "b286ddc7-7335-4fd2-a633-000000000002";
const reviewId = "b286ddc7-7335-4fd2-a633-000000000003";
const response = {
  target_type: target.targetType, target_id: target.targetId, revision: 3, status: "approved", updated_at: "2026-10-21T10:00:00Z",
  review: { id: reviewId, status: "approved", created_at: "2026-10-21T09:00:00Z", expires_at: "2026-10-22T09:00:00Z",
    decided_at: "2026-10-21T10:00:00Z", delivery_complete: true, message_count: 5 },
};

beforeEach(() => { vi.mocked(marketingBffRequest).mockReset(); });

describe("marketing content review BFF client", () => {
  it("reads the exact target using the authenticated BFF and returns only public review fields", async () => {
    const signal = new AbortController().signal;
    vi.mocked(marketingBffRequest).mockResolvedValue({ ...response, chat_id: "private-chat", snapshot: { secret: true },
      review: { ...response.review, token: "private-token", callback_data: "private-callback" } });
    const state = await loadMarketingContentReview(target, signal);
    expect(marketingBffRequest).toHaveBeenCalledWith(MARKETING_BFF_ENDPOINTS.orchestrator, {
      method: "POST", body: { action: "content_review_status", ...target }, requireCsrf: true, signal,
    });
    expect(state).toEqual({ ...target, revision: 3, status: "approved", updatedAt: response.updated_at,
      review: { id: reviewId, status: "approved", createdAt: response.review.created_at,
        expiresAt: response.review.expires_at, decidedAt: response.review.decided_at, deliveryComplete: true, messageCount: 5, errorCode: null } });
    expect(JSON.stringify(state)).not.toContain("private");
    expect(JSON.stringify(state)).not.toContain("snapshot");
  });

  it("queues a retry with the exact observed revision and review ID", async () => {
    vi.mocked(marketingBffRequest).mockResolvedValue({ ...response, status: "queued" });
    const retry = { ...target, expectedRevision: 3, expectedReviewId: reviewId };
    await retryMarketingContentReview(retry);
    expect(marketingBffRequest).toHaveBeenCalledWith(MARKETING_BFF_ENDPOINTS.orchestrator, {
      method: "POST", body: { action: "content_review_retry", ...retry }, requireCsrf: true, signal: undefined,
    });
  });

  it("preserves an explicit null review ID for a failure before delivery", async () => {
    vi.mocked(marketingBffRequest).mockResolvedValue({ ...response, status: "queued", review: null });
    await retryMarketingContentReview({ ...target, expectedRevision: 3, expectedReviewId: null });
    expect(marketingBffRequest).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      body: { action: "content_review_retry", ...target, expectedRevision: 3, expectedReviewId: null },
    }));
  });

  it("projects only known failure codes and discards arbitrary backend error text", async () => {
    vi.mocked(marketingBffRequest).mockResolvedValueOnce({ ...response, status: "failed",
      review: { ...response.review, status: "failed", last_error_code: "content_review_document_too_large" } })
      .mockResolvedValueOnce({ ...response, status: "failed", review: { ...response.review, status: "failed", last_error_code: "private-token unhandled error" } });
    await expect(loadMarketingContentReview(target)).resolves.toMatchObject({ review: { errorCode: "content_review_document_too_large" } });
    const state = await loadMarketingContentReview(target);
    expect(state.review?.errorCode).toBeNull();
    expect(JSON.stringify(state)).not.toContain("private-token");
  });

  it.each([
    { target_id: otherId }, { target_type: "item" }, { revision: -1 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { status: "sent" }, { updated_at: "invalid" }, { review: null },
    { review: { ...response.review, delivery_complete: false } },
    { review: { ...response.review, status: "pending" } },
  ])("rejects mismatched or unconfirmed approval responses: %o", async (invalid) => {
    vi.mocked(marketingBffRequest).mockResolvedValue({ ...response, ...invalid });
    await expect(loadMarketingContentReview(target)).rejects.toThrow("n’a pas pu être confirmé");
  });

  it.each([0, null])("represents an absent review with revision %s without inventing approval", async (revision) => {
    vi.mocked(marketingBffRequest).mockResolvedValue({ ...response, revision, status: "not_requested", updated_at: null, review: null });
    await expect(loadMarketingContentReview(target)).resolves.toMatchObject({ revision, status: "not_requested", review: null });
  });

  it("rejects extra content and cannot turn a status read into a retry", async () => {
    await expect(loadMarketingContentReview({ ...target, content: "Untrusted text" } as MarketingContentReviewTarget)).rejects.toThrow();
    await expect(loadMarketingContentReview({ ...target, action: "content_review_retry", expectedRevision: 3,
      expectedReviewId: reviewId } as MarketingContentReviewTarget)).rejects.toThrow();
    await expect(retryMarketingContentReview({ ...target, expectedRevision: 0, expectedReviewId: null })).rejects.toThrow();
    expect(marketingBffRequest).not.toHaveBeenCalled();
  });
});
