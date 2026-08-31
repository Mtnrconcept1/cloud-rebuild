import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = "supabase/migrations/20260831063500_public_geneva_restaurant_directory.sql";

function readMigration() {
  return readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf8");
}

describe("public restaurant directory migration", () => {
  it("imports only explicit restaurant branches and excludes non-restaurant prospect classes", () => {
    const migration = readMigration();

    expect(migration).toContain(
      "Restaurants, cafés, snack-bar, tea-rooms et salons de dégustation de glaces",
    );
    expect(migration).toContain("Restaurant référencé sur TheFork");
    expect(migration).toContain("c.branch IN ('Bars'");
    expect(migration).toContain("Administration et gestion d''établissements de restauration");
    expect(migration).toContain("Discothèques, dancings, night clubs");
  });

  it("keeps imported directory listings fail-closed for transactions", () => {
    const migration = readMigration();

    expect(migration).toContain("restaurants_directory_listing_fail_closed");
    expect(migration).toContain("COALESCE(supports_reservation, false) IS FALSE");
    expect(migration).toContain("COALESCE(delivery_available, false) IS FALSE");
    expect(migration).toContain("COALESCE(supports_pickup, false) IS FALSE");
    expect(migration).toContain("stripe_account_id IS NULL");
    expect(migration).toContain("COALESCE(stripe_connect_charges_enabled, false) IS FALSE");
    expect(migration).toContain("COALESCE(stripe_connect_payouts_enabled, false) IS FALSE");
  });

  it("tracks provenance and prevents client-owned directory state", () => {
    const migration = readMigration();

    expect(migration).toContain("is_directory_listing boolean NOT NULL DEFAULT false");
    expect(migration).toContain("directory_source_reference text");
    expect(migration).toContain("idx_restaurants_directory_source_reference");
    expect(migration).toContain("Les fiches annuaire sont gérées par le serveur.");
    expect(migration).toContain("La provenance annuaire est gérée par le serveur.");
  });
});
