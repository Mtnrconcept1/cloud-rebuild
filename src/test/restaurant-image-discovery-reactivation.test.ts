import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904173300_restaurant_image_discovery_reactivation.sql",
  "utf8",
);

describe("restaurant image discovery reactivation", () => {
  it("only skips an update when the old row was already fully eligible", () => {
    expect(migration).toContain("v_old_was_eligible boolean := false");
    expect(migration).toContain("COALESCE(OLD.is_active, false)");
    expect(migration).toContain("COALESCE(OLD.is_directory_listing, false)");
    expect(migration).toContain(
      "COALESCE(OLD.directory_public_name_verified, false)",
    );
    expect(migration).toContain("NULLIF(btrim(OLD.image_url), '') IS NULL");
    expect(migration).toContain("IF v_old_was_eligible");
  });

  it("requeues a newly active or newly public verified restaurant without an image", () => {
    expect(migration).toContain("restaurant_image_discovery_jobs");
    expect(migration).toContain("ON CONFLICT (restaurant_id) DO UPDATE");
    expect(migration).toContain("ELSE 'queued'");
    expect(migration).toContain("ELSE now()");
  });

  it("remains additive and inaccessible to public API roles", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.queue_restaurant_image_discovery_after_name_verification()",
    );
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|SCHEMA)/i);
  });
});
