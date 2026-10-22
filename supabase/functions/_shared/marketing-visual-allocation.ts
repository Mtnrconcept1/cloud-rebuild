/** Allocate at most six generations; only the same logical post and format may share a file. */
export async function allocateMarketingVisuals(
  items: ReadonlyArray<{ visual_prompt: string | null; visual_format?: string | null; visual_key?: string | null }>,
  generate: (prompt: string, index: number) => Promise<string | null>,
  budget: number,
): Promise<Map<number, string>> {
  if (!Number.isInteger(budget) || budget < 0 || budget > 6) {
    throw new Error("marketing_visual_budget_invalid");
  }
  const byVisualKey = new Map<string, Promise<string | null>>();
  const visuals = new Map<number, string>();
  const allocations: Array<Promise<void>> = [];
  for (let index = 0; index < items.length; index += 1) {
    const prompt = items[index].visual_prompt?.trim();
    if (!prompt) continue;
    const logicalKey = items[index].visual_key?.trim() || "brief:" + prompt;
    const key = JSON.stringify([logicalKey, items[index].visual_format || "4:5"]);
    if (!byVisualKey.has(key)) {
      if (byVisualKey.size >= budget) continue;
      byVisualKey.set(key, Promise.resolve().then(() => generate(prompt, index)).catch(() => null));
    }
    allocations.push(byVisualKey.get(key)!.then((url) => { if (url) visuals.set(index, url); }));
  }
  await Promise.all(allocations);
  return visuals;
}
