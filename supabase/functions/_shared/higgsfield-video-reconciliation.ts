/** Reconcile accepted jobs only. This path cannot submit a generation or debit credits. */
export async function reconcileHiggsfieldVideos<T extends { id: string; status: string }>(options: {
  authMode: string;
  claim: () => Promise<T[]>;
  poll: (job: T) => Promise<T>;
  onFailure: (job: T) => Promise<void>;
}) {
  if (options.authMode !== "scheduler_secret") throw new Error("video_reconciliation_forbidden");
  const jobs = (await options.claim()).slice(0, 2);
  const result = { checked: 0, completed: 0, failed: 0, pending: 0, errors: 0 };
  // Keep archive memory bounded. The database lease rotates failed checks too,
  // so a provider outage for one job cannot starve the rest of the queue.
  for (const job of jobs) {
    result.checked += 1;
    try {
      const current = await options.poll(job);
      if (current.status === "completed") result.completed += 1;
      else if (current.status === "failed") result.failed += 1;
      else result.pending += 1;
    } catch {
      result.errors += 1;
      await options.onFailure(job);
    }
  }
  return result;
}
