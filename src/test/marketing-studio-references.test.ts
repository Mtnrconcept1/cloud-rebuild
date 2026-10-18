import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { isCurrentMarketingReferenceStorage, marketingReferenceStorageFilter } from "../../supabase/functions/_shared/marketing-studio-references";

const restaurantId = "10000000-0000-4000-8000-000000000001";
const otherId = "20000000-0000-4000-8000-000000000001";

describe("Marketing Studio reference eligibility", () => {
  it.each([
    ["restaurant-images", `${restaurantId}/marketing-assets/logo.png`, undefined, true],
    ["restaurant-images", `owner/marketing-assets/${restaurantId}/menu.png`, undefined, true],
    ["marketing-references", `${restaurantId}/marketing-assets/logo.png`, "marketing-references", true],
    ["restaurant-images", `owner/marketing-assets/${restaurantId}/menu.png`, "marketing-references", true],
    ["restaurant-images", `${restaurantId}/marketing-assets/logo.png`, "marketing-references", false],
    ["unrelated-bucket", `${restaurantId}/marketing-assets/logo.png`, undefined, false],
    ["restaurant-images", `${otherId}/marketing-assets/logo.png`, undefined, false],
    ["restaurant-images", `owner/marketing-assets/${otherId}/menu.png`, undefined, false],
    ["restaurant-images", "old-logo.png", undefined, false],
    [null, null, undefined, false],
  ])("checks the stored location %s / %s", (bucket, path, configuredBucket, expected) => {
    expect(isCurrentMarketingReferenceStorage({ storage_bucket: bucket, storage_path: path }, restaurantId, configuredBucket)).toBe(expected);
  });

  it("serializes the storage alternatives through the real PostgREST client without widening restaurant scope", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([]));
    const client = createClient("https://tok.invalid", "test-public-key", {
      global: { fetch: fetcher as typeof fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.from("restaurant_media").select("id")
      .eq("restaurant_id", restaurantId)
      .or(marketingReferenceStorageFilter(restaurantId))
      .range(1, 1);
    expect(fetcher).toHaveBeenCalledOnce();
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("restaurant_id")).toBe(`eq.${restaurantId}`);
    expect(url.searchParams.get("or")).toBe(`(and(storage_bucket.eq."restaurant-images",storage_path.like."${restaurantId}/marketing-assets/*"),and(storage_bucket.eq."restaurant-images",storage_path.like."*/marketing-assets/${restaurantId}/*"))`);
    expect(url.searchParams.get("offset")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("quotes a configured bucket as a PostgREST literal", () => {
    const bucket = 'brand,"quoted"\\bucket';
    const filter = marketingReferenceStorageFilter(restaurantId, bucket);
    expect(filter).toContain(`storage_bucket.eq.${JSON.stringify(bucket)},storage_path.like.`);
  });
});
