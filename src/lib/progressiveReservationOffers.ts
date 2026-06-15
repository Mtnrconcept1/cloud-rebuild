import { detectServiceFromTime, getServicePeriodLabel, type ServicePeriod } from "@/lib/serviceSettings";

export type ProgressiveReservationOffer = {
  id: string;
  restaurant_id: string;
  title: string;
  description: string | null;
  service_date: string;
  service_time: string | null;
  countdown_starts_at?: string | null;
  countdown_ends_at: string;
  booking_cutoff_at: string;
  max_tables: number;
  max_discount_percent: number;
  current_reservations_count: number;
  final_discount_percent?: number | null;
  status: string;
  restaurants?: {
    id?: string;
    name?: string | null;
    city?: string | null;
    image_url?: string | null;
    cuisine_type?: string | null;
    rating?: number | null;
  } | null;
};

export function getProgressiveOfferServicePeriod(offer: Pick<ProgressiveReservationOffer, "service_time">): ServicePeriod {
  return detectServiceFromTime((offer.service_time || "19:00").slice(0, 5));
}

export function getProgressiveOfferServiceLabel(offer: Pick<ProgressiveReservationOffer, "service_time">) {
  return getServicePeriodLabel(getProgressiveOfferServicePeriod(offer));
}

export function isProgressiveOfferAvailableForSlot(
  offer: Pick<ProgressiveReservationOffer, "service_date" | "service_time">,
  reservationDate: string | null | undefined,
  reservationTime: string,
) {
  return (
    !!reservationDate
    && offer.service_date === reservationDate
    && getProgressiveOfferServicePeriod(offer) === detectServiceFromTime(reservationTime)
  );
}

export function getProgressiveOfferReservationCount(offer: Pick<ProgressiveReservationOffer, "current_reservations_count" | "max_tables">) {
  return Math.min(Math.max(Number(offer.current_reservations_count || 0), 0), Math.max(Number(offer.max_tables || 1), 1));
}

export function getProgressiveOfferRemainingTables(offer: Pick<ProgressiveReservationOffer, "current_reservations_count" | "max_tables">) {
  return Math.max(Number(offer.max_tables || 0) - getProgressiveOfferReservationCount(offer), 0);
}

export function calculateProgressiveDiscount(maxDiscountPercent: number, maxTables: number, reservationCount: number) {
  const maxDiscount = Math.max(Number(maxDiscountPercent || 0), 0);
  const tableLimit = Math.max(Number(maxTables || 1), 1);
  const count = Math.max(Number(reservationCount || 0), 0);
  return Math.min(maxDiscount, Math.round((count * maxDiscount / tableLimit) * 100) / 100);
}

export function getCurrentProgressiveDiscount(offer: Pick<ProgressiveReservationOffer, "max_discount_percent" | "max_tables" | "current_reservations_count" | "final_discount_percent" | "status">) {
  if (offer.status === "finalized" && offer.final_discount_percent != null) {
    return Number(offer.final_discount_percent) || 0;
  }

  return calculateProgressiveDiscount(
    Number(offer.max_discount_percent || 0),
    Number(offer.max_tables || 1),
    Number(offer.current_reservations_count || 0),
  );
}

export function getNextProgressiveDiscount(offer: Pick<ProgressiveReservationOffer, "max_discount_percent" | "max_tables" | "current_reservations_count" | "final_discount_percent" | "status">) {
  if (offer.status === "finalized" && offer.final_discount_percent != null) {
    return Number(offer.final_discount_percent) || 0;
  }

  return calculateProgressiveDiscount(
    Number(offer.max_discount_percent || 0),
    Number(offer.max_tables || 1),
    Number(offer.current_reservations_count || 0) + 1,
  );
}

export function getProgressiveOfferProgressPercent(offer: Pick<ProgressiveReservationOffer, "current_reservations_count" | "max_tables">) {
  const maxTables = Math.max(Number(offer.max_tables || 1), 1);
  return Math.min(100, Math.round((getProgressiveOfferReservationCount(offer) / maxTables) * 100));
}

export function isProgressiveOfferBookable(offer: Pick<ProgressiveReservationOffer, "status" | "booking_cutoff_at" | "current_reservations_count" | "max_tables">, now = Date.now()) {
  return (
    offer.status === "active"
    && new Date(offer.booking_cutoff_at).getTime() > now
    && getProgressiveOfferRemainingTables(offer) > 0
  );
}

export function formatProgressiveCountdown(targetIso: string, nowMs = Date.now()) {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) return "Compte a rebours indisponible";

  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}j ${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min ${seconds}s`;
  return `${seconds}s`;
}

export function formatProgressiveServiceDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
