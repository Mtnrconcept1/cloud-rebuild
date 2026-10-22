import { describe, expect, it, vi } from "vitest";
import { allocateMarketingVisuals } from "../../supabase/functions/_shared/marketing-visual-allocation";

describe("visual generation allocation", () => {
  it("shares one same-format asset only between variants of the same logical post", async () => {
    const generate = vi.fn(async (_prompt: string, index: number) => "https://cdn.example.com/" + index + ".jpg");
    const result = await allocateMarketingVisuals([
      { visual_prompt: "Chef TOK", visual_key: "post:0" },
      { visual_prompt: "Other", visual_key: "post:1" },
      { visual_prompt: "Chef TOK", visual_key: "post:0" },
    ], generate, 1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.get(2)).toBe(result.get(0));
    expect(result.has(1)).toBe(false);
  });

  it("never shares an asset between different posts merely because their briefs are identical", async () => {
    const generate = vi.fn(async (_prompt: string, index: number) => "https://cdn.example.com/" + index + ".jpg");
    const result = await allocateMarketingVisuals([
      { visual_prompt: "Chef TOK", visual_key: "post:0" },
      { visual_prompt: "Chef TOK", visual_key: "post:1" },
    ], generate, 2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.get(0)).not.toBe(result.get(1));
  });

  it("does not substitute unrelated images or retry a failed allocation within the same plan", async () => {
    const generate = vi.fn(async () => null);
    const result = await allocateMarketingVisuals([
      { visual_prompt: "A", visual_key: "post:0" },
      { visual_prompt: "A", visual_key: "post:0" },
      { visual_prompt: "B", visual_key: "post:1" },
    ], generate, 1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(0);
  });

  it("does not consume the budget for absent briefs", async () => {
    const generate = vi.fn(async () => "https://cdn.example.com/a.jpg");
    const result = await allocateMarketingVisuals([{ visual_prompt: null }, { visual_prompt: "  " }, { visual_prompt: "A" }], generate, 1);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.has(2)).toBe(true);
  });

  it("does not share one file between identical logical posts requested in different formats", async () => {
    const generate = vi.fn(async (_prompt: string, index: number) => "https://cdn.example.com/" + index + ".jpg");
    const result = await allocateMarketingVisuals([
      { visual_prompt: "Chef TOK", visual_format: "1:1", visual_key: "post:0" },
      { visual_prompt: "Chef TOK", visual_format: "9:16", visual_key: "post:0" },
    ], generate, 2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.get(0)).not.toBe(result.get(1));
  });

  it.each([-1, NaN, 1.5, 7])("rejects an invalid or over-quota generation budget %s without provider calls", async (budget) => {
    const generate = vi.fn();
    await expect(allocateMarketingVisuals([{ visual_prompt: "A" }], generate, budget)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});
