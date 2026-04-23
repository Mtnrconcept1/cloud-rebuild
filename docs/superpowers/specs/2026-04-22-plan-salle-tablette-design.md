# Refonte Plan De Table Tablette: service-first

**Date** : 2026-04-22
**Status** : En revue
**Auteur** : Collaboration utilisateur <-> Codex

## Contexte

Le plan de table actuel est concentre dans [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx), un ecran de pres de 4000 lignes qui melange :

1. exploitation du service en direct
2. edition de la structure de salle
3. bibliotheque de mobilier
4. assistant IA de disposition
5. inspection detaillee de reservation
6. impression

Ce melange penalise surtout l'usage principal du produit, qui se fait sur tablette en salle. L'ecran reste puissant, mais il est trop dense, trop proche d'un back-office desktop et ne privilegie pas assez les gestes immediats de service.

L'objectif n'est pas de reecrire tout le metier de reservation. L'objectif est de transformer le plan de table en outil de service tactile, lisible et rapide, tout en gardant un mode studio pour la configuration structurelle.

## Objectifs

1. Faire du mode `service` la vue par defaut sur tablette.
2. Permettre le placement ou deplacement d'une reservation en 1-2 gestes.
3. Rendre l'etat de la salle lisible en moins de 3 secondes.
4. Reduire fortement la charge visuelle en mode service.
5. Isoler l'edition structurelle dans un mode `studio` distinct sans changer de route.
6. Decouper techniquement l'ecran monolithique en sous-composants clairs.

## Hors scope

- refonte du schema Supabase
- nouveau moteur de reservation
- changement des regles de compatibilite metier reservation/table
- nouvelle logique de paiement ou de facturation
- synchronisation temps reel serveur additionnelle
- refonte complete de l'impression
- suppression de l'assistant IA

## Surface concernee

- route : `/dashboard/plan-salle`
- page principale :
  - [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx)
- composants existants relies :
  - [TableConfigDialog.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/TableConfigDialog.tsx)
  - [FloorPlanAIPanel.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/FloorPlanAIPanel.tsx)
  - [DynamicTableSvg.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/DynamicTableSvg.tsx)

## Probleme produit

Aujourd'hui, la page traite la tablette comme un desktop compresse :

- trop de commandes visibles en meme temps
- trop de panneaux persistants
- trop d'informations detaillees avant l'action
- pas assez de priorite donnee au plan lui-meme
- edition structurelle et exploitation live constamment entremelées

Le cout concret est operationnel :

- plus de temps pour placer une reservation
- plus de risque de rater une table libre ou un conflit
- plus de fatigue visuelle en service
- code difficile a stabiliser et a faire evoluer

## Decision produit retenue

La refonte suit une strategie `service-first tablette`.

### Principe directeur

Le plan de table n'est plus pense comme un studio generaliste qui sait aussi faire du service. Il devient d'abord un outil de service live, avec un mode studio secondaire.

### Modes

- `service`
  - mode par defaut
  - priorite absolue a la lecture de salle, au placement et aux actions rapides

- `studio`
  - mode de configuration
  - regroupe bibliotheque, structure, mobilier, IA et parametrage avance

Les deux modes restent dans la meme route pour preserver la continuite fonctionnelle et les donnees chargees, mais leur interface doit etre clairement differenciee.

## Experience cible

## 1. Mode service

Le mode service devient la surface principale pour tablette.

### Hierarchie visuelle

- en haut : un bandeau compact avec salle, date, service, filtres essentiels, statut global
- au centre : le plan de salle, plein canvas, dominant
- en bas ou dans un tiroir lateral selon largeur : la file de reservations simplifiee
- en overlay contextuel : un drawer d'action pour la table ou la reservation selectionnee

### Actions prioritaires

Les deux flux les plus rapides doivent etre :

1. choisir une reservation puis toucher une table compatible
2. choisir une table puis toucher une reservation compatible

L'utilisateur ne doit pas avoir besoin d'ouvrir un inspecteur detaille pour faire une affectation standard.

### Regles d'interface

- les controles d'edition structurelle ne sont pas visibles au premier niveau
- les zones tactiles sont larges et adaptees a un doigt
- les labels utiles sont visibles sans zoom fonctionnel obligatoire
- un seul niveau de detail est ouvert a la fois
- l'action principale doit etre evidente en permanence

## 2. Representation des tables

Chaque table ou element visible dans le plan doit repondre a une lecture tres rapide.

### Informations affichees sur la table

En mode service, une table affiche au maximum :

- son nom ou numero
- son etat principal
- la reservation principale si presente

Les metadonnees secondaires restent dans le drawer contextuel.

### Etats visuels normalises

- `libre`
  - vert doux
  - aucune reservation active ou imminente

