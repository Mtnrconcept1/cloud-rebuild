# Dashboard Performances Dual Surface Design

Date: 2026-04-25
Scope: dashboard restaurateur, ecran `Performances`

## Objectif

Transformer l'ecran `Performances` en un cockpit lisible, utile et actionnable, avec deux surfaces clairement separees:

- `Pilotage du jour`: aider le restaurateur a operer maintenant
- `Analyse business`: aider le restaurateur a comprendre sa trajectoire sur une periode

L'ecran ne doit plus ressembler a une longue page de KPI homogenes. Il doit presenter une hierarchie de lecture claire, avec moins de repetition et plus de signaux directement exploitables.

## Probleme Actuel

L'ecran actuel agrège beaucoup de bonnes donnees, mais la comprehension est faible:

- les cartes KPI ont toutes le meme poids
- il n'y a pas de separation nette entre `agir maintenant` et `analyser la periode`
- les graphes, remises, lecture comptable et factures cohabitent sans priorite forte
- les elements vraiment operationnels ne ressortent pas assez
- le restaurateur doit lire l'ecran au lieu de le scanner

## Approche Retenue

Approche retenue: `cockpit double surface`

- conserver les calculs et les sources de donnees actuels
- refondre la composition UI en deux onglets distincts
- introduire une hierarchie forte:
  - orientation
  - resume prioritaire
  - blocs secondaires
  - detail et contexte
- sortir les `factures recentes` du coeur de l'ecran `Performances`
  - elles deviennent un bloc de contexte ou un raccourci, pas une section dominante

Cette approche ameliore radicalement la comprehension sans relancer un chantier metier lourd.

## Structure Cible

### 1. Header commun

Le haut de page reste commun aux deux onglets.

Contenu:

- titre `Performances`
- badge restaurant selectionne
- rappel de periode selectionnee
- selecteur de periode `7 / 30 / 90 jours`
- tabs:
  - `Pilotage du jour`
  - `Analyse business`

Regles:

- le header doit rester compact
- la periode reste visible en permanence
- les tabs doivent etre tactiles, lisibles, et visibles immediatement

### 2. Onglet Pilotage Du Jour

But: donner au restaurateur un ecran d'exploitation journalier.

#### 2.1 Resume prioritaire

Premier rang de cartes a forte priorite:

- `CA du jour`
- `Commandes valides`
- `Reservations du jour`
- `Annulations`
- `Ticket moyen`
- `Satisfaction`

Regles:

- valeurs du jour uniquement
- formulation simple
- couleurs de statut reservees aux vrais signaux

#### 2.2 Bloc A Surveiller

Bloc editorial compact, plus important que les graphes.

Contenu:

- alertes operationnelles derivees des donnees du jour
- exemples:
  - annulations au-dessus du rythme habituel
  - satisfaction insuffisante
  - panier moyen faible
  - creux de reservations sur un service
  - baisse nette de commandes valides

Regles:

- maximum 3 alertes visibles
- si rien d'important, afficher `Rien d'anormal aujourd'hui`
- ton utilitaire, pas marketing

#### 2.3 Bloc Services

Comparaison `midi` / `soir`

Contenu:

- reservations
- couverts
- revenu associe quand disponible
- service dominant
- service le plus faible

Regles:

- lecture comparative
- pas de tableau complexe
- composants simples avec contrastes clairs

#### 2.4 Bloc Activite Du Jour

Bloc court de contexte temps reel.

Contenu:

- dernieres commandes utiles
- dernieres reservations utiles
- etat court

Regles:

- ne pas dupliquer les pages `Commandes` ou `Reservations`
- montrer juste assez pour orienter le clic suivant

#### 2.5 Bloc Raccourcis

Actions contextuelles:

- `Voir les commandes`
- `Voir les reservations`
- `Voir la compta`
- `Voir les campagnes`

But:

- transformer les constats en navigation claire

### 3. Onglet Analyse Business

But: comprendre la performance d'une periode choisie.

#### 3.1 Resume periode

Cartes principales:

- `CA net`
- `CA brut`
- `Commandes valides`
- `Panier moyen`
- `Reservations`
- `Satisfaction`

Regles:

- ne pas re-afficher les memes chiffres du `jour`
- lecture plus business, moins operationnelle

#### 3.2 Tendances

Zone analytique principale.

Contenu:

- evolution du CA
- evolution des commandes
- evolution du panier moyen

Regles:

