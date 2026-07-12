import {
  isReservableFloorPlanItem,
  reservationsOverlap,
  type FloorPlanItemKind,
} from "@/lib/floorPlan";

export type FloorPlanV2Period = "midi" | "soir";
export type FloorPlanV2Shape = "round" | "square" | "rectangle";

export type FloorPlanV2Table = {
  id: string;
  name: string;
  capacity: number;
  zone: string;
  shape: FloorPlanV2Shape;
  x: number;
  y: number;
  blocked: boolean;
};

export type FloorPlanV2Reservation = {
  id: string;
  name: string;
  size: number;
  time: string;
  date: string;
  period: FloorPlanV2Period;
  preferredZone: string;
  note: string;
  durationMinutes: number;
  tableId: string | null;
  status: string;
};

export type FloorPlanV2Assignments = Record<string, string | null>;

type PersistedFloorPlanTable = {
  id: string;
  table_number: string;
  capacity: number;
  is_active: boolean | null;
  sector: string | null;
  layout: unknown;
};

const RELEASED_STATUSES = new Set([
  "cancelled",
  "canceled",
  "no_show",
  "completed",
  "archived",
]);
const CANVAS_WIDTH = 1040;
const CANVAS_HEIGHT = 760;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getShape(value: unknown): FloorPlanV2Shape {
  const shape = String(value || "").toLowerCase();
  if (shape === "round" || shape === "circle" || shape === "oval") return "round";
  if (shape === "rectangle" || shape === "rect") return "rectangle";
  return "square";
}

export function mapFloorPlanV2Table(
  table: PersistedFloorPlanTable,
  index: number,
  layoutOverride?: unknown,
): FloorPlanV2Table {
  const layout = {
    ...asRecord(table.layout),
    ...asRecord(layoutOverride),
  };
  const rawX = Number(layout.x);
  const rawY = Number(layout.y);
  const kind = typeof layout.kind === "string" ? layout.kind as FloorPlanItemKind : "table";
  const isReservable = isReservableFloorPlanItem(kind);

  return {
    id: table.id,
    name: table.table_number,
    capacity: Math.max(0, Math.round(Number(table.capacity) || 0)),
    zone: table.sector?.trim() || "Salle principale",
    shape: getShape(layout.shape),
    x: Number.isFinite(rawX)
      ? clamp((rawX / CANVAS_WIDTH) * 100, 0, 94)
      : 8 + (index * 17) % 78,
    y: Number.isFinite(rawY)
      ? clamp((rawY / CANVAS_HEIGHT) * 100, 0, 86)
      : 10 + (index * 19) % 70,
    blocked: table.is_active === false || !isReservable || Number(table.capacity) < 1,
  };
}

export function buildFloorPlanV2Assignments(
  reservations: readonly FloorPlanV2Reservation[],
): FloorPlanV2Assignments {
  return Object.fromEntries(
    reservations.map((reservation) => [reservation.id, reservation.tableId]),
  );
}

function buildSchedule(reservation: FloorPlanV2Reservation) {
  return {
    id: reservation.id,
    date: reservation.date,
    time: reservation.time,
    partySize: reservation.size,
    status: reservation.status,
  };
}

export function getFloorPlanV2AssignmentError({
  reservationId,
  tableId,
  reservations,
  tables,
  assignments,
}: {
  reservationId: string;
  tableId: string | null;
  reservations: readonly FloorPlanV2Reservation[];
  tables: readonly FloorPlanV2Table[];
  assignments: FloorPlanV2Assignments;
}) {
  const reservation = reservations.find((candidate) => candidate.id === reservationId);
  if (!reservation) return "Réservation introuvable pour ce restaurant.";
  if (!tableId) return null;

  const table = tables.find((candidate) => candidate.id === tableId);
  if (!table) return "Table introuvable dans la salle sélectionnée.";
  if (table.blocked) return `${table.name} est indisponible.`;
  if (reservation.size > table.capacity) {
    return `${table.name} ne peut pas accueillir ${reservation.size} personnes.`;
  }

  const conflict = reservations.find((candidate) => {
    if (candidate.id === reservation.id) return false;
    if (RELEASED_STATUSES.has(candidate.status.toLowerCase())) return false;
    if (assignments[candidate.id] !== tableId) return false;
    return reservationsOverlap(buildSchedule(reservation), buildSchedule(candidate));
  });

  return conflict
    ? `${table.name} est déjà prise autour de ${conflict.time.slice(0, 5)}.`
    : null;
}

export function computeFloorPlanV2AutoAssignments({
  visibleReservations,
  allReservations,
  tables,
  assignments,
}: {
  visibleReservations: readonly FloorPlanV2Reservation[];
  allReservations: readonly FloorPlanV2Reservation[];
  tables: readonly FloorPlanV2Table[];
  assignments: FloorPlanV2Assignments;
}) {
  const nextAssignments = { ...assignments };
  const changedAssignments: FloorPlanV2Assignments = {};
  const placedReservationIds: string[] = [];
  const activeTables = tables.filter((table) => !table.blocked);
  const reservationsToPlace = visibleReservations
    .filter((reservation) => (
      !nextAssignments[reservation.id]
      && !RELEASED_STATUSES.has(reservation.status.toLowerCase())
    ))
    .slice()
    .sort((left, right) => (
      right.size - left.size
      || left.time.localeCompare(right.time, "fr")
    ));

  reservationsToPlace.forEach((reservation) => {
    const bestTable = activeTables
      .filter((table) => !getFloorPlanV2AssignmentError({
        reservationId: reservation.id,
        tableId: table.id,
        reservations: allReservations,
        tables,
        assignments: nextAssignments,
      }))
      .map((table) => {
        const currentUseCount = Object.values(nextAssignments)
          .filter((tableId) => tableId === table.id).length;
        const zoneBonus = reservation.preferredZone === table.zone ? 1_000 : 0;
        const wastedSeats = table.capacity - reservation.size;
        return {
          table,
          score: zoneBonus - wastedSeats * 20 - currentUseCount,
        };
      })
      .sort((left, right) => (
        right.score - left.score
        || left.table.capacity - right.table.capacity
        || left.table.name.localeCompare(right.table.name, "fr")
      ))[0]?.table;

    if (!bestTable) return;
    nextAssignments[reservation.id] = bestTable.id;
    changedAssignments[reservation.id] = bestTable.id;
    placedReservationIds.push(reservation.id);
  });

  return {
    assignments: nextAssignments,
    changedAssignments,
    placedReservationIds,
  };
}

