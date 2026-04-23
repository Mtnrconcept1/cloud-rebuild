# Plan d'implémentation Plan De Salle Structure

## Phase 1

- alléger le shell `Structure`
- réduire la largeur des panneaux
- retirer les blocs non essentiels du mode studio
- garantir un viewport canevas scrollable sans troncature

## Phase 2

- refondre la palette visuelle
- agrandir les aperçus SVG
- ajouter une recherche locale
- séparer plus clairement `Tables`, `Assises`, `Structure`, `Décor`

## Phase 3

- refondre `TableConfigDialog`
- introduire `Base`, `Disposition`, `Affiner`
- proposer des variantes automatiques
- garder les réglages fins derrière une section avancée

## Phase 4

- simplifier l'inspecteur studio
- exposer seulement les réglages utiles
- ajouter des contrôles de taille minimaux pour le mobilier non-table

## Vérification

- `npx tsc --noEmit`
- `npx eslint` ciblé
- `npm run build`
