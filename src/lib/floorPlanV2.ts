import {
  isReservableFloorPlanItem,
  normalizeFloorPlanLayout,
  type FloorPlanItemKind,
  type FloorPlanTableLayout,
} from "@/lib/floorPlan";

export type FloorPlanV2Period = "midi" | "soir";
export type FloorPlanV2Shape = "round" | "square" | "rectangle";
export type FloorPlanV2ObjectType =
  | "wall"
  | "door"
  | "window"
  | "bar"
  | "plant"
  | "service_station"
  | "host_stand"
  | "buffet"
  | "sofa"
  | "divider";

export type FloorPlanV2Table = {
  id: string;
  name: string;
  capacity: number;
  zone: string;
  shape: FloorPlanV2Shape;
  x: number;
  y: number;
  blocked: boolean;
  editable: boolean;
  kind: FloorPlanItemKind | FloorPlanV2ObjectType;
  width?: number;
  height?: number;
  rotation?: number;
  locked?: boolean;
  zIndex?: number;
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

export const FLOOR_PLAN_V2_CANVAS_WIDTH = 1040;
export const FLOOR_PLAN_V2_CANVAS_HEIGHT = 760;

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
  if (shape === "square") return "square";
  return "rectangle";
}

function getKind(value: unknown): FloorPlanItemKind {
  const kind = String(value || "table") as FloorPlanItemKind;
  return isReservableFloorPlanItem(kind) ? "table" : kind;
}

function getV2ObjectType(layout: Record<string, unknown>, persistedKind: FloorPlanItemKind): FloorPlanV2ObjectType {
  const explicitType = String(layout.v2_object_type || "");
  const allowedTypes: FloorPlanV2ObjectType[] = [
    "wall", "door", "window", "bar", "plant", "service_station",
    "host_stand", "buffet", "sofa", "divider",
  ];
  if (allowedTypes.includes(explicitType as FloorPlanV2ObjectType)) {
    return explicitType as FloorPlanV2ObjectType;
  }
  if (persistedKind === "host-stand") return "host_stand";
  if (persistedKind === "service-station") return "service_station";
  if (persistedKind === "banquette" || persistedKind === "booth" || persistedKind === "corner-bench") return "sofa";
  if (persistedKind === "bar" || persistedKind === "plant") return persistedKind;
  return "divider";
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
  const persistedKind = getKind(layout.kind);
  const editable = isReservableFloorPlanItem(persistedKind);
  const kind = editable ? persistedKind : getV2ObjectType(layout, persistedKind);

  return {
    id: table.id,
    name: table.table_number,
    capacity: Math.max(0, Math.round(Number(table.capacity) || 0)),
    zone: table.sector?.trim() || "Salle principale",
    shape: getShape(layout.v2_shape ?? layout.shape),
    x: Number.isFinite(rawX)
      ? clamp((rawX / FLOOR_PLAN_V2_CANVAS_WIDTH) * 100, 0, 94)
      : 8 + (index * 17) % 78,
    y: Number.isFinite(rawY)
      ? clamp((rawY / FLOOR_PLAN_V2_CANVAS_HEIGHT) * 100, 0, 86)
      : 10 + (index * 19) % 70,
    blocked: editable ? table.is_active === false || Number(table.capacity) < 1 : false,
    editable,
    kind,
    width: editable ? undefined : clamp(Number(layout.w) || 96, 24, 520),
    height: editable ? undefined : clamp(Number(layout.h) || 56, 16, 360),
    rotation: editable ? 0 : ((Math.round(Number(layout.rotation) || 0) % 360) + 360) % 360,
    locked: editable ? false : layout.v2_locked === true,
    zIndex: editable ? 0 : clamp(Math.round(Number(layout.v2_z_index) || 0), -100, 100),
  };
}

function layoutToRecord(layout: FloorPlanTableLayout): Record<string, unknown> {
  return {
    x: Math.round(layout.x),
    y: Math.round(layout.y),
    w: Math.round(layout.w),
    h: Math.round(layout.h),
    rotation: layout.rotation,
    shape: layout.shape,
    kind: layout.kind,
    seat_labels: layout.seatLabels,
    seat_type: layout.seatType || "chair",
    seat_placements: layout.seatPlacements || [],
    corner_bench_corners: layout.cornerBenchCorners || [],
    corner_bench_configs: layout.cornerBenchConfigs || [],
    table_width: layout.tableWidth ? Math.round(layout.tableWidth) : undefined,
    table_height: layout.tableHeight ? Math.round(layout.tableHeight) : undefined,
    corner_bench_horizontal: layout.cornerBenchHorizontal
      ? Math.round(layout.cornerBenchHorizontal)
      : undefined,
    corner_bench_vertical: layout.cornerBenchVertical
      ? Math.round(layout.cornerBenchVertical)
      : undefined,
    corner_bench_depth: layout.cornerBenchDepth
      ? Math.round(layout.cornerBenchDepth)
      : undefined,
  };
}

