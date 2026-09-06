# Plan de salle — thème clair / sombre

Ce document fixe la règle de thème du module `src/components/floor-plan/`, et
surtout **la décision explicite sur le canevas** : il ne suit pas le thème.

## Le problème corrigé

Le module était écrit en couleurs claires en dur (`bg-white`, `border-slate-200`,
`text-slate-950`, dégradés `rgba(255,255,255,…)`) sans variantes `dark:`. Sur le
dashboard restaurateur, qui est sombre, le studio apparaissait donc comme un bloc
blanc au milieu de la page.

## La règle : châssis vs feuille

Le module se lit en deux couches, et une seule des deux suit le thème.

| Couche | Contenu | Comportement |
| --- | --- | --- |
| **Châssis** | Cartes, en-têtes, barres d'outils, panneaux latéraux, tiroirs, files de réservation, dialogues, badges d'état | **Suit le thème**, via les tokens |
| **Feuille** | Le canevas lui-même (`data-floor-plan-canvas="stage"`) et tout ce qui est peint dessus | **Reste clair dans les deux thèmes** |

En thème sombre, on obtient donc une feuille de plan claire posée sur un plan de
travail sombre — comme un plan papier sur une table.

## Pourquoi la feuille reste claire

Ce n'est pas un raccourci : c'est une contrainte du contenu.

Le mobilier posé sur le plan n'est pas dessiné en CSS. Il vient de deux sources
à couleurs figées :

- des **images PNG** (`public/plan salle/*.png`, référencées par
  `floorPlanAssets.ts`) — chaises, tables, banquettes, bar, plantes ;
- des **SVG à couleurs littérales** (`EventFurnitureSvg.tsx`,
  `DynamicTableSvg.tsx`) — scène, piste de danse, buffet, régie.

Ces visuels sont dessinés pour un sol clair et il n'existe pas de jeu sombre
équivalent. Inverser le fond du canevas poserait un mobilier clair sur un sol
sombre : contraste non maîtrisé, et aucun moyen de l'adapter sans refaire toute
la bibliothèque d'assets.

Le canevas a par ailleurs son propre décor — sol parquet, murs, trame de
repérage — qui représente une salle physique, pas une surface d'interface. Ce
décor n'a pas de raison de changer avec la préférence d'affichage de
l'utilisateur.

### Corollaire

Tout ce qui est rendu **sur** la feuille garde des tons clairs : étiquettes de
table, pastilles d'état (`getTableServiceState`, `getSurfaceState`), halos de
sélection, poignées de déplacement et de redimensionnement. Ces éléments se
lisent sur le fond de la feuille, pas sur le fond de la page — leur ajouter des
variantes `dark:` les rendrait illisibles.

Même raison pour les **vignettes de prévisualisation** (bibliothèque d'objets,
inspecteur, aperçu du configurateur de table) : elles rendent le même mobilier,
donc elles gardent un fond clair pour que l'objet soit lu comme sur le plan.

### Si un jour la feuille doit suivre le thème

Il faut d'abord produire un jeu d'assets sombre (ou passer le mobilier en SVG
tokenisé). Tant que ce n'est pas fait, la décision ci-dessus tient.

## Où vivent les tokens

- `floorPlanSheet.ts` — décor de la feuille (fond, trame, murs, sol, vignettes)
  et facteur d'échelle du décor. Point d'entrée unique : le studio et le plan de
  service partageaient auparavant ces valeurs par copie.
- `floorPlanTones.ts` — `FLOOR_PLAN_TONE_CLASS`, les tons sémantiques **du
  châssis** (succès, alerte, information, erreur…). Fond teinté translucide et
  encre remontée en sombre, suivant le motif déjà employé dans le reste du
  dashboard restaurateur.

## Correspondances appliquées au châssis

| Avant | Après |
| --- | --- |
| `bg-white` | `bg-card` |
| `bg-white/80` (fond de zone) | `bg-background/60` |
| `bg-slate-50`, `bg-slate-100` | `bg-muted` (`bg-muted/50` quand un survol doit rester perceptible) |
| `border-slate-200`, `border-slate-300` | `border-border` (`border-border/70` pour les séparateurs) |
| `border-slate-200/80` | `border-border/70` |
| `text-slate-950`, `text-slate-900`, `text-slate-700` | `text-foreground` |
| `text-slate-600`, `text-slate-500`, `text-slate-400` | `text-muted-foreground` |
| `ring-orange-500`, `ring-slate-300` | `ring-ring` |
| Dégradés `rgba(255,255,255,…)` des dialogues | `bg-background`, `bg-card`, `bg-muted/40` |
| Dégradé clair de la carte « Table recommandée » | `bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),hsl(var(--card)))]` |

### État sélectionné

Les cartes sélectionnées (file de service, timeline, presets du configurateur)
étaient une inversion en dur : `bg-slate-900` + encre blanche. Sur fond sombre,
la carte sélectionnée devenait invisible.

Elles passent sur `bg-primary` / `text-primary-foreground` : l'orange de marque
est identique dans les deux thèmes, la sélection reste donc lisible partout, et
c'est déjà la couleur de sélection utilisée sur le canevas.
