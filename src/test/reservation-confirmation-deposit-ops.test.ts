import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function readAllMigrations() {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n");
}

describe("reservation confirmation and deposit operations", () => {
  const migrations = readAllMigrations();
  const opsMigration = read("supabase/migrations/20260602122000_reservation_confirmation_deposit_ops.sql");

  it("persists restaurant confirmation deadlines and optional deposits outside metadata", () => {
    expect(migrations).toContain("reservation_confirmation_deadline_at");
    expect(migrations).toContain("no_show_review_at");
    expect(migrations).toContain("tg_reservations_apply_confirmation_deposit");
    expect(migrations).toContain("restaurant_confirmation_required");
    expect(migrations).toContain("metadata ->> 'restaurant_confirmation_required'");
    expect(migrations).toContain("metadata ->> 'deposit_amount_chf'");
    expect(migrations).toContain("NEW.deposit_status := 'pending'");
    expect(migrations).toContain("NEW.deposit_status := 'paid'");
    expect(migrations).toContain("restaurant_confirmed_at");
    expect(migrations).toContain("'forfeited'");
  });

  it("surfaces confirmation, deposit and no-show operations in the restaurant dashboard", () => {
    const dashboard = read("src/pages/dashboard/DashboardReservations.tsx");
    const service = read("src/pages/dashboard/DashboardService.tsx");
    const dialog = read("src/components/ReservationDialog.tsx");

    expect(dashboard).toContain("restaurant_confirmation_required");
    expect(dashboard).toContain("reservation_confirmation_deadline_at");
    expect(dashboard).toContain("deposit_amount_chf");
    expect(dashboard).toContain("deposit_status");
    expect(dashboard).toContain("Confirmation restaurant");
    expect(dashboard).toContain("Acompte");
    expect(dashboard).toContain("No-show");
    expect(service).toContain("restaurant_confirmation_required");
    expect(service).toContain("confirmation_deadline_minutes");
    expect(service).toContain("deposit_amount_chf");
    expect(dialog).toContain("restaurant_confirmation_required");
    expect(dialog).toContain("confirmation_deadline_minutes");
    expect(dialog).toContain("deposit_amount_chf");
  });

  it("does not expose the reservation trigger as a privileged public RPC", () => {
    expect(opsMigration).toContain("SECURITY INVOKER");
    expect(opsMigration).not.toContain("SECURITY DEFINER");
    expect(opsMigration).toContain("REVOKE EXECUTE ON FUNCTION public.tg_reservations_apply_confirmation_deposit()");
  });

  it("opens card slot reservation deeplinks on the selected datetime step with editable party size", () => {
    const detail = read("src/pages/RestaurantDetail.tsx");
    const dialog = read("src/components/ReservationDialog.tsx");
    const restaurantCard = read("src/components/RestaurantCard.tsx");

    expect(detail).toContain("reservationStep");
    expect(detail).toContain("party_size");
    expect(detail).toContain("initialStep={reservationInitialStep}");
    expect(restaurantCard).toContain("reservationStep=datetime");
    expect(restaurantCard).toContain("reservationSource=card_slot");
    expect(dialog).toContain("initialStep?: Step");
    expect(dialog).toContain('initialStep === "confirm"');
    expect(dialog).toContain("setPartySize(initialPartySize || 2)");
  });
});
