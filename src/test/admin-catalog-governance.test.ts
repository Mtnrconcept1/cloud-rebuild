import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function latestMigrationContaining(pattern: RegExp) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));
  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("admin catalog governance", () => {
  it("adds audited catalog RPCs and publication validation", () => {
    const sql = latestMigrationContaining(/admin_catalog_change_history/i);

    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.admin_catalog_change_history/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_save_catalog_collection/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_archive_catalog_collection/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_reorder_catalog_collections/i);
    expect(sql).toMatch(/collection cannot be published without restaurants/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
  });

  it("exposes upload, preview, sort and validated publishing controls", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminCatalog.tsx"), "utf8");

    expect(page).toContain("admin_save_catalog_collection");
    expect(page).toContain("admin_archive_catalog_collection");
    expect(page).toContain("admin_reorder_catalog_collections");
    expect(page).toContain("uploadCatalogMedia");
    expect(page).toContain("Aperçu public");
    expect(page).toContain("Monter");
    expect(page).toContain("Descendre");
    expect(page).toContain("collectionForm.restaurant_ids.length === 0");
    expect(page).toContain("ADMIN_CATALOG_CUISINES_LIMIT");
    expect(page).toContain("ADMIN_CATALOG_COLLECTIONS_LIMIT");
    expect(page).toContain("ADMIN_CATALOG_COLLECTION_LINKS_LIMIT");
    expect(page).toContain("ADMIN_CATALOG_RESTAURANTS_LIMIT");
    expect(page).toContain(".limit(ADMIN_CATALOG_CUISINES_LIMIT)");
    expect(page).toContain(".limit(ADMIN_CATALOG_COLLECTIONS_LIMIT)");
    expect(page).toContain(".limit(ADMIN_CATALOG_COLLECTION_LINKS_LIMIT)");
    expect(page).toContain(".limit(ADMIN_CATALOG_RESTAURANTS_LIMIT)");
    expect(page).not.toContain('.from("collections").delete');
    expect(page).not.toContain('.from("collection_restaurants").delete');
  });

  it("governs cuisine taxonomy through audited admin RPCs", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_upsert_cuisine/i);
    const page = readFileSync(resolve(root, "src/pages/admin/AdminCatalog.tsx"), "utf8");

    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+archived_at/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_upsert_cuisine/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_archive_cuisine/i);
    expect(sql).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.cuisines\s+FROM\s+authenticated/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(page).toContain("admin_upsert_cuisine");
    expect(page).toContain("admin_archive_cuisine");
    expect(page).toContain("Raison obligatoire pour archiver cette cuisine");
    expect(page).not.toContain('.from("cuisines").insert');
    expect(page).not.toContain('.from("cuisines").delete');
  });

  it("pins the cuisine slug normalizer search path after security lint", () => {
    const sql = latestMigrationContaining(/admin_normalize_cuisine_slug/i);

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_normalize_cuisine_slug\(p_name\s+text\)/i);
    expect(sql).toMatch(/IMMUTABLE\s+SET\s+search_path\s*=\s*public/i);
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.admin_normalize_cuisine_slug\(text\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.admin_normalize_cuisine_slug\(text\)\s+FROM\s+anon/i);
  });
});
