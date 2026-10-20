import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261020222733_repair_restaurant_image_discovery_sources.sql",
  "utf8",
);

describe("restaurant image discovery source repair", () => {
  it("uses catalogue websites rather than numeric directory identifiers", () => {
    expect(migration).toContain("SELECT source.url INTO v_source_url");
    expect(migration).toContain("image_job.source_page_url AS url");
    expect(migration).toContain("SELECT 2, contact.website");
    expect(migration).toContain("'^https?://[^[:space:]]+$'");
    expect(migration).not.toContain("NULLIF(btrim(NEW.directory_source_reference), '')");
  });

  it("repairs only eligible imageless jobs without an active lease or valid source", () => {
    expect(migration).toContain("COALESCE(restaurant.is_active, false)");
    expect(migration).toContain("COALESCE(restaurant.directory_public_name_verified, false)");
    expect(migration).toContain("NULLIF(btrim(restaurant.image_url), '') IS NULL");
    expect(migration).toContain("jobs.status <> 'processing'");
    expect(migration).toContain("COALESCE(jobs.source_url, '') !~*");
    expect(migration).not.toMatch(/UPDATE\s+public\.restaurants/i);
  });

  it("keeps discovery internal and leaves image publication to the truth pipeline", () => {
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).not.toMatch(/DELETE\s+FROM|DROP\s+(TABLE|COLUMN|SCHEMA)/i);
    expect(migration).not.toMatch(/SET\s+image_url|status\s*=\s*'verified'/i);
  });
});

