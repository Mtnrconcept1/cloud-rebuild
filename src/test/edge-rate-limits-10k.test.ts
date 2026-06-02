import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readFunction(name: string) {
  return readFileSync(resolve(process.cwd(), "supabase/functions", name, "index.ts"), "utf8");
}

describe("10k edge function rate limits", () => {
  it("limits validate-order by user, IP and global buckets", () => {
    const source = readFunction("validate-order");

    expect(source).toContain('createRateLimiter(actor.adminClient, "validate-order")');
    expect(source).toContain("buildRequestMetadata(req)");
    expect(source).toContain("maxRequests: 60, windowSeconds: 60");
    expect(source).toContain("maxRequests: 180, windowSeconds: 60");
    expect(source).toContain("maxRequests: 1500, windowSeconds: 60");
  });

  it("limits create-checkout by user, IP and global buckets", () => {
    const source = readFunction("create-checkout");

    expect(source).toContain('createRateLimiter(actor.adminClient, "create-checkout")');
    expect(source).toContain("buildRequestMetadata(req)");
    expect(source).toContain("maxRequests: 12, windowSeconds: 300");
    expect(source).toContain("maxRequests: 60, windowSeconds: 300");
    expect(source).toContain("maxRequests: 500, windowSeconds: 60");
  });

  it("limits complete-order-checkout by user, IP and global buckets", () => {
    const source = readFunction("complete-order-checkout");

    expect(source).toContain('createRateLimiter(actor.adminClient, "complete-order-checkout")');
    expect(source).toContain("buildRequestMetadata(req)");
    expect(source).toContain("maxRequests: 30, windowSeconds: 300");
    expect(source).toContain("maxRequests: 120, windowSeconds: 300");
    expect(source).toContain("maxRequests: 800, windowSeconds: 60");
  });
});
