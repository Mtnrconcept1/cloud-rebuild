import { marketingBffRequest, MARKETING_BFF_ENDPOINTS } from "@/marketing/marketingBffClient";
import { parseInstagramResearchRequest, type InstagramResearchRequest, type InstagramResearchResult } from "../../supabase/functions/_shared/marketing-instagram-research";

export async function loadInstagramResearch(request: InstagramResearchRequest, signal?: AbortSignal) {
  return marketingBffRequest<InstagramResearchResult>(MARKETING_BFF_ENDPOINTS.orchestrator, {
    method: "POST", body: parseInstagramResearchRequest(request), requireCsrf: true, timeoutMs: 65_000, signal,
  });
}
