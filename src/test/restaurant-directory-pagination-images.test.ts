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
    expect(searchPage).toContain("const SEARCH_PAGE_SIZE = 54");
    expect(searchPage).toContain('"search_restaurants_catalog_page"');
    expect(searchPage).toContain("total_count");
    expect(searchPage).toContain("p_offset: offset");
    expect(searchPage).toContain("getNextPageParam");
    expect(searchPage).toContain("IntersectionObserver");
    expect(searchPage).toContain('rootMargin: "600px 0px"');
    expect(searchPage).toContain("loadMoreRef");
    expect(searchPage).toContain("organicSearchTotal");
    expect(searchPage).toContain("Charger les ${SEARCH_PAGE_SIZE} suivants");

    expect(localPage).toContain("useInfiniteQuery");
    expect(localPage).toContain("const LOCAL_RESTAURANT_PAGE_SIZE = 60");
    expect(localPage).toContain("p_offset: offset");
    expect(localPage).toContain("rawItems.length === LOCAL_RESTAURANT_PAGE_SIZE");
    expect(localPage).toContain("Charger plus de restaurants");
  });

  it("returns stable visible pages with an exact filtered total", () => {
    const migration = read("supabase/migrations/20260901170943_public_restaurant_catalog_infinite_scroll.sql");

    expect(migration).toContain("search_restaurants_catalog_page");
    expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 54), 1), 54)");
    expect(migration).toContain("WHERE public.restaurant_is_publicly_visible(result.id)");
    expect(migration).toContain("count(*)::bigint AS total_count");
    expect(migration).toContain("row_number() OVER");
    expect(migration).toContain("visible.id ASC");
    expect(migration).toContain("PUBLIC must not execute catalog pagination directly");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog_page");
    expect(migration).toContain("TO anon, authenticated, service_role");
  });

  it("keeps native image enrichment resumable, polite, SSRF-safe and directory-scoped", () => {
    const migration = read("supabase/migrations/20260831081000_directory_image_enrichment.sql");
    const worker = read("supabase/functions/enrich-directory-images/index.ts");

    expect(migration).toContain("restaurant_directory_image_jobs");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.restaurant_directory_image_jobs FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("j.attempts < 3");
    expect(migration).toContain("x-internal-cron-secret");
    expect(migration).toContain("/enrich-directory-images");

    expect(worker).not.toContain("FIRECRAWL_API_KEY");
    expect(worker).not.toContain("api.firecrawl.dev");
    expect(worker).toContain('engine: "native_scraper"');
    expect(worker).toContain("const MAX_BATCH_SIZE = 3");
    expect(worker).toContain("allowSchedulerSecret: true");
    expect(worker).toContain("is_directory_listing");
    expect(worker).toContain("REJECTED_IMAGE_PARTS");
    expect(worker).toContain("REJECTED_SITE_HOSTS");
    expect(worker).toContain("FREE_EMAIL_DOMAINS");
    expect(worker).toContain("business_email_domain");
    expect(worker).toContain("domain_guess");
    expect(worker).toContain("Deno.resolveDns");
    expect(worker).toContain("unsafe_or_private_host");
    expect(worker).toContain("robots.txt");
    expect(worker).toContain("parseRobotsPolicy");
    expect(worker).toContain("crawl-delay");
    expect(worker).toContain("og:image");
    expect(worker).toContain("addJsonImageValues");
    expect(worker).toContain('add(image, "jsonld")');
    expect(worker).toContain('attrs["data-src"]');
    expect(worker).toContain("validateImageUrl");
    expect(worker).toContain("getLeadHints");
    expect(worker).toContain("scoreSiteIdentity");
    expect(worker).not.toContain('.from("restaurant_media")');
  });
});
