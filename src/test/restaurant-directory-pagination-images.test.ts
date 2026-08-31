import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public restaurant directory pagination and images", () => {
  it("keeps restaurant search paginated instead of truncating the catalogue", () => {
    const searchPage = read("src/pages/Recherche.tsx");
    const localPage = read("src/pages/LocalRestaurants.tsx");

    expect(searchPage).toContain("useInfiniteQuery");
    expect(searchPage).toContain("const SEARCH_PAGE_SIZE = 90");
    expect(searchPage).toContain("p_offset: offset");
    expect(searchPage).toContain("getNextPageParam");
    expect(searchPage).toContain("Charger plus de restaurants");

    expect(localPage).toContain("useInfiniteQuery");
    expect(localPage).toContain("const LOCAL_RESTAURANT_PAGE_SIZE = 60");
    expect(localPage).toContain("p_offset: offset");
    expect(localPage).toContain("rawItems.length === LOCAL_RESTAURANT_PAGE_SIZE");
    expect(localPage).toContain("Charger plus de restaurants");
  });

  it("keeps internet image enrichment resumable, server-only and directory-scoped", () => {
    const migration = read("supabase/migrations/20260831081000_directory_image_enrichment.sql");
    const worker = read("supabase/functions/enrich-directory-images/index.ts");

    expect(migration).toContain("restaurant_directory_image_jobs");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.restaurant_directory_image_jobs FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("j.attempts < 3");
    expect(migration).toContain("x-internal-cron-secret");
    expect(migration).toContain("/enrich-directory-images");

    expect(worker).toContain("FIRECRAWL_API_KEY");
    expect(worker).toContain("allowSchedulerSecret: true");
    expect(worker).toContain("is_directory_listing");
    expect(worker).toContain("REJECTED_IMAGE_PARTS");
    expect(worker).toContain("validateImageUrl");
    expect(worker).toContain("getOfficialWebsite");
    expect(worker).toContain("confidence_score");
  });
});
