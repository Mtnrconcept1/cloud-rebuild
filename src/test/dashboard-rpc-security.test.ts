import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigrationsContaining(functionName: string) {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      sql: readFileSync(resolve(migrationsDir, name), "utf8"),
    }))
    .filter(({ sql }) => sql.includes(`FUNCTION public.${functionName}`));
}

function latestFunctionBody(functionName: string) {
  const migrations = readMigrationsContaining(functionName);
  expect(migrations.length).toBeGreaterThan(0);
  return migrations[migrations.length - 1]!;
}

describe("dashboard RPC security migrations", () => {
  it.each([
    "get_restaurant_performance",
    "get_restaurant_comparison",
  ])("keeps owner/admin/service_role authorization in the latest %s definition", (functionName) => {
    const latest = latestFunctionBody(functionName);

    expect(latest.sql, `${functionName} latest migration ${latest.name}`).toMatch(/auth\.role\(\)\s*=\s*'service_role'/i);
    expect(latest.sql, `${functionName} latest migration ${latest.name}`).toMatch(/auth_owns_restaurant|owner_id\s*=\s*v_actor_id/i);
    expect(latest.sql, `${functionName} latest migration ${latest.name}`).toMatch(/auth_is_admin|has_role\s*\(/i);
    expect(latest.sql, `${functionName} latest migration ${latest.name}`).toMatch(/RAISE EXCEPTION 'Forbidden'/i);
  });
});
