import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatSeoReadError,
  isTransientSeoReadError,
  loadSeoPageWithRetry,
} from "../../scripts/seo-query-retry.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SEO build PostgREST recovery", () => {
  it("returns the first successful page after transient timeouts, without repeating completed pages", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "57014", message: "statement timeout" }, status: 500 })
      .mockResolvedValueOnce({ data: [{ id: "restaurant-1" }], error: null, count: 1, status: 200 });
    const pause = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();
    const result = await loadSeoPageWithRetry(fetchPage, { source: "restaurants", pause, warn });
    expect(result.data).toEqual([{ id: "restaurant-1" }]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not retry an invalid schema, forbidden policy or missing resource", async () => {
    for (const status of [400, 401, 403, 404, 409]) {
      const result = { data: null, error: { message: "permission denied", code: "42501" }, status };
      const fetchPage = vi.fn().mockResolvedValue(result);
      expect(await loadSeoPageWithRetry(fetchPage, { pause: vi.fn(), warn: vi.fn() })).toMatchObject(result);
      expect(fetchPage).toHaveBeenCalledOnce();
    }
    expect(isTransientSeoReadError({ code: "PGRST116", message: "no rows" }, 406)).toBe(false);
  });

  it("fails with its real diagnostics after at most three temporary errors", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      data: null, error: { code: "57014", message: "statement timeout" }, status: 503,
    });
    const result = await loadSeoPageWithRetry(fetchPage, { pause: vi.fn(), warn: vi.fn() });
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.error.code).toBe("57014");
    expect(formatSeoReadError(result.error)).toContain("code=57014");
    expect(formatSeoReadError(result.error)).not.toContain("[object Object]");
  });

  it("uses bounded reads and planned counts while retaining strict SEO in production", () => {
    const prerender = read("scripts/prerender-seo.mjs");
    expect(prerender).toContain('process.env.VERCEL_ENV === "production"');
    expect(prerender).toContain('loadSeoPageWithRetry(() =>');
    expect(prerender).toContain('count: "planned"');
    expect(prerender).not.toContain('count: "exact"');
    expect(prerender).toContain("formatSeoReadError(cause)");
    expect(prerender).toContain("RESTAURANT_PRERENDER_BATCH_SIZE = 100");
    expect(prerender).toContain("ACTUALITES_PRERENDER_BATCH_SIZE = 100");
    expect(prerender).toContain("if (STRICT_DYNAMIC_SEO) throw failure");
  });
});
