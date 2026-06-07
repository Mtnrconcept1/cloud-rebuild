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

describe("Chef Table VIP Miamz access", () => {
  it("stores audited VIP access requirements on chef table drops", () => {
    const sql = latestMigrationContaining(/required_miamz_points/i);

    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+is_vip\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+required_miamz_points\s+integer\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    expect(sql).toMatch(/chef_table_drops_vip_miamz_check/i);
    expect(sql).toMatch(/p_payload->>'is_vip'/i);
    expect(sql).toMatch(/p_payload->>'required_miamz_points'/i);
    expect(sql).toMatch(/v_is_vip/i);
    expect(sql).toMatch(/v_required_miamz_points/i);
  });

  it("lets admins mark a drop VIP and configure the Miamz threshold through the governed RPC", () => {
    const page = read("src/pages/admin/DropsManagement.tsx");

    expect(page).toContain("Table VIP");
    expect(page).toContain("required_miamz_points");
    expect(page).toContain("MIAMZ_VIP_TABLE_DEFAULT_THRESHOLD");
    expect(page).toContain("admin_save_chef_table_drop");
  });

  it("surfaces and blocks VIP drops in the client flow before checkout", () => {
    const page = read("src/pages/ChefsTable.tsx");

    expect(page).toContain("is_vip");
    expect(page).toContain("required_miamz_points");
    expect(page).toContain("Acces VIP Miamz");
    expect(page).toContain("ensureVipMiamzAccess");
    expect(page).toContain("loyalty_points");
  });
});
