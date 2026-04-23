# Refonte Plan De Salle Structure: studio simplifie et visuel

**Date** : 2026-04-22
**Status** : En revue
**Auteur** : Collaboration utilisateur <-> Codex

## Contexte

Le mode `Structure` de [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx) reste trop proche d'un back-office technique :

1. le canevas perd de la place quand les panneaux sont ouverts
2. la palette de mobilier montre des aperçus trop petits
3. plusieurs éléments visuels et contrôles se superposent ou se compressent
4. la modale de configuration expose trop de réglages d'un coup
5. la logique de paramétrage du mobilier n'est pas assez guidée

La refonte `service-first` a déjà clarifié le mode `service`. Ce document concerne uniquement l'amélioration forte du mode `Structure / Edition`, sans casser le nouveau flux tactile de service.

## Objectifs

1. Faire du mode `Structure` un atelier de composition clair, rapide et très visuel.
2. Garantir que le canevas reste prioritaire et entièrement utilisable quand les panneaux sont ouverts.
3. Augmenter fortement la lisibilité de la palette de mobilier.
4. Simplifier le configurateur de mobilier pour qu'il propose d'abord, puis détaille seulement si nécessaire.
5. Réduire la charge cognitive et supprimer les informations inutiles.
6. Éviter les dispositions incohérentes ou les superpositions absurdes dans les cas standards.

## Hors scope

- refonte du backend Supabase
- changement du schéma de données du plan de salle
- nouveau moteur géométrique complet
- refonte du mode `service`
- nouveau système d'impression
- nouveaux assets 3D ou moteur de rendu custom

## Surface concernée

- page principale :
  - [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx)
- composants directement impactés :
  - [TableConfigDialog.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/TableConfigDialog.tsx)
  - [FloorPlanItemIllustration.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/FloorPlanItemIllustration.tsx)
  - [DynamicTableSvg.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/DynamicTableSvg.tsx)
- logique métier liée :
  - [floorPlan.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/lib/floorPlan.ts)

## Diagnostic

### 1. Shell `Structure` trop dense

Le mode `Structure` conserve une organisation à trois colonnes trop lourde :

- la colonne gauche prend trop de place au regard de son utilité
- l'inspecteur droit expose trop d'informations en permanence
- le canevas hérite d'une largeur minimale fixe trop rigide
- le document global absorbe du scroll qui devrait rester local au viewport du plan

Le résultat visible est un canevas tronqué dès que les blocs sont déployés, surtout sur des largeurs intermédiaires.

### 2. Palette visuellement faible

La bibliothèque actuelle souffre de plusieurs défauts :

- aperçus SVG trop petits
- trop d'espace utilisé par le texte au lieu du visuel
- familles d'objets peu lisibles
- cartes trop uniformes, donc mauvais scanning

### 3. Configurateur trop technique

La modale de configuration des tables expose immédiatement :

- forme
- dimensions
- toutes les zones
- tous les types d'assises
- bancs d'angle
- compteurs et dimensions fines

Ce niveau de détail est disproportionné pour le besoin principal. L'utilisateur veut surtout :

1. choisir une table cohérente
2. voir rapidement le rendu
3. ajuster seulement si nécessaire

### 4. Paramétrage illogique selon les objets

Le même niveau de paramétrage n'est pas pertinent pour tous les mobiliers :

- une table mérite un configurateur intelligent
- une plante, un séparateur ou un poste de service doivent avoir un paramétrage minimal
- les bancs et banquettes doivent proposer des variantes simples plutôt qu'une logique brute de zones partout

## Décision produit retenue

La refonte suit une stratégie `studio workbench simplifie`.

### Principe directeur

Le mode `Structure` doit se comporter comme un atelier de composition :

- le canevas est la pièce maîtresse
- la palette sert à injecter des objets rapidement
- l'inspecteur n'expose que les réglages utiles à l'objet sélectionné
- le configurateur propose une disposition intelligente avant d'exposer des options avancées

### Priorités UX

1. voir la salle
2. ajouter ou déplacer un élément
3. configurer rapidement
4. n'ouvrir les détails avancés qu'en second niveau

## Architecture d'interface retenue

## 1. Shell `Structure`

Le shell du mode `Structure` reste dans [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx), mais avec une hiérarchie revue.

### Composition cible

- `Palette gauche`
  - compacte
  - scroll local
  - visuelle
- `Canevas central`
  - dominant
  - responsive
  - scroll local dans son viewport
