import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("directory commercial restaurant name governance", () => {
  const migration = read("supabase/migrations/20260831144500_directory_commercial_name_gate.sql");
  const displayNameHardening = read(
    "supabase/migrations/20260901182818_harden_directory_restaurant_display_names.sql",
  );
  const worker = read("supabase/functions/verify-directory-commercial-names/index.ts");

  it("hides unverified legal-entity directory names from every public restaurant read path", () => {
    expect(migration).toContain("directory_public_name_verified boolean NOT NULL DEFAULT false");
    expect(migration).toContain("directory_name_looks_legal_entity");
    expect(migration).toContain("restaurants_public_select");
    expect(migration).toContain("production_hide_demo_restaurants");
    expect(migration).toContain("scope_production_restaurants_for_commercial_demo_accounts");
    expect(migration).toContain("restaurant_is_publicly_visible");
    expect(migration.match(/is_directory_listing IS FALSE OR directory_public_name_verified IS TRUE/g)?.length || 0).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("v_visible_unverified");
    expect(migration).toContain("verified legal-entity names");
  });

  it("keeps public-source restaurant names only when they do not look like corporate legal identities", () => {
    expect(migration).toContain("public_restaurant_listing");
    expect(migration).toContain("public_restaurant_registry_label");
    expect(migration).toContain("pending_commercial_name");
    expect(migration).toContain("duplicate_legal_entity_hidden");
    expect(migration).toContain("legal_name = COALESCE(NULLIF(btrim(r.legal_name), ''), r.name)");
    expect(migration).toContain("c.branch = 'Restaurant référencé sur TheFork'");
    expect(migration).toContain("Restaurants, cafés, snack-bar, tea-rooms et salons de dégustation de glaces");
  });

  it("fails closed for registry labels that may contain a proprietor or legal entity", () => {
    expect(displayNameHardening).toContain("directory_registry_name_needs_commercial_verification");
    expect(displayNameHardening).toContain("position(',' IN value) > 0");
    expect(displayNameHardening).toContain("position('/' IN value) > 0");
    expect(displayNameHardening).toContain("OR name_key !~");
    expect(displayNameHardening).toContain("titulaire|succursale|proprietaire|zweigniederlassung");
    expect(displayNameHardening).toContain("pending_registry_commercial_name_recheck");
    expect(displayNameHardening).toContain("directory_public_name_verified = false");
    expect(displayNameHardening).toContain("restaurants_01_protect_directory_public_name_quality");
    expect(displayNameHardening).toContain("v_ambiguous_visible");
  });

  it("protects the reported Ahmet Sahin case while retaining the verified Les Ormeaux listing", () => {
    expect(displayNameHardening).toContain("public.normalize_search_text(r.name) = 'ahmet sahin'");
    expect(displayNameHardening).toContain("maria otilia de oliveira martins teixeira");
    expect(displayNameHardening).toContain("public.normalize_search_text(r.name) = 'les ormeaux'");
    expect(displayNameHardening).toContain("Route de Chancy 25");
    expect(displayNameHardening).toContain("Petit-Lancy");
    expect(displayNameHardening).toContain("official_website_manual_review");
    expect(displayNameHardening).toContain("https://www.pizzeria-les-ormeaux.ch/");
    expect(displayNameHardening).toContain("Ahmet Sahin legal identity must not be displayed as a restaurant name");
  });

  it("preserves every raw label for review instead of deleting directory data", () => {
    expect(displayNameHardening).toContain(
      "legal_name = COALESCE(NULLIF(btrim(r.legal_name), ''), r.name)",
    );
    expect(displayNameHardening).not.toMatch(/DELETE\s+FROM\s+public\.restaurants/i);
    expect(displayNameHardening).not.toMatch(/DROP\s+TABLE/i);
  });

  it("queues unresolved names separately from image jobs and remains resumable", () => {
    expect(migration).toContain("restaurant_directory_name_jobs");
    expect(migration).toContain("service_claim_directory_name_jobs");
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("j.attempts < 3");
    expect(migration).toContain("tok-directory-commercial-name-verification");
    expect(migration).toContain("verify-directory-commercial-names");
    expect(migration).toContain("internal_cron_secret");
  });

  it("verifies commercial names from the establishment website without changing canonical slugs", () => {
    expect(worker).toContain('engine: "native_commercial_name_verifier"');
    expect(worker).toContain("Deno.resolveDns");
    expect(worker).toContain("robots.txt");
    expect(worker).toContain("crawl-delay");
    expect(worker).toContain("RESTAURANT_SCHEMA_TYPES");
    expect(worker).toContain("collectJsonLdRestaurantNames");
    expect(worker).toContain('key === "og:site_name"');
    expect(worker).toContain("<h1\\b");
    expect(worker).toContain("<title\\b");
    expect(worker).toContain("scoreSiteIdentity");
    expect(worker).toContain("MIN_SITE_IDENTITY_SCORE");
    expect(worker).toContain("legal_name: oldLegalName || null");
    expect(worker).toContain("name: candidate.name");
    expect(worker).toContain("directory_public_name_verified: true");
    expect(worker).not.toContain("slug:");
    expect(worker).not.toContain("FIRECRAWL_API_KEY");
    expect(worker).not.toContain("api.firecrawl.dev");
  });
});
