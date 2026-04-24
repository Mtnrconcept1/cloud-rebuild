# Refonte Plan De Salle Studio: mobilier, labels et resize

**Date** : 2026-04-23
**Status** : En revue
**Auteur** : Collaboration utilisateur <-> Codex

## Contexte

Le mode `Structure` du plan de salle a deja ete simplifie, mais trois problemes produit restent majeurs :

1. le mobilier n'est pas assez facile a redimensionner sur le canevas
2. le canevas reste trop verbeux avec des labels inutiles sur des objets non-table
3. le rendu du mobilier manque de presence et de lisibilite

Le besoin utilisateur est clair :

- pouvoir redimensionner tout le mobilier de maniere intuitive
- n'afficher sur le plan que le numero des tables
- renforcer fortement la qualite visuelle du mobilier

Cette iteration concerne uniquement la surface `studio / structure` du plan de salle, pas le mode `service`.

## Objectifs

1. Permettre le redimensionnement de tout le mobilier depuis le canevas.
2. Rendre ce redimensionnement evident, saisissable et coherent selon le type d'objet.
3. Supprimer le bruit textuel du canevas.
4. Afficher uniquement le numero de table sur les objets reservables.
5. Refaire le langage visuel du mobilier pour qu'il soit lisible a petite et moyenne taille.
6. Garder une interface de studio simple, sans exposer plus d'informations que necessaire.

## Hors scope

- refonte du backend ou du schema Supabase
- changement du mode `service`
- nouveau moteur 3D
- edition libre des SVG depuis l'UI
- systeme avance de contraintes entre objets

## Surface concernee

- page principale :
  - [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx)
- canevas studio :
  - [StudioCanvas.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/StudioCanvas.tsx)
- inspecteur studio :
  - [StudioInspector.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/StudioInspector.tsx)
- rendu du mobilier :
  - [FloorPlanItemIllustration.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/FloorPlanItemIllustration.tsx)
  - [DynamicTableSvg.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/DynamicTableSvg.tsx)
- logique de support :
  - [studioShared.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/studioShared.ts)
  - [floorPlan.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/lib/floorPlan.ts)

## Diagnostic

### 1. Resize present mais trop faible en usage reel

Le studio possede deja une logique de resize, mais l'experience reste insuffisante :

- la poignee est trop discrete
- la lecture visuelle ne montre pas clairement qu'un objet entier est redimensionnable
- les objets non-table ne donnent pas une impression de manipulation robuste
- l'UX actuelle est orientee "table" plus que "mobilier"

Le resultat est une fonctionnalite techniquement la, mais peu evidente pour un exploitant.

### 2. Labels du canevas trop bavards

Le canevas affiche aujourd'hui des informations qui nuisent a la lecture spatiale :

- badge du numero de table
- badge de capacite ou de type
- noms implicites de mobilier
- overlays secondaires trop presents

Sur une surface de composition, ces labels prennent la place de la forme elle-meme.

### 3. Mobilier encore trop faible visuellement

Le mobilier actuel est dessine dans un style top-down propre, mais trop fin pour l'usage :

- masses trop legeres
- details trop petits
- silhouettes pas assez distinctes entre certains types
- presence insuffisante dans la palette et sur le canevas

Le mobilier doit rester lisible en un coup d'oeil, meme quand l'objet occupe une petite empreinte.

## Decision produit retenue

La refonte suit une approche `resize guide + canevas epure + mobilier architectural renforce`.

### Principes directeurs

- tous les objets du studio doivent pouvoir etre redimensionnes
- le resize n'est pas totalement libre : il reste guide selon la logique du type d'objet
- seul le numero de table apparait sur le plan
- le reste de l'information vit dans l'inspecteur
- le mobilier doit privilegier les masses, le contraste utile et la reconnaissance immediate

## Regles de resize retenues

## 1. Regle generale

Tout objet pose sur le canevas doit exposer une vraie capacite de resize.

### UX commune

- un objet selectionne montre une poignee de resize plus grande et plus visible
- la zone de manipulation doit etre facile a saisir sur desktop et tablette
- le contour selectionne doit clarifier la boite englobante reelle de l'objet
- le drag, la rotation et le resize doivent rester separes visuellement

### Garde-fous communs

- taille minimale pour conserver une silhouette lisible
- pas de reduction au point de faire disparaitre la forme
- pas d'etirement qui rendrait certains objets absurdes

## 2. Regles par famille

### Tables

- resize libre largeur + profondeur
- comportement pleinement bi-dimensionnel
- minimum fonde sur l'emprise resolue et les assises

### Bar

- largeur libre
- profondeur ajustable
- minimum plus genereux qu'une table pour conserver l'identite de comptoir

### Banquette

- longueur prioritaire
- profondeur resserree avec bornes plus strictes
- pas d'etirement qui la transforme en bloc generic

