import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904173200_restaurant_image_discovery_trigger.sql",
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
    expect(migration).toContain("NULLIF(btrim(NEW.image_url), '') IS NULL");
  });

  it("keeps the continuation additive and service-internal", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.queue_restaurant_image_discovery_after_name_verification()",
    );
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });
});
