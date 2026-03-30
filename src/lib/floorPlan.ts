export type FloorPlanTableShape = "round" | "rect";

export type FloorPlanTableLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: FloorPlanTableShape;
  seatLabels: number[];
};

export type FloorPlanTablePreset = {
  id: string;
  label: string;
  capacity: number;
  shape: FloorPlanTableShape;
  w: number;
  h: number;
};

export type ReservationSchedule = {
  id: string;
  date: string;
  time: string | null;
  partySize: number;
  status?: string | null;
};

export const FLOOR_PLAN_PRESETS: FloorPlanTablePreset[] = [
  { id: "round-2", label: "2 pers. rond", capacity: 2, shape: "round", w: 118, h: 118 },
  { id: "round-4", label: "4 pers. rond", capacity: 4, shape: "round", w: 138, h: 138 },
  { id: "rect-4", label: "4 pers. rectangle", capacity: 4, shape: "rect", w: 162, h: 98 },
  { id: "rect-6", label: "6 pers. rectangle", capacity: 6, shape: "rect", w: 190, h: 108 },
];

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildSeatLabels(capacity: number, shape: FloorPlanTableShape): number[] {
  const safeCapacity = Math.max(1, Math.round(capacity || 1));
  const seatCount = shape === "round"
    ? Math.min(Math.max(2, safeCapacity), 8)
    : Math.min(Math.max(2, Math.ceil(safeCapacity / 2) * 2), 10);

  const baseSeat = Math.max(1, Math.round(safeCapacity / seatCount) || 1);
  const labels = Array.from({ length: seatCount }, () => baseSeat);
  let distributed = baseSeat * seatCount;

  while (distributed < safeCapacity) {
    const targetIndex = distributed % seatCount;
    labels[targetIndex] += 1;
    distributed += 1;
  }

  return labels;
}

export function getMinimumTableSize(capacity: number, shape: FloorPlanTableShape) {
  const safeCapacity = Math.max(1, Math.round(capacity || 1));
  const seatCount = buildSeatLabels(safeCapacity, shape).length;

  if (shape === "round") {
    const diameter = 144 + (seatCount * 10) + (Math.max(0, safeCapacity - 4) * 8);
    return {
      w: Math.max(176, diameter),
      h: Math.max(176, diameter),
    };
  }

  const seatsPerRow = Math.max(2, Math.ceil(seatCount / 2));
  return {
    w: Math.max(184, 136 + (seatsPerRow * 22) + (safeCapacity * 8)),
    h: Math.max(124, 96 + (Math.ceil(seatCount / 2) * 12) + (Math.max(0, Math.ceil(safeCapacity / 6) - 1) * 22)),
  };
}

export function ensureFloorPlanLayoutFitsCapacity(
  layout: FloorPlanTableLayout,
  capacity: number,
  shape: FloorPlanTableShape = layout.shape,
): FloorPlanTableLayout {
  const minimumSize = getMinimumTableSize(capacity, shape);

  return {
    ...layout,
    shape,
    w: Math.max(layout.w, minimumSize.w),
    h: Math.max(layout.h, minimumSize.h),
    seatLabels: buildSeatLabels(capacity, shape),
  };
}

function parseShape(value: unknown): FloorPlanTableShape {
  return value === "rect" ? "rect" : "round";
}

export function normalizeFloorPlanLayout(
  rawLayout: unknown,
  fallbackIndex: number,
  capacity: number,
  shapeFallback: FloorPlanTableShape = "round",
): FloorPlanTableLayout {
  const raw = rawLayout && typeof rawLayout === "object" && !Array.isArray(rawLayout)
    ? rawLayout as Record<string, unknown>
    : {};

  const shape = parseShape(raw.shape ?? shapeFallback);
  const defaultPreset = FLOOR_PLAN_PRESETS.find((preset) => preset.shape === shape && preset.capacity >= capacity)
    || FLOOR_PLAN_PRESETS.find((preset) => preset.shape === shape)
    || FLOOR_PLAN_PRESETS[0];
  const defaultX = 48 + ((fallbackIndex % 4) * 208);
  const defaultY = 48 + (Math.floor(fallbackIndex / 4) * 162);

  const seatLabels = Array.isArray(raw.seat_labels)
    ? raw.seat_labels.map((value) => Math.max(1, Math.round(toFiniteNumber(value, 1))))
    : Array.isArray(raw.seatLabels)
      ? raw.seatLabels.map((value) => Math.max(1, Math.round(toFiniteNumber(value, 1))))
      : buildSeatLabels(capacity, shape);
  const minimumSize = getMinimumTableSize(capacity, shape);

  return {
    x: Math.max(24, toFiniteNumber(raw.x, defaultX)),
    y: Math.max(24, toFiniteNumber(raw.y, defaultY)),
    w: Math.max(minimumSize.w, toFiniteNumber(raw.w, defaultPreset.w)),
    h: Math.max(minimumSize.h, toFiniteNumber(raw.h, defaultPreset.h)),
    rotation: toFiniteNumber(raw.rotation, 0),
    shape,
    seatLabels,
  };
}

export function buildDraftFloorPlanLayout(
  existingCount: number,
  preset: FloorPlanTablePreset,
): FloorPlanTableLayout {
  return normalizeFloorPlanLayout(
    {
      x: 48 + ((existingCount % 4) * 208),
      y: 48 + (Math.floor(existingCount / 4) * 162),
      w: preset.w,
      h: preset.h,
      shape: preset.shape,
      rotation: 0,
      seatLabels: buildSeatLabels(preset.capacity, preset.shape),
    },
    existingCount,
    preset.capacity,
    preset.shape,
  );
}

export function clampFloorPlanLayout(
  layout: FloorPlanTableLayout,
  canvasWidth: number,
  canvasHeight: number,
): FloorPlanTableLayout {
  const next = { ...layout };
  next.x = Math.min(Math.max(16, next.x), Math.max(16, canvasWidth - next.w - 16));
  next.y = Math.min(Math.max(16, next.y), Math.max(16, canvasHeight - next.h - 16));
  return next;
}

function parseReservationDateTime(schedule: ReservationSchedule) {
  const safeTime = String(schedule.time || "00:00").slice(0, 5);
  return new Date(`${schedule.date}T${safeTime}:00`);
}

export function reservationsOverlap(
  left: ReservationSchedule,
  right: ReservationSchedule,
  occupancyMinutes = 120,
) {
  if (left.date !== right.date) return false;

  const leftStart = parseReservationDateTime(left).getTime();
  const rightStart = parseReservationDateTime(right).getTime();
  const occupancyMs = occupancyMinutes * 60 * 1000;

  return leftStart < rightStart + occupancyMs && rightStart < leftStart + occupancyMs;
}
