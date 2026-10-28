/**
 * Le canevas du plan de salle est une « feuille » claire dans les deux thèmes.
 *
 * Décision (voir docs/design/plan-de-salle-theme.md) : le mobilier est rendu à
 * partir d'assets PNG (`/plan salle/*.png`, cf. `floorPlanAssets.ts`) et de SVG
 * à couleurs figées (`EventFurnitureSvg`, `DynamicTableSvg`). Ces visuels sont
 * dessinés pour un sol clair et il n'existe pas de jeu sombre équivalent :
 * inverser le fond du canevas poserait un mobilier clair sur un sol sombre,
 * sans contraste maîtrisé et sans moyen de l'adapter.
 *
 * Le canevas garde donc son propre décor — sol parquet, murs, trame — pendant
 * que le châssis autour (cartes, en-têtes, barres d'outils, panneaux, files)
 * suit le thème via les tokens (`bg-card`, `bg-muted`, `border-border`, …). En
 * thème sombre, on obtient une feuille de plan claire posée sur un plan de
 * travail sombre, ce qui est l'intention.
 *
 * Corollaire : tout ce qui est rendu *sur* la feuille (étiquettes de table,
 * pastilles d'état, poignées de manipulation) reste volontairement en tons
 * clairs. Ces éléments se lisent sur le fond de la feuille, pas sur le fond de
 * la page — leur ajouter des variantes `dark:` les rendrait illisibles.
 */

/** Fond de la feuille. Volontairement identique en thème clair et sombre. */
export const FLOOR_PLAN_SHEET_BACKGROUND = "#f4f1eb";

/** Trame de repérage imprimée sur la feuille. */
export const FLOOR_PLAN_SHEET_GRID_IMAGE =
  "linear-gradient(rgba(116,103,83,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(116,103,83,0.10) 1px, transparent 1px)";

/** Cadre du canevas lui-même (la feuille), commun au studio et au plan de service. */
export const FLOOR_PLAN_SHEET_STAGE_CLASS =
  "relative shrink-0 origin-top-left overflow-hidden";

/** Murs de la salle dessinés sur la feuille. */
export const FLOOR_PLAN_SHEET_WALL_CLASS =
  "pointer-events-none absolute border-[#d3ccbd] bg-[#eeebe3] shadow-[0_5px_15px_rgba(72,53,31,0.12)]";

/** Sol (parquet) dessiné à l'intérieur des murs. */
export const FLOOR_PLAN_SHEET_FLOOR_CLASS =
  "pointer-events-none absolute fp-oak-floor";

/** Liseré clair qui détache le sol des plinthes. */
export const FLOOR_PLAN_SHEET_FLOOR_INLAY_CLASS =
  "pointer-events-none absolute border border-[#a58b67]/15";

/**
 * Vignette de prévisualisation d'un objet (bibliothèque, inspecteur).
 *
 * Même raison que le canevas : on y rend le mobilier, donc le fond reste clair
 * dans les deux thèmes pour que l'objet soit lu comme sur le plan.
 */
export const FLOOR_PLAN_PREVIEW_TILE_CLASS = "border-[#e6e0d6] bg-[#f7f5f0]";

export const FLOOR_PLAN_PREVIEW_TILE_TABLE_CLASS =
  "border-[#e6e0d6] bg-[#f7f5f0]";

export const FLOOR_PLAN_PREVIEW_TILE_PLANT_CLASS =
  "border-[#dfe5d8] bg-[#f1f4ed]";

export const FLOOR_PLAN_PREVIEW_TILE_NEUTRAL_CLASS =
  "border-[#e6e0d6] bg-[#f7f5f0]";

/**
 * Facteur d'échelle du décor de la feuille : le parquet et les murs gardent
 * leurs proportions quelle que soit la taille du canevas.
 */
export const FLOOR_PLAN_SHEET_BASE_WIDTH = 1040;
export const FLOOR_PLAN_SHEET_BASE_HEIGHT = 760;

export function createFloorPlanSheetScale(
  canvasWidth: number,
  canvasHeight: number,
) {
  const scale = Math.max(
    0.1,
    Math.min(
      canvasWidth / FLOOR_PLAN_SHEET_BASE_WIDTH,
      canvasHeight / FLOOR_PLAN_SHEET_BASE_HEIGHT,
    ),
  );

  return (value: number, minimum = 1) =>
    `${Math.max(minimum, Math.round(value * scale))}px`;
}
