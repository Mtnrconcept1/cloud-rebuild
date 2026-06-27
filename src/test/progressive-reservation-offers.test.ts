import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  selectDailyProgressiveOffers,
  type ProgressiveReservationOffer,
} from "../lib/progressiveReservationOffers";

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
  it("keeps only one visible progressive offer per restaurant and day", () => {
    const offers = [
      {
        id: "evening",
        restaurant_id: "restaurant-1",
        title: "Soir",
        description: null,
        service_date: "2026-06-18",
        service_time: "19:00",
        countdown_ends_at: "2026-06-18T18:00:00.000Z",
        booking_cutoff_at: "2026-06-18T17:30:00.000Z",
        max_tables: 10,
        max_discount_percent: 50,
        current_reservations_count: 1,
        status: "active",
      },
      {
        id: "lunch",
        restaurant_id: "restaurant-1",
        title: "Midi",
        description: null,
        service_date: "2026-06-18",
        service_time: "12:00",
        countdown_ends_at: "2026-06-18T11:00:00.000Z",
        booking_cutoff_at: "2026-06-18T10:30:00.000Z",
        max_tables: 10,
        max_discount_percent: 50,
        current_reservations_count: 1,
        status: "active",
      },
      {
        id: "next-day",
        restaurant_id: "restaurant-1",
        title: "Demain",
        description: null,
        service_date: "2026-06-19",
        service_time: "19:00",
        countdown_ends_at: "2026-06-19T18:00:00.000Z",
        booking_cutoff_at: "2026-06-19T17:30:00.000Z",
        max_tables: 10,
        max_discount_percent: 50,
        current_reservations_count: 1,
        status: "active",
      },
    ] satisfies ProgressiveReservationOffer[];

    expect(selectDailyProgressiveOffers(offers, { maxOffers: 3 }).map((offer) => offer.id)).toEqual([
      "lunch",
      "next-day",
    ]);
    expect(selectDailyProgressiveOffers(offers, {
      reservationDate: "2026-06-18",
      reservationTime: "19:30",
      maxOffers: 3,
    }).map((offer) => offer.id)).toEqual(["evening"]);
  });

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
    const migration = latestMigrationContaining("CREATE OR REPLACE FUNCTION public.get_progressive_offer_service_key");

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_progressive_offer_service_key");
    expect(migration).toContain("EXTRACT(HOUR FROM p_time) < 16");
    expect(migration).toContain("v_reservation_service <> v_offer_service");
    expect(migration).toContain("Cette offre progressive est disponible uniquement pour le service");
    expect(migration).toContain("progressive_offer_service");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_progressive_offer_service_key(time) TO anon, authenticated, service_role");
  });

  it("blocks a client from re-registering after cancelling a progressive offer for the same day", () => {
    const migration = latestMigrationContaining("progressive_offer_reentry_blocked");
    const reservationMutations = read("src/lib/reservationMutations.ts");

    expect(migration).toContain("idx_reservations_progressive_offer_cancelled_reentry");
    expect(migration).toContain("v_cancelled_statuses constant text[] := ARRAY['cancelled', 'canceled']");
    expect(migration).toContain("COALESCE(r.cancelled_by, 'customer') = 'customer'");
    expect(migration).toContain("r.progressive_offer_id = NEW.progressive_offer_id");
    expect(migration).toContain("r.date = v_offer.service_date");
    expect(migration).toContain("progressive_offer_reentry_blocked");
    expect(migration).toContain("Vous vous etes deja desinscrit de cette offre progressive pour ce jour.");
    expect(reservationMutations).toContain("PROGRESSIVE_OFFER_REENTRY_MESSAGE");
    expect(reservationMutations).toContain("normalized.includes(\"progressive_offer_reentry_blocked\")");
  });

  it("prevents two active progressive offers on the same restaurant day", () => {
    const migration = latestMigrationContaining("idx_reservation_progressive_offers_one_active_per_day");

    expect(migration).toContain("daily_progressive_offer_limit");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_progressive_offers_one_active_per_day");
    expect(migration).toContain("ON public.reservation_progressive_offers(restaurant_id, service_date)");
    expect(migration).toContain("WHERE status = 'active'");
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
    expect(index).toContain('queryKey: ["home-progressive-reservation-offers", todayServiceDate]');
    expect(index).toContain('.eq("service_date", todayServiceDate)');
    expect(index).toContain("reservationDate: todayServiceDate");
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
    expect(dashboardFormules).toContain("Jour unique");
    expect(dashboardFormules).toContain("Occurrence");
    expect(dashboardFormules).toContain("Dates personnalisees");
    expect(dashboardFormules).toContain("Jours reguliers");
    expect(dashboardFormules).toContain("Jours de la semaine");
    expect(dashboardFormules).toContain("Date de fin de l'occurrence");
    expect(dashboardFormules).toContain("countdown_starts_at");
    expect(dashboardFormules).toContain("getProgressiveScheduledDates");
    expect(dashboardFormules).toContain("occurrences programmees");
    expect(dashboardFormules).toContain("PROGRESSIVE_EDITOR_STEPS");
    expect(dashboardFormules).toContain("progressive-offer-editor-modal");
    expect(dashboardFormules).toContain("Parametrage en 3 etapes");
    expect(dashboardFormules).toContain("Offre progressive en 3 etapes");
    expect(dashboardFormules).toContain("Base de l'offre");
    expect(dashboardFormules).toContain("Capacite et remise");
    expect(dashboardFormules).toContain("L'heure de debut doit etre avant l'heure de fin du compte a rebours.");
    expect(dashboardFormules).toContain("La fin du compte a rebours doit etre avant l'heure de reservation du client.");
    expect(dashboardFormules).toContain("Calendrier des offres");
    expect(dashboardFormules).toContain("selectedCalendarDate");
    expect(dashboardFormules).toContain("updateOfferStatus");
    expect(dashboardFormules).toContain("Activer");
    expect(dashboardFormules).toContain("Désactiver");
    expect(index).toContain("selectDailyProgressiveOffers");
    expect(restaurantDetail).toContain("selectDailyProgressiveOffers");
    expect(reservationDialog).toContain("selectDailyProgressiveOffers");
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
    expect(restaurantDetail).toContain('setReservationInitialStep("datetime")');
    expect(reservationDialog).toContain("resetKey?: number");
    expect(reservationDialog).toContain("setStep(\"datetime\")");
    expect(reservationDialog).toContain('initialStep === "confirm" && initialDate && initialTime ? "confirm" : "datetime"');
    expect(reservationDialog).toContain("[initialDate, initialStep, initialTime, open, resetKey]");
  });
});
