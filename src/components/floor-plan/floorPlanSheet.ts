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
export const FLOOR_PLAN_SHEET_BACKGROUND = "#f6f7fb";

/** Trame de repérage imprimée sur la feuille. */
export const FLOOR_PLAN_SHEET_GRID_IMAGE =
  "linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)";

/** Cadre du canevas lui-même (la feuille), commun au studio et au plan de service. */
export const FLOOR_PLAN_SHEET_STAGE_CLASS =
  "relative shrink-0 origin-top-left overflow-hidden border border-slate-300/70 shadow-inner";

/** Murs de la salle dessinés sur la feuille. */
export const FLOOR_PLAN_SHEET_WALL_CLASS = "pointer-events-none absolute border-[#36373d]";

/** Sol (parquet) dessiné à l'intérieur des murs. */
export const FLOOR_PLAN_SHEET_FLOOR_CLASS =
  "pointer-events-none absolute bg-[linear-gradient(145deg,rgba(225,192,149,0.9),rgba(192,151,111,0.92))]";

/** Liseré clair qui détache le sol des plinthes. */
export const FLOOR_PLAN_SHEET_FLOOR_INLAY_CLASS = "pointer-events-none absolute border border-white/25";

/**
 * Vignette de prévisualisation d'un objet (bibliothèque, inspecteur).
 *
 * Même raison que le canevas : on y rend le mobilier, donc le fond reste clair
 * dans les deux thèmes pour que l'objet soit lu comme sur le plan.
 */
export const FLOOR_PLAN_PREVIEW_TILE_CLASS = "border-slate-200/90 bg-slate-50";

export const FLOOR_PLAN_PREVIEW_TILE_TABLE_CLASS =
  "border-sky-200/90 bg-[radial-gradient(circle_at_top,rgba(232,244,255,0.98),rgba(240,247,255,0.92)_55%,rgba(255,255,255,0.9)_100%)]";

export const FLOOR_PLAN_PREVIEW_TILE_PLANT_CLASS =
  "border-emerald-200/90 bg-[radial-gradient(circle_at_top,rgba(234,247,235,0.98),rgba(241,250,242,0.92)_55%,rgba(255,255,255,0.9)_100%)]";

export const FLOOR_PLAN_PREVIEW_TILE_NEUTRAL_CLASS =
  "border-slate-200/90 bg-[radial-gradient(circle_at_top,rgba(248,250,252,0.98),rgba(244,247,250,0.92)_58%,rgba(255,255,255,0.9)_100%)]";

/**
 * Facteur d'échelle du décor de la feuille : le parquet et les murs gardent
 * leurs proportions quelle que soit la taille du canevas.
 */
export const FLOOR_PLAN_SHEET_BASE_WIDTH = 1040;
export const FLOOR_PLAN_SHEET_BASE_HEIGHT = 760;

export function createFloorPlanSheetScale(canvasWidth: number, canvasHeight: number) {
  const scale = Math.max(
    0.1,
    Math.min(canvasWidth / FLOOR_PLAN_SHEET_BASE_WIDTH, canvasHeight / FLOOR_PLAN_SHEET_BASE_HEIGHT),
  );

  return (value: number, minimum = 1) => `${Math.max(minimum, Math.round(value * scale))}px`;
}
