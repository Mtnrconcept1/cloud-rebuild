import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function latestMigrationContaining(needle: string) {
  const migrationsDir = resolve(root, "supabase/migrations");
  const migration = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(resolve(migrationsDir, name), "utf8").includes(needle));

  expect(migration, `Migration containing ${needle}`).toBeTruthy();
  const filePath = resolve(migrationsDir, migration!);
  expect(existsSync(filePath)).toBe(true);
  return readFileSync(filePath, "utf8");
}

describe("reservation service table capacity", () => {
  it("enforces restaurant table limits across the whole service, not per slot", () => {
    const migration = latestMigrationContaining("reservation-service-capacity:");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_restaurant_reservation_slot_availability");
    expect(migration).toContain("reservation-service-capacity:");
    expect(migration).toContain("reservation-service:");
    expect(migration).toContain("v_service_reserved_tables");
    expect(migration).toContain("v_service_table_capacity");
    expect(migration).toContain("EXTRACT(HOUR FROM r.time) < 15");
    expect(migration).toContain("EXTRACT(HOUR FROM r.time) >= 15");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_zero_attente_checkout_hold");
    expect(migration).toContain("Ce service est complet. Choisissez une autre heure.");
  });
});
