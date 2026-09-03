# TOK — Système de design

Référence des tokens et primitives introduits par la refonte visuelle. Tout est
déclaré dans `src/index.css` (variables CSS) et exposé en utilitaires Tailwind
dans `tailwind.config.ts`.

## Principes

1. **Chaud plutôt que froid.** Les neutres tirent vers l'ocre (teinte ~24-30°)
   au lieu du gris-bleu. La plateforme vend de la nourriture ; une rampe papier
   / expresso met les photos en valeur là où le slate d'origine les refroidit.
2. **Un token, pas une valeur.** Les couleurs, ombres, durées et courbes
   d'animation passent par des variables. Éviter les `#hex`, `rgba()` et
   `shadow-[0_18px_...]` en dur dans les composants.
3. **Contraste vérifié.** `--primary` est un vermillon profond : blanc sur
   primaire passe de 2,8:1 (échec WCAG AA) à ~4,5:1, et la même valeur sert de
   couleur de texte lisible sur fond clair. L'orange vif du logo reste
   disponible via `--brand`, **pour la décoration uniquement** (halos,
   dégradés, accents) où le contraste n'est pas en jeu.

## Couleurs

| Rôle | Token | Utilitaires |
| --- | --- | --- |
| Fond de page | `--background` | `bg-background` |
| Surfaces empilées | `--surface-sunken` / `--surface` / `--surface-raised` / `--surface-overlay` | `bg-surface-sunken`, `bg-surface-raised`, … |
| Texte | `--foreground`, `--muted-foreground` | `text-foreground`, `text-muted-foreground` |
| Action | `--primary` (+ `--primary-soft`) | `bg-primary`, `bg-primary-soft`, `text-primary-soft-foreground` |
| Identité | `--brand` (+ `--brand-muted`) | `bg-brand`, `bg-brand-gradient` |
| Succès / frais | `--success` (= `--accent`) | `bg-success`, `bg-success-soft` |
| Alerte | `--warning` | `bg-warning`, `bg-warning-soft` |
| Information | `--info` | `bg-info`, `bg-info-soft` |
| Erreur | `--destructive` | `bg-destructive`, `bg-destructive-soft` |
| Traits | `--border`, `--border-strong` | `border-border`, `border-border-strong` |

Chaque rôle sémantique a une variante `-soft` (fond teinté + texte foncé
assorti) pour les badges et encarts : lisible en petite taille sans crier.

`slate-*` est remappé sur la rampe neutre chaude dans `tailwind.config.ts`.
Les ~1200 appels existants restent valides et deviennent cohérents avec les
tokens ; inutile de les réécrire.

### Survols de menus

Dans shadcn, `--accent` désigne « la surface de survol discrète ». Ce projet
l'utilise comme vert de marque : les primitives de menu pointent donc vers
`muted` (`hover:bg-muted`) et `--accent` reste le vert sémantique.

## Élévation

`--shadow-xs` → `--shadow-2xl`, plus `--shadow-brand` (halo orange) et
`--shadow-inset-top` (liseré supérieur). Utilitaires : `shadow-xs`, `shadow-sm`,
`shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, `shadow-brand`,
`shadow-inset-top`, ou les classes `elev-1` … `elev-5`.

Les ombres sont teintées chaud en clair et deviennent profondes + liseré interne
en sombre. Ne pas écrire d'ombre littérale dans un composant.

## Typographie

- `font-sans` : DM Sans — interface.
- `font-display` : Playfair Display — titres éditoriaux.
- Échelle fluide : `text-display-2xl`, `text-display-xl`, `text-display-lg`,
  `text-display-md`, `text-display-sm` (clamp + interlettrage négatif).
- `text-eyebrow` ou la classe `.section-eyebrow` pour les sur-titres.
- `[data-numeric]` applique `tabular-nums` (prix, compteurs, KPI).

## Mouvement

Durées `--duration-fast|base|slow` (`duration-fast`, `duration-base`,
`duration-slow`) et courbes `--ease-out-soft|out-quint|in-out-soft|spring`
(`ease-out-soft`, `ease-spring`, …).

Animations disponibles : `animate-fade-in`, `animate-fade-up`,
`animate-scale-in`, `animate-slide-in-right`, `animate-gradient-pan`,
`animate-pulse-ring`, `animate-float`.

Tout est neutralisé sous `prefers-reduced-motion: reduce`.

## Utilitaires

| Classe | Usage |
| --- | --- |
| `surface`, `surface-raised`, `surface-sunken` | Cartes et panneaux tokenisés |
| `glass`, `glass-strong` | Barres et calques translucides |
| `hover-lift`, `press`, `premium-card` | Micro-interactions |
| `brand-gradient`, `premium-gradient`, `text-gradient` | Dégradés de marque |
| `section-eyebrow`, `rule-soft` | Rythme de section |
| `bg-grid`, `bg-dots`, `mask-fade-b`, `mask-fade-x` | Fonds et fondus |
| `skeleton-shimmer`, `no-scrollbar` | États de chargement, défilement |

## Primitives

- **Button** — variantes `default`, `brand`, `destructive`, `success`,
  `outline`, `secondary`, `soft`, `ghost`, `glass`, `link` ; tailles `sm`,
  `default`, `lg`, `xl`, `icon`, `icon-sm` ; `pill` pour un rayon complet.
- **Card** — variantes `default`, `raised`, `flat`, `sunken`, `glass`,
  `outline` et `interactive` pour un survol cliquable.
- **Badge** — variantes pleines (`default`, `brand`, `success`, `warning`,
  `info`, `destructive`) et tonales (`soft`, `soft-success`, `soft-warning`,
  `soft-info`, `soft-destructive`).
- **Input / Textarea / Select** — hauteur 44 px sur mobile, anneau de focus
  `ring-[3px]` sur `--ring`, état `aria-invalid`.

## Opacités

L'échelle d'opacité couvre 0 → 100 par pas de 1. Tailwind ne fournit que des
pas de 5 : les modificateurs hors échelle (`bg-white/92`, `border-white/12`,
`text-white/72`, …) ne généraient aucune règle et l'élément s'affichait sans
couleur. Une centaine d'appels du dépôt étaient concernés.

## Accessibilité

- Focus clavier unifié : contour 2 px sur `--ring`, décalé de 2 px, appliqué
  globalement dans `src/index.css`.
- `--muted-foreground` respecte AA sur `--background` dans les deux thèmes.
- Les pastilles de note (`RestaurantCard`) utilisent une encre foncée sur fond
  teinté pour les scores moyens ; le blanc sur lime/ambre plafonnait à ~2:1.
