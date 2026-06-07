import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("analytics ingest contract", () => {
  it("does not send unsupported user entity events to track-analytics", () => {
    const analytics = read("src/lib/analytics.ts");
    const panier = read("src/pages/Panier.tsx");

    expect(analytics).toContain("if (!restaurantId) return;");
    expect(analytics).toContain('entityType: "restaurant"');
    expect(analytics).not.toContain('entityType: restaurantId ? "restaurant" : "user"');
    expect(panier).toContain("restaurantId,");
  });

  it("batches public analytics events into one Edge Function call and deduplicates them server-side", () => {
    const analytics = read("src/lib/analytics.ts");
    const edgeFunction = read("supabase/functions/track-analytics/index.ts");

    expect(analytics).toContain('kind: "batch"');
    expect(analytics).toContain("events: batch.map");
    expect(analytics).not.toContain("for (const item of batch)");

    expect(edgeFunction).toContain("type AnalyticsBatchPayload");
    expect(edgeFunction).toContain('case "batch"');
    expect(edgeFunction).toContain("dedupeBatchEvents");
    expect(edgeFunction).toContain("MAX_BATCH_EVENTS");
  });
});