- `arrivee proche`
  - ambre
  - reservation proche de l'heure de service ou en attente immediate

- `occupee / placee`
  - bleu dense
  - reservation deja affectee et table active

- `conflit`
  - rouge
  - surcharge, incompatibilite ou chevauchement detecte

- `hors service / non reservable`
  - gris
  - mobilier structurel ou table desactivee

Cette grammaire doit etre unique dans tout le mode service.

## 3. File de reservations

La file de reservations doit cesser d'etre une carte riche de back-office. Elle devient une pile tactile orientee placement.

### Contenu minimal

- nom client
- heure
- taille du groupe
- statut
- table assignee ou mention `Sans table`
- badges utiles :
  - `Zero Attente`
  - note client si necessaire
  - indication paiement si vraiment utile en service

### Comportement

- toucher une reservation la selectionne
- une reservation selectionnee met en valeur les tables compatibles
- glisser-deposer peut rester disponible, mais le flux de base ne doit pas en dependre
- les reservations sans table sont regroupees et mises en avant

## 4. Drawer contextuel

Le panneau inspecteur permanent actuel est remplace par un drawer contextuel en mode service.

### Quand il s'ouvre

- selection d'une table
- selection d'une reservation
- affectation en cours necessitant confirmation

### Pour une table

Le drawer table doit proposer en priorite :

- affecter une reservation compatible
- deplacer une reservation
- liberer la table
- marquer hors service / reactiver
- voir les reservations associees

### Pour une reservation

Le drawer reservation doit proposer :

- affecter a une table compatible
- retirer de la table
- voir client, note, taille, heure
- voir les details de paiement et les items seulement dans un niveau secondaire ou un bloc compact

## 5. Mode studio

Le mode studio conserve la richesse de configuration, mais hors du flux de service.

### Contenu

- bibliotheque de presets
- structure et secteurs
- ajout / suppression / duplication d'elements
- configuration fine des assises
- assistant IA
- edition durable du template

### Regles

- l'interface studio peut rester plus dense
- le mode studio ne doit pas polluer le mode service
- les actions studio modifient la structure, alors que le mode service modifie le placement du jour

## Architecture technique retenue

La refonte reste dans la route actuelle, mais decoupe fortement l'implementation.

## 1. Shell principal

[DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx) doit devenir un orchestrateur leger.

Il garde :

- chargement des donnees
- choix du mode `service | studio`
- etat global partage
- ouverture/fermeture des drawers et sheets

Il ne doit plus porter tout le rendu detaille des panneaux et des interactions.

## 2. Sous-composants cibles

### `PlanSalleShell`

Responsabilites :

- header global
- filtres essentiels
- mode actif
- statut global de sauvegarde
- responsive desktop / tablette

### `ServiceBoard`

Responsabilites :

- plan central
- rendu tactile des tables
- surbrillance des compatibilites
- actions rapides de salle
- raccourcis de zoom minimaux

### `ReservationQueue`

Responsabilites :

- liste simplifiee des reservations
- selection tactile
- file `Sans table`
- regroupements utiles au service

### `TableContextDrawer`

Responsabilites :

- afficher le contexte de la table ou reservation selectionnee
- exposer les actions prioritaires
- concentrer les details utiles sans recreer un inspecteur massif

### `PlanStudio`

Responsabilites :

- bibliotheque
- structure
- decoration
- IA
- edition durable du template

## 3. Helpers metier a extraire

La page actuelle contient beaucoup de derivees metier implicites. Elles doivent sortir dans des helpers purs pour reduire le risque de regression.

### Helpers a isoler

- calcul de l'etat visuel d'une table
- compatibilite reservation/table
- resume d'occupation
- regroupement des reservations
- derivees de selection active
- detection de conflits

Ces helpers doivent vivre dans un module dedie du type :

- `src/lib/floorPlanService.ts`
- ou plusieurs fichiers locaux selon les responsabilites

## 4. Etat et flux

### Etat global a conserver dans le shell

- restaurant et branche selectionnes
- date et filtre de service
- mode actif
- table selectionnee
- reservation selectionnee
- assignments du jour
- etat de sauvegarde

### Etat local a descendre

- drawer ouvert / ferme
- interactions UI temporaires
- mode compact / expanded de certaines listes
- scrolling et affordances purement visuelles

Le but est de sortir les micro-etats de presentation du composant page.

## Strategie responsive

La refonte optimise explicitement l'usage `pointer coarse` et largeur tablette.

### Tablette

- service comme vue dominante
- file de reservations accessible directement
- drawer contextuel plein confort tactile
- controles secondaires compresses ou relegues

### Desktop

- meme architecture
- possibilite de garder plus de surfaces simultanees
- mode studio plus confortable

