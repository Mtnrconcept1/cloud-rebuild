export type FloorPlanTableShape = "round" | "rect";
export type FloorPlanItemCategory = "table" | "furniture";
export type FloorPlanSeatType = "chair" | "stool" | "bench" | "corner-bench";
export type FloorPlanLinearSeatType = Exclude<FloorPlanSeatType, "corner-bench">;
export type FloorPlanRectSeatZone = "top" | "right" | "bottom" | "left";
export type FloorPlanRoundSeatZone =
  | "north"
  | "north-east"
  | "east"
  | "south-east"
  | "south"
  | "south-west"
  | "west"
  | "north-west";
export type FloorPlanSeatZone = FloorPlanRectSeatZone | FloorPlanRoundSeatZone;
export type FloorPlanCornerBenchCorner = "top-left" | "top-right" | "bottom-right" | "bottom-left";
export type FloorPlanSeatPlacement = {
  zone: FloorPlanSeatZone;
  type: FloorPlanLinearSeatType;
  count: number;
  benchLength?: number;
  benchDepth?: number;
};
export type FloorPlanCornerBenchConfig = {
  corner: FloorPlanCornerBenchCorner;
  horizontal: number;
  vertical: number;
  depth: number;
  horizontalSeats?: number;
  verticalSeats?: number;
};
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
type FloorPlanFurnitureKind = Exclude<FloorPlanItemKind, "table">;

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
  seatPlacements?: FloorPlanSeatPlacement[];
  cornerBenchCorners?: FloorPlanCornerBenchCorner[];
  cornerBenchConfigs?: FloorPlanCornerBenchConfig[];
  tableWidth?: number;
  tableHeight?: number;
  cornerBenchHorizontal?: number;
  cornerBenchVertical?: number;
  cornerBenchDepth?: number;
};

export type FloorPlanResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type FloorPlanRenderedFrame = { x: number; y: number; w: number; h: number };
export type FloorPlanViewportAnchor = { x: number; y: number };
export type FloorPlanInteractiveFrame = FloorPlanRenderedFrame & {
  visualOffsetX: number;
  visualOffsetY: number;
};

export type FloorPlanResizeBehavior = {
  ratioLocked: boolean;
  handles: FloorPlanResizeHandle[];
};

/** Corner handles scale both axes together; edge handles stretch one axis. */
const UNIFORM_RESIZE_HANDLES: FloorPlanResizeHandle[] = ["nw", "ne", "se", "sw"];
const FREE_RESIZE_HANDLES: FloorPlanResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function getFloorPlanItemResizeBehavior(
  kind: FloorPlanItemKind,
  shape?: FloorPlanTableShape,
): FloorPlanResizeBehavior {
  // A round top stretched on a single axis becomes an ellipse, which no longer
  // matches any real table: rounds are always resized uniformly.
  if (shape === "round") {
    return { ratioLocked: true, handles: UNIFORM_RESIZE_HANDLES };
  }

  if (kind === "table") {
    return { ratioLocked: false, handles: FREE_RESIZE_HANDLES };
  }

  switch (kind) {
    case "chair":
    case "stool":
    case "plant":
      return { ratioLocked: true, handles: UNIFORM_RESIZE_HANDLES };
    case "bar":
      return { ratioLocked: false, handles: ["nw", "n", "ne", "e", "se", "s", "sw", "w"] };
    case "banquette":
      return { ratioLocked: false, handles: ["nw", "n", "ne", "e", "se", "s", "sw", "w"] };
    case "divider":
      return { ratioLocked: false, handles: ["e", "w", "n", "s", "nw", "ne", "se", "sw"] };
    case "booth":
    case "host-stand":
    case "service-station":
    case "corner-bench":
      return { ratioLocked: false, handles: ["nw", "n", "ne", "e", "se", "s", "sw", "w"] };
    default:
      return { ratioLocked: false, handles: ["nw", "n", "ne", "e", "se", "s", "sw", "w"] };
  }
}

export function getFloorPlanInteractiveFrame(
  frame: FloorPlanRenderedFrame,
  minimumSize = 36,
): FloorPlanInteractiveFrame {
  const safeMinimum = Math.max(1, Math.round(minimumSize));
  const width = Math.max(frame.w, safeMinimum);
  const height = Math.max(frame.h, safeMinimum);
  const visualOffsetX = Math.round((width - frame.w) / 2);
  const visualOffsetY = Math.round((height - frame.h) / 2);

  return {
    x: frame.x - visualOffsetX,
    y: frame.y - visualOffsetY,
    w: width,
    h: height,
    visualOffsetX,
    visualOffsetY,
  };
}

