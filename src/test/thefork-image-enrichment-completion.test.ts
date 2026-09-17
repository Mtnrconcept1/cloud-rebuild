import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const workerPath = resolve(root, "supabase/functions/enrich-thefork-images/index.ts");
const truthWorkerPath = resolve(root, "supabase/functions/verify-directory-image-truth/index.ts");
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
    expect(worker).toContain('"verified_search_result"');
    expect(worker).toContain("isLikelyOfficialRestaurantHost");
    expect(migration).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(migration).toContain("Restaurant référencé sur TheFork");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.service_claim_thefork_image_discovery_jobs");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.service_claim_thefork_image_discovery_jobs");
  });

  it("schedules both truth verification and TheFork recovery through environment-bound edge URLs", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = read(migrationPath);

    expect(migration).toContain("invoke_directory_image_truth_worker");
    expect(migration).toContain("invoke_thefork_image_recovery_worker");
    expect(migration).toContain("marketing_edge_url");
    expect(migration).toContain("internal_cron_secret");
    expect(migration).toContain("tok-directory-image-truth-verifier");
    expect(migration).toContain("tok-thefork-image-recovery");
    expect(migration).not.toContain("vault.decrypted_secrets s WHERE s.name = 'SUPABASE_SERVICE_ROLE_KEY'");
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

  it("stores only validated official-site images in TOK Storage before quarantine verification", () => {
    expect(existsSync(workerPath)).toBe(true);
    if (!existsSync(workerPath)) return;
    const worker = read(workerPath);

    expect(worker).toContain('const RESTAURANT_IMAGE_BUCKET = "restaurant-images"');
    expect(worker).toContain("persistRestaurantImage");
    expect(worker).toContain('provider: "verified_official_site"');
    expect(worker).toContain("restaurant_image_truth_reviews");
    expect(worker).toContain("MAX_STORED_IMAGE_BYTES");
    expect(worker).toContain("quarantine_not_created");
  });

  it("verifies high-confidence official-source images without requiring OpenAI credits", () => {
    expect(existsSync(truthWorkerPath)).toBe(true);
    if (!existsSync(truthWorkerPath)) return;
    const verifier = read(truthWorkerPath);

    expect(verifier).toContain("tok-official-source-verifier-v1");
    expect(verifier).toContain("imageDimensions");
    expect(verifier).toContain("restaurant_directory_image_jobs");
    expect(verifier).toContain("source_page_url, source_image_url");
    expect(verifier).toContain("settle_restaurant_image_truth_review");
    expect(verifier).toContain("official_source_identity_verified");
    expect(verifier).not.toContain("OPENAI_API_KEY");
  });
});