- `Inspecteur droit`
  - allégé
  - orienté sélection active

### Règle de layout

Le canevas ne doit plus être la variable d'ajustement sacrifiée.

Quand l'espace manque :

- les panneaux latéraux se compactent d'abord
- leurs largeurs max sont plafonnées
- le viewport du canevas garde son intégrité
- le scroll appartient au viewport du canevas, pas au document principal

## 2. Palette gauche

La palette devient une vraie bibliothèque visuelle.

### Contenu conservé

- recherche
- familles :
  - `Tables`
  - `Assises`
  - `Structure`
  - `Décor`
- cartes de presets
- ajout par tap
- drag and drop si déjà supporté

### Contenu supprimé ou réduit

- longs textes explicatifs
- blocs secondaires trop verbeux
- espace perdu autour des aperçus
- hiérarchie trop plate entre les familles

### Rendu visuel cible

- aperçu SVG dominant dans chaque carte
- nom court
- capacité uniquement si pertinente
- contraste renforcé
- densité équilibrée pour afficher plus d'objets sans rétrécir leur visuel

## 3. Canevas central

Le canevas devient l'espace prioritaire du mode `Structure`.

### Changements requis

- largeur pilotée par l'espace réellement disponible
- suppression du comportement où le canevas est rogné par les panneaux
- viewport avec scroll interne fiable
- barre haute plus compacte

### Barre haute du canevas

Elle ne garde que :

- secteur
- état du mode structure
- zoom
- recentrage
- option secondaire de grille si utile

Les contrôles non essentiels doivent quitter cette zone.

### Comportement visuel

- la salle reste entièrement visible dans son cadre
- les règles graduées et le décor de fond ne doivent pas empiéter sur la lisibilité
- les overlays et poignées doivent rester au-dessus sans collision visuelle

## 4. Inspecteur droit

L'inspecteur devient léger et contextuel.

### Sans sélection

Afficher uniquement :

- un rappel court des actions possibles
- éventuellement un raccourci d'ajout ou d'aide

### Avec sélection

Afficher seulement :

- nom ou label
- type
- dimensions utiles
- secteur
- rotation
- statut actif
- actions :
  - `Configurer`
  - `Dupliquer`
  - `Supprimer`

### Contenu supprimé

- blocs hérités du mode service
- calques détaillés non essentiels au flux de composition
- statistiques de secteur toujours visibles
- textes explicatifs redondants

## 5. Configurateur de mobilier

Le configurateur est refondu autour d'un parcours guidé.

## 5.1 Tables

Les tables utilisent un configurateur intelligent en trois niveaux.

### Niveau 1 : `Base`

Visible par défaut :

- forme
- dimensions principales
- capacité cible
- aperçu central fort

### Niveau 2 : `Disposition`

Le moteur propose automatiquement une disposition cohérente selon :

- forme
- capacité
- type de table

Exemples de propositions par défaut :

- ronde 2 : 2 chaises opposées
- ronde 4 : 4 chaises équilibrées
- rectangle 4 : répartition `2 + 2`
- rectangle 6 : répartition `2 + 2 + 1 + 1`

L'utilisateur choisit d'abord une variante simple avant de toucher aux détails.

### Variantes simples proposées

Selon le cas :

- `Équilibrée`
- `Banquette d'un côté`
- `Banquette deux côtés`
- `Angle`
- `Tabourets`

### Niveau 3 : `Affiner`

Masqué par défaut derrière une action explicite.

Expose seulement si ouvert :

- répartition par zone
- type d'assise par côté
- paramètres fins des bancs
- bancs d'angle

L'objectif est d'éliminer l'exposition immédiate de huit zones et de tous leurs compteurs.

## 5.2 Mobilier non-table

Les objets non-table ont un configurateur minimal, proportionné à leur usage.

### Objets concernés

- `plant`
- `divider`
- `bar`
- `service-station`
- `banquette`
- `booth`
- `host-stand`

### Paramètres autorisés

Seulement selon le besoin :

- taille
- orientation
- variante simple

Pas de logique lourde de zones ou d'assises si elle n'apporte pas de valeur opérationnelle.

## 6. Règles anti-superposition et cohérence

La simplification UI doit s'appuyer sur des garde-fous explicites.

### Règles retenues

