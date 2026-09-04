import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904173200_restaurant_image_discovery_trigger.sql",
  "utf8",
);
const claimEligibilityMigration = readFileSync(
  "supabase/migrations/20260904173400_restaurant_image_discovery_claim_eligibility.sql",
  "utf8",
);

describe("restaurant image discovery continuation trigger", () => {
  it("queues image discovery when a directory name becomes verified", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.queue_restaurant_image_discovery_after_name_verification()",
    );
    expect(migration).toContain(
      "CREATE TRIGGER trg_queue_restaurant_image_discovery_after_name_verification",
    );
    expect(migration).toContain("directory_public_name_verified");
    expect(migration).toContain("directory_public_name_source_url");
    expect(migration).toContain("restaurant_image_discovery_jobs");
    expect(migration).toContain("ON CONFLICT (restaurant_id) DO UPDATE");
  });

  it("never schedules inactive, non-directory or already imaged restaurants", () => {
    expect(migration).toContain("COALESCE(NEW.is_active, false)");
    expect(migration).toContain("COALESCE(NEW.is_directory_listing, false)");
    expect(migration).toContain(
      "COALESCE(NEW.directory_public_name_verified, false)",
    );

    const imageGuard = migration.indexOf(
      "OR NULLIF(btrim(NEW.image_url), '') IS NOT NULL",
    );
    const discoveryInsert = migration.indexOf(
      "INSERT INTO public.restaurant_image_discovery_jobs",
    );
    expect(imageGuard).toBeGreaterThanOrEqual(0);
    expect(imageGuard).toBeLessThan(discoveryInsert);
  });

  it("applies restaurant eligibility to every claimable discovery status", () => {
    expect(claimEligibilityMigration).toMatch(
      /WHERE\s+\(\s*\(\s*jobs\.status[\s\S]*?\)\s+OR\s+\([\s\S]*?\)\s*\)\s+AND\s+COALESCE\(restaurant\.is_active, false\)/,
    );
    expect(claimEligibilityMigration).toContain(
      "AND COALESCE(restaurant.directory_public_name_verified, false)",
    );
    expect(claimEligibilityMigration).toContain(
      "AND NULLIF(btrim(restaurant.image_url), '') IS NULL",
    );
  });

  it("keeps the continuation additive and service-internal", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.queue_restaurant_image_discovery_after_name_verification()",
    );
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);

    expect(claimEligibilityMigration).toContain("SECURITY DEFINER");
    expect(claimEligibilityMigration).toContain("SET search_path = ''");
    expect(claimEligibilityMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_restaurant_image_discovery_jobs(integer)",
    );
    expect(claimEligibilityMigration).not.toMatch(/DELETE\s+FROM/i);
    expect(claimEligibilityMigration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });
});