### Divider

- longueur libre
- epaisseur fortement contrainte
- orientation conservee comme ligne architecturale, pas comme meuble massif

### Booth

- largeur et profondeur ajustables
- ratio partiellement protege pour garder l'idee de box

### Host stand et service station

- resize libre avec bornes propres
- le volume garde une silhouette credible

### Plant

- resize quasi uniforme
- ratio verrouille ou tres proche du verrouillage

### Chair et stool

- taille ajustable
- ratio verrouille

## Regles d'affichage du canevas

## 1. Tables

Les tables sont les seuls objets autorises a porter un label visible sur le plan.

### Rendu retenu

- afficher uniquement `table_number`
- pas de capacite affichee sur l'objet
- pas de type affiche
- badge compact, lisible et discret

## 2. Mobilier non-table

Le mobilier non reservable ne doit afficher aucun texte sur le canevas.

### Implications

- pas de nom d'objet
- pas de type
- pas de badge secondaire
- pas de capacite

L'information reste disponible dans l'inspecteur et la palette, mais sort de la surface de travail.

## 3. Selection

La selection reste visible, mais plus propre :

- halo plus net
- contour plus clair
- poignee de drag plus lisible
- poignee de resize plus grande
- pas de multiplication de badges autour de l'objet

## Langage visuel du mobilier

## 1. Direction artistique

Le mobilier adopte un style top-down plus premium et plus architectural.

### Qualites recherchees

- silhouettes fortes
- surfaces plus pleines
- details moins nombreux mais mieux choisis
- meilleurs contrastes entre plateau, assise, structure et decor
- reconnaissance immediate par type

### Ce qu'il faut eviter

- micro-details invisibles
- rendu "schema technique fin"
- surcharge decoratrice
- icones trop generiques

## 2. Tables

Les tables doivent devenir les objets visuellement les plus lisibles du plan.

### Rendu cible

- plateau mieux defini
- assises plus presentes
- distinction claire entre ronde et rectangulaire
- lecture immediate du nombre et de la nature des assises

Le rendu de [DynamicTableSvg.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/DynamicTableSvg.tsx) doit etre renforce avant d'ajouter tout nouveau detail.

## 3. Mobilier non-table

Chaque type doit posseder une silhouette distincte.

### Exemples de clarte attendue

- `bar` : vrai comptoir, lecture lineaire forte
- `banquette` : bande assise lisible, pas simple rectangle
- `booth` : volume enveloppant reconnaissable
- `divider` : element leger et directionnel
- `plant` : masse organique claire
- `service-station` : meuble fonctionnel compact

## Impact UI retenu

## 1. Canevas studio

Le canevas reste la surface prioritaire.

### Simplifications

- suppression des badges de type/capacite sur les objets
- overlays plus sobres
- meilleure lisibilite des controles d'objet

## 2. Inspecteur studio

L'inspecteur garde les informations qui ne doivent plus vivre sur le canevas.

### Contenu attendu

- nom ou numero editable
- type
- secteur
- taille
- rotation
- visibilite
- actions de duplication et suppression

### Regle de copy

Le contenu doit rester utilitaire et court.

## 3. Palette studio

La palette doit beneficier du nouveau langage visuel du mobilier.

### Changements attendus

- apercus plus impactants
- meilleure distinction entre les familles
- meilleure lisibilite a petite taille

## Strategie d'implementation

## 1. Donnees et logique

- introduire une notion de comportement de resize par type d'objet
- centraliser les contraintes minimales utiles
- distinguer clairement `table` et `non-table` dans le rendu des labels

## 2. Canevas

- refaire la couche de label
- agrandir et clarifier les poignets de manipulation
- s'assurer que tout objet selectionnable est effectivement redimensionnable

## 3. Illustrations

- renforcer d'abord le composant de rendu dynamique des tables
- refaire ensuite les silhouettes non-table dans un meme langage visuel
- verifier palette + canevas, pas seulement un des deux

## 4. Verification

- verifier le resize pour chaque grande famille de mobilier
- verifier que seuls les numeros de tables s'affichent
- verifier que le mobilier reste lisible dans la palette et sur le canevas
- valider `tsc`, `eslint` et build

## Risques

1. rendre certains types trop rigides en voulant trop proteger leurs proportions
2. casser le drag ou la rotation en retouchant les controles de selection
3. ameliorer la palette mais pas le canevas, ou l'inverse
4. conserver des labels parasites dans des cas non-table

## Decision finale

Cette iteration ne doit pas etre un patch cosmetique.

Le resultat attendu est un studio ou :

- tout le mobilier est redimensionnable
- le canevas reste propre et lisible
- seules les tables portent un numero visible
- le mobilier a enfin une presence visuelle nette et credible
