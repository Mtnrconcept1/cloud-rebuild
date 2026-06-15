import {
  HttpError,
  authenticateRequest,
  jsonResponse,
  requireRestaurantAccess,
  writeAuditLog,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import { makeLogger } from "../_shared/logging.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_DATA_URL_CHARS = 8_000_000;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const FUNCTION_NAME = "floorplan-ai";
const FEATURE_NAME = "floorplan_ai";
const AI_TOOL_CREDIT_UNITS = 5;
const CANONICAL_CANVAS_WIDTH = 1040;
const CANONICAL_CANVAS_HEIGHT = 760;
const CANVAS_ROOM_INSET = 46;
const FLOOR_PLAN_IMAGE_IMPORT_SCHEMA = `JSON image-import obligatoire:
{
  "analysis": {
    "source_image": {"width": 0, "height": 0},
    "room_bounds": {"x": 0, "y": 0, "w": 0, "h": 0},
    "tables": [
      {
        "table_number": "20",
        "shape": "rect",
        "capacity": 4,
        "kind": "table-rect-4",
        "x_ratio": 0.12,
        "y_ratio": 0.08,
        "w_ratio": 0.10,
        "h_ratio": 0.12,
        "seat_count": 4,
        "seats": [{"zone": "top"}, {"zone": "top"}, {"zone": "bottom"}, {"zone": "bottom"}],
        "seatPlacements": [{"zone": "top", "type": "chair", "count": 2}, {"zone": "bottom", "type": "chair", "count": 2}],
        "image_bbox": {"x": 0, "y": 0, "w": 0, "h": 0},
        "confidence": 0.95
      }
    ],
    "furniture": [
      {"kind": "plant", "label": "Plante", "x_ratio": 0.94, "y_ratio": 0.04, "w_ratio": 0.05, "h_ratio": 0.08}
    ],
    "zones": [],
    "circulation": {"description": "..."},
    "resume_occupation": {"tables_totales": 0, "places_totales": 0}
  },
  "salle": {
    "nom": "1er Etage",
    "forme": "rectangulaire",
    "tables": [
      {"numero": 20, "forme": "rectangulaire", "position": "haut_gauche", "places": 4, "etat": "occupee_ou_reservee", "couleur": "vert"},
      {"numero": 23, "forme": "carree", "position": "haut_centre", "places": 2, "etat": "libre", "couleur": "beige"},
      {"numero": 31, "forme": "carree", "position": "bas_centre_droit", "places": 2, "etat": "libre", "couleur": "beige"}
    ],
    "decoration": [{"type": "plante", "position": "haut_droit"}]
  },
  "tables": [],
  "explanation": "..."
}
Coordonnees: x_ratio/y_ratio/w_ratio/h_ratio sont des ratios 0-1 dans room_bounds, pas dans toute l'image.
Si "analysis.tables" contient des ratios precis, ils sont prioritaires. Si l'IA renvoie seulement "salle.tables" avec des positions comme haut_centre_droit ou bas_gauche, Tok les convertit en placement stable.
Inclue toutes les tables visibles quelle que soit leur couleur ou leur statut: les tables beige/libres comptent autant que les tables vertes/occupees.
Avant de repondre, verifie que le nombre de tables listees correspond au nombre de numeros de table visibles. Une sortie partielle a 5 ou 7 tables est invalide si l'image montre 14 numeros.
Ne renvoie jamais les chaises attachees aux tables comme meubles separes.`;

type FloorplanAction = "generate" | "optimize" | "suggest-furniture" | "custom" | "image-import";

type ReservationRow = { party_size: number | null };
type ImagePayload = {
  dataUrl: string;
  mimeType: string;
  name: string | null;
  width: number | null;
  height: number | null;
};
type AiFloorPlanSeatPlacement = {
  zone: string;
  type: string;
  count: number;
  benchLength?: number;
  benchDepth?: number;
};
type AiFloorPlanTable = {
  table_number: string;
  capacity: number;
  kind: string;
  shape: "round" | "rect";
  seatType?: string;
  seatPlacements?: AiFloorPlanSeatPlacement[];
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  seatLabels: number[];
  source_bbox?: Record<string, number>;
  confidence?: number;
};
type SemanticFrameHint = {
  x_ratio: number;
  y_ratio: number;
  w_ratio: number;
  h_ratio: number;
};

const RESERVABLE_TABLE_KINDS = new Set(["table-round-2", "table-round-4", "table-rect-2", "table-rect-4", "table-rect-6", "table"]);
const FURNITURE_KINDS = new Set(["chair", "stool", "bar", "corner-bench", "banquette", "booth", "host-stand", "divider", "plant", "service-station"]);
const RECT_SEAT_ZONES = new Set(["top", "right", "bottom", "left"]);
const ROUND_SEAT_ZONES = new Set(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getTableKind(shape: "round" | "rect", capacity: number) {
  if (shape === "round") return capacity <= 2 ? "table-round-2" : "table-round-4";
  if (capacity <= 2) return "table-rect-2";
  return capacity <= 4 ? "table-rect-4" : "table-rect-6";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeToken(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function readValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function readString(source: Record<string, unknown>, keys: string[]) {
  const value = readValue(source, keys);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  const parsed = Number(readValue(source, keys));
  return Number.isFinite(parsed) ? parsed : null;
}

function readArray(source: Record<string, unknown>, keys: string[]) {
  const value = readValue(source, keys);
  return Array.isArray(value) ? value : [];
}

function readRecord(source: Record<string, unknown>, keys: string[]) {
  return asRecord(readValue(source, keys));
}

function normalizeRatio(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 1) return null;
  return parsed;
}

function getCanvasRoomBounds(canvasWidth: number, canvasHeight: number) {
  const minX = Math.min(CANVAS_ROOM_INSET, Math.max(0, Math.floor(canvasWidth / 2) - 1));
  const minY = Math.min(CANVAS_ROOM_INSET, Math.max(0, Math.floor(canvasHeight / 2) - 1));
  return {
    minX,
    minY,
    maxX: Math.max(minX, canvasWidth - minX),
    maxY: Math.max(minY, canvasHeight - minY),
  };
}

function normalizeShape(value: unknown): "round" | "rect" {
  const token = normalizeToken(value);
  return ["round", "ronde", "rond", "circle", "circular", "circulaire"].includes(token) ? "round" : "rect";
}

function normalizeFurnitureKind(value: unknown) {
  const token = normalizeToken(value);
  if (["plant", "plante", "decoration_plante", "greenery", "tree", "arbre"].includes(token)) return "plant";
  if (["host_stand", "host", "accueil", "pupitre", "borne", "comptoir_accueil"].includes(token)) return "host-stand";
  if (["service_station", "desserte", "station_service", "meuble_service"].includes(token)) return "service-station";
  if (["divider", "separateur", "separation", "cloison", "porte", "door", "wall"].includes(token)) return "divider";
  if (["corner_bench", "banc_angle"].includes(token)) return "corner-bench";
  if (["banquette", "bench"].includes(token)) return "banquette";
  if (["booth", "box"].includes(token)) return "booth";
  if (["bar", "comptoir"].includes(token)) return "bar";
  if (["chair", "chaise"].includes(token)) return "chair";
  if (["stool", "tabouret"].includes(token)) return "stool";
  return FURNITURE_KINDS.has(token) ? token : null;
}

function normalizeSeatZone(value: unknown, shape: "round" | "rect") {
  const token = normalizeToken(value);
  const rectMap: Record<string, string> = {
    top: "top",
    haut: "top",
    above: "top",
    nord: "top",
    north: "top",
    bottom: "bottom",
    bas: "bottom",
    below: "bottom",
    sud: "bottom",
    south: "bottom",
    left: "left",
    gauche: "left",
    ouest: "left",
    west: "left",
    right: "right",
    droite: "right",
    est: "right",
    east: "right",
  };
  const roundMap: Record<string, string> = {
    top: "north",
    haut: "north",
    above: "north",
    nord: "north",
    north: "north",
    bottom: "south",
    bas: "south",
    below: "south",
    sud: "south",
    south: "south",
    left: "west",
    gauche: "west",
    ouest: "west",
    west: "west",
    right: "east",
    droite: "east",
    est: "east",
    east: "east",
    north_east: "north-east",
    nord_est: "north-east",
    south_east: "south-east",
    sud_est: "south-east",
    south_west: "south-west",
    sud_ouest: "south-west",
    north_west: "north-west",
    nord_ouest: "north-west",
  };
  const zone = shape === "round" ? roundMap[token] || token.replace(/_/g, "-") : rectMap[token] || token;
  if (shape === "round") return ROUND_SEAT_ZONES.has(zone) ? zone : null;
  return RECT_SEAT_ZONES.has(zone) ? zone : null;
}

function normalizeSeatType(value: unknown) {
  const token = normalizeToken(value);
  if (["stool", "tabouret"].includes(token)) return "stool";
  if (["bench", "banquette", "banc"].includes(token)) return "bench";
  return "chair";
}

function defaultSeatPlacements(shape: "round" | "rect", capacity: number): AiFloorPlanSeatPlacement[] {
  const safeCapacity = Math.max(0, Math.round(capacity || 0));
  if (safeCapacity <= 0) return [];
  if (shape === "round") {
    if (safeCapacity === 2) {
      return [{ zone: "north", type: "chair", count: 1 }, { zone: "south", type: "chair", count: 1 }];
    }
    if (safeCapacity === 4) {
      return ["north", "east", "south", "west"].map((zone) => ({ zone, type: "chair", count: 1 }));
    }
    return Array.from({ length: safeCapacity }, (_, index) => ({
      zone: Array.from(ROUND_SEAT_ZONES)[index % ROUND_SEAT_ZONES.size],
      type: "chair",
      count: 1,
    }));
  }

  if (safeCapacity === 1) return [{ zone: "bottom", type: "chair", count: 1 }];
  if (safeCapacity === 2) return [{ zone: "top", type: "chair", count: 1 }, { zone: "bottom", type: "chair", count: 1 }];
  const top = Math.floor(safeCapacity / 2);
  const bottom = safeCapacity - top;
  return [
    ...(top > 0 ? [{ zone: "top", type: "chair", count: top }] : []),
    ...(bottom > 0 ? [{ zone: "bottom", type: "chair", count: bottom }] : []),
  ];
}

function normalizeSeatPlacementsFromAi(source: Record<string, unknown>, shape: "round" | "rect", capacity: number) {
  const explicit = readArray(source, ["seatPlacements", "seat_placements", "assise_placements"]).flatMap((entry) => {
    const record = asRecord(entry);
    const zone = normalizeSeatZone(readValue(record, ["zone", "position", "side", "cote"]), shape);
    const count = Math.max(1, Math.round(readNumber(record, ["count", "nombre", "places"]) || 1));
    if (!zone) return [];
    return [{
      zone,
      type: normalizeSeatType(readValue(record, ["type", "seatType", "seat_type"])),
      count,
      benchLength: readNumber(record, ["benchLength", "bench_length"]) ?? undefined,
      benchDepth: readNumber(record, ["benchDepth", "bench_depth"]) ?? undefined,
    }];
  });
  if (explicit.length > 0) return explicit;

  const seats = readArray(source, ["seats", "chairs", "assises", "chaises"]);
  const counts = new Map<string, number>();
  seats.forEach((entry) => {
    const record = asRecord(entry);
    const zone = normalizeSeatZone(readValue(record, ["zone", "position", "side", "cote"]), shape);
    if (!zone) return;
    counts.set(zone, (counts.get(zone) || 0) + 1);
  });
  if (counts.size > 0) {
    return Array.from(counts.entries()).map(([zone, count]) => ({
      zone,
      type: "chair",
      count,
    }));
  }

  return defaultSeatPlacements(shape, capacity);
}

function getFallbackSize(kind: string, shape: "round" | "rect", capacity: number) {
  if (kind === "plant") return { w: 84, h: 84 };
  if (kind === "host-stand") return { w: 110, h: 98 };
  if (kind === "service-station") return { w: 140, h: 92 };
  if (kind === "divider") return { w: 188, h: 46 };
  if (kind === "bar") return { w: 280, h: 104 };
  if (kind === "banquette") return { w: 228, h: 104 };
  if (kind === "booth") return { w: 220, h: 152 };
  if (kind === "corner-bench") return { w: 248, h: 188 };
  if (shape === "round") return capacity <= 2 ? { w: 128, h: 128 } : { w: 176, h: 176 };
  if (capacity <= 2) return { w: 136, h: 108 };
  if (capacity <= 4) return { w: 176, h: 112 };
  return { w: 210, h: 118 };
}

function hasExplicitFloorPlanGeometry(source: Record<string, unknown>) {
  const ratioBox = readBox(source, ["normalized", "relative_bounds", "relativeBounds", "ratio_bounds", "ratioBounds"]);
  const directRatioBox = [
    readValue(source, ["x_ratio", "xRatio"]),
    readValue(source, ["y_ratio", "yRatio"]),
    readValue(source, ["w_ratio", "wRatio", "width_ratio", "widthRatio"]),
    readValue(source, ["h_ratio", "hRatio", "height_ratio", "heightRatio"]),
  ];
  const imageBox = readBox(source, ["image_bbox", "imageBBox", "bbox", "bounds", "box"]);
  const absoluteBox = [
    readNumber(source, ["x", "left"]),
    readNumber(source, ["y", "top"]),
    readNumber(source, ["w", "width"]),
    readNumber(source, ["h", "height"]),
  ];

  return Boolean(ratioBox)
    || directRatioBox.every((value) => normalizeRatio(value) !== null)
    || Boolean(imageBox)
    || absoluteBox.every((value) => value !== null);
}

function getSemanticPositionToken(source: Record<string, unknown>) {
  return normalizeToken(readValue(source, ["position", "emplacement", "location", "zone", "area"]));
}

function getSemanticFloorPlanGroup(token: string, forcedFurniture: boolean) {
  if (!token) return null;

  if (forcedFurniture) {
    if (token === "haut_gauche") return "decor-top-left";
    if (token === "haut_droit") return "decor-top-right";
    if (token === "milieu_droit") return "decor-mid-right";
  }

  if (["haut_gauche", "haut_centre", "haut_centre_droit", "haut_droit"].some((position) => token.includes(position))) {
    return "top-row";
  }
  if (["bas_gauche", "coin_inferieur_gauche"].some((position) => token.includes(position))) {
    return "bottom-left";
  }
  if (["bas_centre", "bas_centre_droit", "zone_inferieure_centrale"].some((position) => token.includes(position))) {
    return "lower-center";
  }
  if (token.includes("haut")) return "top-row";
  if (token.includes("bas") && token.includes("gauche")) return "bottom-left";
  if (token.includes("bas")) return "lower-center";
  if (forcedFurniture && token.includes("droit")) return "decor-mid-right";

  return null;
}

function getSemanticGroupCenter(group: string, itemIndex: number, itemCount: number) {
  const safeIndex = Math.max(0, itemIndex);
  const safeCount = Math.max(1, itemCount);
  const lerp = (start: number, end: number) => safeCount === 1
    ? (start + end) / 2
    : start + ((end - start) * safeIndex) / (safeCount - 1);

  switch (group) {
    case "top-row":
      return { x: lerp(0.11, 0.88), y: 0.12 };
    case "lower-center":
      return { x: lerp(0.36, 0.68), y: 0.62 };
    case "bottom-left":
      return { x: 0.12, y: 0.62 };
    case "decor-top-left":
      return { x: 0.035, y: 0.065 };
    case "decor-top-right":
      return { x: 0.94, y: 0.065 };
    case "decor-mid-right":
      return { x: 0.94, y: 0.38 };
    default:
      return null;
  }
}

function getSemanticElementSizeRatios(
  source: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
  forcedFurniture: boolean,
) {
  const shape = normalizeShape(readValue(source, ["shape", "forme"]));
  const rawSeats = readArray(source, ["seats", "chairs", "assises", "chaises"]);
  const rawPlacements = readArray(source, ["seatPlacements", "seat_placements", "assise_placements"]);
  const placementCapacity = rawPlacements.reduce(
    (sum, placement) => sum + Math.max(0, Math.round(readNumber(asRecord(placement), ["count", "nombre"]) || 0)),
    0,
  );
  const capacity = forcedFurniture
    ? 0
    : Math.round(clampNumber(
      readNumber(source, ["capacity", "places", "seat_count", "seatCount", "nombre_assises", "capacite"])
        ?? (rawSeats.length > 0 ? rawSeats.length : placementCapacity || null),
      2,
      1,
      24,
    ));
  const furnitureKind = normalizeFurnitureKind(readValue(source, ["kind", "type", "object_type", "objet", "label", "nom"]));
  const kind = forcedFurniture ? furnitureKind || "plant" : getTableKind(shape, capacity);
  const surface = getCanvasRoomBounds(canvasWidth, canvasHeight);
  const surfaceWidth = Math.max(1, surface.maxX - surface.minX);
  const surfaceHeight = Math.max(1, surface.maxY - surface.minY);
  const size = getFallbackSize(kind, shape, capacity);

  return {
    w: clampNumber(size.w / surfaceWidth, 0.12, 0.03, 0.36),
    h: clampNumber(size.h / surfaceHeight, 0.14, 0.03, 0.36),
  };
}

function buildSemanticFloorPlanFrameHints(
  entries: unknown[],
  canvasWidth: number,
  canvasHeight: number,
  forcedFurniture = false,
) {
  const groups = new Map<string, Array<{ index: number; source: Record<string, unknown> }>>();

  entries.forEach((entry, index) => {
    const source = asRecord(entry);
    if (Object.keys(source).length === 0 || hasExplicitFloorPlanGeometry(source)) return;
    const group = getSemanticFloorPlanGroup(getSemanticPositionToken(source), forcedFurniture);
    if (!group) return;
    groups.set(group, [...(groups.get(group) || []), { index, source }]);
  });

  const hints = new Map<number, SemanticFrameHint>();
  groups.forEach((items, group) => {
    items.forEach((item, itemIndex) => {
      const center = getSemanticGroupCenter(group, itemIndex, items.length);
      if (!center) return;
      const size = getSemanticElementSizeRatios(item.source, canvasWidth, canvasHeight, forcedFurniture);
      const x = clampNumber(center.x - size.w / 2, 0, 0, Math.max(0, 1 - size.w));
      const y = clampNumber(center.y - size.h / 2, 0, 0, Math.max(0, 1 - size.h));
      hints.set(item.index, {
        x_ratio: Number(x.toFixed(4)),
        y_ratio: Number(y.toFixed(4)),
        w_ratio: Number(size.w.toFixed(4)),
        h_ratio: Number(size.h.toFixed(4)),
      });
    });
  });

  return hints;
}

function withSemanticFrameHint(entry: unknown, hint?: SemanticFrameHint) {
  if (!hint) return entry;
  return { ...asRecord(entry), ...hint };
}

function getFloorPlanTableIdentity(entry: unknown) {
  const source = asRecord(entry);
  const tableNumber = readString(source, ["table_number", "tableNumber", "numero", "number", "label", "nom"]);
  return tableNumber ? normalizeToken(tableNumber) : null;
}

function getFloorPlanFurnitureIdentity(entry: unknown) {
  const source = asRecord(entry);
  const kind = normalizeFurnitureKind(readValue(source, ["kind", "type", "object_type", "objet", "label", "nom"]))
    || normalizeToken(readValue(source, ["kind", "type", "object_type", "objet"]));
  const position = getSemanticPositionToken(source);
  const label = normalizeToken(readString(source, ["label", "nom", "name"]) || "");
  const key = [kind, position, label].filter(Boolean).join(":");
  return key.length > 0 ? key : null;
}

function mergeFloorPlanEntriesByIdentity(
  groups: unknown[][],
  getIdentity: (entry: unknown) => string | null,
) {
  const merged: unknown[] = [];
  const seen = new Set<string>();

  groups.forEach((entries) => {
    entries.forEach((entry) => {
      const source = asRecord(entry);
      if (Object.keys(source).length === 0) return;
      const identity = getIdentity(entry);
      if (identity) {
        if (seen.has(identity)) return;
        seen.add(identity);
      }
      merged.push(entry);
    });
  });

  return merged;
}

function readBox(source: Record<string, unknown>, keys: string[]) {
  const record = readRecord(source, keys);
  if (Object.keys(record).length === 0) return null;
  const x = readNumber(record, ["x", "left"]);
  const y = readNumber(record, ["y", "top"]);
  const w = readNumber(record, ["w", "width"]);
  const h = readNumber(record, ["h", "height"]);
  return x === null || y === null || w === null || h === null ? null : { x, y, w, h };
}

function normalizeAiFloorPlanFrame(
  source: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
  fallbackIndex: number,
  kind: string,
  shape: "round" | "rect",
  capacity: number,
  roomBounds: Record<string, unknown>,
) {
  const surface = getCanvasRoomBounds(canvasWidth, canvasHeight);
  const surfaceWidth = Math.max(1, surface.maxX - surface.minX);
  const surfaceHeight = Math.max(1, surface.maxY - surface.minY);
  const fallbackSize = getFallbackSize(kind, shape, capacity);
  const ratioBox = readBox(source, ["normalized", "relative_bounds", "relativeBounds", "ratio_bounds", "ratioBounds"]);
  const directRatioBox = {
    x: normalizeRatio(readValue(source, ["x_ratio", "xRatio"])),
    y: normalizeRatio(readValue(source, ["y_ratio", "yRatio"])),
    w: normalizeRatio(readValue(source, ["w_ratio", "wRatio", "width_ratio", "widthRatio"])),
    h: normalizeRatio(readValue(source, ["h_ratio", "hRatio", "height_ratio", "heightRatio"])),
  };
  const normalizedBox = ratioBox && [ratioBox.x, ratioBox.y, ratioBox.w, ratioBox.h].every((value) => value >= 0 && value <= 1)
    ? ratioBox
    : directRatioBox.x !== null && directRatioBox.y !== null && directRatioBox.w !== null && directRatioBox.h !== null
      ? { x: directRatioBox.x, y: directRatioBox.y, w: directRatioBox.w, h: directRatioBox.h }
      : null;

  let x: number;
  let y: number;
  let w: number;
  let h: number;

  if (normalizedBox) {
    x = surface.minX + normalizedBox.x * surfaceWidth;
    y = surface.minY + normalizedBox.y * surfaceHeight;
    w = normalizedBox.w * surfaceWidth;
    h = normalizedBox.h * surfaceHeight;
  } else {
    const imageBox = readBox(source, ["image_bbox", "imageBBox", "bbox", "bounds", "box"]);
    const roomBox = {
      x: readNumber(roomBounds, ["x", "left"]) ?? 0,
      y: readNumber(roomBounds, ["y", "top"]) ?? 0,
      w: readNumber(roomBounds, ["w", "width"]) ?? 0,
      h: readNumber(roomBounds, ["h", "height"]) ?? 0,
    };

    if (imageBox && roomBox.w > 0 && roomBox.h > 0) {
      x = surface.minX + ((imageBox.x - roomBox.x) / roomBox.w) * surfaceWidth;
      y = surface.minY + ((imageBox.y - roomBox.y) / roomBox.h) * surfaceHeight;
      w = (imageBox.w / roomBox.w) * surfaceWidth;
      h = (imageBox.h / roomBox.h) * surfaceHeight;
    } else {
      w = readNumber(source, ["w", "width"]) ?? fallbackSize.w;
      h = readNumber(source, ["h", "height"]) ?? fallbackSize.h;
      x = readNumber(source, ["x", "left"]) ?? surface.minX + (fallbackIndex % 5) * 156;
      y = readNumber(source, ["y", "top"]) ?? surface.minY + Math.floor(fallbackIndex / 5) * 136;
    }
  }

  const minSize = FURNITURE_KINDS.has(kind) ? 24 : 48;
  const maxWidth = Math.max(minSize, surfaceWidth);
  const maxHeight = Math.max(minSize, surfaceHeight);
  const safeW = Math.round(clampNumber(w, fallbackSize.w, minSize, maxWidth));
  const safeH = Math.round(clampNumber(h, fallbackSize.h, minSize, maxHeight));
  const maxX = Math.max(surface.minX, surface.maxX - safeW);
  const maxY = Math.max(surface.minY, surface.maxY - safeH);

  return {
    x: Math.round(clampNumber(x, surface.minX, surface.minX, maxX)),
    y: Math.round(clampNumber(y, surface.minY, surface.minY, maxY)),
    w: safeW,
    h: safeH,
  };
}

function normalizeAiElement(
  entry: unknown,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
  roomBounds: Record<string, unknown>,
  forcedFurniture = false,
): AiFloorPlanTable[] {
  const source = asRecord(entry);
  if (Object.keys(source).length === 0) return [];

  const furnitureKind = normalizeFurnitureKind(readValue(source, ["kind", "type", "object_type", "objet", "label", "nom"]));
  const isFurniture = forcedFurniture || (furnitureKind !== null && !normalizeToken(furnitureKind).startsWith("table"));
  const shape = normalizeShape(readValue(source, ["shape", "forme"]));
  const rawSeats = readArray(source, ["seats", "chairs", "assises", "chaises"]);
  const rawPlacements = readArray(source, ["seatPlacements", "seat_placements", "assise_placements"]);
  const placementCapacity = rawPlacements.reduce((sum, placement) => sum + Math.max(0, Math.round(readNumber(asRecord(placement), ["count", "nombre"]) || 0)), 0);
  const capacity = isFurniture
    ? 0
    : Math.round(clampNumber(
      readNumber(source, ["capacity", "places", "seat_count", "seatCount", "nombre_assises", "capacite"])
        ?? (rawSeats.length > 0 ? rawSeats.length : placementCapacity || null),
      2,
      1,
      24,
    ));
  const kind = isFurniture
    ? furnitureKind || "plant"
    : getTableKind(shape, capacity);
  const frame = normalizeAiFloorPlanFrame(source, canvasWidth, canvasHeight, index, kind, shape, capacity, roomBounds);
  const imageBox = readBox(source, ["image_bbox", "imageBBox", "bbox", "bounds", "box"]);
  const confidence = readNumber(source, ["confidence", "score", "fiabilite"]);
  const seatPlacements = isFurniture ? [] : normalizeSeatPlacementsFromAi(source, shape, capacity);

  return [{
    table_number: readString(source, ["table_number", "tableNumber", "numero", "number", "label", "nom"]) || (isFurniture ? `${kind}-${index + 1}` : `AI-${index + 1}`),
    capacity,
    kind: RESERVABLE_TABLE_KINDS.has(kind) || FURNITURE_KINDS.has(kind) ? kind : getTableKind(shape, capacity),
    shape,
    seatType: normalizeSeatType(readValue(source, ["seatType", "seat_type", "assise_type"])),
    seatPlacements,
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    rotation: Math.round(clampNumber(readNumber(source, ["rotation", "angle"]), 0, -180, 180) / 15) * 15,
    seatLabels: isFurniture ? [] : Array.from({ length: capacity }, (_, seatIndex) => seatIndex + 1),
    source_bbox: imageBox || undefined,
    confidence: confidence === null ? undefined : clampNumber(confidence, confidence, 0, 1),
  }];
}

function normalizeAiFloorPlanAnalysis(
  value: unknown,
  canvasWidth: number,
  canvasHeight: number,
  image?: ImagePayload | null,
) {
  const source = asRecord(value);
  const semanticRoomSource = readRecord(source, ["salle", "room", "venue"]);
  const analysisSource = Object.keys(asRecord(source.analysis)).length > 0
    ? asRecord(source.analysis)
    : Object.keys(semanticRoomSource).length > 0
      ? semanticRoomSource
      : source;
  const roomBounds = readRecord(analysisSource, ["room_bounds", "roomBounds", "salle_bounds", "room"]);
  const analysisTables = readArray(analysisSource, ["tables"]);
  const rootTables = readArray(source, ["tables"]);
  const semanticTables = readArray(semanticRoomSource, ["tables"]);
  const rawTables = mergeFloorPlanEntriesByIdentity(
    [analysisTables, rootTables, semanticTables],
    getFloorPlanTableIdentity,
  );
  const analysisFurniture = [
    ...readArray(analysisSource, ["furniture", "mobilier"]),
    ...readArray(analysisSource, ["decoration", "decorations"]),
    ...readArray(analysisSource, ["objects", "objets", "elements"]),
  ];
  const rootFurniture = [
    ...readArray(source, ["furniture", "mobilier"]),
    ...readArray(source, ["decoration", "decorations"]),
    ...readArray(source, ["objects", "objets", "elements"]),
  ];
  const semanticFurniture = [
    ...readArray(semanticRoomSource, ["furniture", "mobilier"]),
    ...readArray(semanticRoomSource, ["decoration", "decorations"]),
    ...readArray(semanticRoomSource, ["objects", "objets", "elements"]),
  ];
  const rawFurniture = mergeFloorPlanEntriesByIdentity(
    [analysisFurniture, rootFurniture, semanticFurniture],
    getFloorPlanFurnitureIdentity,
  );
  const semanticTableHints = buildSemanticFloorPlanFrameHints(rawTables, canvasWidth, canvasHeight);
  const semanticFurnitureHints = buildSemanticFloorPlanFrameHints(rawFurniture, canvasWidth, canvasHeight, true);
  const tables = [
    ...rawTables.flatMap((entry, index) => normalizeAiElement(
      withSemanticFrameHint(entry, semanticTableHints.get(index)),
      index,
      canvasWidth,
      canvasHeight,
      roomBounds,
    )),
    ...rawFurniture.flatMap((entry, index) => normalizeAiElement(
      withSemanticFrameHint(entry, semanticFurnitureHints.get(index)),
      rawTables.length + index,
      canvasWidth,
      canvasHeight,
      roomBounds,
      true,
    )),
  ];

  return {
    ...analysisSource,
    source_image: {
      ...asRecord(analysisSource.source_image),
      width: image?.width || readNumber(asRecord(analysisSource.source_image), ["width"]) || null,
      height: image?.height || readNumber(asRecord(analysisSource.source_image), ["height"]) || null,
    },
    room_bounds: roomBounds,
    tables: tables.filter((table) => table.capacity > 0),
    furniture: tables.filter((table) => table.capacity === 0),
    normalized_canvas: {
      width: canvasWidth,
      height: canvasHeight,
      room_inset: CANVAS_ROOM_INSET,
    },
  };
}

function normalizeFloorPlanAiResult(
  value: unknown,
  canvasWidth: number,
  canvasHeight: number,
  image?: ImagePayload | null,
) {
  const source = asRecord(value);
  const analysis = normalizeAiFloorPlanAnalysis(source, canvasWidth, canvasHeight, image);
  const tables = [
    ...(Array.isArray(analysis.tables) ? analysis.tables : []),
    ...(Array.isArray(analysis.furniture) ? analysis.furniture : []),
  ] as AiFloorPlanTable[];

  return {
    ...source,
    analysis,
    tables,
    explanation: typeof source.explanation === "string"
      ? source.explanation
      : "Plan genere a partir de l'analyse IA precise de l'image.",
  };
}

function buildSystemPrompt(params: {
  restaurant: { name: string; cuisine_type: string | null; city: string | null };
  avgPartySize: string;
  partyDistribution: Record<number, number>;
  canvasWidth: number;
  canvasHeight: number;
  currentLayoutSummary: string;
}) {
  const { restaurant, avgPartySize, partyDistribution, canvasWidth, canvasHeight, currentLayoutSummary } = params;
  return `Tu es un expert en aménagement de salles de restaurant pour la plateforme Tok.
Tu dois TOUJOURS répondre avec un JSON valide, sans texte avant ni après le JSON.

Contexte du restaurant:
- Nom: ${restaurant.name}
- Cuisine: ${restaurant.cuisine_type || "Non spécifié"}
- Ville: ${restaurant.city || "Non spécifié"}
- Taille moyenne des groupes (30j): ${avgPartySize} personnes
- Distribution: ${JSON.stringify(partyDistribution)}
- Canvas: ${canvasWidth}x${canvasHeight} pixels

Disposition actuelle:
${currentLayoutSummary}

TYPES DISPONIBLES (kind):
- "table-round-2", "table-round-4", "table-rect-2", "table-rect-4", "table-rect-6"
- "chair", "stool", "bar", "corner-bench", "banquette", "booth"
- "host-stand", "divider", "plant", "service-station"

SHAPES: "round" ou "rect"
SEAT TYPES: "chair", "stool", "bench", "corner-bench"

RÈGLES:
- x,y dans les limites du canvas (0-${canvasWidth} x 0-${canvasHeight})
- minimum 60px entre les éléments
- rondes: w=h; tables rect min 140x90; meubles min 60x60; max 300x300
- rotation multiple de 15; capacity = nombre de places
- Pour les imports image, capacity doit venir des chaises visibles: one chair above and one chair below = table 2 places, jamais 4.
- Une table rectangulaire avec 2 chaises visibles doit utiliser kind "table-rect-2"; une ronde 2 places doit utiliser "table-round-2".
- Une table ronde 2 places doit avoir les chaises opposees (nord/sud), pas cote a cote.

FORMAT DE RÉPONSE (JSON strict):
{
  "tables": [{"table_number":"T1","capacity":4,"kind":"table-rect-4","shape":"rect","seatType":"chair","x":100,"y":100,"w":176,"h":112,"rotation":0,"seatLabels":[1,2,3,4]}],
  "explanation": "..."
}`;
}

function buildFloorPlanPrompt(params: {
  restaurant: { name: string; cuisine_type: string | null; city: string | null };
  avgPartySize: string;
  partyDistribution: Record<number, number>;
  canvasWidth: number;
  canvasHeight: number;
  currentLayoutSummary: string;
}) {
  const { restaurant, avgPartySize, partyDistribution, canvasWidth, canvasHeight, currentLayoutSummary } = params;
  return `Tu es un expert en amenagement de salles de restaurant pour la plateforme Tok.
Tu dois TOUJOURS repondre avec un JSON valide, sans texte avant ni apres le JSON.

Contexte du restaurant:
- Nom: ${restaurant.name}
- Cuisine: ${restaurant.cuisine_type || "Non specifie"}
- Ville: ${restaurant.city || "Non specifie"}
- Taille moyenne des groupes (30j): ${avgPartySize} personnes
- Distribution: ${JSON.stringify(partyDistribution)}
- Canvas logique Tok: ${canvasWidth}x${canvasHeight} pixels

Disposition actuelle:
${currentLayoutSummary}

TYPES DISPONIBLES (kind):
- "table-round-2", "table-round-4", "table-rect-2", "table-rect-4", "table-rect-6"
- "chair", "stool", "bar", "corner-bench", "banquette", "booth"
- "host-stand", "divider", "plant", "service-station"

SHAPES: "round" ou "rect"
SEAT TYPES: "chair", "stool", "bench", "corner-bench"

REGLES:
- x,y dans les limites du canvas logique (0-${canvasWidth} x 0-${canvasHeight})
- minimum 60px entre les elements pour les generations libres; pour les imports image, privilegie la fidelite au plan source.
- rondes: w=h; tables rect min 140x90; meubles min 60x60; max 300x300
- rotation multiple de 15; capacity = nombre de places
- Pour les imports image, localise d'abord le rectangle interieur de la salle, puis utilise room_bounds comme origine de tous les ratios.
- Pour les imports image, renvoie x_ratio, y_ratio, w_ratio, h_ratio pour chaque table et chaque meuble visible.
- Les ratios de position doivent suivre l'image: meme rang, meme colonne, meme decalage relatif, meme alignement que le plan source.
- Ne renvoie jamais les chaises attachees aux tables comme meubles separes: elles doivent devenir seat_count, seats et seatPlacements.
- Ne fusionne jamais deux tables visibles, ne cree jamais une table invisible et conserve les numeros lus sur l'image.
- Inclue toutes les tables visibles, y compris les tables beige/libres ou peu colorees; ne liste pas uniquement les tables vertes/occupees.
- Verifie le decompte final avant de repondre: si l'image montre les numeros 20 a 33, la reponse doit contenir 14 tables, pas 5 ni 7.
- Pour les imports image, capacity doit venir des chaises visibles: one chair above and one chair below = table 2 places, jamais 4.
- Une table rectangulaire avec 2 chaises visibles doit utiliser kind "table-rect-2"; une ronde 2 places doit utiliser "table-round-2".
- Une table ronde 2 places doit avoir les chaises opposees (nord/sud), pas cote a cote.

FORMAT DE REPONSE (JSON strict):
${FLOOR_PLAN_IMAGE_IMPORT_SCHEMA}`;
}

function normalizeImagePayload(value: unknown): ImagePayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl.trim() : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim().toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 180) : null;
  const width = Math.round(clampNumber(record.width, 0, 0, 20_000)) || null;
  const height = Math.round(clampNumber(record.height, 0, 0, 20_000)) || null;

  if (!dataUrl || !mimeType || !IMAGE_MIME_TYPES.has(mimeType)) return null;
  if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) return null;
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return null;

  return { dataUrl, mimeType, name, width, height };
}

function readTokenCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function extractChatUsage(value: unknown) {
  const usage = typeof value === "object" && value !== null
    ? (value as Record<string, unknown>).usage
    : null;
  const record = typeof usage === "object" && usage !== null ? usage as Record<string, unknown> : {};
  const inputTokens = readTokenCount(record.prompt_tokens ?? record.input_tokens);
  const outputTokens = readTokenCount(record.completion_tokens ?? record.output_tokens);
  const totalTokens = readTokenCount(record.total_tokens) || inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

function estimateCostChf(inputTokens = 0, outputTokens = 0) {
  return Number(((inputTokens * 0.00000025) + (outputTokens * 0.000001)).toFixed(6));
}

async function insertUsage(
  actor: Awaited<ReturnType<typeof authenticateRequest>>,
  payload: {
    status: "success";
    action: FloorplanAction;
    restaurantId: string;
    model: string;
    usage: ReturnType<typeof extractChatUsage>;
    metadata?: Record<string, unknown>;
  },
) {
  await actor.adminClient.from("ai_usage_logs").insert({
    function_name: FUNCTION_NAME,
    action: payload.action,
    feature_name: FEATURE_NAME,
    source: FUNCTION_NAME,
    model: payload.model,
    user_id: actor.userId,
    restaurant_id: payload.restaurantId,
    status: payload.status,
    input_tokens: payload.usage.inputTokens,
    output_tokens: payload.usage.outputTokens,
    total_tokens: payload.usage.totalTokens,
    estimated_cost_chf: estimateCostChf(payload.usage.inputTokens, payload.usage.outputTokens),
    metadata: { credit_kind: "ai_tools", credit_units: AI_TOOL_CREDIT_UNITS, ...(payload.metadata || {}) },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, cors);
  if (preflight) return preflight;

  const log = makeLogger(FUNCTION_NAME);
  let actor: Awaited<ReturnType<typeof authenticateRequest>> | null = null;

  try {
    actor = await authenticateRequest(req, { allowServiceRole: false });
    if (!actor.userId) throw new HttpError(401, "Unauthorized");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const OPENAI_VISION_MODEL = Deno.env.get("OPENAI_VISION_MODEL") || OPENAI_MODEL;
    if (!OPENAI_API_KEY) {
      log.error("openai_key_missing");
      throw new HttpError(503, "ai_service_unavailable");
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as FloorplanAction;
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
    const requestedCanvasWidth = Math.min(Math.max(Number(body.canvasWidth) || CANONICAL_CANVAS_WIDTH, 400), 2000);
    const requestedCanvasHeight = Math.min(Math.max(Number(body.canvasHeight) || CANONICAL_CANVAS_HEIGHT, 400), 2000);
    const canvasWidth = CANONICAL_CANVAS_WIDTH;
    const canvasHeight = CANONICAL_CANVAS_HEIGHT;
    const currentLayout = Array.isArray(body.currentLayout) ? body.currentLayout : [];
    const rawPrompt = typeof body.prompt === "string" ? body.prompt.slice(0, 2000) : "";
    const image = normalizeImagePayload(body.image);

    if (!restaurantId || !["generate", "optimize", "suggest-furniture", "custom", "image-import"].includes(action)) {
      throw new HttpError(400, "invalid_request");
    }
    if (action === "image-import" && !image) {
      throw new HttpError(400, "invalid_image");
    }

    // Ownership check.
    const restaurant = await requireRestaurantAccess(actor, restaurantId);

    // Per-user + per-restaurant + global rate limit. Fail-closed.
    const rl = createRateLimiter(actor.adminClient, "floorplan-ai");
    await rl.consume(`user:${actor.userId}`, { maxRequests: 15, windowSeconds: 3600 });
    await rl.consume(`restaurant:${restaurantId}`, { maxRequests: 30, windowSeconds: 3600 });
    await rl.consume("global", { maxRequests: 200, windowSeconds: 60 });

    // Reservation stats (last 30d).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentReservations } = await actor.adminClient
      .from("reservations")
      .select("party_size")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", thirtyDaysAgo);

    const reservations = (recentReservations as ReservationRow[] | null) ?? [];
    const avgPartySize = reservations.length > 0
      ? (reservations.reduce((s, r) => s + (r.party_size || 2), 0) / reservations.length).toFixed(1)
      : "2.5";
    const partyDistribution: Record<number, number> = {};
    for (const r of reservations) {
      const size = r.party_size || 2;
      partyDistribution[size] = (partyDistribution[size] || 0) + 1;
    }

    const currentLayoutSummary = currentLayout.length > 0
      ? currentLayout
        .map((t: Record<string, unknown>) => {
          const layout = (t.layout ?? {}) as Record<string, unknown>;
          return `${t.table_number}: ${t.capacity}p ${layout.shape} (${Math.round(
            Number(layout.x) || 0,
          )},${Math.round(Number(layout.y) || 0)}) ${layout.w}x${layout.h}`;
        })
        .join("\n")
      : "Aucune table placée";

    const systemPrompt = buildFloorPlanPrompt({
      restaurant: {
        name: restaurant.name,
        cuisine_type: restaurant.cuisine_type,
        city: restaurant.city,
      },
      avgPartySize,
      partyDistribution,
      canvasWidth,
      canvasHeight,
      currentLayoutSummary,
    });

    let userPrompt = rawPrompt;
    if (!userPrompt) {
      if (action === "image-import") {
        userPrompt =
          `Analyse l'image importee comme un plan de salle a reproduire fidelement. Dimensions source connues: ${image?.width || "inconnue"}x${image?.height || "inconnue"} px. Identifie d'abord le rectangle interieur de la salle (room_bounds), puis liste toutes les tables visibles avec leur numero exact, leur forme, leur nombre exact d'assises visibles, leurs chaises par zone et leurs ratios x_ratio/y_ratio/w_ratio/h_ratio dans la salle. Inclue uniquement le mobilier visible (plantes, accueil, bar, separateurs, dessertes). Ne renvoie jamais les chaises attachees aux tables comme meubles separes. Ne corrige pas le plan et n'optimise pas: reproduis le meme placement relatif que l'image. Retourne uniquement le JSON strict demande.`;
      } else if (action === "generate") {
        userPrompt =
          "Génère un plan de salle optimisé avec un bon mix de tables 2/4/6 personnes, un accueil et des plantes. Optimise circulation et couverts.";
      } else if (action === "optimize") {
        userPrompt =
          "Analyse la disposition actuelle et propose une version optimisée. Garde les types existants, ajuste positions/rotations/espacement.";
      } else if (action === "suggest-furniture") {
        userPrompt =
          "Suggère des meubles complémentaires (plantes, séparateurs, bar, accueil) sans modifier les tables existantes.";
      } else {
        userPrompt = "Donne tes suggestions d'amélioration.";
      }
    }

    const selectedModel = action === "image-import" ? OPENAI_VISION_MODEL : OPENAI_MODEL;
    const userContent = image
      ? [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: image.dataUrl, detail: "high" } },
      ]
      : userPrompt;

    const aiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: action === "image-import" ? 0 : 0.7,
        max_tokens: action === "image-import" ? 4000 : 1800,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      log.error("openai_error", { status: aiResponse.status });
      if (aiResponse.status === 429) {
        throw new HttpError(429, "Trop de requêtes. Réessayez dans quelques instants.");
      }
      throw new HttpError(502, "ai_service_error");
    }

    const data = await aiResponse.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "ai_empty_response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      log.error("ai_parse_error");
      throw new HttpError(502, "ai_invalid_response");
    }

    const usage = extractChatUsage(data);
    await insertUsage(actor, {
      status: "success",
      action,
      restaurantId,
      model: selectedModel,
      usage,
      metadata: {
        rid: log.rid,
        has_image: Boolean(image),
        image_mime_type: image?.mimeType || null,
        canvas_width: canvasWidth,
        canvas_height: canvasHeight,
        requested_canvas_width: requestedCanvasWidth,
        requested_canvas_height: requestedCanvasHeight,
        source_image_width: image?.width || null,
        source_image_height: image?.height || null,
      },
    });

    await writeAuditLog({
      adminClient: actor.adminClient,
      functionName: FUNCTION_NAME,
      status: "success",
      action,
      actor,
      request: req,
      targetEntityType: "restaurants",
      targetEntityId: restaurantId,
      metadata: {
        model: selectedModel,
        rid: log.rid,
        has_image: Boolean(image),
        image_mime_type: image?.mimeType || null,
        source_image_width: image?.width || null,
        source_image_height: image?.height || null,
      },
    });

    return jsonResponse(normalizeFloorPlanAiResult(parsed, canvasWidth, canvasHeight, image), 200, cors);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof HttpError ? err.message : "internal_error";
    log.error("request_failed", { status, message });

    if (actor) {
      await writeAuditLog({
        adminClient: actor.adminClient,
        functionName: FUNCTION_NAME,
        status: "failure",
        actor,
        request: req,
        errorMessage: message,
        metadata: { rid: log.rid },
      }).catch(() => {});
    }

    return jsonResponse({ error: message, rid: log.rid }, status, cors);
  }
});
