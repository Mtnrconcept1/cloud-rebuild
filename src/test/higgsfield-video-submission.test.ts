import { describe, expect, it, vi } from "vitest";
import { submitHiggsfieldVideo } from "../../supabase/functions/_shared/higgsfield-video-submission";
import { reconcileHiggsfieldVideos } from "../../supabase/functions/_shared/higgsfield-video-reconciliation";

const job = { id: "tok-job", status: "submitting", provider_request_id: null as string | null };
const receipt = { request_id: "provider-accepted-1234", status: "queued" };
function fixture() {
  return {
    job,
    submit: vi.fn().mockResolvedValue(receipt),
    persist: vi.fn(async (current: typeof job, status: string, _code: string | null, id: string | null) =>
      ({ ...current, status, provider_request_id: id })),
    archive: vi.fn(async (current: typeof job) => ({ ...current, status: "completed" })),
    onFailure: vi.fn().mockResolvedValue(undefined),
    waitBeforeRetry: vi.fn().mockResolvedValue(undefined),
  };
}

describe("durable Higgsfield acceptance", () => {
  it("keeps the provider ID when the first database acknowledgement is lost", async () => {
    const flow = fixture();
    flow.persist.mockRejectedValueOnce(new Error("database response lost"));
    const result = await submitHiggsfieldVideo(flow);
    expect(result).toMatchObject({ status: "needs_review", provider_request_id: receipt.request_id });
    expect(flow.persist).toHaveBeenLastCalledWith(expect.objectContaining({ provider_request_id: receipt.request_id }),
      "needs_review", "video_status_persistence_failed", receipt.request_id);
    expect(flow.submit).toHaveBeenCalledTimes(1);
    expect(flow.onFailure).toHaveBeenCalledWith(result, expect.objectContaining({ confirmedRejected: false }));
  });

  it("never refunds an accepted video because its archive returned a 4xx", async () => {
    const flow = fixture();
    flow.submit.mockResolvedValue({ ...receipt, status: "completed", video: { url: "https://cdn.higgsfield.ai/clip.mp4" } });
    flow.archive.mockRejectedValue({ statusCode: 401 });
    const result = await submitHiggsfieldVideo(flow);
    expect(result).toMatchObject({ status: "needs_review", provider_request_id: receipt.request_id });
    expect(flow.persist.mock.calls.every(([, status]) => status !== "failed")).toBe(true);
    expect(flow.submit).toHaveBeenCalledTimes(1);
  });

  it("replays a lost receipt once, then follows the original accepted job", async () => {
    const flow = fixture();
    flow.submit.mockRejectedValueOnce(new Error("response timeout"));
    expect(await submitHiggsfieldVideo(flow)).toMatchObject({ status: "queued", provider_request_id: receipt.request_id });
    expect(flow.submit).toHaveBeenCalledTimes(2);
    expect(flow.waitBeforeRetry).toHaveBeenCalledTimes(1);
    expect(flow.persist).toHaveBeenCalledTimes(1);
    expect(flow.onFailure).not.toHaveBeenCalled();
  });

  it("does not refund the original ambiguous request after a later validation refusal", async () => {
    const flow = fixture();
    flow.submit.mockRejectedValueOnce(new Error("response timeout")).mockRejectedValueOnce({ statusCode: 422 });
    const result = await submitHiggsfieldVideo(flow);
    expect(result.status).toBe("needs_review");
    expect(flow.persist).toHaveBeenCalledExactlyOnceWith(job, "needs_review", "video_submission_unconfirmed", null);
    expect(flow.onFailure).toHaveBeenCalledWith(result, expect.objectContaining({ confirmedRejected: false, statusCode: 422 }));
  });

  it.each([403, 423, 429])("releases an explicitly refused initial submission (%s) without retry", async (statusCode) => {
    const flow = fixture(); flow.submit.mockRejectedValue({ statusCode });
    expect((await submitHiggsfieldVideo(flow)).status).toBe("failed");
    expect(flow.submit).toHaveBeenCalledTimes(1);
    expect(flow.waitBeforeRetry).not.toHaveBeenCalled();
    expect(flow.onFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ confirmedRejected: true }));
  });

  it("bounds ambiguous transport retries and retains credits for review", async () => {
    const flow = fixture(); flow.submit.mockRejectedValue(new Error("offline"));
    expect((await submitHiggsfieldVideo(flow)).status).toBe("needs_review");
    expect(flow.submit).toHaveBeenCalledTimes(2);
    expect(flow.persist.mock.calls.every(([, status]) => status !== "failed")).toBe(true);
  });

  it("refunds a confirmed terminal failure with its provider receipt", async () => {
    const flow = fixture(); flow.submit.mockResolvedValue({ ...receipt, status: "failed" });
    expect(await submitHiggsfieldVideo(flow)).toMatchObject({ status: "failed", provider_request_id: receipt.request_id });
    expect(flow.archive).not.toHaveBeenCalled();
    expect(flow.submit).toHaveBeenCalledTimes(1);
  });
});

describe("server video reconciliation", () => {
  it.each(["user_jwt", "service_role", "anonymous"])("rejects %s before any job is read", async (authMode) => {
    const claim = vi.fn();
    await expect(reconcileHiggsfieldVideos({ authMode, claim, poll: vi.fn(), onFailure: vi.fn() }))
      .rejects.toThrow("video_reconciliation_forbidden");
    expect(claim).not.toHaveBeenCalled();
  });

  it("archives accepted jobs without a browser and continues after one failed check", async () => {
    const jobs = [{ id: "first", status: "queued" }, { id: "second", status: "archiving" }];
    const poll = vi.fn().mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ ...jobs[1], status: "completed" });
    const onFailure = vi.fn().mockResolvedValue(undefined);
    expect(await reconcileHiggsfieldVideos({ authMode: "scheduler_secret", claim: async () => jobs, poll, onFailure }))
      .toEqual({ checked: 2, completed: 1, failed: 0, pending: 0, errors: 1 });
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(jobs[0]);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("keeps each invocation bounded and leaves unfinished jobs pending", async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({ id: `job-${i}`, status: "in_progress" }));
    const poll = vi.fn(async (current) => current);
    expect(await reconcileHiggsfieldVideos({ authMode: "scheduler_secret", claim: async () => jobs, poll, onFailure: vi.fn() }))
      .toEqual({ checked: 2, completed: 0, failed: 0, pending: 2, errors: 0 });
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
