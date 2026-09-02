import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  const absolute = resolve(root, path);
  expect(existsSync(absolute), `${path} should exist`).toBe(true);
  return readFileSync(absolute, "utf8");
}

const migrationPath = "supabase/migrations/20260902060000_directory_cuisine_osm_backfill.sql";
const functionPath = "supabase/functions/enrich-directory-cuisines-osm/index.ts";

describe("directory cuisine OSM backfill", () => {
  it("keeps the queue resumable, private, prioritized and non-destructive", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("restaurant_directory_cuisine_osm_jobs");
    expect(migration).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(migration).toContain("job.attempts < 5");
    expect(migration).toContain("directory_public_name_verified IS TRUE THEN 100");
    expect(migration).toContain("REVOKE ALL ON TABLE public.restaurant_directory_cuisine_osm_jobs FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("service_claim_directory_cuisine_osm_jobs");
    expect(migration).toContain("service_apply_directory_cuisine_osm_evidence");
    expect(migration).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.restaurant_cuisines/i);
    expect(migration).not.toContain("migration repair");
    expect(migration).not.toContain("--status reverted");
  });

  it("retains explicit OSM provenance and multiple cuisine assignments", () => {
    const migration = read(migrationPath);
    const worker = read(functionPath);

    expect(migration).toContain("'openstreetmap_live'");
    expect(migration).toContain("ON CONFLICT (restaurant_id, cuisine_id, source_kind) DO UPDATE");
    expect(migration).toContain("INSERT INTO public.restaurant_cuisines");
    expect(worker).toContain("tags.cuisine");
    expect(worker).toContain("cuisineTokens(rawCuisine)");
    expect(worker).toContain("diet:vegan");
    expect(worker).toContain("diet:vegetarian");
    expect(worker).toContain("diet:halal");
    expect(worker).toContain("MAX_BATCH_SIZE = 24");
  });

  it("matches OSM establishments with identity evidence instead of nearest-place guessing", () => {
    const worker = read(functionPath);

    expect(worker).toContain("haversineMeters");
    expect(worker).toContain("same_phone");
    expect(worker).toContain("same_website");
    expect(worker).toContain("same_house_number");
    expect(worker).toContain("street_similarity");
    expect(worker).toContain("directory_public_name_verified === true");
    expect(worker).toContain("uniqueVeryNear");
    expect(worker).toContain("best.score >= 12");
    expect(worker).not.toContain('slug: "international", label: "International", confidence: 0.5');
  });

  it("queries only food amenities through bounded Overpass calls and has endpoint failover", () => {
    const worker = read(functionPath);

    expect(worker).toContain("https://overpass-api.de/api/interpreter");
    expect(worker).toContain("https://overpass.kumi.systems/api/interpreter");
    expect(worker).toContain("OSM_RADIUS_METERS = 140");
    expect(worker).toContain('amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$');
    expect(worker).toContain("AbortSignal.timeout(OVERPASS_TIMEOUT_MS)");
  });

  it("schedules a fast second pass without exposing scheduler credentials", () => {
    const migration = read(migrationPath);
    const config = read("supabase/config.toml");

    expect(migration).toContain("tok-directory-cuisine-osm-enrichment");
    expect(migration).toContain("/enrich-directory-cuisines-osm");
    expect(migration).toContain('{"mode":"process_batch","limit":24,"source":"cron"}');
    expect(migration).toContain("FROM vault.decrypted_secrets");
    expect(migration).toContain("WHERE name = 'internal_cron_secret'");
    expect(config).toContain("[functions.enrich-directory-cuisines-osm]\nverify_jwt = false");
  });
});