- une zone ne peut porter qu'un seul type d'assise
- un banc d'angle réserve son emprise et neutralise les conflits latéraux concernés
- les dimensions minimales sont imposées selon l'objet et la capacité
- les combinaisons incohérentes sont refusées ou auto-corrigées
- l'aperçu du configurateur ne doit jamais afficher une composition invalide

### Politique produit

Quand l'utilisateur demande une configuration incohérente :

- priorité à la correction automatique si le résultat attendu est évident
- sinon blocage clair avec message court

Le produit doit guider, pas seulement signaler l'erreur.

## 7. Modale de configuration

La modale doit rester lisible sur toute la hauteur disponible.

### Contraintes d'ergonomie

- contenu principal scrollable indépendamment
- footer d'action toujours accessible
- aperçu visible en permanence ou au moins fortement priorisé
- aucun bloc utile ne doit être caché sous le fold sans indice

### Règle de densité

- une seule idée forte par bloc
- suppression des textes répétitifs
- labels plus courts
- regroupement par tâches, pas par structure technique interne

## 8. Architecture technique retenue

## 8.1 DashboardPlanSalle

[DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx) doit rester l'orchestrateur, mais le mode `Structure` doit sortir de la composition monolithique actuelle.

Le travail doit extraire des sous-composants dédiés au studio quand cela clarifie réellement les responsabilités :

- palette studio
- shell canevas studio
- inspecteur studio
- configurateur guidé

Le découpage doit rester ciblé pour ne pas relancer une réécriture totale du plan de salle.

## 8.2 Configurateur

[TableConfigDialog.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/TableConfigDialog.tsx) doit être restructuré autour :

- d'états simples de base
- d'une génération automatique des dispositions
- d'un niveau avancé optionnel

La page ne doit plus injecter une logique de paramétrage brute dans une seule grande surface.

## 8.3 Illustrations et aperçu

[FloorPlanItemIllustration.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/FloorPlanItemIllustration.tsx) et [DynamicTableSvg.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/DynamicTableSvg.tsx) doivent supporter :

- des aperçus palette plus grands
- un aperçu configurateur plus lisible
- une cohérence visuelle entre palette, modale et canevas

## 8.4 Logique métier

[floorPlan.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/lib/floorPlan.ts) garde le rôle de moteur de cohérence.

Les évolutions attendues concernent surtout :

- mapping `forme + capacité -> disposition par défaut`
- règles plus claires pour les variantes simples
- garde-fous de compatibilité

Sans réécriture complète du moteur.

## Plan de livraison

### Phase 1 : shell studio

- alléger palette et inspecteur
- rendre le canevas réellement prioritaire
- corriger les largeurs, overflow et scrolls locaux
- augmenter la taille et la lisibilité des presets

### Phase 2 : configurateur guidé

- refondre [TableConfigDialog.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/TableConfigDialog.tsx)
- afficher d'abord `Base` puis `Disposition`
- déplacer les détails complexes derrière `Affiner`
- simplifier le mobilier non-table

### Phase 3 : cohérence visuelle et garde-fous

- harmoniser aperçu palette / modale / canevas
- réduire les collisions visuelles
- durcir les variantes automatiques
- nettoyer les textes et actions résiduelles

## Risques

1. casser le mode `service` récemment refondu
2. créer une divergence entre l'aperçu du configurateur et le rendu réel du canevas
3. compliquer inutilement le moteur au lieu de simplifier l'interface
4. conserver des réglages historiques qui polluent encore l'expérience

## Stratégie de vérification

### Vérification technique

- `npx tsc --noEmit`
- `npx eslint` sur les fichiers modifiés
- `npm run build`

### Vérification manuelle

- mode `Structure` avec palette ouverte
- mode `Structure` avec inspecteur ouvert
- mode `Structure` avec les deux panneaux ouverts
- ajout de plusieurs presets en série
- table ronde 2, 4, 6
- table rectangle 4, 6, 8
- banquette, banc d'angle, séparateur, plante, poste de service
- modale de configuration avec contenu long
- viewport intermédiaire où le canevas était auparavant tronqué

## Critères de succès

Le travail sera considéré réussi si :

1. le canevas ne se fait plus tronquer quand les panneaux sont déployés
2. la palette devient lisible d'un coup d'oeil avec des aperçus nettement plus grands
3. la modale de configuration reste exploitable jusqu'en bas sans perte d'action
4. le configurateur paraît intuitif sans lecture longue ni jargon
5. les cas standards de tables sont configurables en quelques gestes
6. les réglages inutiles ou disproportionnés ont disparu du parcours par défaut