export function serializeFloorPlanV2Layout(
  table: FloorPlanV2Table,
  existingLayout: unknown,
  fallbackIndex: number,
) {
  const source = asRecord(existingLayout);
  const canonicalShape = table.shape === "round" ? "round" : "rect";
  const normalized = normalizeFloorPlanLayout({
    ...source,
    x: Math.round((table.x / 100) * FLOOR_PLAN_V2_CANVAS_WIDTH),
    y: Math.round((table.y / 100) * FLOOR_PLAN_V2_CANVAS_HEIGHT),
    shape: canonicalShape,
    kind: "table",
    v2_shape: table.shape,
  }, fallbackIndex, table.capacity, canonicalShape, "table");

  return {
    ...source,
    ...layoutToRecord(normalized),
    v2_shape: table.shape,
  };
}

function getPersistedFurnitureKind(kind: FloorPlanV2ObjectType): FloorPlanItemKind {
  if (kind === "wall" || kind === "door" || kind === "window" || kind === "divider") return "divider";
  if (kind === "service_station" || kind === "buffet") return "service-station";
  if (kind === "host_stand") return "host-stand";
  if (kind === "sofa") return "banquette";
  return kind;
}

export function serializeFloorPlanV2Object(object: FloorPlanV2Table, existingLayout: unknown) {
  const source = asRecord(existingLayout);
  const kind = object.kind as FloorPlanV2ObjectType;
  return {
    ...source,
    x: Math.round((object.x / 100) * FLOOR_PLAN_V2_CANVAS_WIDTH),
    y: Math.round((object.y / 100) * FLOOR_PLAN_V2_CANVAS_HEIGHT),
    w: Math.round(object.width || 96),
    h: Math.round(object.height || 56),
    rotation: ((Math.round(object.rotation || 0) % 360) + 360) % 360,
    shape: "rect",
    kind: getPersistedFurnitureKind(kind),
    v2_object_type: kind,
    v2_locked: object.locked === true,
    v2_z_index: Math.round(object.zIndex || 0),
    seat_labels: [],
    seat_placements: [],
  };
}

export function parseFloorPlanV2TableDrafts(value: unknown): FloorPlanV2Table[] {
  if (!Array.isArray(value)) throw new Error("La liste des tables est invalide.");
  if (value.length > 200) throw new Error("Le plan ne peut pas contenir plus de 200 tables.");

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  return value.map((candidate, index) => {
    const raw = asRecord(candidate);
    const id = String(raw.id || "").trim();
    const name = String(raw.name || "").trim();
    const zone = String(raw.zone || "").trim();
    const capacity = Number(raw.capacity);
    const x = Number(raw.x);
    const y = Number(raw.y);
    const shape = String(raw.shape || "") as FloorPlanV2Shape;
    const nameKey = name.toLocaleLowerCase("fr");

    if (!id || id.length > 100) throw new Error(`Identifiant invalide à la table ${index + 1}.`);
    if (!name || name.length > 40) throw new Error(`Nom invalide à la table ${index + 1}.`);
    if (!zone || zone.length > 60) throw new Error(`Zone invalide pour ${name}.`);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) {
      throw new Error(`${name} doit avoir entre 1 et 30 places.`);
    }
    if (!Number.isFinite(x) || x < 0 || x > 94 || !Number.isFinite(y) || y < 0 || y > 86) {
      throw new Error(`La position de ${name} est invalide.`);
    }
    if (!(["round", "square", "rectangle"] as string[]).includes(shape)) {
      throw new Error(`La forme de ${name} est invalide.`);
    }
    if (seenIds.has(id)) throw new Error("Une table est présente deux fois dans le plan.");
    if (seenNames.has(nameKey)) throw new Error(`Le nom ${name} est utilisé deux fois.`);
    seenIds.add(id);
    seenNames.add(nameKey);

    return {
      id,
      name,
      capacity,
      zone,
      shape,
      x,
      y,
      blocked: raw.blocked === true,
      editable: true,
      kind: "table",
    };
  });
}

