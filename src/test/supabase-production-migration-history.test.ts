import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");

// These filenames come from the production schema_migrations ledger via the
// read-only `supabase migration fetch` command. Production is the canonical
// version source; changing one would reintroduce the deploy drift.
const productionHistory = [
  "20260914224100_add_directory_display_name.sql",
  "20260915183203_admin_thefork_only_catalog_filter.sql",
  "20260915183625_admin_thefork_only_catalog_filter.sql",
  "20260915183715_thefork_deploy_probe.sql",
  "20260915183730_create_restaurant_thefork_catalog.sql",
  "20260915183738_extend_restaurant_thefork_catalog.sql",
  "20260915183744_seed_public_restaurant_source_flag.sql",
  "20260915183752_populate_restaurant_thefork_catalog.sql",
  "20260915184411_create_public_restaurant_all_sources_helper.sql",
  "20260915184416_create_restaurant_thefork_member_helper.sql",
  "20260915184421_create_restaurant_source_display_helper.sql",
  "20260915184427_secure_thefork_visibility_helpers.sql",
  "20260915184436_gate_restaurants_public_select_by_source.sql",
  "20260915184441_gate_production_restaurant_reads_by_source.sql",
  "20260915184447_gate_commercial_demo_production_reads_by_source.sql",
  "20260915184514_secure_restaurant_thefork_catalog_table.sql",
  "20260915184551_gate_public_catalog_rpc_by_thefork_source.sql",
  "20260915184600_remove_thefork_deploy_probe.sql",
  "20260917212632_claim_thefork_image_discovery_jobs.sql",
  "20260917213543_prioritize_thefork_image_truth_reviews.sql",
  "20260917213646_fix_thefork_truth_priority_internal_call.sql",
  "20260917214232_thefork_official_site_discovery.sql",
  "20260918031431_claim_thefork_image_truth_reviews.sql",
  "20260918031434_thefork_official_site_discovery.sql",
  "20260918031741_fix_thefork_site_discovery_handoff.sql",
  "20260918032031_backoff_thefork_site_discovery_provider.sql",
  "20260918032409_recover_stale_thefork_image_worker_leases.sql",
  "20260924044424_restrict_internal_print_rpc_execution.sql",
  "20260924044438_qualify_invoice_logo_storage_paths.sql",
  "20260924044449_align_restaurant_public_read_policies.sql",
] as const;

// These prepared Git timestamps were never recorded by production. Keeping
// them would make `db push --include-all` replay SQL that is already live.
const supersededLocalAliases = [
  "20260915200000_admin_thefork_only_catalog_filter.sql",
  "20260917213000_claim_thefork_image_discovery_jobs.sql",
  "20260917221000_claim_thefork_image_truth_reviews.sql",
  "20260917223000_thefork_official_site_discovery.sql",
  "20260917224000_fix_thefork_site_discovery_handoff.sql",
  "20260917225000_backoff_thefork_site_discovery_provider.sql",
  "20260917226000_recover_stale_thefork_image_worker_leases.sql",
] as const;

describe("Supabase production migration history", () => {
  it("keeps every migration version recorded by production in Git", () => {
    for (const name of productionHistory) {
      const path = resolve(migrationsDirectory, name);
      expect(existsSync(path), `${name} must remain addressable`).toBe(true);
      expect(readFileSync(path, "utf8").trim().length, `${name} must contain SQL`).toBeGreaterThan(0);
    }
  });

  it("does not reintroduce local aliases that production never recorded", () => {
    for (const name of supersededLocalAliases) {
      expect(existsSync(resolve(migrationsDirectory, name)), `${name} must stay retired`).toBe(false);
    }
  });
});
