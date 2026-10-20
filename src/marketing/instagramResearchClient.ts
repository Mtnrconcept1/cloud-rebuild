import { marketingBffRequest, MARKETING_BFF_ENDPOINTS } from "@/marketing/marketingBffClient";
import { parseInstagramResearchRequest, type InstagramResearchRequest, type InstagramResearchResult } from "../../supabase/functions/_shared/marketing-instagram-research";
import { parseInstagramReviewRequest, type InstagramReviewDraft, type InstagramReviewView } from "../../supabase/functions/_shared/marketing-instagram-review";

export async function submitInstagramTelegramReview(draft: InstagramReviewDraft) {
  return marketingBffRequest<{ review: InstagramReviewView }>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST", body: parseInstagramReviewRequest(draft), requireCsrf: true, timeoutMs: 30_000,
  });
}
export async function listInstagramTelegramReviews() {
  return marketingBffRequest<{ reviews: InstagramReviewView[] }>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST", body: { action: "instagram_review_list" }, requireCsrf: true,
  });
}

export async function loadInstagramResearch(request: InstagramResearchRequest, signal?: AbortSignal) {
  return marketingBffRequest<InstagramResearchResult>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST", body: parseInstagramResearchRequest(request), requireCsrf: true, timeoutMs: 65_000, signal,
  });
}
