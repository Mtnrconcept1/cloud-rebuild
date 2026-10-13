/** Allocate at most six generations; exact matching briefs may share a file. */
export async function allocateMarketingVisuals(
  items: ReadonlyArray<{ visual_prompt: string | null; visual_format?: string | null }>,
  generate: (prompt: string, index: number) => Promise<string | null>,
  budget: number,
): Promise<Map<number, string>> {
  if (!Number.isInteger(budget) || budget < 0 || budget > 6) {
    throw new Error("marketing_visual_budget_invalid");
  }
  const byPrompt = new Map<string, string | null>();
  const visuals = new Map<number, string>();
  for (let index = 0; index < items.length; index += 1) {
    const prompt = items[index].visual_prompt?.trim();
    if (!prompt) continue;
    const cacheKey = `${items[index].visual_format || "default"}\u0000${prompt}`;
    if (!byPrompt.has(cacheKey)) {
      if (byPrompt.size >= budget) continue;
      // Keep a failed allocation in the budget; no hidden retry or substitute.
      byPrompt.set(cacheKey, await generate(prompt, index).catch(() => null));
    }
    const url = byPrompt.get(cacheKey);
    if (url) visuals.set(index, url);
  }
  return visuals;
}
