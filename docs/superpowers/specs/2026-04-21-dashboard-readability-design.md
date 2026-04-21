# Lisibilite dashboard: factures, reservations et commandes

**Date** : 2026-04-21
**Status** : Approuve
**Auteur** : Collaboration utilisateur <-> Codex

## Contexte

Les ecrans dashboard et admin affichent aujourd'hui toutes les factures dans les vues principales, et les listes de reservations / commandes restent longues a parcourir quand plusieurs jours sont visibles.

Deux problemes concrets en resultent :

1. Les factures deja reglees encombrent les vues d'action.
2. Les reservations et commandes manquent de separation claire par jour, ce qui ralentit la lecture operationnelle.

L'objectif est de rendre les ecrans directement actionnables, sans changer les regles metier existantes ni les sources de donnees.

## Objectifs

1. Afficher par defaut uniquement les factures encore a traiter.
2. Deplacer les factures payees dans un onglet dedie `Historique des factures`.
3. Regrouper reservations et commandes par jour avec une separation visuelle nette.
4. Ouvrir automatiquement le jour courant au chargement.
5. Garantir qu'un seul jour soit developpe a la fois.
6. Appliquer ces principes aux vues restaurateur et admin concernees.

## Hors scope

- Changement des regles de facturation
- Refonte backend ou migration de donnees
- Nouveaux statuts metier pour commandes, reservations ou factures
- Pagination / infinite scroll / optimisation serveur

## Ecrans concernes

### Restaurateur

- `src/pages/dashboard/DashboardFactures.tsx`
- `src/pages/dashboard/DashboardReservations.tsx`
- `src/pages/dashboard/DashboardCommandes.tsx`

### Admin

- `src/pages/admin/AdminCompta.tsx`

## Design retenu

### 1. Factures

Les ecrans de facturation seront organises en deux niveaux de lecture :

1. Une vue principale `A traiter`
2. Une vue secondaire `Historique des factures`

#### Regles d'affichage

- `A traiter` contient uniquement les factures dont le statut n'est pas `paid`
- `Historique des factures` contient uniquement les factures `paid`
- Les actions de traitement (`Marquer payee`, ouverture PDF, apercu) restent disponibles dans le meme contexte fonctionnel qu'aujourd'hui

#### Restaurateur

Dans `DashboardFactures.tsx`, cette separation s'applique aux deux familles deja presentes :

- factures emises par le restaurateur a TOK (`invoice_type = payout`)
- factures emises par TOK au restaurateur (`invoice_type = reservation_fees`)

La vue par defaut doit mettre en avant les montants restant a regler et ne plus melanger les factures deja soldees avec celles en attente.

#### Admin

Dans `AdminCompta.tsx`, la meme logique s'applique aux tableaux de :

- reversements restaurateurs
- factures TOK de frais de reservation

Le contenu `paid` ne disparait pas, mais passe dans un onglet d'historique pour alleger la vue principale.

### 2. Reservations

Les reservations seront regroupees par jour dans un accordion exclusif.

#### Regles d'ouverture

- Au chargement, le jour courant est developpe automatiquement
- Si aucun groupe ne correspond au jour courant, le premier jour visible est developpe
- Quand l'utilisateur ouvre un jour, les autres se ferment
- L'etat ouvert suit les filtres actifs : si le jour ouvert disparait apres filtrage, on recalcule un jour ouvert valide

#### Presentation

- Chaque jour devient un bloc visuellement distinct avec son resume :
  - date lisible
  - nombre de reservations
  - nombre total de couverts
- Le contenu detaille d'un jour n'est rendu que lorsqu'il est ouvert
- A l'interieur d'un jour, le regroupement par heure deja existant est conserve

#### Portee

- `DashboardReservations.tsx`
- section `Reservations` de `AdminCompta.tsx`

### 3. Commandes

Les commandes adopteront exactement la meme logique de jour developpable.

#### Regles d'ouverture

- Jour courant ouvert par defaut
- Un seul jour ouvert a la fois
- Si le jour courant n'existe pas dans les donnees visibles, ouverture du premier jour

#### Presentation

- Chaque jour affiche un resume :
  - nombre de commandes
  - chiffre d'affaires visible du jour si pertinent
- Le detail complet des cartes commandes reste identique a l'interieur du jour ouvert
- Le comportement ne modifie ni les actions de changement de statut ni les cartes de details

#### Portee

- `DashboardCommandes.tsx`
- section `Toutes les transactions` / historique commandes de `AdminCompta.tsx` lorsque le regroupement par date est affiche

