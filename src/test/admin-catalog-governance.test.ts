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
    expect(page).not.toContain('.from("collections").delete');
    expect(page).not.toContain('.from("collection_restaurants").delete');
  });
});
