import type { Database, Json } from "@/integrations/supabase/types";
import { reservationsOverlap, type FloorPlanTableLayout } from "@/lib/floorPlan";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type ServiceReservation = ReservationRow & {
  customer: Pick<ProfileRow, "full_name" | "phone"> | null;
};

export type ServiceDraftTable = {
  id: string;
  table_number: string;
  capacity: number;
  is_active: boolean;
  sector: string;
  layout: FloorPlanTableLayout;
};

export type ReservationDropState = {
  ok: boolean;
  reason: string | null;
};

export type RenderedTableFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TableDensity = "tight" | "compact" | "regular";
export type TableServiceStateKey =
  | "furniture"
  | "free"
  | "conflict"
  | "upcoming"
  | "late"
  | "soon-free"
  | "arrived"
  | "occupied"
  | "zero-attente"
  | "no-show";

export type TableServiceState = {
  key: TableServiceStateKey;
  label: string;
  detail: string | null;
  haloClass: string;
  chipClass: string;
};

export type ReservationPlacementScore = {
  score: number;
  wastedSeats: number;
  reasons: string[];
};

export type ReservationTableRecommendation = {
  table: ServiceDraftTable;
} & ReservationPlacementScore;

const DEFAULT_OCCUPATION_MINUTES = 90;
const RELEASED_RESERVATION_STATUSES = new Set(["cancelled", "canceled", "no_show", "completed", "archived"]);

const isJsonRecord = (value: Json): value is Record<string, Json> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function getSafeTime(value: string | null | undefined) {
  return (value && value.slice(0, 5)) || "00:00";
}

export function getReservationCustomerLabel(reservation: ServiceReservation) {
  return reservation.customer?.full_name || "Client sans nom";
}