export function parseFloorPlanV2ObjectDrafts(value: unknown): FloorPlanV2Table[] {
  if (!Array.isArray(value)) throw new Error("La liste du mobilier est invalide.");
  if (value.length > 250) throw new Error("Le plan ne peut pas contenir plus de 250 objets de mobilier.");

  const allowedTypes: FloorPlanV2ObjectType[] = [
    "wall", "door", "window", "bar", "plant", "service_station",
    "host_stand", "buffet", "sofa", "divider",
  ];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  return value.map((candidate, index) => {
    const raw = asRecord(candidate);
    const id = String(raw.id || "").trim();
    const name = String(raw.name || raw.label || "").trim();
    const zone = String(raw.zone || "").trim();
    const kind = String(raw.kind || raw.object_type || "") as FloorPlanV2ObjectType;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const width = Number(raw.width);
    const height = Number(raw.height);
    const rotation = Number(raw.rotation || 0);
    const zIndex = Number(raw.zIndex ?? raw.z_index ?? 0);

    if (!id || id.length > 100 || seenIds.has(id)) throw new Error(`Objet de mobilier invalide à la ligne ${index + 1}.`);
    if (!name || name.length > 40 || !zone || zone.length > 60) throw new Error(`Nom ou zone invalide pour l'objet ${index + 1}.`);
    if (!allowedTypes.includes(kind)) throw new Error(`Type de mobilier invalide pour ${name}.`);
    if (!Number.isFinite(x) || x < 0 || x > 94 || !Number.isFinite(y) || y < 0 || y > 86) {
      throw new Error(`La position de ${name} est invalide.`);
    }
    if (!Number.isFinite(width) || width < 24 || width > 520 || !Number.isFinite(height) || height < 16 || height > 360) {
      throw new Error(`Les dimensions de ${name} sont invalides.`);
    }
    if (!Number.isFinite(rotation) || !Number.isFinite(zIndex) || zIndex < -100 || zIndex > 100) {
      throw new Error(`La rotation ou le niveau de ${name} est invalide.`);
    }
    const maxX = ((x / 100) * FLOOR_PLAN_V2_CANVAS_WIDTH) + width;
    const maxY = ((y / 100) * FLOOR_PLAN_V2_CANVAS_HEIGHT) + height;
    if (maxX > FLOOR_PLAN_V2_CANVAS_WIDTH + 0.01 || maxY > FLOOR_PLAN_V2_CANVAS_HEIGHT + 0.01) {
      throw new Error(`${name} dépasse les limites de la salle.`);
    }
    const nameKey = name.toLocaleLowerCase("fr");
    if (seenNames.has(nameKey)) throw new Error(`Le nom ${name} est utilisé deux fois.`);
    seenIds.add(id);
    seenNames.add(nameKey);

    return {
      id,
      name,
      capacity: 0,
      zone,
      shape: "rectangle",
      x,
      y,
      blocked: false,
      editable: false,
      kind,
      width,
      height,
      rotation: ((Math.round(rotation) % 360) + 360) % 360,
      locked: raw.locked === true,
      zIndex: Math.round(zIndex),
    };
  });
}

export function buildFloorPlanV2Assignments(
  reservations: readonly FloorPlanV2Reservation[],
): FloorPlanV2Assignments {
  return Object.fromEntries(
    reservations.map((reservation) => [reservation.id, reservation.tableId]),
  );
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return (Number.parseInt(hours, 10) || 0) * 60 + (Number.parseInt(minutes, 10) || 0);
}

export function floorPlanV2ReservationsOverlap(
  left: FloorPlanV2Reservation,
  right: FloorPlanV2Reservation,
) {
  if (!left.date || left.date !== right.date || left.id === right.id) return false;
  const leftStart = timeToMinutes(left.time);
  const rightStart = timeToMinutes(right.time);
  const leftDuration = Math.max(30, Number(left.durationMinutes) || 120);
  const rightDuration = Math.max(30, Number(right.durationMinutes) || 120);
  return leftStart < rightStart + rightDuration && rightStart < leftStart + leftDuration;
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
  if (!table.editable || table.blocked) return `${table.name} est indisponible.`;
  if (reservation.size > table.capacity) {
    return `${table.name} ne peut pas accueillir ${reservation.size} personnes.`;
  }

  const conflict = reservations.find((candidate) => {
    if (candidate.id === reservation.id) return false;
    if (RELEASED_STATUSES.has(candidate.status.toLowerCase())) return false;
    if (assignments[candidate.id] !== tableId) return false;
    return floorPlanV2ReservationsOverlap(reservation, candidate);
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
  const activeTables = tables.filter((table) => table.editable && !table.blocked);
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
