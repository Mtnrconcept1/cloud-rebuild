import type {
  FloorPlanItemKind,
  FloorPlanTableFinish,
  FloorPlanTableShape,
  FloorPlanVisualVariant,
} from "@/lib/floorPlan";

/** Real transparent assets from the approved TOK floor-plan pack.
 * Visible bounds are measured at alpha >= 128. The full image is retained so
 * normalizing the furniture never crops its soft shadows or translucent glass.
 * See public/floor-plan/manifest.json for source hashes and conversion settings.
 */
export type FloorPlanAssetBounds = readonly [
  left: number,
  top: number,
  right: number,
  bottom: number,
];

export type FloorPlanAsset = {
  src: string;
  width: number;
  height: number;
  visibleBounds: FloorPlanAssetBounds;
};

const assets = {
  "round-table-duo": {
    src: "/floor-plan/01_table-ronde-duo.webp",
    width: 768,
    height: 768,
    visibleBounds: [91, 88, 675, 663],
  },
  "round-table-top": {
    src: "/floor-plan/02_table-ronde-quatre.webp",
    width: 768,
    height: 768,
    visibleBounds: [83, 81, 686, 688],
  },
  "square-table-top": {
    src: "/floor-plan/03_table-carree.webp",
    width: 768,
    height: 768,
    visibleBounds: [133, 145, 636, 623],
  },
  "rect-table-top": {
    src: "/floor-plan/04_table-rectangulaire.webp",
    width: 768,
    height: 384,
    visibleBounds: [64, 80, 704, 302],
  },
  "high-table-top": {
    src: "/floor-plan/05_table-haute-ronde.webp",
    width: 768,
    height: 768,
    visibleBounds: [77, 74, 689, 686],
  },
  chair: {
    src: "/floor-plan/06_chaise-sable.webp",
    width: 768,
    height: 768,
    visibleBounds: [115, 130, 652, 623],
  },
  stool: {
    src: "/floor-plan/07_tabouret-sauge.webp",
    width: 768,
    height: 768,
    visibleBounds: [158, 152, 609, 610],
  },
  "banquette-straight": {
    src: "/floor-plan/08_banquette-droite-sauge.webp",
    width: 768,
    height: 384,
    visibleBounds: [76, 82, 692, 307],
  },
  "corner-bench": {
    src: "/floor-plan/09_banquette-angle-sauge.webp",
    width: 768,
    height: 768,
    visibleBounds: [91, 108, 695, 681],
  },
  "service-station": {
    src: "/floor-plan/10_console-service-bois.webp",
    width: 768,
    height: 384,
    visibleBounds: [104, 120, 664, 264],
  },
  wall: {
    src: "/floor-plan/11_mur-droit.webp",
    width: 768,
    height: 384,
    visibleBounds: [52, 158, 716, 226],
  },
  "wall-corner": {
    src: "/floor-plan/12_mur-angle.webp",
    width: 768,
    height: 768,
    visibleBounds: [83, 83, 685, 685],
  },
  door: {
    src: "/floor-plan/13_porte-ouverte.webp",
    width: 768,
    height: 768,
    visibleBounds: [138, 141, 638, 650],
  },
  window: {
    src: "/floor-plan/14_fenetre-module.webp",
    width: 768,
    height: 256,
    visibleBounds: [54, 103, 715, 151],
  },
  "divider-open": {
    src: "/floor-plan/15_cloison-vitree.webp",
    width: 768,
    height: 278,
    visibleBounds: [52, 115, 717, 169],
  },
  plant: {
    src: "/floor-plan/16_plante-grande.webp",
    width: 768,
    height: 768,
    visibleBounds: [65, 25, 728, 705],
  },
  "table-plant": {
    src: "/floor-plan/17_plante-table.webp",
    width: 768,
    height: 768,
    visibleBounds: [193, 171, 590, 585],
  },
  planter: {
    src: "/floor-plan/18_jardiniere-rectangulaire.webp",
    width: 768,
    height: 279,
    visibleBounds: [81, 31, 686, 220],
  },
  parasol: {
    src: "/floor-plan/19_parasol-terrasse.webp",
    width: 768,
    height: 768,
    visibleBounds: [38, 47, 730, 726],
  },
  "cake-table": {
    src: "/floor-plan/20_presentoir-gateau.webp",
    width: 768,
    height: 768,
    visibleBounds: [112, 109, 655, 654],
  },
  buffet: {
    src: "/floor-plan/21_buffet-reception.webp",
    width: 768,
    height: 320,
    visibleBounds: [91, 63, 677, 248],
  },
  "bar-top": {
    src: "/floor-plan/22_comptoir-mobile.webp",
    width: 768,
    height: 384,
    visibleBounds: [83, 99, 686, 282],
  },
} satisfies Record<string, FloorPlanAsset>;

