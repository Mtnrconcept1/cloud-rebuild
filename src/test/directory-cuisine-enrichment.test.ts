import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant directory cuisine enrichment", () => {
  it("seeds verified multi-cuisine evidence with private provenance", () => {
    const migration = read("supabase/migrations/20260901203000_directory_cuisine_enrichment.sql");

    expect(migration).toContain("restaurant_cuisine_evidence");
    expect(migration).toContain("PRIMARY KEY (restaurant_id, cuisine_id, source_kind)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.restaurant_cuisine_evidence FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("openstreetmap");
    expect(migration).toContain("official_website");
    expect(migration).toContain("vetted_targeted_web_search");
    expect(migration).toContain("INSERT INTO public.restaurant_cuisines");
    expect(migration).toContain("ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING");
    expect(migration).toContain("Generated from 4049 restaurant records");
  });

  it("keeps unresolved and future directory records in a resumable service-only queue", () => {
    const migration = read("supabase/migrations/20260901203000_directory_cuisine_enrichment.sql");

    expect(migration).toContain("restaurant_directory_cuisine_jobs");
    expect(migration).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(migration).toContain("job.attempts < 5");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("service_apply_directory_cuisine_evidence");
    expect(migration).toContain("jsonb_array_length(p_assignments) > 12");
    expect(migration).toContain("restaurants_enqueue_directory_cuisine_research");
    expect(migration).toContain("tok-directory-cuisine-enrichment");
    expect(migration).toContain("/enrich-directory-cuisines");
    expect(migration).toContain("x-internal-cron-secret");
  });

  it("only accepts cuisine proof from an identity-matched official site", () => {
    const worker = read("supabase/functions/enrich-directory-cuisines/index.ts");

    expect(worker).not.toContain("FIRECRAWL_API_KEY");
    expect(worker).not.toContain("api.firecrawl.dev");
    expect(worker).toContain('engine: "native_official_site_cuisine_verifier"');
    expect(worker).toContain("const MAX_BATCH_SIZE = 3");
    expect(worker).toContain("allowSchedulerSecret: true");
    expect(worker).toContain("is_directory_listing");
    expect(worker).toContain("REJECTED_SITE_HOSTS");
    expect(worker).toContain("Deno.resolveDns");
    expect(worker).toContain("unsafe_or_private_host");
    expect(worker).toContain("robots.txt");
    expect(worker).toContain("parseRobotsPolicy");
    expect(worker).toContain("crawl-delay");
    expect(worker).toContain("scoreSiteIdentity");
    expect(worker).toContain("MIN_CATALOG_SITE_SCORE");
    expect(worker).toContain("servesCuisine");
    expect(worker).toContain("jsonld_serves_cuisine");
    expect(worker).toContain("official_page_phrase");
    expect(worker).toContain("service_apply_directory_cuisine_evidence");
  });
});
