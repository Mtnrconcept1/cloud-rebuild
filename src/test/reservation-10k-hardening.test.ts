import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
}

describe("reservation 10k hardening", () => {
  const availability = readMigration("20260526005419_reservation_slot_availability.sql");
  const floorPlanGuard = readMigration("20260525205039_restore_dashboard_rpc_guards.sql");
  const hardening = readMigration("20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql");
  const status = readMigration("20260527134055_allow_seated_reservation_status.sql");

  it("prevents double reservations with transactional slot locking and capacity windows", () => {
    expect(availability).toContain("pg_advisory_xact_lock");
    expect(availability).toContain("reservation-slot:");
    expect(availability).toContain("get_reservation_slot_capacity");
    expect(availability).toContain("slot_capacity_windows");
    expect(availability).toContain("v_slot_reserved >= v_slot_capacity");
  });

  it("keeps floor-plan table assignments synchronized with reservation state", () => {
    expect(floorPlanGuard).toContain("guard_reservation_table_slot");
    expect(floorPlanGuard).toContain("trg_guard_reservation_table_slot");
    expect(floorPlanGuard).toContain("reservation_slots");
    expect(hardening).toContain("idx_reservation_slots_table_reservation_10k");
  });

  it("supports restaurant confirmation, no-show states and optional deposits", () => {
    expect(status).toContain("confirmed");
    expect(status).toContain("no_show");
    expect(hardening).toContain("restaurant_confirmation_required");
    expect(hardening).toContain("restaurant_confirmed_at");
    expect(hardening).toContain("deposit_amount_chf");
    expect(hardening).toContain("deposit_status");
    expect(hardening).toContain("reservations_deposit_status_check");
  });
});