Le desktop reste supporte, mais il ne dicte plus l'architecture.

## Donnees et backend

Le chantier ne change pas les sources de donnees principales au debut.

### Reutilisation des queries existantes

- `restaurant_branches`
- `reservation_tables`
- `reservation_table_layout_overrides`
- `reservations`
- `reservation_slots`

### Raison

Le gain attendu vient surtout de la presentation, de la hiérarchie d'action et du decoupage du code. Refaire le backend en parallele augmenterait le risque sans benefice immediat proportionnel.

## Parcours critiques

## 1. Affecter une reservation

1. l'utilisateur touche une reservation
2. le plan met en avant les tables compatibles
3. l'utilisateur touche une table
4. l'affectation est appliquee
5. le statut visuel du plan se met a jour immediatement

## 2. Liberer une table

1. l'utilisateur touche une table occupee
2. le drawer s'ouvre
3. l'utilisateur choisit `Liberer`
4. les reservations associees et l'etat de table sont mis a jour

## 3. Passer en studio

1. l'utilisateur bascule en mode `Structure`
2. les panneaux de bibliotheque et de configuration redeviennent visibles
3. l'utilisateur modifie le template
4. l'enregistrement agit sur la structure durable

## Fichiers cibles

### Refonte prioritaire

- [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx)

### Nouveaux composants probables

- `src/components/floor-plan/PlanSalleShell.tsx`
- `src/components/floor-plan/ServiceBoard.tsx`
- `src/components/floor-plan/ReservationQueue.tsx`
- `src/components/floor-plan/TableContextDrawer.tsx`
- `src/components/floor-plan/PlanStudio.tsx`

### Composants existants a reutiliser ou adapter

- [TableConfigDialog.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/TableConfigDialog.tsx)
- [FloorPlanAIPanel.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/FloorPlanAIPanel.tsx)
- [DynamicTableSvg.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/components/floor-plan/DynamicTableSvg.tsx)

## Sequence d'implementation recommandee

## Phase 1. Extraire le socle service

- sortir les derivees metier de la page
- introduire un shell plus fin
- preparer les composants `ServiceBoard` et `ReservationQueue`

## Phase 2. Livrer le mode service tablette

- centrer l'ecran sur le plan
- simplifier la file de reservations
- ajouter le drawer contextuel
- retirer l'inspecteur permanent du mode service

## Phase 3. Replier l'edition dans le studio

- isoler la bibliotheque
- isoler les actions structurelles
- conserver l'IA et le configurateur dans ce mode

## Phase 4. Nettoyage

- supprimer la duplication restante
- verifier la coherences des actions
- reduire le fichier page a un vrai role d'orchestration

## Verification

### Manuel

1. ouvrir `/dashboard/plan-salle` sur tablette
2. verifier que le mode par defaut met le plan au centre
3. verifier qu'une reservation peut etre affectee en selectionnant reservation puis table
4. verifier qu'une table peut etre ouverte et liberee via le drawer
5. verifier que les tables compatibles sont mises en evidence
6. verifier que les reservations sans table restent visibles et prioritaires
7. verifier que le passage en mode studio affiche les outils d'edition sans polluer le mode service
8. verifier que le template et le plan du jour restent bien distingues
9. verifier que l'impression reste accessible
10. verifier que l'IA reste disponible uniquement dans le contexte studio retenu

### Regressions a surveiller

- affectation reservation/table incorrecte
- perte de separation entre `template` et `plan du jour`
- drawer qui remplace mal l'inspecteur et cache des actions critiques
- baisse de fluidite tactile a cause de rerenders excessifs
- conflits de selection entre reservation active et table active

## Risques

## Risque principal

La complexite actuelle est surtout dans la page monolithique. Le risque n'est pas tant visuel que structurel : deplacer l'UI sans sortir les derivees metier maintiendrait une dette forte.

## Risques secondaires

1. refonte visuelle sans vraie simplification de parcours
2. extraction trop faible, laissant [DashboardPlanSalle.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardPlanSalle.tsx) encore centrale
3. confusion pour les utilisateurs si les frontieres `service` / `studio` ne sont pas assez nettes

## Reponses retenues

- service prioritaire et minimal
- studio secondaire et explicite
- extraction de composants par responsabilite
- conservation du backend et des queries tant que le produit ne l'exige pas

## Recommendation finale

La bonne implementation est une refonte `service-first tablette` sur la meme route, avec un shell leger et deux experiences distinctes :

- une experience `service` rapide, tactile, lisible
- une experience `studio` plus dense mais isolee

Cette option donne le meilleur ratio impact/risque :

- gain immediat pour l'usage principal en salle
- dette technique reduite
- migration progressive possible
- pas de rearchitecture backend prematuree
