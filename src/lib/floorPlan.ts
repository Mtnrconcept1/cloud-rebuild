export type FloorPlanTableShape = "round" | "rect";
export type FloorPlanItemCategory = "table" | "furniture";
export type FloorPlanSeatType = "chair" | "stool" | "bench" | "corner-bench";
export type FloorPlanItemKind =
  | "table"
  | "chair"
  | "stool"
  | "bar"
  | "corner-bench"
  | "banquette"
  | "booth"
  | "host-stand"
  | "divider"
  | "plant"
  | "service-station";

export type FloorPlanTableLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  shape: FloorPlanTableShape;
  seatLabels: number[];
  kind: FloorPlanItemKind;
  seatType?: FloorPlanSeatType;
};

export type FloorPlanTablePreset = {
  id: string;
  label: string;
  description?: string;
  category: FloorPlanItemCategory;
  kind: FloorPlanItemKind;
  capacity: number;
  shape: FloorPlanTableShape;
  w: number;
  h: number;
};

type FloorPlanReservationSchedule = {
  id: string;
  date: string;
  time: string | null;
  partySize: number;
  status?: string | null;
};

const DEFAULT_PADDING = 16;
const DEFAULT_CANVAS_WIDTH = 1040;
const DEFAULT_CANVAS_HEIGHT = 680;

const VALID_SEAT_TYPES = new Set<FloorPlanSeatType>(["chair", "stool", "bench", "corner-bench"]);

export const SEAT_TYPE_LABELS: Record<FloorPlanSeatType, string> = {
  chair: "Chaises",
  stool: "Tabourets",
  bench: "Banquettes",
  "corner-bench": "Bancs d'angle",
};

const ITEM_BASE_NAMES: Record<FloorPlanItemKind, string> = {
  table: "Table",
  chair: "Chaise",
  stool: "Tabouret",
  bar: "Bar",
  "corner-bench": "Banc d'angle",
  banquette: "Banquette",
  booth: "Booth",
  "host-stand": "Accueil",
  divider: "Separateur",
  plant: "Plante",
  "service-station": "Desserte",
};

const ITEM_TYPE_LABELS: Record<FloorPlanItemKind, string> = {
  table: "Table",
  chair: "Chaise",
  stool: "Tabouret",
  bar: "Bar",
  "corner-bench": "Banc d'angle",
  banquette: "Banquette",
  booth: "Booth",
  "host-stand": "Pupitre d'accueil",
  divider: "Separateur",
  plant: "Plante",
  "service-station": "Desserte de service",
};

