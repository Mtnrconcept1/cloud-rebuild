/** Allocate at most six generations; exact matching briefs may share a file. */
export async function allocateMarketingVisuals(
  items: ReadonlyArray<{ visual_prompt: string | null; visual_format?: string | null }>,
  generate: (prompt: string, index: number) => Promise<string | null>,
  budget: number,
): Promise<Map<number, string>> {
  if (!Number.isInteger(budget) || budget < 0 || budget > 6) {
    throw new Error("marketing_visual_budget_invalid");
  }
  const byPrompt = new Map<string, Promise<string | null>>();
  const visuals = new Map<number, string>();
  const allocations: Array<Promise<void>> = [];
  for (let index = 0; index < items.length; index += 1) {
    const prompt = items[index].visual_prompt?.trim();
    if (!prompt) continue;
    const key = JSON.stringify([prompt, items[index].visual_format || "4:5"]);
    if (!byPrompt.has(key)) {
      if (byPrompt.size >= budget) continue;
      // Keep a failed allocation in the budget; no hidden retry or substitute.
      // Start each distinct generation immediately; six sequential provider
      // timeouts would exceed the campaign request's total time budget.
      byPrompt.set(key, Promise.resolve().then(() => generate(prompt, index)).catch(() => null));
    }
    allocations.push(byPrompt.get(key)!.then((url) => { if (url) visuals.set(index, url); }));
  }
  await Promise.all(allocations);
  return visuals;
}
