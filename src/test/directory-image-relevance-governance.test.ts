import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("directory restaurant image relevance governance", () => {
  const worker = read("supabase/functions/enrich-directory-images/index.ts");
  const migration = read(
    "supabase/migrations/20260904190000_directory_image_relevance_governance.sql",
  );

  it("continues from identity-matched official sites when Firecrawl is unavailable", () => {
    expect(worker).toContain('Deno.env.get("FIRECRAWL_API_KEY")?.trim()');
    expect(worker).not.toContain(
      'throw new HttpError(503, "FIRECRAWL_API_KEY not configured")',
    );
    expect(worker).toContain("firecrawlAvailable");
    expect(worker).toContain("official_site_without_firecrawl");
    expect(worker).toContain("findOfficialSiteCandidates");
    expect(worker).toContain("findExactSearchCandidates");
    expect(worker).toContain("catalog_website");
    expect(worker).toContain("business_email_domain");
    expect(worker).toContain("domain_guess");
    expect(worker).toContain("scoreSiteIdentity");
    expect(worker).toContain("identity.nameMatched");
    expect(worker).toContain("identity.addressMatched");
  });

  it("requires a low-cost visual proof that the physical restaurant is shown", () => {
    expect(worker).toContain("OPENAI_API_KEY");
    expect(worker).toContain('selectTokAiModel("image_economy")');
    expect(worker).toContain('type: "input_image"');
    expect(worker).toContain('detail: "low"');
    expect(worker).toContain("DIRECTORY_IMAGE_REVIEW_SCHEMA");
    expect(worker).toContain("shows_physical_restaurant");
    expect(worker).toContain("visible_business_name");
    expect(worker).toContain("name_match");
    expect(worker).toContain("restaurant_exterior");
    expect(worker).toContain("restaurant_interior");
    expect(worker).toContain("restaurant_storefront");
    expect(worker).toContain("restaurant_terrace");
    expect(worker).toContain("food_only");
    expect(worker).toContain("logo_or_graphic");
    expect(worker).toContain("generic_template");
    expect(worker).toContain("visualReview.approved");
    expect(worker).toContain("VISUAL_APPROVAL_MIN_CONFIDENCE");
    expect(worker).toContain("directory_image_visual_review");
    expect(worker).toContain('mode === "review_batch"');
    expect(worker).toContain("recordImageReview");
    expect(worker).toContain("rejectExistingImage");
  });

  it("rejects known generic templates before making a model call", () => {
    expect(worker).toContain("KNOWN_GENERIC_IMAGE_PATTERNS");
    expect(worker).toContain("menus_side_image");
    expect(worker).toContain("restaurant-menus-showcase-ooi");
    expect(worker).toContain("known_generic_template");
    expect(worker).toContain("looksLikeBrandingOnlyUrl");
  });

  it("makes image review durable, private, resumable and replacement-safe", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS review_status");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS review_attempts");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS reviewed_image_url");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS review_model");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.restaurant_directory_image_reviews");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.restaurant_directory_image_reviews FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("service_claim_directory_image_review_jobs");
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("directory_public_name_verified DESC");
    expect(migration).toContain("tok-directory-image-review");
    expect(migration).toContain('/enrich-directory-images');
    expect(migration).toContain('\"mode\":\"review_batch\"');
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("menus_side_image");
    expect(migration).toContain("restaurant-menus-showcase-ooi");
    expect(migration).toContain("review_verdict");
    expect(migration).toContain("previous_image_url");
    expect(migration).not.toMatch(/storage\.objects[\s\S]*DELETE/i);
    expect(migration).not.toMatch(/TRUNCATE\s+TABLE/i);
  });

  it("keeps the enrichment queue focused on publishable restaurants first", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.service_claim_directory_image_jobs",
    );
    expect(migration).toContain("r.directory_public_name_verified DESC");
    expect(migration).toContain("j.attempts < 3");
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("attempts = 0");
  });
});
