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
    const migration = latestMigrationContaining("CREATE TABLE IF NOT EXISTS public.reservation_progressive_offers");

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

  it("scopes progressive offers to their service period on the backend", () => {
    const migration = latestMigrationContaining("get_progressive_offer_service_key");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_progressive_offer_service_key");
    expect(migration).toContain("EXTRACT(HOUR FROM p_time) < 16");
    expect(migration).toContain("v_reservation_service <> v_offer_service");
    expect(migration).toContain("Cette offre progressive est disponible uniquement pour le service");
    expect(migration).toContain("progressive_offer_service");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_progressive_offer_service_key(time) TO anon, authenticated, service_role");
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
    expect(index).toContain('import { Badge } from "@/components/ui/badge"');
    expect(index).toContain("Offres progressives");
    expect(index).toContain("reservation_progressive_offers");
    expect(index).toContain("isMissingOptionalSupabaseRelation");
    expect(index).toContain("PROGRESSIVE_OFFERS_TABLE");
    expect(index).toContain("getProgressiveOfferServiceLabel");
    expect(restaurantDetail).toContain("progressiveOfferId");
    expect(restaurantDetail).toContain("reservation_progressive_offers");
    expect(restaurantDetail).toContain("getProgressiveOfferServiceLabel");
    expect(restaurantDetail).toContain("visibleProgressiveOffers");
    expect(restaurantDetail).toContain("isProgressiveOfferAvailableForSlot");
    expect(restaurantDetail).toContain("setReservationProgressiveOfferId(null)");
    expect(restaurantDetail).toContain("activeReservationProgressiveOfferId");
    expect(restaurantDetail).toContain("onSelectionChange={handleWidgetSelectionChange}");
    expect(reservationDialog).toContain("progressiveOfferId");
    expect(reservationDialog).toContain("promo-progressive");
    expect(reservationDialog).toContain("promoChoiceTouched");
    expect(reservationDialog).toContain("isProgressiveOfferAvailableForSlot");
    expect(reservationDialog).toContain('setPromoChoiceTouched(true)');
    expect(reservationDialog).toContain('setStep("datetime")');
    expect(reservationDialog).toContain('setTime((initialProgressiveOffer.service_time || "19:00").slice(0, 5))');
    expect(dashboardFormules).toContain("Service cible");
    expect(dashboardFormules).toContain("Tous les creneaux du service");
    expect(reservationMutations).toContain("progressive_offer_id");
    expect(customerReservations).toContain("progressive_offer_discount_percent");
    expect(dashboardReservations).toContain("progressive_offer_discount_percent");
    expect(adminShared).toContain("progressiveOfferDiscountPercent");
    expect(adminOrdersReservations).toContain("progressive_offer_discount_percent");
    expect(detailModal).toContain("Offre progressive");
  });

  it("opens a progressive offer reservation on the datetime step so the client chooses the time", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");
    const reservationDialog = read("src/components/ReservationDialog.tsx");

    expect(restaurantDetail).toContain("reservationDialogResetKey");
    expect(restaurantDetail).toContain("setReservationDialogResetKey((current) => current + 1)");
    expect(restaurantDetail).toContain("resetKey={reservationDialogResetKey}");
    expect(reservationDialog).toContain("resetKey?: number");
    expect(reservationDialog).toContain("setStep(\"datetime\")");
    expect(reservationDialog).toContain("[open, resetKey]");
  });
});
