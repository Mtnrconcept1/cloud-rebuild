import { classifyHiggsfieldSubmissionError, readProviderVideoResponse } from "./higgsfield-video.ts";

type SubmissionJob = { id: string; status: string; provider_request_id: string | null };
type Diagnosis = ReturnType<typeof classifyHiggsfieldSubmissionError>;

/** Keep the acceptance receipt even when the database or archive is unavailable.
 * The caller closes over ONE exact provider payload and Idempotency-Key. A single
 * replay after an ambiguous transport error cannot create or bill a second job.
 * https://docs.higgsfield.ai/docs/concepts/idempotency
 */
export async function submitHiggsfieldVideo<T extends SubmissionJob>(options: {
  job: T;
  submit: () => Promise<unknown>;
  persist: (job: T, status: string, code: string | null, providerId: string | null) => Promise<T>;
  archive: (job: T, url: string) => Promise<T>;
  onFailure: (job: T, diagnosis: Diagnosis) => Promise<void>;
  waitBeforeRetry?: () => Promise<void>;
}): Promise<T> {
  let current = options.job;
  let acceptedId = current.provider_request_id;
  let ambiguousAttempt = false;
  try {
    let response: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await options.submit();
        break;
      } catch (error) {
        const diagnosis = classifyHiggsfieldSubmissionError(error);
        if (attempt === 0 && !diagnosis.confirmedRejected) {
          ambiguousAttempt = true;
          await (options.waitBeforeRetry?.() ?? new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500)));
          continue;
        }
        throw error;
      }
    }
    const provider = readProviderVideoResponse(response);
    if (!/^[a-zA-Z0-9_-]{4,120}$/.test(provider.requestId)) throw new Error("video_provider_id_invalid");
    acceptedId = provider.requestId;
    // Retain the received ID BEFORE awaiting the first persistence call.
    current = { ...current, provider_request_id: acceptedId };
    if (["failed", "nsfw", "canceled"].includes(provider.status)) {
      current = await options.persist(current, "failed", "video_provider_failed", acceptedId);
    } else {
      current = await options.persist(current, "queued", null, acceptedId);
      if (provider.status === "completed" && provider.url) {
        current = await options.archive(await options.persist(current, "archiving", null, acceptedId), provider.url);
      }
    }
  } catch (error) {
    const reported = classifyHiggsfieldSubmissionError(error);
    // An archive/database error is not a provider refusal. Nor does a later
    // 4xx prove that an earlier timed-out submission was rejected.
    const diagnosis: Diagnosis = acceptedId || ambiguousAttempt ? {
      confirmedRejected: false,
      code: acceptedId ? "video_status_persistence_failed" : "video_submission_unconfirmed",
      statusCode: acceptedId ? 0 : reported.statusCode,
    } : reported;
    current = await options.persist(current, diagnosis.confirmedRejected ? "failed" : "needs_review", diagnosis.code, acceptedId);
    await options.onFailure(current, diagnosis);
  }
  return current;
}
