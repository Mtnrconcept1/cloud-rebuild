import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function readSource(path: string) {
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
  return readFileSync(resolve(migrationsDir, migration!), "utf8");
}

describe("restaurant profile hours as slot source", () => {
  it("keeps reservation UI from falling back to invented default services", () => {
    expect(readSource("src/components/ReservationDialog.tsx")).toContain("getConfiguredServiceSettings(data?.opening_hours)");
    expect(readSource("src/components/ReservationWidget.tsx")).toContain("getConfiguredServiceSettings(data?.opening_hours)");
    expect(readSource("src/components/RestaurantCard.tsx")).toContain("getConfiguredServiceSettings(resolvedOpeningHours)");
    expect(readSource("src/lib/deliverySlots.ts")).toContain("getConfiguredServiceSettings(openingHours)");
  });

  it("enforces profile-configured hours in reservation and order RPCs", () => {
    const migration = latestMigrationContaining("Enforce restaurant-profile hours as the only source");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_profile_reservation_service_settings");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_profile_order_window");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.validate_and_create_reservation");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_zero_attente_checkout_hold");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_restaurant_order_capacity_state");
    expect(migration).toContain("Les horaires du restaurant ne sont pas configures pour ce service.");
    expect(migration).toContain("missing_opening_hours");
  });

  it("keeps cart order slots aligned with server order windows", () => {
    const deliverySlotsSource = readSource("src/lib/deliverySlots.ts");
    const validateOrderSource = readSource("supabase/functions/validate-order/index.ts");

    expect(deliverySlotsSource).toContain("order_start_time");
    expect(deliverySlotsSource).toContain("order_end_time");
    expect(deliverySlotsSource).toContain("online_ordering_enabled");
    expect(deliverySlotsSource).toContain("orders_closed");
    expect(validateOrderSource).toContain("Europe/Zurich");
    expect(validateOrderSource).toContain("toZurichScheduledUtcIso");
    expect(validateOrderSource).not.toContain(":00+01:00`");
  });
});