export function getReservationStatusTone(status: string | null | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pending":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "arrived":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "seated":
    case "installed":
    case "occupied":
    case "order_taken":
    case "served":
    case "dessert":
    case "bill_requested":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "no_show":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function normalizeReservationFeature(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function getReservationMetadataRecord(reservation: ReservationRow) {
  return isJsonRecord(reservation.metadata) ? reservation.metadata : {};
}

function getReservationFeature(reservation: ReservationRow) {
  const explicitFeature = normalizeReservationFeature(reservation.feature);
  const metadataFeature = normalizeReservationFeature(getReservationMetadataRecord(reservation).feature);

  if (metadataFeature) return metadataFeature;
  if (explicitFeature) return explicitFeature;
  return "standard";
}

export function isZeroAttenteReservation(reservation: ReservationRow) {
  return getReservationFeature(reservation) === "zero-attente";
}

export function getReservationSpecialRequest(reservation: ReservationRow) {
  const specialRequests = (reservation as Record<string, unknown>).special_requests;
  if (typeof specialRequests === "string" && specialRequests.trim()) {
    return specialRequests.trim();
  }

  return typeof reservation.notes === "string" && reservation.notes.trim()
    ? reservation.notes.trim()
    : null;
}

export function getShortDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function getTableDensity(frame: RenderedTableFrame): TableDensity {
  if (frame.w < 120 || frame.h < 120) return "tight";
  if (frame.w < 190 || frame.h < 155) return "compact";
  return "regular";
}

export function getCompactReservationCustomerLabel(
  reservation: ServiceReservation,
  density: TableDensity,
) {
  const fullLabel = getReservationCustomerLabel(reservation).trim();
  if (density === "regular") return fullLabel;

  const parts = fullLabel.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullLabel;

  if (density === "compact") {
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() || ""}.`;
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 10);
  }

  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

export function scoreReservationPlacement({
  reservation,
  table,
  currentTableLoad = 0,
  currentTableReservations = [],
}: {
  reservation: ServiceReservation;
  table: ServiceDraftTable;
  currentTableLoad?: number;
  currentTableReservations?: ServiceReservation[];
}): ReservationPlacementScore {
  const partySize = Math.max(0, Number(reservation.party_size || 0));
  const capacity = Math.max(0, Number(table.capacity || 0));
  const load = Math.max(0, Math.max(currentTableLoad, currentTableReservations.length));
  const reasons: string[] = [];

  if (capacity <= 0) {
    return {
      score: 0,
      wastedSeats: 0,
      reasons: ["Mobilier non reservable"],
    };
  }

  if (partySize <= 0) {
    return {
      score: 0,
      wastedSeats: capacity,
      reasons: ["Nombre de couverts manquant"],
    };
  }

  if (partySize > capacity) {
    return {
      score: 0,
      wastedSeats: 0,
      reasons: ["Capacite insuffisante"],
    };
  }

  const wastedSeats = capacity - partySize;
  let score = 100 - wastedSeats * 12 - load * 5;

  if (wastedSeats === 0) {
    score += 8;
    reasons.push("Capacite parfaite");
  } else if (wastedSeats <= 2) {
    score += 3;
    reasons.push(`${wastedSeats} place(s) de marge`);
  } else {
    reasons.push(`${wastedSeats} place(s) libres`);
  }

  if (capacity >= 6 && partySize <= 2) {
    score -= 24;
    reasons.push("Preserve les grandes tables");
  } else if (capacity >= 8 && partySize <= 4) {
    score -= 12;
    reasons.push("Garde une option groupe");
  }

  const rotationGap = getClosestRotationGapMinutes(reservation, currentTableReservations);
  if (rotationGap !== null && rotationGap < 30) {
    score -= 16;
    reasons.push("Rotation serree");
  } else if (rotationGap !== null && rotationGap < 60) {
    score -= 6;
    reasons.push(`${rotationGap} min de battement`);
  } else if (rotationGap !== null) {
    score += 4;
    reasons.push("Rotation confortable");
  } else if (load === 0) {
    reasons.push("Rotation simple");
  } else {
    reasons.push(`Table deja planifiee (${load})`);
  }

  if (isZeroAttenteReservation(reservation)) {
    score += 4;
    reasons.push("Zero Attente priorise");
  }

  return {
    score: Math.max(1, Math.min(100, Math.round(score))),
    wastedSeats,
    reasons,
  };
}

export function getRecommendedTableByReservation({
  reservations,
  tables,
  getReservationDropState,
  getPlacementScore,
}: {
  reservations: ServiceReservation[];
  tables: ServiceDraftTable[];
  getReservationDropState: (reservationId: string, tableId: string) => ReservationDropState;
  getPlacementScore: (reservation: ServiceReservation, table: ServiceDraftTable) => ReservationPlacementScore;
}) {
  const recommendations = new Map<string, ReservationTableRecommendation>();

  reservations.forEach((reservation) => {
    const best = tables
      .filter((table) => getReservationDropState(reservation.id, table.id).ok)
      .map((table) => ({
        table,
        ...getPlacementScore(reservation, table),
      }))
      .sort((left, right) => (
        right.score - left.score
        || left.wastedSeats - right.wastedSeats
        || left.table.capacity - right.table.capacity
        || left.table.table_number.localeCompare(right.table.table_number, "fr")
      ))[0];

    if (best) {
      recommendations.set(reservation.id, best);
    }
  });

  return recommendations;
}

function getReservationDurationMinutes(reservation: ServiceReservation) {
  const rawDuration = getReservationMetadataRecord(reservation).duration_minutes
    ?? getReservationMetadataRecord(reservation).durationMinutes;
  const duration = Number(rawDuration);
  if (Number.isFinite(duration) && duration > 0) {
    return Math.max(30, Math.round(duration));
  }

  const partySize = Number(reservation.party_size || 0);
  if (partySize >= 7) return 150;
  if (partySize >= 5) return 120;
  if (partySize >= 3) return 105;
  return DEFAULT_OCCUPATION_MINUTES;
}

function getClosestRotationGapMinutes(
  reservation: ServiceReservation,
  tableReservations: ServiceReservation[],
) {
  const sameDateReservations = tableReservations.filter((candidate) => (
    candidate.id !== reservation.id
    && candidate.date === reservation.date
  ));
  if (sameDateReservations.length === 0) return null;

  const start = getReservationMinutesFromDayStart(reservation);
  const end = start + getReservationDurationMinutes(reservation);
  let closestGap: number | null = null;

  sameDateReservations.forEach((candidate) => {
    const candidateStart = getReservationMinutesFromDayStart(candidate);
    const candidateEnd = candidateStart + getReservationDurationMinutes(candidate);
    const gap = candidateEnd <= start
      ? start - candidateEnd
      : candidateStart >= end
        ? candidateStart - end
        : 0;

    closestGap = closestGap === null ? gap : Math.min(closestGap, gap);
  });

  return closestGap;
}

function getReservationMinutesFromDayStart(reservation: ServiceReservation) {
  const [rawHour = "0", rawMinute = "0"] = getSafeTime(reservation.time).split(":");
  const hour = Number.parseInt(rawHour, 10) || 0;
  const minute = Number.parseInt(rawMinute, 10) || 0;
  return hour * 60 + minute;
}

function getDateMinutesFromDayStart(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function isSameServiceDate(reservationDate: string | null | undefined, now: Date) {
  if (!reservationDate) return false;

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return reservationDate === `${year}-${month}-${day}`;
}

function addMinutesToTime(time: string | null | undefined, minutes: number) {
  const [rawHour = "0", rawMinute = "0"] = getSafeTime(time).split(":");
  const total = (Number.parseInt(rawHour, 10) || 0) * 60
    + (Number.parseInt(rawMinute, 10) || 0)
    + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function getMinutesUntilEstimatedRelease(reservation: ServiceReservation, now: Date) {
  if (!isSameServiceDate(reservation.date, now)) return null;
  return getReservationMinutesFromDayStart(reservation)
    + DEFAULT_OCCUPATION_MINUTES
    - getDateMinutesFromDayStart(now);
}

function isBlockingReservation(reservation: ServiceReservation) {
  return !RELEASED_RESERVATION_STATUSES.has(String(reservation.status || "").toLowerCase());
}

function getOverlappingAssignmentCount(assignments: ServiceReservation[]) {
  const blockingAssignments = assignments.filter(isBlockingReservation);
  let overlapCount = 0;

  for (let leftIndex = 0; leftIndex < blockingAssignments.length; leftIndex += 1) {
    const left = blockingAssignments[leftIndex];
    if (!left.date) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < blockingAssignments.length; rightIndex += 1) {
      const right = blockingAssignments[rightIndex];
      if (!right.date) continue;

      if (reservationsOverlap(
        {
          id: left.id,
          date: left.date,
          time: left.time,
          partySize: Number(left.party_size || 0),
          status: left.status,
        },
        {
          id: right.id,
          date: right.date,
          time: right.time,
          partySize: Number(right.party_size || 0),
          status: right.status,
        },
      )) {
        overlapCount += 1;
      }
    }
  }

  return overlapCount;
}

export function getTableServiceState({
  isReservable,
  assignments,
  now = new Date(),
}: {
  isReservable: boolean;
  assignments: ServiceReservation[];
  now?: Date;
}): TableServiceState {
  if (!isReservable) {
    return {
      key: "furniture",
      label: "Mobilier",
      detail: null,
      haloClass: "bg-slate-300/55 shadow-[0_22px_55px_-42px_rgba(15,23,42,0.55)]",
      chipClass: "border-slate-300 bg-slate-100 text-slate-700",
    };
  }

  if (assignments.length === 0) {
    return {
      key: "free",
      label: "Libre",
      detail: null,
      haloClass: "bg-emerald-200/45 shadow-[0_28px_65px_-40px_rgba(16,185,129,0.35)]",
      chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  const blockingAssignments = assignments.filter(isBlockingReservation);

  if (getOverlappingAssignmentCount(blockingAssignments) > 0) {
    return {
      key: "conflict",
      label: "Conflit horaire",
      detail: `${blockingAssignments.length} reservations`,
      haloClass: "bg-rose-400/65 shadow-[0_28px_70px_-34px_rgba(225,29,72,0.55)]",
      chipClass: "border-rose-400 bg-rose-50 text-rose-800",
    };
  }

  const primary = blockingAssignments[0] || assignments[0];
  const status = String(primary.status || "pending").toLowerCase();

  if (status === "no_show") {
    return {
      key: "no-show",
      label: "No-show",
      detail: getSafeTime(primary.time),
      haloClass: "bg-rose-300/55 shadow-[0_28px_65px_-38px_rgba(244,63,94,0.45)]",
      chipClass: "border-rose-300 bg-rose-50 text-rose-700",
    };
  }

  if (status === "arrived") {
    return {
      key: "arrived",
      label: "Arrive",
      detail: getSafeTime(primary.time),
      haloClass: "bg-sky-300/55 shadow-[0_28px_65px_-38px_rgba(14,165,233,0.45)]",
      chipClass: "border-sky-300 bg-sky-50 text-sky-700",
    };
  }

  if (["seated", "installed", "occupied", "order_taken", "served", "dessert", "bill_requested"].includes(status)) {
    const minutesUntilRelease = getMinutesUntilEstimatedRelease(primary, now);
    if (minutesUntilRelease !== null && minutesUntilRelease >= 0 && minutesUntilRelease <= 15) {
      return {
        key: "soon-free",
        label: "Bientot libre",
        detail: `lib. ~${addMinutesToTime(primary.time, DEFAULT_OCCUPATION_MINUTES)}`,
        haloClass: "bg-lime-300/55 shadow-[0_28px_65px_-38px_rgba(132,204,22,0.42)]",
        chipClass: "border-lime-300 bg-lime-50 text-lime-800",
      };
    }

    return {
      key: "occupied",
      label: "Occupee",
      detail: `lib. ~${addMinutesToTime(primary.time, DEFAULT_OCCUPATION_MINUTES)}`,
      haloClass: "bg-orange-300/60 shadow-[0_28px_65px_-38px_rgba(249,115,22,0.42)]",
      chipClass: "border-orange-300 bg-orange-50 text-orange-800",
    };
  }

  if (isZeroAttenteReservation(primary)) {
    return {
      key: "zero-attente",
      label: "Zero Attente",
      detail: getSafeTime(primary.time),
      haloClass: "bg-teal-300/55 shadow-[0_28px_65px_-38px_rgba(20,184,166,0.45)]",
      chipClass: "border-teal-300 bg-teal-50 text-teal-700",
    };
  }

  const delayMinutes = isSameServiceDate(primary.date, now)
    ? getDateMinutesFromDayStart(now) - getReservationMinutesFromDayStart(primary)
    : 0;
  if (delayMinutes >= 15 && ["confirmed", "pending"].includes(status)) {
    return {
      key: "late",
      label: "Retard",
      detail: `${delayMinutes} min`,
      haloClass: "bg-rose-300/55 shadow-[0_28px_65px_-38px_rgba(244,63,94,0.42)]",
      chipClass: "border-rose-300 bg-rose-50 text-rose-700",
    };
  }

  return {
    key: "upcoming",
    label: "Reservee",
    detail: getSafeTime(primary.time),
    haloClass: "bg-amber-300/55 shadow-[0_28px_65px_-38px_rgba(245,158,11,0.4)]",
    chipClass: "border-amber-300 bg-amber-50 text-amber-800",
  };
}