export type FloorPlanResolvedDimensions = {
  tableWidth: number;
  tableHeight: number;
  footprintWidth: number;
  footprintHeight: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  seatType: FloorPlanSeatType;
  seatPlacements: FloorPlanSeatPlacement[];
  cornerBenchCorners: FloorPlanCornerBenchCorner[];
  cornerBenchConfigs: FloorPlanCornerBenchConfig[];
  capacity: number;
  cornerBenchHorizontal?: number;
  cornerBenchVertical?: number;
  cornerBenchDepth?: number;
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
const DEFAULT_CANVAS_HEIGHT = 760;
const ROOM_SURFACE_INSET = 46;

const VALID_SEAT_TYPES = new Set<FloorPlanSeatType>(["chair", "stool", "bench", "corner-bench"]);
const VALID_LINEAR_SEAT_TYPES = new Set<FloorPlanLinearSeatType>(["chair", "stool", "bench"]);
export const RECT_SEAT_ZONES: FloorPlanRectSeatZone[] = ["top", "right", "bottom", "left"];
export const ROUND_SEAT_ZONES: FloorPlanRoundSeatZone[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
export const CORNER_BENCH_CORNERS: FloorPlanCornerBenchCorner[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

export const SEAT_TYPE_LABELS: Record<FloorPlanSeatType, string> = {
  chair: "Chaises",
  stool: "Tabourets",
  bench: "Banquettes",
  "corner-bench": "Bancs d'angle",
};

export const RECT_SEAT_ZONE_LABELS: Record<FloorPlanRectSeatZone, string> = {
  top: "Haut",
  right: "Droite",
  bottom: "Bas",
  left: "Gauche",
};

export const ROUND_SEAT_ZONE_LABELS: Record<FloorPlanRoundSeatZone, string> = {
  north: "Nord",
  "north-east": "Nord-est",
  east: "Est",
  "south-east": "Sud-est",
  south: "Sud",
  "south-west": "Sud-ouest",
  west: "Ouest",
  "north-west": "Nord-ouest",
};

export const CORNER_BENCH_LABELS: Record<FloorPlanCornerBenchCorner, string> = {
  "top-left": "Haut gauche",
  "top-right": "Haut droite",
  "bottom-right": "Bas droite",
  "bottom-left": "Bas gauche",
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
const MIN_FURNITURE_RESIZE_SIZE: Record<Exclude<FloorPlanItemKind, "table">, { w: number; h: number }> = {
  chair: { w: 1, h: 1 },
  stool: { w: 1, h: 1 },
  bar: { w: 1, h: 1 },
  "corner-bench": { w: 1, h: 1 },
  banquette: { w: 1, h: 1 },
  booth: { w: 1, h: 1 },
  "host-stand": { w: 1, h: 1 },
  divider: { w: 1, h: 1 },
  plant: { w: 1, h: 1 },
  "service-station": { w: 1, h: 1 },
};
const MIN_RESIZE_SIZE = { w: 1, h: 1 };

const FOOTPRINT_BASE_PADDING = 14;
const RECT_SIDE_CORNER_GAP = 18;
const ROUND_SEAT_PADDING: Record<FloorPlanSeatType, number> = {
  chair: 28,
  stool: 22,
  bench: 24,
  "corner-bench": 24,
};
const RECT_SEAT_PADDING: Record<Exclude<FloorPlanSeatType, "corner-bench">, number> = {
  chair: 30,
  stool: 22,
  bench: 26,
};
const MIN_CORNER_BENCH_DEPTH = 44;
const MAX_CORNER_BENCH_DEPTH = 74;
const MIN_CORNER_BENCH_HORIZONTAL = 92;
const MIN_CORNER_BENCH_VERTICAL = 86;
const CORNER_BENCH_SEAT_SPAN = 52;
const CORNER_BENCH_DEFAULT_DEPTH = 56;
const MAX_CORNER_BENCH_SEATS_PER_AXIS = 12;
const MIN_BENCH_DEPTH = 22;
const MAX_BENCH_DEPTH = 52;
const ROUND_ZONE_SAFE_ARC_RADIANS = (38 * Math.PI) / 180;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const parseNumber = (value: unknown) => {
  if (isFiniteNumber(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isReservableFloorPlanItem(kind: FloorPlanItemKind | null | undefined): kind is "table" {
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

function roundDimension(value: number) {
  return Math.round(value);
}

function clampDimension(value: number, min: number, max = Number.POSITIVE_INFINITY) {
  return roundDimension(Math.min(max, Math.max(min, value)));
}

function resolveFurnitureFootprint(
  kind: FloorPlanFurnitureKind,
  footprintWidth?: number | null,
  footprintHeight?: number | null,
) {
  const defaultSize = MIN_FURNITURE_SIZE[kind];
  const minimum = MIN_FURNITURE_RESIZE_SIZE[kind];

  return {
    w: clampDimension(parseNumber(footprintWidth) ?? defaultSize.w, minimum.w),
    h: clampDimension(parseNumber(footprintHeight) ?? defaultSize.h, minimum.h),
  };
}

export function resizeRenderedFloorPlanFrame(
  frame: FloorPlanRenderedFrame,
  handle: FloorPlanResizeHandle,
  deltaX: number,
  deltaY: number,
  minimumWidth: number,
  minimumHeight: number,
): FloorPlanRenderedFrame {
  const left = frame.x;
  const top = frame.y;
  const right = frame.x + frame.w;
  const bottom = frame.y + frame.h;

  if (handle.length === 2) {
    const candidateWidth = Math.max(
      minimumWidth,
      handle.includes("e") ? frame.w + deltaX : frame.w - deltaX,
    );
    const candidateHeight = Math.max(
      minimumHeight,
      handle.includes("s") ? frame.h + deltaY : frame.h - deltaY,
    );
    const scaleFromWidth = candidateWidth / frame.w;
    const scaleFromHeight = candidateHeight / frame.h;
    const minimumScale = Math.max(minimumWidth / frame.w, minimumHeight / frame.h);
    const dominantScale = Math.abs(scaleFromWidth - 1) >= Math.abs(scaleFromHeight - 1)
      ? scaleFromWidth
      : scaleFromHeight;
    const scale = Math.max(minimumScale, dominantScale);
    const nextWidth = roundDimension(frame.w * scale);
    const nextHeight = roundDimension(frame.h * scale);

    return {
      x: handle.includes("w") ? right - nextWidth : left,
      y: handle.includes("n") ? bottom - nextHeight : top,
      w: nextWidth,
      h: nextHeight,
    };
  }

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle === "e") {
    nextRight = Math.max(nextLeft + minimumWidth, right + deltaX);
  }
  if (handle === "w") {
    nextLeft = Math.min(nextRight - minimumWidth, left + deltaX);
  }
  if (handle === "s") {
    nextBottom = Math.max(nextTop + minimumHeight, bottom + deltaY);
  }
  if (handle === "n") {
    nextTop = Math.min(nextBottom - minimumHeight, top + deltaY);
  }

  return {
    x: nextLeft,
    y: nextTop,
    w: nextRight - nextLeft,
    h: nextBottom - nextTop,
  };
}

function distributeSidesRect(capacity: number) {
  const count = Math.max(1, Math.round(capacity || 1));
  if (count === 1) return { top: 0, bottom: 1, left: 0, right: 0 };
  if (count === 2) return { top: 1, bottom: 1, left: 0, right: 0 };
  if (count === 3) return { top: 1, bottom: 2, left: 0, right: 0 };

  const longSideTotal = count <= 4 ? count : count - 2;
  const top = Math.floor(longSideTotal / 2);
  const bottom = Math.ceil(longSideTotal / 2);
  const remainder = Math.max(0, count - top - bottom);
  const left = Math.floor(remainder / 2);
  const right = remainder - left;
  return { top, bottom, left, right };
}

function isRectSeatZone(value: string): value is FloorPlanRectSeatZone {
  return RECT_SEAT_ZONES.includes(value as FloorPlanRectSeatZone);
}

function isRoundSeatZone(value: string): value is FloorPlanRoundSeatZone {
  return ROUND_SEAT_ZONES.includes(value as FloorPlanRoundSeatZone);
}

function isSeatZoneForShape(shape: FloorPlanTableShape, zone: string): zone is FloorPlanSeatZone {
  return shape === "rect" ? isRectSeatZone(zone) : isRoundSeatZone(zone);
}

function getRoundZoneCenterAngle(zone: FloorPlanRoundSeatZone) {
  const angleByZone: Record<FloorPlanRoundSeatZone, number> = {
    north: -90,
    "north-east": -45,
    east: 0,
    "south-east": 45,
    south: 90,
    "south-west": 135,
    west: 180,
    "north-west": 225,
  };
  return angleByZone[zone];
}

function getNormalizedLinearSeatType(value: unknown): FloorPlanLinearSeatType | null {
  return typeof value === "string" && VALID_LINEAR_SEAT_TYPES.has(value as FloorPlanLinearSeatType)
    ? value as FloorPlanLinearSeatType
    : null;
}

function normalizeCornerBenchSeatCount(value: unknown, fallback = 1) {
  const parsed = parseNumber(value);
  const seatCount = parsed === null ? fallback : parsed;
  return Math.max(1, Math.min(MAX_CORNER_BENCH_SEATS_PER_AXIS, Math.round(seatCount || fallback)));
}

function estimateCornerBenchSeatCountFromSpan(
  span: number | null,
  baseSpan: number,
) {
  if (span === null) return 1;
  return normalizeCornerBenchSeatCount(1 + Math.round(Math.max(0, span - baseSpan) / CORNER_BENCH_SEAT_SPAN));
}

export function getCornerBenchDimensionsFromSeatCounts(
  horizontalSeats: number,
  verticalSeats: number,
) {
  const safeHorizontalSeats = normalizeCornerBenchSeatCount(horizontalSeats);
  const safeVerticalSeats = normalizeCornerBenchSeatCount(verticalSeats);

  return {
    horizontalSeats: safeHorizontalSeats,
    verticalSeats: safeVerticalSeats,
    horizontal: MIN_CORNER_BENCH_HORIZONTAL + (safeHorizontalSeats - 1) * CORNER_BENCH_SEAT_SPAN,
    vertical: MIN_CORNER_BENCH_VERTICAL + (safeVerticalSeats - 1) * CORNER_BENCH_SEAT_SPAN,
    depth: CORNER_BENCH_DEFAULT_DEPTH,
  };
}

function normalizeCornerBenchConfig(source: Record<string, unknown>) {
  const corner = typeof source.corner === "string" && CORNER_BENCH_CORNERS.includes(source.corner as FloorPlanCornerBenchCorner)
    ? source.corner as FloorPlanCornerBenchCorner
    : null;
  const sourceHorizontalSeats = parseNumber(source.horizontalSeats) ?? parseNumber(source.horizontal_seats);
  const sourceVerticalSeats = parseNumber(source.verticalSeats) ?? parseNumber(source.vertical_seats);
  const sourceHorizontal = parseNumber(source.horizontal);
  const sourceVertical = parseNumber(source.vertical);
  const sourceDepth = parseNumber(source.depth);
  const horizontalSeats = normalizeCornerBenchSeatCount(
    sourceHorizontalSeats,
    estimateCornerBenchSeatCountFromSpan(sourceHorizontal, MIN_CORNER_BENCH_HORIZONTAL),
  );
  const verticalSeats = normalizeCornerBenchSeatCount(
    sourceVerticalSeats,
    estimateCornerBenchSeatCountFromSpan(sourceVertical, MIN_CORNER_BENCH_VERTICAL),
  );
  const dimensions = getCornerBenchDimensionsFromSeatCounts(horizontalSeats, verticalSeats);

  if (!corner) return null;
  return {
    corner,
    horizontal: clampDimension(dimensions.horizontal, MIN_CORNER_BENCH_HORIZONTAL),
    vertical: clampDimension(dimensions.vertical, MIN_CORNER_BENCH_VERTICAL),
    depth: clampDimension(sourceDepth ?? dimensions.depth, MIN_CORNER_BENCH_DEPTH, MAX_CORNER_BENCH_DEPTH),
    horizontalSeats,
    verticalSeats,
  };
}

function getDefaultLinearSeatType(seatType?: FloorPlanSeatType): FloorPlanLinearSeatType {
  if (seatType === "stool" || seatType === "bench") return seatType;
  return "chair";
}

function getSeatTypeFromPlacements(
  shape: FloorPlanTableShape,
  placements: FloorPlanSeatPlacement[],
  fallback?: FloorPlanSeatType,
): FloorPlanSeatType {
  if (placements.length === 0) return getEffectiveSeatType(shape, fallback);

  const weightedTypes = placements.reduce<Record<FloorPlanLinearSeatType, number>>((accumulator, placement) => {
    accumulator[placement.type] += placement.count;
    return accumulator;
  }, { chair: 0, stool: 0, bench: 0 });

  if (weightedTypes.bench >= weightedTypes.chair && weightedTypes.bench >= weightedTypes.stool) return "bench";
  if (weightedTypes.stool >= weightedTypes.chair && weightedTypes.stool >= weightedTypes.bench) return "stool";
  return "chair";
}

function distributeRoundZones(capacity: number) {
  const safeCapacity = Math.max(0, Math.round(capacity || 0));
  const counts = new Map<FloorPlanRoundSeatZone, number>();
  ROUND_SEAT_ZONES.forEach((zone) => counts.set(zone, 0));

  if (safeCapacity === 2) {
    counts.set("north", 1);
    counts.set("south", 1);
    return counts;
  }

  if (safeCapacity === 4) {
    counts.set("north", 1);
    counts.set("east", 1);
    counts.set("south", 1);
    counts.set("west", 1);
    return counts;
  }

  for (let index = 0; index < safeCapacity; index += 1) {
    const zone = ROUND_SEAT_ZONES[index % ROUND_SEAT_ZONES.length];
    counts.set(zone, (counts.get(zone) || 0) + 1);
  }

  return counts;
}

function getOpposedRoundTwoSeatPlacements(
  type: FloorPlanLinearSeatType,
): FloorPlanSeatPlacement[] {
  return [
    { zone: "north", type, count: 1 },
    { zone: "south", type, count: 1 },
  ];
}

function shouldOpposeRoundTwoSeats(
  shape: FloorPlanTableShape,
  placements: FloorPlanSeatPlacement[],
) {
  if (shape !== "round") return false;
  if (placements.some((placement) => placement.type === "bench")) return false;
  return placements.reduce((total, placement) => total + placement.count, 0) === 2;
}

export function getDefaultBenchDimensions(
  tableWidth: number,
  tableHeight: number,
  zone: FloorPlanSeatZone,
  count = 2,
) {
  const isHorizontal = zone === "top" || zone === "bottom";
  const relevantSpan = isHorizontal
    ? Math.max(88, roundDimension(tableWidth || 88))
    : zone === "left" || zone === "right"
      ? Math.max(72, roundDimension(tableHeight || 72))
      : Math.max(96, roundDimension((Math.max(tableWidth || 88, tableHeight || 72)) * 0.55));

  return {
    benchLength: clampDimension(
      Math.max(relevantSpan * 0.56, Math.max(1, count) * 28),
      Math.max(56, Math.max(1, count) * 22),
      relevantSpan,
    ),
    benchDepth: clampDimension(Math.min(tableWidth || 88, tableHeight || 72) * 0.26, MIN_BENCH_DEPTH, MAX_BENCH_DEPTH),
  };
}

function normalizeSeatPlacements(
  shape: FloorPlanTableShape,
  rawPlacements: unknown,
  fallbackCapacity: number,
  fallbackSeatType?: FloorPlanSeatType,
  tableWidth?: number,
  tableHeight?: number,
): FloorPlanSeatPlacement[] {
  const parsedPlacements: FloorPlanSeatPlacement[] = Array.isArray(rawPlacements)
    ? rawPlacements.flatMap((entry): FloorPlanSeatPlacement[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const source = entry as Record<string, unknown>;
      const zone = typeof source.zone === "string" && isSeatZoneForShape(shape, source.zone)
        ? source.zone as FloorPlanSeatZone
        : null;
      const type = getNormalizedLinearSeatType(source.type);
      const count = parseNumber(source.count);
      if (!zone || !type || !count || count <= 0) return [];
      const safeCount = Math.max(1, Math.round(count));
      if (type !== "bench") {
        return [{ zone, type, count: safeCount }];
      }

      const defaults = getDefaultBenchDimensions(tableWidth || 88, tableHeight || 72, zone, safeCount);
      const benchLength = clampDimension(
        parseNumber(source.bench_length) ?? parseNumber(source.benchLength) ?? defaults.benchLength,
        Math.max(48, safeCount * 20),
      );
      const benchDepth = clampDimension(
        parseNumber(source.bench_depth) ?? parseNumber(source.benchDepth) ?? defaults.benchDepth,
        MIN_BENCH_DEPTH,
        MAX_BENCH_DEPTH,
      );

      return [{ zone, type, count: safeCount, benchLength, benchDepth }];
    })
    : [];

  if (parsedPlacements.length > 0) {
    const deduped = new Map<string, FloorPlanSeatPlacement>();
    parsedPlacements.forEach((placement) => {
      deduped.set(placement.zone, placement);
    });
    const nextPlacements = Array.from(deduped.values());
    if (shouldOpposeRoundTwoSeats(shape, nextPlacements)) {
      return getOpposedRoundTwoSeatPlacements(nextPlacements[0]?.type || getDefaultLinearSeatType(fallbackSeatType));
    }
    return nextPlacements;
  }

  if ((Array.isArray(rawPlacements) && rawPlacements.length === 0) || fallbackSeatType === "corner-bench") {
    return [];
  }

  const defaultType = getDefaultLinearSeatType(fallbackSeatType);
  const safeCapacity = Math.max(0, Math.round(fallbackCapacity || 0));
  if (safeCapacity <= 0) return [];

  if (shape === "round") {
    const distribution = distributeRoundZones(safeCapacity);
    return ROUND_SEAT_ZONES.flatMap((zone): FloorPlanSeatPlacement[] => {
      const count = distribution.get(zone) || 0;
      if (count <= 0) return [];
      if (defaultType !== "bench") return [{ zone, type: defaultType, count }];
      const defaults = getDefaultBenchDimensions(tableWidth || 88, tableHeight || 72, zone, count);
      return [{ zone, type: defaultType, count, benchLength: defaults.benchLength, benchDepth: defaults.benchDepth }];
    });
  }

  const distribution = distributeSidesRect(safeCapacity);
  return RECT_SEAT_ZONES.flatMap((zone): FloorPlanSeatPlacement[] => {
    const count = distribution[zone];
    if (count <= 0) return [];
    if (defaultType !== "bench") return [{ zone, type: defaultType, count }];
    const defaults = getDefaultBenchDimensions(tableWidth || 88, tableHeight || 72, zone, count);
    return [{ zone, type: defaultType, count, benchLength: defaults.benchLength, benchDepth: defaults.benchDepth }];
  });
}

function normalizeCornerBenchCorners(
  shape: FloorPlanTableShape,
  rawCorners: unknown,
  fallbackSeatType?: FloorPlanSeatType,
): FloorPlanCornerBenchCorner[] {
  if (shape !== "rect") return [] as FloorPlanCornerBenchCorner[];

  const parsedCorners: FloorPlanCornerBenchCorner[] = Array.isArray(rawCorners)
    ? rawCorners.flatMap((entry): FloorPlanCornerBenchCorner[] => {
      if (typeof entry !== "string") return [];
      return CORNER_BENCH_CORNERS.includes(entry as FloorPlanCornerBenchCorner)
        ? [entry as FloorPlanCornerBenchCorner]
        : [];
    })
    : [];

  if (parsedCorners.length > 0) {
    return Array.from(new Set(parsedCorners));
  }

  return fallbackSeatType === "corner-bench" ? ["top-left"] : [];
}

function normalizeCornerBenchConfigs(
  shape: FloorPlanTableShape,
  rawConfigs: unknown,
  legacyCorners: FloorPlanCornerBenchCorner[],
  legacyHorizontal: number | undefined,
  legacyVertical: number | undefined,
  legacyDepth: number | undefined,
  tableWidth: number,
  tableHeight: number,
): FloorPlanCornerBenchConfig[] {
  if (shape !== "rect") return [] as FloorPlanCornerBenchConfig[];

  const defaults = getDefaultCornerBenchDimensions(tableWidth, tableHeight);
  const parsedConfigs = Array.isArray(rawConfigs)
    ? rawConfigs.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const parsed = normalizeCornerBenchConfig(entry as Record<string, unknown>);
      return parsed ? [parsed] : [];
    })
    : [];

  if (parsedConfigs.length > 0) {
    const deduped = new Map<FloorPlanCornerBenchCorner, FloorPlanCornerBenchConfig>();
    parsedConfigs.forEach((config) => {
      const dimensions = getCornerBenchDimensionsFromSeatCounts(
        config.horizontalSeats ?? 1,
        config.verticalSeats ?? 1,
      );
      deduped.set(config.corner, {
        corner: config.corner,
        horizontal: clampDimension(dimensions.horizontal, MIN_CORNER_BENCH_HORIZONTAL, Math.max(tableWidth, dimensions.horizontal)),
        vertical: clampDimension(dimensions.vertical, MIN_CORNER_BENCH_VERTICAL, Math.max(tableHeight, dimensions.vertical)),
        depth: clampDimension(config.depth, MIN_CORNER_BENCH_DEPTH, MAX_CORNER_BENCH_DEPTH),
        horizontalSeats: dimensions.horizontalSeats,
        verticalSeats: dimensions.verticalSeats,
      });
    });
    return Array.from(deduped.values());
  }

  return legacyCorners.map((corner) => {
    const dimensions = getCornerBenchDimensionsFromSeatCounts(
      estimateCornerBenchSeatCountFromSpan(legacyHorizontal ?? defaults.cornerBenchHorizontal, MIN_CORNER_BENCH_HORIZONTAL),
      estimateCornerBenchSeatCountFromSpan(legacyVertical ?? defaults.cornerBenchVertical, MIN_CORNER_BENCH_VERTICAL),
    );

    return {
      corner,
      horizontal: clampDimension(dimensions.horizontal, MIN_CORNER_BENCH_HORIZONTAL, Math.max(tableWidth, dimensions.horizontal)),
      vertical: clampDimension(dimensions.vertical, MIN_CORNER_BENCH_VERTICAL, Math.max(tableHeight, dimensions.vertical)),
      depth: clampDimension(legacyDepth ?? dimensions.depth, MIN_CORNER_BENCH_DEPTH, MAX_CORNER_BENCH_DEPTH),
      horizontalSeats: dimensions.horizontalSeats,
      verticalSeats: dimensions.verticalSeats,
    };
  });
}

export function getSeatPlacementsCapacity(placements: FloorPlanSeatPlacement[]) {
  return placements.reduce((total, placement) => total + Math.max(0, Math.round(placement.count || 0)), 0);
}

function getEffectiveSeatType(shape: FloorPlanTableShape, seatType?: FloorPlanSeatType): FloorPlanSeatType {
  const normalizedSeatType = seatType && VALID_SEAT_TYPES.has(seatType) ? seatType : "chair";
  if (shape === "round" && normalizedSeatType === "corner-bench") {
    return "bench";
  }
  return normalizedSeatType;
}

function getMinimumTableTopSize(capacity: number, shape: FloorPlanTableShape) {
  const safeCapacity = Math.max(1, Math.round(capacity || 1));
  if (shape === "round") {
    const diameter = 78 + Math.max(0, safeCapacity - 2) * 10;
    return { w: diameter, h: diameter };
  }

  const distribution = distributeSidesRect(safeCapacity);
  const longSideSeats = Math.max(1, distribution.top, distribution.bottom);
  const shortSideSeats = Math.max(0, distribution.left, distribution.right);

  return {
    w: 84 + longSideSeats * 28 + Math.max(0, safeCapacity - 8) * 3,
    h: 60 + Math.max(1, shortSideSeats) * 18 + Math.max(0, safeCapacity - 10) * 2,
  };
}

function getSeatDemandSpan(placement: FloorPlanSeatPlacement, orientation: "horizontal" | "vertical" | "radial") {
  if (placement.type === "bench") {
    return Math.max(48, roundDimension(placement.benchLength || (placement.count * 28)));
  }
  const unit = orientation === "radial" ? 22 : 28;
  return Math.max(unit, placement.count * unit + Math.max(0, placement.count - 1) * 6);
}

function getMinimumTableTopSizeFromConfiguration(
  shape: FloorPlanTableShape,
  capacity: number,
  placements: FloorPlanSeatPlacement[],
  cornerBenchConfigs: FloorPlanCornerBenchConfig[],
) {
  if (shape === "round") {
    const base = getMinimumTableTopSize(Math.max(1, capacity), shape);
    const padding = getRoundPaddingFromPlacements(placements);
    const requiredOrbitRadius = placements.reduce((maximum, placement) => (
      Math.max(maximum, getSeatDemandSpan(placement, "radial") / ROUND_ZONE_SAFE_ARC_RADIANS)
    ), (base.w / 2) + padding * 0.56);
    const diameterFromArc = roundDimension(Math.max(base.w, (requiredOrbitRadius - padding * 0.56) * 2));
    return { w: diameterFromArc, h: diameterFromArc };
  }

  const topPlacement = placements.find((placement) => placement.zone === "top");
  const bottomPlacement = placements.find((placement) => placement.zone === "bottom");
  const leftPlacement = placements.find((placement) => placement.zone === "left");
  const rightPlacement = placements.find((placement) => placement.zone === "right");

  const topLeftCorner = cornerBenchConfigs.find((config) => config.corner === "top-left");
  const topRightCorner = cornerBenchConfigs.find((config) => config.corner === "top-right");
  const bottomLeftCorner = cornerBenchConfigs.find((config) => config.corner === "bottom-left");
  const bottomRightCorner = cornerBenchConfigs.find((config) => config.corner === "bottom-right");

  const width = Math.max(
    84,
    (topLeftCorner?.horizontal || 0) + (topRightCorner?.horizontal || 0) + getSeatDemandSpan(topPlacement || { zone: "top", type: "chair", count: 0 }, "horizontal") + RECT_SIDE_CORNER_GAP * 2,
    (bottomLeftCorner?.horizontal || 0) + (bottomRightCorner?.horizontal || 0) + getSeatDemandSpan(bottomPlacement || { zone: "bottom", type: "chair", count: 0 }, "horizontal") + RECT_SIDE_CORNER_GAP * 2,
    Math.max(topLeftCorner?.horizontal || 0, bottomLeftCorner?.horizontal || 0, topRightCorner?.horizontal || 0, bottomRightCorner?.horizontal || 0, 84),
  );

  const height = Math.max(
    60,
    (topLeftCorner?.vertical || 0) + (bottomLeftCorner?.vertical || 0) + getSeatDemandSpan(leftPlacement || { zone: "left", type: "chair", count: 0 }, "vertical") + RECT_SIDE_CORNER_GAP * 2,
    (topRightCorner?.vertical || 0) + (bottomRightCorner?.vertical || 0) + getSeatDemandSpan(rightPlacement || { zone: "right", type: "chair", count: 0 }, "vertical") + RECT_SIDE_CORNER_GAP * 2,
    Math.max(topLeftCorner?.vertical || 0, topRightCorner?.vertical || 0, bottomLeftCorner?.vertical || 0, bottomRightCorner?.vertical || 0, 60),
  );

  return {
    w: roundDimension(width),
    h: roundDimension(height),
  };
}

function getRectSideAvailableSpan(
  zone: FloorPlanRectSeatZone,
  tableWidth: number,
  tableHeight: number,
  cornerBenchConfigs: FloorPlanCornerBenchConfig[],
) {
  if (zone === "top") {
    const left = cornerBenchConfigs.find((config) => config.corner === "top-left")?.horizontal || 0;
    const right = cornerBenchConfigs.find((config) => config.corner === "top-right")?.horizontal || 0;
    return Math.max(48, tableWidth - left - right - RECT_SIDE_CORNER_GAP * 2);
  }
  if (zone === "bottom") {
    const left = cornerBenchConfigs.find((config) => config.corner === "bottom-left")?.horizontal || 0;
    const right = cornerBenchConfigs.find((config) => config.corner === "bottom-right")?.horizontal || 0;
    return Math.max(48, tableWidth - left - right - RECT_SIDE_CORNER_GAP * 2);
  }
  if (zone === "left") {
    const top = cornerBenchConfigs.find((config) => config.corner === "top-left")?.vertical || 0;
    const bottom = cornerBenchConfigs.find((config) => config.corner === "bottom-left")?.vertical || 0;
    return Math.max(42, tableHeight - top - bottom - RECT_SIDE_CORNER_GAP * 2);
  }

  const top = cornerBenchConfigs.find((config) => config.corner === "top-right")?.vertical || 0;
  const bottom = cornerBenchConfigs.find((config) => config.corner === "bottom-right")?.vertical || 0;
  return Math.max(42, tableHeight - top - bottom - RECT_SIDE_CORNER_GAP * 2);
}

function normalizeResolvedSeatPlacements(
  shape: FloorPlanTableShape,
  placements: FloorPlanSeatPlacement[],
  tableWidth: number,
  tableHeight: number,
  cornerBenchConfigs: FloorPlanCornerBenchConfig[],
): FloorPlanSeatPlacement[] {
  return placements.map((placement) => {
    if (placement.type !== "bench") return placement;

    if (shape === "round") {
      const defaults = getDefaultBenchDimensions(tableWidth, tableHeight, placement.zone, placement.count);
      const maxArcLength = Math.PI * Math.max(tableWidth, tableHeight) * 0.2;
      return {
        ...placement,
        benchLength: clampDimension(placement.benchLength ?? defaults.benchLength, 48, maxArcLength),
        benchDepth: clampDimension(placement.benchDepth ?? defaults.benchDepth, MIN_BENCH_DEPTH, MAX_BENCH_DEPTH),
      };
    }

    const zone = placement.zone as FloorPlanRectSeatZone;
    const defaults = getDefaultBenchDimensions(tableWidth, tableHeight, zone, placement.count);
    return {
      ...placement,
      benchLength: clampDimension(
        placement.benchLength ?? defaults.benchLength,
        Math.max(48, placement.count * 20),
        getRectSideAvailableSpan(zone, tableWidth, tableHeight, cornerBenchConfigs),
      ),
      benchDepth: clampDimension(placement.benchDepth ?? defaults.benchDepth, MIN_BENCH_DEPTH, MAX_BENCH_DEPTH),
    };
  });
}

function getRectSidePaddingFromPlacements(placements: FloorPlanSeatPlacement[]) {
  return placements.reduce<Record<FloorPlanRectSeatZone, number>>((accumulator, placement) => {
    const zone = placement.zone as FloorPlanRectSeatZone;
    const depth = placement.type === "bench"
      ? placement.benchDepth ?? RECT_SEAT_PADDING.bench
      : RECT_SEAT_PADDING[placement.type];
    accumulator[zone] = Math.max(accumulator[zone], FOOTPRINT_BASE_PADDING + depth);
    return accumulator;
  }, { top: FOOTPRINT_BASE_PADDING, right: FOOTPRINT_BASE_PADDING, bottom: FOOTPRINT_BASE_PADDING, left: FOOTPRINT_BASE_PADDING });
}

function getRoundPaddingFromPlacements(placements: FloorPlanSeatPlacement[]) {
  if (placements.length === 0) return FOOTPRINT_BASE_PADDING;
  return Math.max(
    ...placements.map((placement) => FOOTPRINT_BASE_PADDING + (
      placement.type === "bench"
        ? placement.benchDepth ?? ROUND_SEAT_PADDING.bench
        : ROUND_SEAT_PADDING[placement.type]
    )),
  );
}

export function getDefaultCornerBenchDimensions(tableWidth: number, tableHeight: number) {
  const dimensions = getCornerBenchDimensionsFromSeatCounts(1, 1);

  return {
    cornerBenchHorizontal: dimensions.horizontal,
    cornerBenchVertical: dimensions.vertical,
    cornerBenchDepth: dimensions.depth,
  };
}

function getCornerBenchConfigCapacity(config: FloorPlanCornerBenchConfig) {
  const horizontalSeats = normalizeCornerBenchSeatCount(
    config.horizontalSeats,
    estimateCornerBenchSeatCountFromSpan(config.horizontal, MIN_CORNER_BENCH_HORIZONTAL),
  );
  const verticalSeats = normalizeCornerBenchSeatCount(
    config.verticalSeats,
    estimateCornerBenchSeatCountFromSpan(config.vertical, MIN_CORNER_BENCH_VERTICAL),
  );
  return Math.max(2, horizontalSeats + verticalSeats);
}

export function getCornerBenchCapacity(configs: FloorPlanCornerBenchConfig[]) {
  return configs.reduce(
    (total, config) => total + getCornerBenchConfigCapacity(config),
    0,
  );
}

export function getConfiguredTableCapacity({
  shape,
  seatPlacements,
  cornerBenchConfigs,
}: {
  shape: FloorPlanTableShape;
  seatPlacements: FloorPlanSeatPlacement[];
  cornerBenchConfigs?: FloorPlanCornerBenchConfig[];
}) {
  const linearCapacity = getSeatPlacementsCapacity(seatPlacements);
  if (shape !== "rect" || !cornerBenchConfigs?.length) return linearCapacity;

  return linearCapacity + getCornerBenchCapacity(cornerBenchConfigs);
}

function getCornerBenchSidePadding(
  configs: FloorPlanCornerBenchConfig[],
) {
  return {
    top: FOOTPRINT_BASE_PADDING + Math.max(0, ...configs.filter((config) => config.corner.startsWith("top")).map((config) => config.depth)),
    right: FOOTPRINT_BASE_PADDING + Math.max(0, ...configs.filter((config) => config.corner.endsWith("right")).map((config) => config.depth)),
    bottom: FOOTPRINT_BASE_PADDING + Math.max(0, ...configs.filter((config) => config.corner.startsWith("bottom")).map((config) => config.depth)),
    left: FOOTPRINT_BASE_PADDING + Math.max(0, ...configs.filter((config) => config.corner.endsWith("left")).map((config) => config.depth)),
  };
}

type ResolveFloorPlanDimensionsInput = {
  capacity: number;
  shape: FloorPlanTableShape;
  kind?: FloorPlanItemKind;
  seatType?: FloorPlanSeatType;
  seatPlacements?: FloorPlanSeatPlacement[];
  cornerBenchCorners?: FloorPlanCornerBenchCorner[];
  cornerBenchConfigs?: FloorPlanCornerBenchConfig[];
  tableWidth?: number;
  tableHeight?: number;
  footprintWidth?: number;
  footprintHeight?: number;
  cornerBenchHorizontal?: number;
  cornerBenchVertical?: number;
  cornerBenchDepth?: number;
};

export function getResolvedFloorPlanDimensions({
  capacity,
  shape,
  kind = "table",
  seatType = "chair",
  seatPlacements,
  cornerBenchCorners,
  cornerBenchConfigs,
  tableWidth,
  tableHeight,
  footprintWidth,
  footprintHeight,
  cornerBenchHorizontal,
  cornerBenchVertical,
  cornerBenchDepth,
}: ResolveFloorPlanDimensionsInput): FloorPlanResolvedDimensions {
  if (!isReservableFloorPlanItem(kind)) {
    const furnitureFootprint = resolveFurnitureFootprint(
      kind,
      parseNumber(footprintWidth) ?? parseNumber(tableWidth),
      parseNumber(footprintHeight) ?? parseNumber(tableHeight),
    );

    return {
      tableWidth: furnitureFootprint.w,
      tableHeight: furnitureFootprint.h,
      footprintWidth: furnitureFootprint.w,
      footprintHeight: furnitureFootprint.h,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      seatType: "chair",
      seatPlacements: [],
      cornerBenchCorners: [],
      cornerBenchConfigs: [],
      capacity: 0,
    };
  }

  const preliminaryTableWidth = Math.max(88, roundDimension(parseNumber(tableWidth) ?? Math.max(88, (parseNumber(footprintWidth) ?? 176) - 88)));
  const preliminaryTableHeight = Math.max(72, roundDimension(parseNumber(tableHeight) ?? Math.max(72, (parseNumber(footprintHeight) ?? 116) - 88)));
  const normalizedSeatPlacements = normalizeSeatPlacements(
    shape,
    seatPlacements,
    capacity,
    seatType,
    preliminaryTableWidth,
    preliminaryTableHeight,
  );
  const normalizedCornerBenchCorners = normalizeCornerBenchCorners(shape, cornerBenchCorners, seatType);
  const normalizedCornerBenchConfigs = normalizeCornerBenchConfigs(
    shape,
    cornerBenchConfigs,
    normalizedCornerBenchCorners,
    parseNumber(cornerBenchHorizontal) ?? undefined,
    parseNumber(cornerBenchVertical) ?? undefined,
    parseNumber(cornerBenchDepth) ?? undefined,
    preliminaryTableWidth,
    preliminaryTableHeight,
  );
  const effectiveSeatType = shape === "rect" && normalizedCornerBenchConfigs.length > 0
    ? "corner-bench"
    : getSeatTypeFromPlacements(shape, normalizedSeatPlacements, seatType);
  const fallbackCapacity = Math.max(1, Math.round(capacity || 1));
  const seatCapacity = Math.max(
    fallbackCapacity,
    getConfiguredTableCapacity({
      shape,
      seatPlacements: normalizedSeatPlacements,
      cornerBenchConfigs: normalizedCornerBenchConfigs,
    }),
  );
  const minimumTable = getMinimumTableTopSizeFromConfiguration(
    shape,
    seatCapacity,
    normalizedSeatPlacements,
    normalizedCornerBenchConfigs,
  );

  if (shape === "round") {
    const roundPlacements = normalizeResolvedSeatPlacements(
      shape,
      normalizedSeatPlacements.filter((placement) => isRoundSeatZone(placement.zone)),
      minimumTable.w,
      minimumTable.h,
      [],
    );
    const padding = getRoundPaddingFromPlacements(roundPlacements);
    const inferredDiameter = [parseNumber(footprintWidth), parseNumber(footprintHeight)]
      .filter((value): value is number => value !== null)
      .map((value) => value - padding * 2)
      .filter((value) => value > 0);
    const diameter = clampDimension(
      parseNumber(tableWidth)
        ?? parseNumber(tableHeight)
        ?? (inferredDiameter.length ? Math.min(...inferredDiameter) : minimumTable.w),
      minimumTable.w,
    );
    const footprint = diameter + padding * 2;

    return {
      tableWidth: diameter,
      tableHeight: diameter,
      footprintWidth: footprint,
      footprintHeight: footprint,
      paddingTop: padding,
      paddingRight: padding,
      paddingBottom: padding,
      paddingLeft: padding,
      seatType: effectiveSeatType,
      seatPlacements: roundPlacements,
      cornerBenchCorners: [],
      cornerBenchConfigs: [],
      capacity: getSeatPlacementsCapacity(roundPlacements),
    };
  }

  const fallbackWidth = parseNumber(footprintWidth) !== null
    ? Math.max(minimumTable.w, (parseNumber(footprintWidth) || minimumTable.w) - 88)
    : minimumTable.w;
  const fallbackHeight = parseNumber(footprintHeight) !== null
    ? Math.max(minimumTable.h, (parseNumber(footprintHeight) || minimumTable.h) - 88)
    : minimumTable.h;

  let resolvedTableWidth = clampDimension(parseNumber(tableWidth) ?? fallbackWidth, minimumTable.w);
  let resolvedTableHeight = clampDimension(parseNumber(tableHeight) ?? fallbackHeight, minimumTable.h);
  const resolvedCornerBenchConfigs = normalizeCornerBenchConfigs(
    shape,
    normalizedCornerBenchConfigs,
    normalizedCornerBenchCorners,
    undefined,
    undefined,
    undefined,
    resolvedTableWidth,
    resolvedTableHeight,
  );
  const rectPlacements = normalizeResolvedSeatPlacements(
    shape,
    normalizedSeatPlacements.filter((placement) => isRectSeatZone(placement.zone)),
    resolvedTableWidth,
    resolvedTableHeight,
    resolvedCornerBenchConfigs,
  );
  const sidePadding = getRectSidePaddingFromPlacements(rectPlacements);
  const cornerPadding = getCornerBenchSidePadding(resolvedCornerBenchConfigs);
  const padding = {
    top: Math.max(sidePadding.top, cornerPadding.top),
    right: Math.max(sidePadding.right, cornerPadding.right),
    bottom: Math.max(sidePadding.bottom, cornerPadding.bottom),
    left: Math.max(sidePadding.left, cornerPadding.left),
  };
  if (parseNumber(tableWidth) === null && parseNumber(footprintWidth) !== null) {
    resolvedTableWidth = clampDimension(
      (parseNumber(footprintWidth) || minimumTable.w) - padding.left - padding.right,
      minimumTable.w,
    );
  }
  if (parseNumber(tableHeight) === null && parseNumber(footprintHeight) !== null) {
    resolvedTableHeight = clampDimension(
      (parseNumber(footprintHeight) || minimumTable.h) - padding.top - padding.bottom,
      minimumTable.h,
    );
  }

  return {
    tableWidth: resolvedTableWidth,
    tableHeight: resolvedTableHeight,
    footprintWidth: resolvedTableWidth + padding.left + padding.right,
    footprintHeight: resolvedTableHeight + padding.top + padding.bottom,
    paddingTop: padding.top,
    paddingRight: padding.right,
    paddingBottom: padding.bottom,
    paddingLeft: padding.left,
    seatType: effectiveSeatType,
    seatPlacements: rectPlacements,
    cornerBenchCorners: resolvedCornerBenchConfigs.map((config) => config.corner),
    cornerBenchConfigs: resolvedCornerBenchConfigs,
    capacity: getConfiguredTableCapacity({
      shape,
      seatPlacements: rectPlacements,
      cornerBenchConfigs: resolvedCornerBenchConfigs,
    }),
    cornerBenchHorizontal: resolvedCornerBenchConfigs[0]?.horizontal,
    cornerBenchVertical: resolvedCornerBenchConfigs[0]?.vertical,
    cornerBenchDepth: resolvedCornerBenchConfigs[0]?.depth,
  };
}

export function getMinimumTableSize(
  capacity: number,
  shape: FloorPlanTableShape,
  kind: FloorPlanItemKind = "table",
) {
  if (!isReservableFloorPlanItem(kind)) {
    const furnitureSize = MIN_FURNITURE_RESIZE_SIZE[kind];
    return { w: furnitureSize.w, h: furnitureSize.h };
  }

  const resolved = getResolvedFloorPlanDimensions({
    capacity,
    shape,
    kind,
  });

  return {
    w: resolved.footprintWidth,
    h: resolved.footprintHeight,
  };
}

export function getMinimumFloorPlanResizeSize(kind: FloorPlanItemKind = "table") {
  if (!isReservableFloorPlanItem(kind)) {
    return MIN_FURNITURE_RESIZE_SIZE[kind];
  }

  return MIN_RESIZE_SIZE;
}

export function getFloorPlanContentPadding(
  layout: FloorPlanTableLayout,
  capacity: number,
  zoom = 1,
) {
  if (!isReservableFloorPlanItem(layout.kind)) {
    const horizontal = Math.max(6, Math.min(layout.w * 0.08, 20)) * zoom;
    const vertical = Math.max(6, Math.min(layout.h * 0.08, 20)) * zoom;
    return {
      top: vertical,
      right: horizontal,
      bottom: vertical,
      left: horizontal,
    };
  }

  const resolved = getResolvedFloorPlanDimensions({
    capacity,
    shape: layout.shape,
    kind: layout.kind,
    seatType: layout.seatType,
    seatPlacements: layout.seatPlacements,
    cornerBenchCorners: layout.cornerBenchCorners,
    cornerBenchConfigs: layout.cornerBenchConfigs,
    tableWidth: layout.tableWidth,
    tableHeight: layout.tableHeight,
    footprintWidth: layout.w,
    footprintHeight: layout.h,
    cornerBenchHorizontal: layout.cornerBenchHorizontal,
    cornerBenchVertical: layout.cornerBenchVertical,
    cornerBenchDepth: layout.cornerBenchDepth,
  });

  return {
    top: resolved.paddingTop * zoom,
    right: resolved.paddingRight * zoom,
    bottom: resolved.paddingBottom * zoom,
    left: resolved.paddingLeft * zoom,
  };
}

export function resizeFloorPlanLayoutToFootprint(
  layout: FloorPlanTableLayout,
  capacity: number,
  footprintWidth: number,
  footprintHeight: number,
  shape: FloorPlanTableShape = layout.shape,
  kind: FloorPlanItemKind = layout.kind || "table",
) {
  const nextShape = !isReservableFloorPlanItem(kind)
    ? MIN_FURNITURE_SIZE[kind].shape
    : shape;
  const minimum = getMinimumFloorPlanResizeSize(kind);
  const nextWidth = clampDimension(footprintWidth, minimum.w);
  const nextHeight = clampDimension(footprintHeight, minimum.h);

  if (!isReservableFloorPlanItem(kind)) {
    return ensureFloorPlanLayoutFitsCapacity(
      {
        ...layout,
        kind,
        shape: nextShape,
        w: nextWidth,
        h: nextHeight,
      },
      capacity,
      nextShape,
      kind,
    );
  }

  const resolved = getResolvedFloorPlanDimensions({
    capacity,
    shape: nextShape,
    kind,
    seatType: layout.seatType,
    seatPlacements: layout.seatPlacements,
    cornerBenchCorners: layout.cornerBenchCorners,
    cornerBenchConfigs: layout.cornerBenchConfigs,
    tableWidth: layout.tableWidth,
    tableHeight: layout.tableHeight,
    footprintWidth: layout.w,
    footprintHeight: layout.h,
    cornerBenchHorizontal: layout.cornerBenchHorizontal,
    cornerBenchVertical: layout.cornerBenchVertical,
    cornerBenchDepth: layout.cornerBenchDepth,
  });

  return ensureFloorPlanLayoutFitsCapacity(
    {
      ...layout,
      kind,
      shape: nextShape,
      w: nextWidth,
      h: nextHeight,
      seatType: resolved.seatType,
      seatPlacements: layout.seatPlacements ?? resolved.seatPlacements,
      cornerBenchCorners: layout.cornerBenchCorners ?? resolved.cornerBenchCorners,
      cornerBenchConfigs: layout.cornerBenchConfigs ?? resolved.cornerBenchConfigs,
      tableWidth: layout.tableWidth ?? resolved.tableWidth,
      tableHeight: layout.tableHeight ?? resolved.tableHeight,
      cornerBenchHorizontal: layout.cornerBenchHorizontal ?? resolved.cornerBenchHorizontal,
      cornerBenchVertical: layout.cornerBenchVertical ?? resolved.cornerBenchVertical,
      cornerBenchDepth: layout.cornerBenchDepth ?? resolved.cornerBenchDepth,
    },
    capacity,
    nextShape,
    kind,
  );
}

export function ensureFloorPlanLayoutFitsCapacity(
  layout: FloorPlanTableLayout,
  capacity: number,
  shape: FloorPlanTableShape = layout.shape,
  kind: FloorPlanItemKind = layout.kind || "table",
) {
  const minimum = getMinimumFloorPlanResizeSize(kind);
  const nextShape = !isReservableFloorPlanItem(kind)
    ? MIN_FURNITURE_SIZE[kind].shape
    : shape;
  const resolved = getResolvedFloorPlanDimensions({
    capacity,
    shape: nextShape,
    kind,
    seatType: layout.seatType,
    seatPlacements: layout.seatPlacements,
    cornerBenchCorners: layout.cornerBenchCorners,
    cornerBenchConfigs: layout.cornerBenchConfigs,
    tableWidth: layout.tableWidth,
    tableHeight: layout.tableHeight,
    footprintWidth: layout.w,
    footprintHeight: layout.h,
    cornerBenchHorizontal: layout.cornerBenchHorizontal,
    cornerBenchVertical: layout.cornerBenchVertical,
    cornerBenchDepth: layout.cornerBenchDepth,
  });

  return {
    ...layout,
    kind,
    shape: nextShape,
    seatType: resolved.seatType,
    seatPlacements: resolved.seatPlacements,
    cornerBenchCorners: resolved.cornerBenchCorners,
    cornerBenchConfigs: resolved.cornerBenchConfigs,
    tableWidth: resolved.tableWidth,
    tableHeight: resolved.tableHeight,
    cornerBenchHorizontal: resolved.cornerBenchHorizontal,
    cornerBenchVertical: resolved.cornerBenchVertical,
    cornerBenchDepth: resolved.cornerBenchDepth,
    w: Math.max(minimum.w, roundDimension(parseNumber(layout.w) ?? resolved.footprintWidth)),
    h: Math.max(minimum.h, roundDimension(parseNumber(layout.h) ?? resolved.footprintHeight)),
    seatLabels: isReservableFloorPlanItem(kind) ? buildSeatLabels(Math.max(1, resolved.capacity || capacity), nextShape) : [],
  };
}

export function clampFloorPlanLayout(
  layout: FloorPlanTableLayout,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
) {
  const roomBounds = getFloorPlanLogicalSurfaceBounds(canvasWidth, canvasHeight);
  const roomWidth = Math.max(1, roomBounds.maxX - roomBounds.minX);
  const roomHeight = Math.max(1, roomBounds.maxY - roomBounds.minY);
  const safeWidth = Math.min(
    Math.max(1, Math.round(layout.w || 1)),
    roomWidth,
  );
  const safeHeight = Math.min(
    Math.max(1, Math.round(layout.h || 1)),
    roomHeight,
  );
  const maxX = Math.max(roomBounds.minX, roomBounds.maxX - safeWidth);
  const maxY = Math.max(roomBounds.minY, roomBounds.maxY - safeHeight);

  return {
    ...layout,
    w: safeWidth,
    h: safeHeight,
    x: Math.min(Math.max(roomBounds.minX, Math.round(layout.x || roomBounds.minX)), maxX),
    y: Math.min(Math.max(roomBounds.minY, Math.round(layout.y || roomBounds.minY)), maxY),
  };
}

function getFloorPlanCanvasScale(canvasWidth: number, canvasHeight: number) {
  const widthScale = canvasWidth / DEFAULT_CANVAS_WIDTH;
  const heightScale = canvasHeight / DEFAULT_CANVAS_HEIGHT;
  const scale = Math.min(widthScale, heightScale);

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function getFloorPlanRoomSurfaceBounds(canvasWidth: number, canvasHeight: number) {
  const canvasScale = getFloorPlanCanvasScale(canvasWidth, canvasHeight);
  const roomInset = Math.max(1, Math.round(ROOM_SURFACE_INSET * canvasScale));
  const minX = Math.min(roomInset, Math.max(0, Math.floor(canvasWidth / 2) - 1));
  const minY = Math.min(roomInset, Math.max(0, Math.floor(canvasHeight / 2) - 1));

  return {
    minX,
    minY,
    maxX: Math.max(minX, canvasWidth - minX),
    maxY: Math.max(minY, canvasHeight - minY),
  };
}

function getFloorPlanLogicalSurfaceBounds(_canvasWidth: number, _canvasHeight: number) {
  return {
    minX: ROOM_SURFACE_INSET,
    minY: ROOM_SURFACE_INSET,
    maxX: DEFAULT_CANVAS_WIDTH - ROOM_SURFACE_INSET,
    maxY: DEFAULT_CANVAS_HEIGHT - ROOM_SURFACE_INSET,
  };
}

function getFloorPlanRenderSurfaceBounds(canvasWidth: number, canvasHeight: number) {
  return getFloorPlanRoomSurfaceBounds(canvasWidth, canvasHeight);
}

function getFloorPlanSurfaceFitZoom(
  canvasWidth: number,
  canvasHeight: number,
  requestedZoom: number,
) {
  const renderBounds = getFloorPlanRenderSurfaceBounds(canvasWidth, canvasHeight);
  const logicalBounds = getFloorPlanLogicalSurfaceBounds(canvasWidth, canvasHeight);
  const renderWidth = Math.max(1, renderBounds.maxX - renderBounds.minX);
  const renderHeight = Math.max(1, renderBounds.maxY - renderBounds.minY);
  const logicalWidth = Math.max(1, logicalBounds.maxX - logicalBounds.minX);
  const logicalHeight = Math.max(1, logicalBounds.maxY - logicalBounds.minY);
  const fitZoom = Math.min(1, renderWidth / logicalWidth, renderHeight / logicalHeight);

  return Math.max(0.01, Math.min(Number.isFinite(requestedZoom) ? requestedZoom : 1, fitZoom));
}

export function resolveFloorPlanViewportZoom(
  requestedZoom: number,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
) {
  return getFloorPlanSurfaceFitZoom(canvasWidth, canvasHeight, requestedZoom);
}

export function getRenderedFloorPlanFrame(
  layout: FloorPlanTableLayout,
  zoom: number,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
  _anchor?: FloorPlanViewportAnchor,
): FloorPlanRenderedFrame {
  const safeZoom = getFloorPlanSurfaceFitZoom(canvasWidth, canvasHeight, zoom);
  const renderedWidth = layout.w * safeZoom;
  const renderedHeight = layout.h * safeZoom;
  const renderBounds = getFloorPlanRenderSurfaceBounds(canvasWidth, canvasHeight);
  const logicalBounds = getFloorPlanLogicalSurfaceBounds(canvasWidth, canvasHeight);
  const logicalMaxX = Math.max(logicalBounds.minX, logicalBounds.maxX - layout.w);
  const logicalMaxY = Math.max(logicalBounds.minY, logicalBounds.maxY - layout.h);
  const safeLayoutX = Math.min(Math.max(logicalBounds.minX, isFiniteNumber(layout.x) ? layout.x : logicalBounds.minX), logicalMaxX);
  const safeLayoutY = Math.min(Math.max(logicalBounds.minY, isFiniteNumber(layout.y) ? layout.y : logicalBounds.minY), logicalMaxY);
  const logicalTravelX = Math.max(0, logicalMaxX - logicalBounds.minX);
  const logicalTravelY = Math.max(0, logicalMaxY - logicalBounds.minY);
  const renderedMaxX = Math.max(renderBounds.minX, renderBounds.maxX - renderedWidth);
  const renderedMaxY = Math.max(renderBounds.minY, renderBounds.maxY - renderedHeight);
  const renderedTravelX = Math.max(0, renderedMaxX - renderBounds.minX);
  const renderedTravelY = Math.max(0, renderedMaxY - renderBounds.minY);

  return {
    x: logicalTravelX > 0
      ? renderBounds.minX + ((safeLayoutX - logicalBounds.minX) / logicalTravelX) * renderedTravelX
      : renderBounds.minX,
    y: logicalTravelY > 0
      ? renderBounds.minY + ((safeLayoutY - logicalBounds.minY) / logicalTravelY) * renderedTravelY
      : renderBounds.minY,
    w: renderedWidth,
    h: renderedHeight,
  };
}

export function getLogicalFloorPlanPositionFromRenderedFrame(
  layout: FloorPlanTableLayout,
  renderedX: number,
  renderedY: number,
  zoom: number,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  canvasHeight = DEFAULT_CANVAS_HEIGHT,
  _anchor?: FloorPlanViewportAnchor,
) {
  const safeZoom = getFloorPlanSurfaceFitZoom(canvasWidth, canvasHeight, zoom);
  const renderedWidth = layout.w * safeZoom;
  const renderedHeight = layout.h * safeZoom;
  const renderBounds = getFloorPlanRenderSurfaceBounds(canvasWidth, canvasHeight);
  const logicalBounds = getFloorPlanLogicalSurfaceBounds(canvasWidth, canvasHeight);
  const logicalMaxX = Math.max(logicalBounds.minX, logicalBounds.maxX - layout.w);
  const logicalMaxY = Math.max(logicalBounds.minY, logicalBounds.maxY - layout.h);
  const renderedMaxX = Math.max(renderBounds.minX, renderBounds.maxX - renderedWidth);
  const renderedMaxY = Math.max(renderBounds.minY, renderBounds.maxY - renderedHeight);
  const safeRenderedX = Math.min(Math.max(renderBounds.minX, renderedX), renderedMaxX);
  const safeRenderedY = Math.min(Math.max(renderBounds.minY, renderedY), renderedMaxY);
  const logicalTravelX = Math.max(0, logicalMaxX - logicalBounds.minX);
  const logicalTravelY = Math.max(0, logicalMaxY - logicalBounds.minY);
  const renderedTravelX = Math.max(0, renderedMaxX - renderBounds.minX);
  const renderedTravelY = Math.max(0, renderedMaxY - renderBounds.minY);

  return {
    x: renderedTravelX > 0
      ? logicalBounds.minX + ((safeRenderedX - renderBounds.minX) / renderedTravelX) * logicalTravelX
      : logicalBounds.minX,
    y: renderedTravelY > 0
      ? logicalBounds.minY + ((safeRenderedY - renderBounds.minY) / renderedTravelY) * logicalTravelY
      : logicalBounds.minY,
  };
}

export type FloorPlanViewportItem = {
  id: string;
  table_number: string;
  capacity: number;
  is_active?: boolean | null;
  sector?: string | null;
  layout: FloorPlanTableLayout;
};

export type FloorPlanViewportHitTarget<TItem extends FloorPlanViewportItem> = {
  item: TItem;
  frame: FloorPlanRenderedFrame;
};

export type FloorPlanViewportModel<TItem extends FloorPlanViewportItem> = {
  visibleItems: TItem[];
  visibleReservableItems: TItem[];
  visibleFurnitureCount: number;
  visibleItemIdSet: Set<string>;
  visibleReservableIdSet: Set<string>;
  anchor: FloorPlanViewportAnchor;
  framesById: Map<string, FloorPlanRenderedFrame>;
  reservableHitTargets: {
    visual: Array<FloorPlanViewportHitTarget<TItem>>;
    interactive: Array<FloorPlanViewportHitTarget<TItem>>;
  };
  getRenderedFrame: (item: TItem) => FloorPlanRenderedFrame;
  getLogicalPosition: (item: TItem, renderedX: number, renderedY: number) => { x: number; y: number };
  getReservableItemAtPoint: (x: number, y: number) => TItem | null;
};

function getHitTargetAtPoint<TItem extends FloorPlanViewportItem>(
  targets: Array<FloorPlanViewportHitTarget<TItem>>,
  x: number,
  y: number,
) {
  for (const target of targets) {
    const { frame } = target;
    const withinX = x >= frame.x && x <= frame.x + frame.w;
    const withinY = y >= frame.y && y <= frame.y + frame.h;
    if (withinX && withinY) return target.item;
  }

  return null;
}

export function buildFloorPlanViewportModel<TItem extends FloorPlanViewportItem>(
  items: readonly TItem[],
  options: {
    sector: string;
    zoom: number;
    canvasWidth?: number;
    canvasHeight?: number;
  },
): FloorPlanViewportModel<TItem> {
  const canvasWidth = options.canvasWidth ?? DEFAULT_CANVAS_WIDTH;
  const canvasHeight = options.canvasHeight ?? DEFAULT_CANVAS_HEIGHT;
  const visibleItems = items
    .filter((item) => item.is_active !== false)
    .filter((item) => item.sector === options.sector)
    .sort((left, right) => left.table_number.localeCompare(right.table_number, "fr"))
    .map((item) => {
      const clampedLayout = clampFloorPlanLayout(item.layout, canvasWidth, canvasHeight);
      return areFloorPlanLayoutsEquivalent(item.layout, clampedLayout)
        ? item
        : { ...item, layout: clampedLayout };
    }) as TItem[];
  const anchor = visibleItems.reduce<FloorPlanViewportAnchor>((current, item) => ({
    x: Math.min(current.x, item.layout.x || DEFAULT_PADDING),
    y: Math.min(current.y, item.layout.y || DEFAULT_PADDING),
  }), { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY });
  const safeAnchor = Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
    ? anchor
    : { x: DEFAULT_PADDING, y: DEFAULT_PADDING };
  const visibleReservableItems = visibleItems.filter((item) => isReservableFloorPlanItem(item.layout.kind));
  const framesById = new Map(visibleItems.map((item) => [
    item.id,
    getRenderedFloorPlanFrame(item.layout, options.zoom, canvasWidth, canvasHeight, safeAnchor),
  ]));
  const getRenderedFrame = (item: TItem) => (
    framesById.get(item.id)
      || getRenderedFloorPlanFrame(item.layout, options.zoom, canvasWidth, canvasHeight, safeAnchor)
  );
  const topmostReservableItems = visibleReservableItems.slice().reverse();
  const visualHitTargets = topmostReservableItems.map((item) => ({
    item,
    frame: getRenderedFrame(item),
  }));
  const interactiveHitTargets = topmostReservableItems.map((item) => ({
    item,
    frame: getFloorPlanInteractiveFrame(getRenderedFrame(item)),
  }));

  return {
    visibleItems,
    visibleReservableItems,
    visibleFurnitureCount: visibleItems.length - visibleReservableItems.length,
    visibleItemIdSet: new Set(visibleItems.map((item) => item.id)),
    visibleReservableIdSet: new Set(visibleReservableItems.map((item) => item.id)),
    anchor: safeAnchor,
    framesById,
    reservableHitTargets: {
      visual: visualHitTargets,
      interactive: interactiveHitTargets,
    },
    getRenderedFrame,
    getLogicalPosition: (item, renderedX, renderedY) => getLogicalFloorPlanPositionFromRenderedFrame(
      item.layout,
      renderedX,
      renderedY,
      options.zoom,
      canvasWidth,
      canvasHeight,
      safeAnchor,
    ),
    getReservableItemAtPoint: (x: number, y: number) => {
      return getHitTargetAtPoint(visualHitTargets, x, y)
        || getHitTargetAtPoint(interactiveHitTargets, x, y);
    },
  };
}

function getFloorPlanLayoutSignature(layout: FloorPlanTableLayout) {
  return JSON.stringify({
    x: Math.round(layout.x),
    y: Math.round(layout.y),
    w: Math.round(layout.w),
    h: Math.round(layout.h),
    rotation: layout.rotation,
    shape: layout.shape,
    kind: layout.kind,
    seatLabels: layout.seatLabels,
    seatType: layout.seatType,
    seatPlacements: layout.seatPlacements || [],
    cornerBenchCorners: layout.cornerBenchCorners || [],
    cornerBenchConfigs: layout.cornerBenchConfigs || [],
    tableWidth: layout.tableWidth ? Math.round(layout.tableWidth) : undefined,
    tableHeight: layout.tableHeight ? Math.round(layout.tableHeight) : undefined,
    cornerBenchHorizontal: layout.cornerBenchHorizontal ? Math.round(layout.cornerBenchHorizontal) : undefined,
    cornerBenchVertical: layout.cornerBenchVertical ? Math.round(layout.cornerBenchVertical) : undefined,
    cornerBenchDepth: layout.cornerBenchDepth ? Math.round(layout.cornerBenchDepth) : undefined,
  });
}

export function areFloorPlanLayoutsEquivalent(
  left: FloorPlanTableLayout,
  right: FloorPlanTableLayout,
) {
  return getFloorPlanLayoutSignature(left) === getFloorPlanLayoutSignature(right);
}

export function updateFloorPlanItemLayoutById<TItem extends { id: string; layout: FloorPlanTableLayout }>(
  items: readonly TItem[],
  itemId: string,
  getNextLayout: (layout: FloorPlanTableLayout, item: TItem) => FloorPlanTableLayout,
): TItem[] {
  const itemIndex = items.findIndex((item) => item.id === itemId);
  if (itemIndex < 0) return items as TItem[];

  const item = items[itemIndex];
  const nextLayout = getNextLayout(item.layout, item);
  if (areFloorPlanLayoutsEquivalent(item.layout, nextLayout)) {
    return items as TItem[];
  }

  const nextItems = items.slice() as TItem[];
  nextItems[itemIndex] = {
    ...item,
    layout: nextLayout,
  };
  return nextItems;
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
  const rawSeatPlacements = Array.isArray(source.seat_placements)
    ? source.seat_placements
    : Array.isArray(source.seatPlacements)
      ? source.seatPlacements
      : [];
  const rawCornerBenchCorners = Array.isArray(source.corner_bench_corners)
    ? source.corner_bench_corners
    : Array.isArray(source.cornerBenchCorners)
      ? source.cornerBenchCorners
      : [];
  const rawCornerBenchConfigs = Array.isArray(source.corner_bench_configs)
    ? source.corner_bench_configs
    : Array.isArray(source.cornerBenchConfigs)
      ? source.cornerBenchConfigs
      : [];
  const tableWidth = parseNumber(source.table_width) ?? parseNumber(source.tableWidth);
  const tableHeight = parseNumber(source.table_height) ?? parseNumber(source.tableHeight);
  const legacyBenchWidth = parseNumber(source.bench_width) ?? parseNumber(source.benchWidth);
  const legacyBenchDepth = parseNumber(source.bench_depth) ?? parseNumber(source.benchDepth);
  const cornerBenchHorizontal = parseNumber(source.corner_bench_horizontal) ?? parseNumber(source.cornerBenchHorizontal) ?? legacyBenchWidth;
  const cornerBenchVertical = parseNumber(source.corner_bench_vertical) ?? parseNumber(source.cornerBenchVertical) ?? legacyBenchWidth;
  const cornerBenchDepth = parseNumber(source.corner_bench_depth) ?? parseNumber(source.cornerBenchDepth) ?? legacyBenchDepth;

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
    seatPlacements: normalizeSeatPlacements(normalizedShape, rawSeatPlacements, capacity, seatType, tableWidth ?? minimum.w, tableHeight ?? minimum.h),
    cornerBenchCorners: normalizeCornerBenchCorners(normalizedShape, rawCornerBenchCorners, seatType),
    cornerBenchConfigs: normalizeCornerBenchConfigs(
      normalizedShape,
      rawCornerBenchConfigs,
      normalizeCornerBenchCorners(normalizedShape, rawCornerBenchCorners, seatType),
      cornerBenchHorizontal ?? undefined,
      cornerBenchVertical ?? undefined,
      cornerBenchDepth ?? undefined,
      tableWidth ?? minimum.w,
      tableHeight ?? minimum.h,
    ),
    tableWidth: tableWidth ?? undefined,
    tableHeight: tableHeight ?? undefined,
    cornerBenchHorizontal: cornerBenchHorizontal ?? undefined,
    cornerBenchVertical: cornerBenchVertical ?? undefined,
    cornerBenchDepth: cornerBenchDepth ?? undefined,
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
    id: "table-rect-2",
    label: "Table rectangle 2 pers.",
    description: "Duo compact avec une assise de chaque cote.",
    category: "table",
    kind: "table",
    capacity: 2,
    shape: "rect",
    w: 136,
    h: 108,
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
    description: "Repère végétal pour structurer la salle.",
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
