/**
 * Tons sémantiques du châssis du plan de salle (panneaux, files, tiroirs).
 *
 * Ces classes s'appliquent **hors** du canevas : elles sont lues sur le fond de
 * la page, donc elles suivent le thème. Le fond teinté passe en surface
 * translucide en sombre et l'encre remonte de deux crans pour rester lisible,
 * suivant le motif déjà employé ailleurs dans le dashboard restaurateur.
 *
 * À ne pas utiliser pour ce qui est peint sur le canevas : la feuille reste
 * claire dans les deux thèmes (cf. `floorPlanSheet.ts`), les pastilles posées
 * dessus gardent donc leurs tons clairs.
 */
export const FLOOR_PLAN_TONE_CLASS = {
  neutral: "border-border bg-muted text-muted-foreground",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  orange:
    "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200",
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  teal: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200",
  lime: "border-lime-200 bg-lime-50 text-lime-800 dark:border-lime-500/30 dark:bg-lime-500/10 dark:text-lime-200",
  violet:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
} as const;

export type FloorPlanTone = keyof typeof FLOOR_PLAN_TONE_CLASS;

/** Texte seul, sans fond ni bordure — pour les libellés d'accompagnement. */
export const FLOOR_PLAN_TONE_TEXT_CLASS = {
  neutral: "text-muted-foreground",
  emerald: "text-emerald-700 dark:text-emerald-300",
  sky: "text-sky-700 dark:text-sky-300",
  amber: "text-amber-700 dark:text-amber-300",
  orange: "text-orange-800 dark:text-orange-300",
  rose: "text-rose-700 dark:text-rose-300",
  teal: "text-teal-700 dark:text-teal-300",
  lime: "text-lime-800 dark:text-lime-300",
  violet: "text-violet-700 dark:text-violet-300",
} as const satisfies Record<FloorPlanTone, string>;
