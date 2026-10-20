import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDailyMarketingBrief } from "../../supabase/functions/_shared/marketing-daily-editorial";
import { dailyGenerationErrorCode, runDailyMarketingGeneration } from "../../supabase/functions/_shared/marketing-daily-generation";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../../supabase/functions/_shared/marketing-daily-visual.ts", () => ({ generateDailyMarketingVisual: generate }));
const runId = "33333333-3333-4333-8333-333333333333";
const lease = "44444444-4444-4444-8444-444444444444";
const claim = { id: runId, series_id: "11111111-1111-4111-8111-111111111111", local_date: "2026-10-19",
  actor_user_id: "22222222-2222-4222-8222-222222222222", attempt_count: 1, lease_token: lease, recent_posts: [] };
const completed = { id: runId, status: "succeeded", calendar_item_id: "55555555-5555-4555-8555-555555555555",
  campaign_id: "66666666-6666-4666-8666-666666666666", next_attempt_at: null };
const options = { apiKey: "test-only", reviewModel: "vision-model", supabaseUrl: "https://project.supabase.co" };
const visual = { imageUrl: "https://project.supabase.co/storage/v1/object/public/social-post-media/daily.jpg",
  quality: { status: "validated", checks: { single_visual: true }, dimensions: { width: 1024, height: 1280 }, reviewer_model: "vision-model", reason: "Conforme." }, source: "created" };
function clientFor(data: unknown = claim) {
  const rpc = vi.fn().mockResolvedValueOnce({ data, error: null }).mockResolvedValueOnce({ data: completed, error: null });
  return { rpc, storage: { from: vi.fn() } };
}
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

describe("continuous daily marketing worker", () => {
  it("does no work when the database reports paused/not due/already claimed", async () => {
    const client = clientFor(null);
    expect(await runDailyMarketingGeneration(client, options)).toEqual({ status: "idle" });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("claim_marketing_daily_run", { p_lease_seconds: 300 });
    expect(generate).not.toHaveBeenCalled();
  });

  it("completes exactly one validated draft from the claimed local date without granting approval", async () => {
    const client = clientFor(); generate.mockResolvedValue(visual);
    expect(await runDailyMarketingGeneration(client, options)).toEqual(completed);
    expect(generate).toHaveBeenCalledTimes(1);
    const args = client.rpc.mock.calls[1][1];
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(["claim_marketing_daily_run", "complete_marketing_daily_run"]);
    expect(args).toMatchObject({ p_run_id: runId, p_lease_token: lease, p_error: null,
      p_content: { title: "Vos réservations. Bien organisées.", image_quality: visual.quality,
        reference_ids: expect.arrayContaining(["instagram-profile"]), image_model: "gpt-image-2", generation_source: "created" } });
    expect(args.p_content).not.toHaveProperty("approval_status");
    expect(args.p_content).not.toHaveProperty("published_at");
  });

  it("reuses the snapshotted recent titles and propagates artifact recovery on a retry", async () => {
    const recent = [buildDailyMarketingBrief(claim.local_date).title];
    const client = clientFor({ ...claim, attempt_count: 2, recent_posts: recent.map((title) => ({ title })) });
    generate.mockResolvedValue({ ...visual, source: "recovered" });
    await runDailyMarketingGeneration(client, options);
    expect(generate.mock.calls[0][1].brief).toEqual(buildDailyMarketingBrief(claim.local_date, recent));
    expect(client.rpc.mock.calls[1][1].p_content.generation_source).toBe("recovered");
  });

  it("records a quality rejection as a bounded retryable error, with no incomplete campaign content", async () => {
    const client = clientFor();
    client.rpc.mockReset().mockResolvedValueOnce({ data: claim, error: null }).mockResolvedValueOnce({ data: {
      id: runId, status: "retrying", campaign_id: null, calendar_item_id: null, next_attempt_at: "2026-10-19T08:05:00Z",
    }, error: null });
    generate.mockRejectedValue(new Error("marketing_daily_quality_title_mismatch"));
    expect(await runDailyMarketingGeneration(client, options)).toMatchObject({ status: "retrying", error: "marketing_daily_quality_title_mismatch" });
    expect(client.rpc.mock.calls[1][1]).toEqual({ p_run_id: runId, p_lease_token: lease,
      p_content: {}, p_error: "marketing_daily_quality_title_mismatch" });
  });

  it("does not blindly retry completion or generation after an uncertain database acknowledgement", async () => {
    const client = clientFor(); generate.mockResolvedValue(visual);
    client.rpc.mockReset().mockResolvedValueOnce({ data: claim, error: null })
      .mockRejectedValueOnce(new Error("transport disconnected"));
    await expect(runDailyMarketingGeneration(client, options)).rejects.toThrow("transport disconnected");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("refuses malformed claims before a paid call", async () => {
    const client = clientFor({ ...claim, id: "untrusted/path", recent_posts: "not history" });
    await expect(runDailyMarketingGeneration(client, options)).rejects.toThrow("marketing_daily_claim_invalid");
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not report success when the database has no campaign/calendar identifiers", async () => {
    const client = clientFor(); generate.mockResolvedValue(visual);
    client.rpc.mockReset().mockResolvedValueOnce({ data: claim, error: null })
      .mockResolvedValueOnce({ data: { ...completed, calendar_item_id: null }, error: null });
    await expect(runDailyMarketingGeneration(client, options)).rejects.toThrow("marketing_daily_completion_invalid");
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it("never includes provider responses or credentials in visible errors", () => {
    expect(dailyGenerationErrorCode(new Error("upstream error Authorization: Bearer secret"))).toBe("marketing_daily_generation_failed");
    expect(dailyGenerationErrorCode(new DOMException("Aborted", "AbortError"))).toBe("marketing_daily_timeout");
    expect(dailyGenerationErrorCode(new Error("image_body_too_large"))).toBe("marketing_daily_image_invalid");
  });
});