- 1 graphe principal fort
- 1 ou 2 graphes secondaires maximum
- priorite a la lisibilite, pas a l'empilement

#### 3.3 Leviers Commerciaux

Bloc dedie aux remises et mecanismes qui influencent la marge.

Contenu:

- remises `formule`
- remises `promotion`
- remises `fidelite`
- remises `flex`
- total remises

Regles:

- lecture immediate du poids des remises
- afficher les montants, pas un discours

#### 3.4 Mix D Activite

Bloc de structure business.

Contenu:

- poids `midi` / `soir`
- reservations et couverts
- repartition des flux

But:

- comprendre ou se concentre la demande

#### 3.5 Lecture Comptable

Bloc explicatif court.

Contenu:

- CA net
- CA brut estime
- ticket comptable
- rappel de la logique de calcul

Regles:

- pas de jargon excessif
- pas d'invasion du domaine `Factures`

#### 3.6 Ce Que Ca Raconte

Bloc insight compact.

Contenu:

- 2 ou 3 constats derives des donnees visibles
- exemples:
  - `Le soir concentre 68% des couverts`
  - `Le panier moyen est superieur de 14% au debut de periode`
  - `Les promotions representent la majeure partie des remises`

Regles:

- insights simples
- zero texte generique
- si la donnee n'est pas robuste, ne pas inventer d'analyse

## Donnees Et Calculs

Le chantier doit reposer au maximum sur le socle existant de `dashboardPerformance.ts`.

Reutilisation directe:

- `buildPerformanceSummary`
- `getPerformancePeriodBounds`
- aggregation commandes / reservations / reviews
- remises
- breakdown `midi` / `soir`

Extensions necessaires:

- derivees `jour` a partir de la meme matiere premiere
- derivees `alertes`
- derivees `insights`

Principe:

- une seule couche de calcul metier partagee
- la page ne doit pas recalculer inline des choses complexes

## Composants Recommandes

Refactorisation recommandee:

- `DashboardPerformances.tsx`
  - shell de page
  - periode
  - tabs
  - orchestration

- `PerformanceTodayTab.tsx`
  - pilotage du jour

- `PerformanceBusinessTab.tsx`
  - analyse business

- `PerformanceHeroStats.tsx`
  - resume principal reutilisable

- `PerformanceAlerts.tsx`
  - bloc `A surveiller`

- `PerformanceServiceSplit.tsx`
  - midi / soir

- `PerformanceInsights.tsx`
  - constats derives

Les helpers de calcul restent dans `dashboardPerformance.ts` ou un fichier voisin dedie si necessaire.

## Etats Vides Et Erreurs

### Etats vides

Si aucune activite:

- onglet `Pilotage du jour`: message simple `Aucune activite aujourd'hui`
- onglet `Analyse business`: message simple `Aucune donnee sur cette periode`

### Etats de chargement

- skeletons compacts
- pas d'ecran vide brutal

### Etats d'erreur

- message unique et lisible
- pas de repetition de plusieurs erreurs techniques sur toute la page

## UX Et Direction Visuelle

Direction:

- app UI sobre, claire, plus premium
- moins de murs de cartes
- plus de groupements visuels
- un bloc dominant par onglet
- contrastes moderes, accent reserve aux signaux

Regles:

- pas de hero marketing
- pas de surcharge de badges
- pas de duplication entre les deux onglets
- lecture possible en 5 secondes

## Tests Et Verification

Verification attendue:

- typecheck
- lint
- build
- verification manuelle des deux onglets

Points de controle:

- periode `7 / 30 / 90 jours`
- changement de restaurant
- ecran sans activite
- ecran avec donnees completes
- coherence entre cartes, graphes, remises et insights

## Risques

- trop de logique inline dans la page si on ne sort pas les derivees
- duplication entre `jour` et `periode`
- surinterpretation des insights si les regles sont trop ambitieuses

Mitigation:

- helpers clairs
- composants dedies
- insights limites et derives de chiffres deja affiches

## Hors Scope

- refonte des pages `Commandes`, `Reservations`, `Factures`
- nouveaux indicateurs metier lourds cote base
- systeme IA complet d'analyse narrative

## Resultat Attendu

Apres refonte, `Performances` doit devenir:

- un ecran `Piloter aujourd'hui`
- un ecran `Comprendre la trajectoire`

Et non plus une simple accumulation de KPI, graphes et factures sur une meme page.