// Keep the existing semantic IDs for saved furniture and external consumers.
export const FLOOR_PLAN_ASSETS = {
  ...assets,
  "banquette-end": assets["banquette-straight"],
  "divider-hedge": assets.planter,
  "round-table-angled": assets["round-table-top"],
  "host-stand": assets["bar-top"],
  "planter-banquette": assets.planter,
};

export type FloorPlanAssetId = keyof typeof FLOOR_PLAN_ASSETS;

const TABLETOP_ASSETS: ReadonlySet<FloorPlanAssetId> = new Set([
  "round-table-duo",
  "round-table-top",
  "round-table-angled",
  "square-table-top",
  "rect-table-top",
  "high-table-top",
]);

/** Render-only finishes: keep the source grain and alpha, never tint furniture. */
export function getFloorPlanTableFinishFilter(
  assetId: FloorPlanAssetId,
  finish?: FloorPlanTableFinish,
) {
  if (!TABLETOP_ASSETS.has(assetId)) return undefined;
  if (finish === "natural") return "saturate(0.55) brightness(1.06)";
  if (finish === "walnut")
    return "sepia(0.2) saturate(0.72) brightness(0.62) contrast(1.08)";
  return undefined;
}

export function getFloorPlanAssetAspectRatio(assetId: FloorPlanAssetId) {
  const [left, top, right, bottom] = FLOOR_PLAN_ASSETS[assetId].visibleBounds;
  return (right - left) / (bottom - top);
}

export type FloorPlanAssetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type FloorPlanAssetFit = "contain" | "stretch";

/**
 * Size and center the visible furniture, rather than the transparent PNG canvas.
 * Returning the full bitmap rectangle keeps every shadow pixel outside the body.
 */
export function getFloorPlanAssetRect(
  asset: FloorPlanAsset,
  target: FloorPlanAssetRect,
  fit: FloorPlanAssetFit = "contain",
): FloorPlanAssetRect {
  const [left, top, right, bottom] = asset.visibleBounds;
  const visibleWidth = right - left;
  const visibleHeight = bottom - top;
  const containScale = Math.min(
    target.width / visibleWidth,
    target.height / visibleHeight,
  );
  const scaleX = fit === "stretch" ? target.width / visibleWidth : containScale;
  const scaleY =
    fit === "stretch" ? target.height / visibleHeight : containScale;

  return {
    x: target.x + (target.width - visibleWidth * scaleX) / 2 - left * scaleX,
    y: target.y + (target.height - visibleHeight * scaleY) / 2 - top * scaleY,
    width: asset.width * scaleX,
    height: asset.height * scaleY,
  };
}

const VARIANT_ASSETS: Record<FloorPlanVisualVariant, FloorPlanAssetId> = {
  wall: "wall",
  "wall-corner": "wall-corner",
  door: "door",
  window: "window",
  "table-plant": "table-plant",
  planter: "planter",
  parasol: "parasol",
  "high-table": "high-table-top",
};

export function getFloorPlanItemAssetId({
  kind,
  shape,
  capacity,
  visualVariant,
  tableWidth,
  tableHeight,
}: {
  kind: FloorPlanItemKind;
  shape?: FloorPlanTableShape;
  capacity?: number;
  visualVariant?: FloorPlanVisualVariant;
  tableWidth?: number;
  tableHeight?: number;
}): FloorPlanAssetId | null {
  if (visualVariant) return VARIANT_ASSETS[visualVariant];
  if (kind === "table") {
    if (shape === "round")
      return capacity && capacity <= 2 ? "round-table-duo" : "round-table-top";
    const ratio = tableWidth && tableHeight ? tableWidth / tableHeight : 1;
    return ratio >= 0.75 && ratio <= 1.33
      ? "square-table-top"
      : "rect-table-top";
  }
  const assetByKind: Partial<Record<FloorPlanItemKind, FloorPlanAssetId>> = {
    chair: "chair",
    stool: "stool",
    bar: "bar-top",
    "corner-bench": "corner-bench",
    banquette: "banquette-straight",
    "host-stand": "host-stand",
    divider: "divider-open",
    plant: "plant",
    "service-station": "service-station",
    sofa: "banquette-straight",
    buffet: "buffet",
    "cake-table": "cake-table",
  };
  return assetByKind[kind] ?? null;
}
