import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

function readMigrationContaining(fragment: string) {
  const fileName = readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .filter((entry) => readFileSync(resolve(migrationsDir, entry), "utf8").includes(fragment))
    .sort()
    .at(-1);

  expect(fileName, `Missing migration containing ${fragment}`).toBeTruthy();
  return readFileSync(resolve(migrationsDir, fileName!), "utf8");
}

describe("plan 2 Supabase FK index readiness", () => {
  it("adds guarded FK indexes for launch-scale restaurant, cart, click and chef table tables", () => {
    const sql = readMigrationContaining("plan2_fk_index_specs");

    const expectedIndexes = [
      "idx_commercial_commissions_restaurant_id_fk",
      "idx_carts_restaurant_id_fk",
      "idx_clicks_impression_id_fk",
      "idx_clicks_user_id_fk",
      "idx_chef_table_checkout_holds_drop_id_fk",
      "idx_chef_table_checkout_holds_user_id_fk",
      "idx_chef_table_drops_restaurant_id_fk",
      "idx_favorites_restaurant_id_fk",
      "idx_favorites_user_id_fk",
    ];

    for (const indexName of expectedIndexes) {
      expect(sql).toContain(indexName);
    }

    expect(sql).toContain("to_regclass(format('%I.%I', 'public', index_spec.table_name)) IS NOT NULL");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)");
  });
});
