import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

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

describe("meal formula service table limits", () => {
  it("enforces formula table limits per service in Supabase", () => {
    const migration = latestMigrationContaining("get_meal_formula_service_availability");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_meal_formula_service_availability");
    expect(migration).toContain("maxTablesPerService");
    expect(migration).toContain("formula_id");
    expect(migration).toContain("promo-formule");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('meal-formula-service:'");
    expect(migration).toContain("Cette formule n''est plus disponible pour ce service.");
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("wires the quota through the restaurateur and client reservation UI", () => {
    const dashboardFormules = read("src/pages/dashboard/DashboardFormules.tsx");
    const reservationDialog = read("src/components/ReservationDialog.tsx");
    const mealFormulas = read("src/lib/meal-formulas.ts");

    expect(dashboardFormules).toContain("maxTablesPerService");
    expect(dashboardFormules).toContain("Tables maximum avec promotion");
    expect(dashboardFormules).toContain("jusqu'au prochain service");
    expect(reservationDialog).toContain("get_meal_formula_service_availability");
    expect(reservationDialog).toContain("formula_id");
    expect(reservationDialog).toContain("table(s) promo restante(s)");
    expect(mealFormulas).toContain("getMealFormulaRemainingTablesForService");
  });
});
