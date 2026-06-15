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

describe("progressive reservation offers", () => {
  it("stores progressive booking offers and enforces the discount lifecycle in Supabase", () => {
    const migration = latestMigrationContaining("reservation_progressive_offers");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.reservation_progressive_offers");
    expect(migration).toContain("max_tables");
    expect(migration).toContain("max_discount_percent");
    expect(migration).toContain("booking_cutoff_at");
    expect(migration).toContain("final_discount_percent");
    expect(migration).toContain("current_reservations_count");
    expect(migration).toContain("ALTER TABLE public.reservation_progressive_offers ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("reservation_progressive_offers_public_active_select");
    expect(migration).toContain("reservation_progressive_offers_owner_admin_write");
    expect(migration).toContain("ALTER TABLE public.reservations");
    expect(migration).toContain("progressive_offer_id");
    expect(migration).toContain("progressive_offer_discount_percent");
    expect(migration).toContain("progressive_offer_discount_status");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.calculate_progressive_offer_discount");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.finalize_progressive_offer");
    expect(migration).toContain("CREATE OR REPLACE TRIGGER reservations_progressive_offer_apply");
    expect(migration).toContain("CREATE OR REPLACE TRIGGER reservations_progressive_offer_recount");
  });

  it("wires progressive offers through restaurant, customer and admin surfaces", () => {
    const dashboardFormules = read("src/pages/dashboard/DashboardFormules.tsx");
    const index = read("src/pages/Index.tsx");
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const reservationDialog = read("src/components/ReservationDialog.tsx");
    const reservationMutations = read("src/lib/reservationMutations.ts");
    const customerReservations = read("src/pages/Reservations.tsx");
    const dashboardReservations = read("src/pages/dashboard/DashboardReservations.tsx");
    const adminShared = read("src/pages/admin/adminOrdersReservationsShared.ts");
    const adminOrdersReservations = read("src/pages/admin/AdminOrdersReservations.tsx");
    const detailModal = read("src/components/ReservationDetailModal.tsx");

    expect(dashboardFormules).toContain("Offre progressive");
    expect(dashboardFormules).toContain("reservation_progressive_offers");
    expect(dashboardFormules).toContain("finalize_progressive_offer");
    expect(index).toContain("Offres progressives");
    expect(index).toContain("reservation_progressive_offers");
    expect(restaurantDetail).toContain("progressiveOfferId");
    expect(restaurantDetail).toContain("reservation_progressive_offers");
    expect(reservationDialog).toContain("progressiveOfferId");
    expect(reservationDialog).toContain("promo-progressive");
    expect(reservationMutations).toContain("p_progressive_offer_id");
    expect(customerReservations).toContain("progressive_offer_discount_percent");
    expect(dashboardReservations).toContain("progressive_offer_discount_percent");
    expect(adminShared).toContain("progressiveOfferDiscountPercent");
    expect(adminOrdersReservations).toContain("progressive_offer_discount_percent");
    expect(detailModal).toContain("Offre progressive");
  });
});
