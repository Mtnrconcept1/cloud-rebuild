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

  it("batches public analytics events, including impressions, into one Edge Function call", () => {
    const analytics = read("src/lib/analytics.ts");
    const edgeFunction = read("supabase/functions/track-analytics/index.ts");

    expect(analytics).toContain('kind: "batch"');
    expect(analytics).toContain("events: batch.map");
    expect(analytics).not.toContain("for (const item of batch)");
    expect(analytics).toContain("export async function trackImpression");
    expect(analytics).toContain("const data = await queueAnalyticsEvent({");

    expect(edgeFunction).toContain("type AnalyticsBatchPayload");
    expect(edgeFunction).toContain('case "batch"');
    expect(edgeFunction).toContain("recordImpression");
    expect(edgeFunction).toContain('eventKind === "impression"');
    expect(edgeFunction).toContain("dedupeBatchEvents");
    expect(edgeFunction).toContain("MAX_BATCH_EVENTS");
  });

  it("keeps restaurant detail analytics and image priority attributes compatible with runtime contracts", () => {
    const analytics = read("src/lib/analytics.ts");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const edgeFunction = read("supabase/functions/track-analytics/index.ts");

    expect(analytics).toContain('| "view"');
    expect(edgeFunction).toContain('"view"');
    expect(restaurantDetail).toContain('eventType: "view"');
    expect(restaurantDetail).not.toContain('eventType: "page_view"');

    expect(restaurantDetail).toContain("HERO_IMAGE_FETCH_PRIORITY_PROPS");
    expect(restaurantDetail).toContain('fetchpriority: "high"');
    expect(restaurantDetail).not.toContain("fetchPriority=");
  });

  it("accepts cart additions for restaurant analytics without opening the event allowlist", () => {
    const edgeFunction = read("supabase/functions/track-analytics/index.ts");
    const restaurantEvents = edgeFunction.match(
      /\["restaurant", new Set\(\[(.*?)\]\)\]/,
    )?.[1];

    expect(restaurantEvents).toContain('"add_to_cart"');
    expect(restaurantEvents).not.toContain('"unsupported_event"');
    expect(edgeFunction).toContain("if (!isAllowedEvent(entityType, eventName))");
    expect(edgeFunction).toContain('throw new HttpError(400, "eventName invalide")');
  });
});
