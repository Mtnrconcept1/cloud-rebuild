import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

function readLatestMigrationContaining(fragment: string) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => readFileSync(resolve(migrationsDir, name), "utf8").includes(fragment));

  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("order capacity and restaurant acceptance hardening", () => {
  it("adds server-owned order capacity settings and slot diagnostics", () => {
    const migration = readLatestMigrationContaining("get_restaurant_order_capacity_state");

    expect(migration).toContain("orders_paused_until");
    expect(migration).toContain("orders_paused_reason");
    expect(migration).toContain("order_slot_capacity_per_15m");
    expect(migration).toContain("dynamic_prep_time_minutes");
    expect(migration).toContain("exceptional_hours");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("order-slot:");
    expect(migration).toContain("slot_order_count");
    expect(migration).toContain("slot_capacity");
    expect(migration).toContain("can_accept_orders");
    expect(migration).toContain("prep_time_minutes");
  });

  it("tracks restaurant view and acceptance deadlines on orders", () => {
    const migration = readLatestMigrationContaining(
      "CREATE OR REPLACE FUNCTION public.mark_order_seen_by_restaurant",
    );

    expect(migration).toContain("restaurant_viewed_at");
    expect(migration).toContain("restaurant_accepted_at");
    expect(migration).toContain("acceptance_deadline_at");
    expect(migration).toContain("restaurant_response_status");
    expect(migration).toContain("compute_order_acceptance_deadline");
    expect(migration).toContain("mark_order_seen_by_restaurant");
    expect(migration).toContain("mark_overdue_order_acceptance");
    expect(migration).toContain("idx_orders_restaurant_acceptance_deadline");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.mark_order_seen_by_restaurant(uuid) TO authenticated");
  });

  it("blocks validate-order before order creation when a restaurant cannot accept orders", () => {
    const source = read("supabase/functions/validate-order/index.ts");

    expect(source).toContain("ensureRestaurantCanAcceptOrder");
    expect(source).toContain('rpc("get_restaurant_order_capacity_state"');
    expect(source).toContain("can_accept_orders");
    expect(source).toContain("slot_order_count");
    expect(source).toContain("prep_time_minutes");
    expect(source).toContain("acceptance_deadline_at");

    const guardIndex = source.indexOf("await ensureRestaurantCanAcceptOrder");
    const createIndex = source.indexOf("create_order_with_items");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(createIndex);
  });

  it("marks view and acceptance timestamps when restaurant status changes", () => {
    const statusFunction = read("supabase/functions/restaurant-order-status/index.ts");
    const dashboard = read("src/pages/dashboard/DashboardCommandes.tsx");

    expect(statusFunction).toContain("restaurant_viewed_at");
    expect(statusFunction).toContain("restaurant_accepted_at");
    expect(statusFunction).toContain("acceptance_deadline_at");
    expect(statusFunction).toContain("acceptance_deadline_exceeded");
    expect(statusFunction).toContain("restaurant_response_status");
    expect(dashboard).toContain("restaurant_viewed_at");
    expect(dashboard).toContain("acceptance_deadline_at");
    expect(dashboard).toContain("Accepter");
  });
});
