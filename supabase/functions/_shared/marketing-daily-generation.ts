import { buildDailyMarketingBrief } from "./marketing-daily-editorial.ts";
import { generateDailyMarketingVisual, type DailyVisualStorageClient } from "./marketing-daily-visual.ts";

type RpcResponse = { data: unknown; error: { message?: string } | null };
type RpcRequest = PromiseLike<RpcResponse> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResponse> };
export type MarketingDailyClient = DailyVisualStorageClient & {
  rpc: (name: string, args: Record<string, unknown>) => RpcRequest;
};

type DailyClaim = {
  id: string;
  series_id: string;
  local_date: string;
  attempt_count: number;
  lease_token: string;
  actor_user_id: string;
  recent_posts: Array<{ title: string }>;
};
type DailyCompletion = {
  id: string;
  status: "succeeded" | "retrying" | "failed";
  calendar_item_id: string | null;
  campaign_id: string | null;
  next_attempt_at: string | null;
};
export type MarketingDailyResult = { status: "idle" } | (DailyCompletion & { error?: string });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function dailyRpc(client: MarketingDailyClient, name: string, args: Record<string, unknown>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = client.rpc(name, args);
    const result = await Promise.race([
      request.abortSignal ? request.abortSignal(controller.signal) : request,
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error("marketing_daily_database_timeout"));
      }, 10_000); }),
    ]);
    if (result.error) throw new Error("marketing_daily_database_failed");
    return result.data;
  } finally { clearTimeout(timer); }
}

function parseClaim(value: unknown): DailyClaim | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("marketing_daily_claim_invalid");
  const claim = value as DailyClaim;
  if (![claim.id, claim.series_id, claim.lease_token, claim.actor_user_id].every((id) => typeof id === "string" && UUID.test(id))
    || typeof claim.local_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(claim.local_date)
    || !Number.isInteger(claim.attempt_count) || claim.attempt_count < 1 || claim.attempt_count > 3
    || !Array.isArray(claim.recent_posts) || claim.recent_posts.length > 30
    || claim.recent_posts.some((post) => !post || typeof post.title !== "string" || post.title.length > 200)) {
    throw new Error("marketing_daily_claim_invalid");
  }
  return claim;
}

function parseCompletion(value: unknown, runId: string): DailyCompletion {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("marketing_daily_completion_invalid");
  const result = value as DailyCompletion;
  if (result.id !== runId || !["succeeded", "retrying", "failed"].includes(result.status)
    || (result.status === "succeeded" && (!UUID.test(result.calendar_item_id ?? "") || !UUID.test(result.campaign_id ?? "")))
    || (result.status !== "succeeded" && (result.calendar_item_id !== null || result.campaign_id !== null))
    || (result.status === "retrying" && (typeof result.next_attempt_at !== "string" || !Number.isFinite(Date.parse(result.next_attempt_at))))) {
    throw new Error("marketing_daily_completion_invalid");
  }
  return result;
}

/** Do not persist provider bodies, URLs or secrets in the administrator-visible failure history. */
export function dailyGenerationErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "marketing_daily_timeout";
  const message = error instanceof Error ? error.message : "";
  if (/^marketing_(?:daily|brand|image)_[a-z0-9_]{1,100}$/.test(message)) return message;
  if (message === "image_body_timeout") return "marketing_daily_timeout";
  if (["image_body_too_large", "image_invalid_payload"].includes(message)) return "marketing_daily_image_invalid";
  return "marketing_daily_generation_failed";
}

/**
 * One claimed local day becomes one reviewed draft. PostgreSQL owns scheduling,
 * authorization, leases, retry limits and the atomic campaign/calendar insertion.
 * This worker has no provider-publishing adapter and never grants approval.
 */
export async function runDailyMarketingGeneration(client: MarketingDailyClient, options: {
  apiKey: string;
  reviewModel: string;
  supabaseUrl: string;
}): Promise<MarketingDailyResult> {
  const claim = parseClaim(await dailyRpc(client, "claim_marketing_daily_run", { p_lease_seconds: 300 }));
  if (!claim) return { status: "idle" };
  let content: Record<string, unknown>;
  try {
    const brief = buildDailyMarketingBrief(claim.local_date, claim.recent_posts.map((post) => post.title));
    const visual = await generateDailyMarketingVisual(client, { runId: claim.id, brief, attemptCount: claim.attempt_count, ...options });
    content = {
      title: brief.title, caption: brief.caption, image_url: visual.imageUrl, image_quality: visual.quality,
      visual_brand_profile: brief.brandVersion, profile_version: brief.brandVersion,
      subject_id: brief.subjectId, visual_family: brief.visualFamily, visual_prompt: brief.visualPrompt,
      reference_ids: brief.referenceIds, image_model: "gpt-image-2", variation_id: brief.variationId,
      generation_source: visual.source,
    };
  } catch (error) {
    const code = dailyGenerationErrorCode(error);
    const completed = parseCompletion(await dailyRpc(client, "complete_marketing_daily_run", {
      p_run_id: claim.id, p_lease_token: claim.lease_token, p_content: {}, p_error: code,
    }), claim.id);
    return { ...completed, error: code };
  }
  // Keep this outside the generation catch: a lost acknowledgement may already
  // have committed. Do not overwrite it with a failure or create another image.
  return parseCompletion(await dailyRpc(client, "complete_marketing_daily_run", {
    p_run_id: claim.id, p_lease_token: claim.lease_token, p_content: content, p_error: null,
  }), claim.id);
}
