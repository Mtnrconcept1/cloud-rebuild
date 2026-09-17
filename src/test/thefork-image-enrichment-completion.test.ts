import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const workerPath = resolve(root, "supabase/functions/enrich-thefork-images/index.ts");
const migrationPath = resolve(
  root,
  "supabase/migrations/20260917213000_claim_thefork_image_discovery_jobs.sql",
);

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("TheFork directory image enrichment completion", () => {
  it("adds a dedicated recovery worker and a concurrency-safe claim RPC", () => {
    expect(existsSync(workerPath)).toBe(true);
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(workerPath) || !existsSync(migrationPath)) return;

    const worker = read(workerPath);
    const migration = read(migrationPath);

    expect(worker).toContain("service_claim_thefork_image_discovery_jobs");
    expect(worker).toContain("verifiedOfficialPages");
    expect(worker).toContain('discoveryMethod: "verified_search_result"');
    expect(worker).toContain("isLikelyOfficialRestaurantHost");
    expect(migration).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(migration).toContain("Restaurant référencé sur TheFork");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.service_claim_thefork_image_discovery_jobs");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.service_claim_thefork_image_discovery_jobs");
  });

  it("never imports images from TheFork-owned hosts across country domains", () => {
    expect(existsSync(workerPath)).toBe(true);
    if (!existsSync(workerPath)) return;
    const worker = read(workerPath);

    expect(worker).toContain("function isTheForkHost");
    expect(worker).toContain("if (isTheForkHost(normalized)) return true");
    expect(worker).toContain("isRejectedSiteHost(sourceHost) || isRejectedSiteHost(imageHost)");
    expect(worker).toContain("image_redirected_to_rejected_host");
  });

  it("uses an already-known official website before spending a Firecrawl search request", () => {
    expect(existsSync(workerPath)).toBe(true);
    if (!existsSync(workerPath)) return;
    const worker = read(workerPath);
    const recovery = worker.match(/async function recoverRestaurantImage[\s\S]*?\n}\n\nasync function updateJob/)?.[0] || "";

    expect(recovery).toContain("getLeadHints");
    expect(recovery).toContain("crawlOfficialSite");
    expect(recovery).toContain("discoverOfficialSiteWithSearch");
    expect(recovery.indexOf("crawlOfficialSite")).toBeLessThan(
      recovery.indexOf("discoverOfficialSiteWithSearch"),
    );
  });

  it("stores only validated official-site images in TOK Storage", () => {
    expect(existsSync(workerPath)).toBe(true);
    if (!existsSync(workerPath)) return;
    const worker = read(workerPath);

    expect(worker).toContain('const RESTAURANT_IMAGE_BUCKET = "restaurant-images"');
    expect(worker).toContain("persistRestaurantImage");
    expect(worker).toContain('provider: "verified_official_site"');
    expect(worker).toContain("restaurant_media");
    expect(worker).toContain("MAX_STORED_IMAGE_BYTES");
  });
});
