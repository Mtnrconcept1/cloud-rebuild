import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant image discovery ingestion", () => {
  it("consumes only URL-backed discovery jobs through the official-site truth pipeline", () => {
    const worker = read("supabase/functions/enrich-directory-images/index.ts");
    const migration = read("supabase/migrations/20260925015352_schedule_directory_image_discovery.sql");

    expect(worker).toContain('mode === "process_discovery_batch"');
    expect(worker).toContain('"claim_restaurant_image_discovery_jobs_for_edge"');
    expect(worker).toContain('"settle_restaurant_image_discovery_job"');
    expect(worker).toContain('"restaurant_image_truth_reviews"');
    expect(worker).toContain('["verified", "rejected", "manual_review"]');
    expect(worker).toContain('"source_page_url"');
    expect(worker).toContain('!host.includes(".")');
    expect(worker).toContain("scoreSiteIdentity");
    expect(worker).toContain("extractImageCandidates");
    expect(worker).toContain("validateImageUrl");
    expect(worker).toContain("official_source_candidate_discovery");
    expect(worker).toContain("official_source_identity_not_verified");
    expect(worker).toContain("official_source_missing_or_rejected");
    expect(worker).toContain('action: "directory_image_discovery_batch"');

    expect(migration).toContain("claim_restaurant_image_discovery_jobs_for_edge");
    expect(migration).toContain("FOR UPDATE OF jobs SKIP LOCKED");
    expect(migration).toContain("image_jobs.source_page_url");
    expect(migration).toContain("jobs.status IN ('queued', 'retry', 'no_candidate')");
    expect(migration).toContain("Restaurant référencé sur TheFork");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.claim_restaurant_image_discovery_jobs_for_edge(integer)");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("schedules a low-throughput discovery worker with the internal cron secret", () => {
    const migration = read("supabase/migrations/20260925015352_schedule_directory_image_discovery.sql");

    expect(migration).toContain("tok-directory-image-discovery");
    expect(migration).toContain("/enrich-directory-images");
    expect(migration).toContain('"mode":"process_discovery_batch"');
    expect(migration).toContain('"limit":1');
    expect(migration).toContain("x-internal-cron-secret");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("timeout_milliseconds := 55000");
    expect(migration).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });
});