const MIN_FURNITURE_SIZE: Record<Exclude<FloorPlanItemKind, "table">, { w: number; h: number; shape: FloorPlanTableShape }> = {
  chair: { w: 76, h: 76, shape: "round" },
  stool: { w: 64, h: 64, shape: "round" },
  bar: { w: 280, h: 104, shape: "rect" },
  "corner-bench": { w: 248, h: 188, shape: "rect" },
  banquette: { w: 228, h: 104, shape: "rect" },
  booth: { w: 220, h: 152, shape: "rect" },
  "host-stand": { w: 110, h: 98, shape: "rect" },
  divider: { w: 188, h: 46, shape: "rect" },
  plant: { w: 84, h: 84, shape: "round" },
  "service-station": { w: 140, h: 92, shape: "rect" },
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const parseNumber = (value: unknown) => {
  if (isFiniteNumber(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isReservableFloorPlanItem(kind: FloorPlanItemKind | null | undefined) {
  return (kind || "table") === "table";
}

export function getFloorPlanItemBaseName(kind: FloorPlanItemKind | null | undefined) {
  return ITEM_BASE_NAMES[kind || "table"];
}

export function getFloorPlanItemTypeLabel(
  kind: FloorPlanItemKind | null | undefined,
  shape?: FloorPlanTableShape,
) {
  if ((kind || "table") !== "table") {
    return ITEM_TYPE_LABELS[kind || "table"];
  }

  return shape === "round" ? "Table ronde" : "Table rectangulaire";
}

export function buildSeatLabels(capacity: number, shape: FloorPlanTableShape) {
  const safeCapacity = Math.max(1, Math.round(capacity || 1));
  if (shape === "round") {
    return Array.from({ length: safeCapacity }, () => 1);
  }

  const seatCount = Math.max(2, Math.ceil(safeCapacity / 2) * 2);
  return Array.from({ length: seatCount }, () => 1);
}

export function getMinimumTableSize(
  capacity: number,
  shape: FloorPlanTableShape,
  kind: FloorPlanItemKind = "table",
) {
  if (!isReservableFloorPlanItem(kind)) {
    const furnitureSize = MIN_FURNITURE_SIZE[kind];
    return { w: furnitureSize.w, h: furnitureSize.h };
  }

  const safeCapacity = Math.max(1, Math.round(capacity || 1));
  if (shape === "round") {
    const diameter = 116 + Math.max(0, safeCapacity - 2) * 12;
    return { w: diameter, h: diameter };
  }

  const width = 132 + Math.max(0, safeCapacity - 2) * 18;
  const height = 88 + Math.max(0, Math.ceil((safeCapacity - 4) / 4)) * 10;
  return { w: width, h: Math.max(88, height) };
}

export function ensureFloorPlanLayoutFitsCapacity(
  layout: FloorPlanTableLayout,
  capacity: number,
  shape: FloorPlanTableShape = layout.shape,
  kind: FloorPlanItemKind = layout.kind || "table",
) {
  const minimum = getMinimumTableSize(capacity, shape, kind);
  const nextShape = !isReservableFloorPlanItem(kind)
    ? MIN_FURNITURE_SIZE[kind].shape
    : shape;

  return {
    ...layout,
    kind,
    shape: nextShape,
    w: Math.max(minimum.w, Math.round(layout.w || minimum.w)),
    h: Math.max(minimum.h, Math.round(layout.h || minimum.h)),
    seatLabels: isReservableFloorPlanItem(kind) ? buildSeatLabels(capacity, nextShape) : [],
  };
}

export function clampFloorPlanLayout(
  layout: FloorPlanTableLayout,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
) {
  const maxX = Math.max(DEFAULT_PADDING, canvasWidth - layout.w - DEFAULT_PADDING);
  const maxY = Math.max(DEFAULT_PADDING, canvasHeight - layout.h - DEFAULT_PADDING);

  return {
    ...layout,
    x: Math.min(Math.max(DEFAULT_PADDING, Math.round(layout.x || DEFAULT_PADDING)), maxX),
    y: Math.min(Math.max(DEFAULT_PADDING, Math.round(layout.y || DEFAULT_PADDING)), maxY),
  };
}

export function normalizeFloorPlanLayout(
  rawLayout: unknown,
  fallbackIndex: number,
  capacity: number,
  shapeFallback: FloorPlanTableShape = "rect",
  kindFallback: FloorPlanItemKind = "table",
) {
  const source = typeof rawLayout === "object" && rawLayout !== null ? rawLayout as Record<string, unknown> : {};
  const parsedKind = typeof source.kind === "string" ? source.kind : kindFallback;
  const kind = Object.prototype.hasOwnProperty.call(ITEM_BASE_NAMES, parsedKind) ? parsedKind as FloorPlanItemKind : kindFallback;
  const parsedShape = typeof source.shape === "string" && (source.shape === "round" || source.shape === "rect")
    ? source.shape
    : shapeFallback;
  const normalizedShape = !isReservableFloorPlanItem(kind) ? MIN_FURNITURE_SIZE[kind].shape : parsedShape;
  const minimum = getMinimumTableSize(capacity, normalizedShape, kind);
  const seatLabels = Array.isArray(source.seat_labels)
    ? source.seat_labels.flatMap((value) => {
      const parsed = parseNumber(value);
      return parsed && parsed > 0 ? [Math.round(parsed)] : [];
    })
    : Array.isArray(source.seatLabels)
      ? source.seatLabels.flatMap((value) => {
        const parsed = parseNumber(value);
        return parsed && parsed > 0 ? [Math.round(parsed)] : [];
      })
      : [];

  const rawSeatType = typeof source.seat_type === "string" ? source.seat_type
    : typeof source.seatType === "string" ? source.seatType
    : undefined;
  const seatType: FloorPlanSeatType | undefined = rawSeatType && VALID_SEAT_TYPES.has(rawSeatType as FloorPlanSeatType)
    ? rawSeatType as FloorPlanSeatType
    : undefined;

  const x = parseNumber(source.x) ?? (24 + (fallbackIndex % 4) * 220);
  const y = parseNumber(source.y) ?? (24 + Math.floor(fallbackIndex / 4) * 176);
  const w = parseNumber(source.w) ?? minimum.w;
  const h = parseNumber(source.h) ?? minimum.h;
  const rotation = parseNumber(source.rotation) ?? 0;

  return clampFloorPlanLayout(ensureFloorPlanLayoutFitsCapacity({
    x,
    y,
    w,
    h,
    rotation,
    shape: normalizedShape,
    kind,
    seatType,
    seatLabels: isReservableFloorPlanItem(kind)
      ? (seatLabels.length ? seatLabels : buildSeatLabels(capacity, normalizedShape))
      : [],
  }, capacity, normalizedShape, kind));
}

export function buildDraftFloorPlanLayout(
  existingCount: number,
  preset: FloorPlanTablePreset,
) {
  const layout = ensureFloorPlanLayoutFitsCapacity({
    x: 24 + (existingCount % 4) * 220,
    y: 24 + Math.floor(existingCount / 4) * 176,
    w: preset.w,
    h: preset.h,
    rotation: 0,
    shape: preset.shape,
    kind: preset.kind,
    seatLabels: isReservableFloorPlanItem(preset.kind) ? buildSeatLabels(preset.capacity, preset.shape) : [],
  }, preset.capacity, preset.shape, preset.kind);

  return clampFloorPlanLayout(layout);
}

function getScheduleTimestamp(schedule: FloorPlanReservationSchedule) {
  const [rawHour = "0", rawMinute = "0"] = String(schedule.time || "00:00").split(":");
  const hour = Number.parseInt(rawHour, 10) || 0;
  const minute = Number.parseInt(rawMinute, 10) || 0;
  return new Date(`${schedule.date}T00:00:00`).getTime() + (hour * 60 + minute) * 60 * 1000;
}

export function reservationsOverlap(
  left: FloorPlanReservationSchedule,
  right: FloorPlanReservationSchedule,
) {
  if (!left.date || !right.date || left.date !== right.date) return false;

  const windowMinutes = 120;
  const leftStart = getScheduleTimestamp(left);
  const rightStart = getScheduleTimestamp(right);
  const leftEnd = leftStart + windowMinutes * 60 * 1000;
  const rightEnd = rightStart + windowMinutes * 60 * 1000;

  return leftStart < rightEnd && rightStart < leftEnd;
}

export const FLOOR_PLAN_PRESETS: FloorPlanTablePreset[] = [
  {
    id: "table-round-2",
    label: "Table ronde 2 pers.",
    description: "Petit duo pour vitrine ou coin salon.",
    category: "table",
    kind: "table",
    capacity: 2,
    shape: "round",
    w: 128,
    h: 128,
  },
  {
    id: "table-round-4",
    label: "Table ronde 4 pers.",
    description: "Format central polyvalent.",
    category: "table",
    kind: "table",
    capacity: 4,
    shape: "round",
    w: 156,
    h: 156,
  },
  {
    id: "table-rect-4",
    label: "Table rectangle 4 pers.",
    description: "Table standard pour salle principale.",
    category: "table",
    kind: "table",
    capacity: 4,
    shape: "rect",
    w: 176,
    h: 112,
  },
  {
    id: "table-rect-6",
    label: "Table rectangle 6 pers.",
    description: "Format banquet court ou famille.",
    category: "table",
    kind: "table",
    capacity: 6,
    shape: "rect",
    w: 210,
    h: 118,
  },
  {
    id: "chair",
    label: "Chaise",
    description: "Assise individuelle mobile.",
    category: "furniture",
    kind: "chair",
    capacity: 0,
    shape: "round",
    w: 76,
    h: 76,
  },
  {
    id: "stool",
    label: "Tabouret",
    description: "Assise compacte pour bar ou mange-debout.",
    category: "furniture",
    kind: "stool",
    capacity: 0,
    shape: "round",
    w: 64,
    h: 64,
  },
  {
    id: "bar",
    label: "Bar",
    description: "Comptoir principal ou secondaire.",
    category: "furniture",
    kind: "bar",
    capacity: 0,
    shape: "rect",
    w: 280,
    h: 104,
  },
  {
    id: "corner-bench",
    label: "Banc d'angle",
    description: "Banquette en L pour coin lounge.",
    category: "furniture",
    kind: "corner-bench",
    capacity: 0,
    shape: "rect",
    w: 248,
    h: 188,
  },
  {
    id: "banquette",
    label: "Banquette",
    description: "Assise murale lineaire.",
    category: "furniture",
    kind: "banquette",
    capacity: 0,
    shape: "rect",
    w: 228,
    h: 104,
  },
  {
    id: "booth",
    label: "Booth",
    description: "Box complet avec assises integrees.",
    category: "furniture",
    kind: "booth",
    capacity: 0,
    shape: "rect",
    w: 220,
    h: 152,
  },
  {
    id: "host-stand",
    label: "Accueil",
    description: "Pupitre d'accueil ou caisse.",
    category: "furniture",
    kind: "host-stand",
    capacity: 0,
    shape: "rect",
    w: 110,
    h: 98,
  },
  {
    id: "divider",
    label: "Separateur",
    description: "Claustra ou separation de flux.",
    category: "furniture",
    kind: "divider",
    capacity: 0,
    shape: "rect",
    w: 188,
    h: 46,
  },
  {
    id: "plant",
    label: "Plante",
    description: "Repere vegetal pour structurer la salle.",
    category: "furniture",
    kind: "plant",
    capacity: 0,
    shape: "round",
    w: 84,
    h: 84,
  },
  {
    id: "service-station",
    label: "Desserte",
    description: "Meuble de service, couverts ou eau.",
    category: "furniture",
    kind: "service-station",
    capacity: 0,
    shape: "rect",
    w: 140,
    h: 92,
  },
];
