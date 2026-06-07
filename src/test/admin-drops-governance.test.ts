import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function latestMigrationContaining(pattern: RegExp) {
  const match = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));
  if (!match) throw new Error(`No migration found for ${pattern}`);
  return readFileSync(resolve(migrationsDir, match), "utf8");
}

const migrationsSource = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
  .join("\n");

describe("admin Chef Table drops governance", () => {
  it("adds audited save/archive RPCs and blocks editing sold drops", () => {
    const sql = latestMigrationContaining(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_save_chef_table_drop/i);

    expect(migrationsSource).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+archived_at/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_save_chef_table_drop/i);
    expect(migrationsSource).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_archive_chef_table_drop/i);
    expect(migrationsSource).toMatch(/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.chef_table_drops\s+FROM\s+authenticated/i);
    expect(sql).toMatch(/already sold; archive it instead of editing/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
  });

  it("routes the admin UI through the audited RPCs instead of direct CRUD", () => {
    const page = read("src/pages/admin/DropsManagement.tsx");

    expect(page).toContain("admin_save_chef_table_drop");
    expect(page).toContain("admin_archive_chef_table_drop");
    expect(page).toContain("Raison obligatoire pour archiver ce drop");
    expect(page).toContain('.is("archived_at", null)');
    expect(page).not.toContain('.from("chef_table_drops" as any).update');
    expect(page).not.toContain('.from("chef_table_drops" as any).insert');
    expect(page).not.toContain('.from("chef_table_drops" as any).delete');
  });
});