## Architecture UI

Le changement doit rester une refactor UI locale, sans changement de schema ni RPC.

### Helpers / composants recommandes

#### `splitInvoicesByPaymentState`

Helper pur qui separe une liste de factures en :

- `pendingInvoices`
- `paidInvoices`

Il doit etre reutilisable par la vue restaurateur et la vue admin.

#### `DayAccordion` ou equivalent

Composant ou logique partagee pour :

- calculer les groupes par jour
- determiner le jour initialement ouvert
- gerer l'ouverture exclusive
- rendre un header de jour coheremment stylise

L'objectif n'est pas une abstraction generique excessive, mais l'evitement de duplication fragile entre commandes et reservations.

## Comportement detaille

### Determination du jour courant

Le jour courant doit etre calcule a partir de la meme reference que les filtres de dashboard existants :

- reservations : `referenceDate` deja present dans `DashboardReservations.tsx`
- commandes : `referenceDate` deja present dans `DashboardCommandes.tsx`
- admin : date du navigateur / periode filtree selon le contexte affichable

On compare les groupes par cle de date (`yyyy-mm-dd`) pour eviter les problemes d'heure locale.

### Changement de filtres

Quand un filtre change :

1. recalculer les groupes visibles
2. si le jour actuellement ouvert existe encore, le conserver
3. sinon ouvrir le jour courant si present
4. sinon ouvrir le premier groupe visible

### Etat vide

Si aucun groupe n'est visible apres filtrage :

- afficher le message vide existant
- ne rendre aucun accordion

## Changements fichiers

### Restaurateur

- `src/pages/dashboard/DashboardFactures.tsx`
  - separer les factures impayees et payees
  - ajouter un onglet `Historique des factures`
  - conserver les actions existantes

- `src/pages/dashboard/DashboardReservations.tsx`
  - remplacer la simple succession de sections par un accordion de jours exclusif
  - ouvrir le jour courant par defaut

- `src/pages/dashboard/DashboardCommandes.tsx`
  - introduire le regroupement par jour
  - ouvrir le jour courant par defaut
  - conserver les cartes commandes dans le jour ouvert

### Admin

- `src/pages/admin/AdminCompta.tsx`
  - separer les tableaux de factures en `A traiter` et `Historique des factures`
  - regrouper l'historique reservations par jour avec ouverture exclusive
  - regrouper l'historique commandes par jour avec ouverture exclusive

### UI partagee potentielle

- `src/components/ui/accordion.tsx` est deja disponible et doit etre privilegie
- un helper ou composant local supplementaire peut etre ajoute si necessaire

## Verification

### Manuel

1. Ouvrir le dashboard factures restaurateur avec au moins une facture `paid` et une facture non payee
2. Verifier que l'onglet principal n'affiche que les factures non payees
3. Verifier que les factures `paid` sont visibles dans `Historique des factures`
4. Refaire la meme verification sur `AdminCompta`
5. Ouvrir l'onglet reservations avec plusieurs jours visibles
6. Verifier que le jour courant est ouvert au chargement
7. Cliquer sur un autre jour et verifier que le jour precedent se ferme
8. Refaire la meme verification sur les commandes
9. Verifier qu'un changement de filtre conserve un jour ouvert valide
10. Verifier qu'aucune action existante ne regresse : marquer payee, changer statut, annuler, ouvrir un detail

### Regressions a surveiller

- jour courant non ouvert apres changement de filtre
- plusieurs jours ouverts en meme temps
- factures `paid` encore visibles dans la vue `A traiter`
- actions admin / restaurateur perdues apres la reorganisation

## Risques

### Risque faible

La logique repose majoritairement sur des transformations front-end de donnees deja chargees.

### Risques principaux

1. Duplication de logique entre admin et restaurateur si aucun helper partage n'est extrait
2. Mauvais calcul du jour initialement ouvert lors des changements de filtres
3. Reorganisation visuelle trop agressive sur `AdminCompta` si les tableaux journaliers deviennent moins scannables

## Recommendation d'implementation

1. Extraire d'abord les helpers de separation (`paid` / `unpaid`, groupement par jour)
2. Appliquer ensuite la refactor restaurateur
3. Terminer par `AdminCompta`, en gardant les tableaux a l'interieur des blocs de jour quand cela preserve la lisibilite

Cette sequence minimise le risque et permet de verifier le comportement sur les ecrans les plus utilises avant la vue admin.
