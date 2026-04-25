# Dashboard restaurateur — commandes anti-gaspi et ventes flash

Date: 2026-04-22
Statut: draft valide pour relecture utilisateur

## Objectif

Rendre visibles les commandes `anti-gaspi` et `ventes flash` dans :

1. le dashboard `Commandes` du restaurateur
2. l'outil de comptabilite du restaurateur

Ces commandes doivent :

- apparaitre dans la liste existante des commandes
- etre clairement identifiables par type
- etre mieux discernables a l'interieur de chaque jour
- etre prises en compte explicitement dans la lisibilite comptable restaurateur

## Constat actuel

Le code de pricing, de status lock et de comptabilite reconnait deja ces commandes via :

- `metadata.is_anti_waste`
- `metadata.has_flash_sale`
- `metadata.flash_sale_id`
- `metadata.feature === "anti-gaspi"` ou `metadata.feature === "ventes-flash"`

Mais cote restaurateur :

- `DashboardCommandes` n'offre pas de lecture claire par type de commande
- la comptabilite restaurateur agrège bien les montants par source, mais n'expose pas encore de detail operationnel visible pour `anti-gaspi` et `ventes flash`

## Decision produit

Approche retenue :

- conserver la vue chronologique par jour dans `DashboardCommandes`
- ajouter une identification forte de type sur chaque commande
- ajouter un regroupement visuel par type a l'interieur de chaque jour
- exposer dans la comptabilite restaurateur les sources `anti-gaspi` et `ventes flash` a la fois :
  - dans les cartes de synthese existantes
  - dans un detail operationnel sur l'ecran `Entrees d'argent`

Cette approche garde le flux quotidien du restaurateur intact, sans fragmenter les commandes en onglets separes.

## Experience cible

### 1. Dashboard Commandes

Chaque jour reste un accordion unique, comme aujourd'hui.

A l'interieur d'un jour :

- un resume affiche le nombre de commandes et le chiffre d'affaires par type :
  - `Classiques`
  - `Anti-gaspi`
  - `Ventes flash`
- les cartes commandes restent dans une seule vue chronologique
- chaque commande recoit un badge clair de type :
  - `Anti-gaspi`
  - `Vente flash`
  - pas de badge special pour une commande classique
- les commandes speciales recoivent un traitement visuel discret mais identifiable :
  - anti-gaspi : accent vert
  - vente flash : accent ambre

Objectif :

- voir immediatement qu'un jour contient des commandes speciales
- reperer visuellement chaque commande speciale sans perdre la timeline globale

### 2. Comptabilite restaurateur — home

La home compta conserve sa structure actuelle.

Elle continue d'afficher la ventilation par source :

- `Commandes`
- `Zero Attente`
- `La Table du Chef`
- `Ventes flash`
- `Anti-gaspi`

Mais le wording et l'ordre d'affichage doivent rendre explicite que :

- `Ventes flash` et `Anti-gaspi` ne sont pas caches dans `Commandes`
- ces deux lignes sont des sources distinctes de revenu et de reversement

### 3. Comptabilite restaurateur — Entrees d'argent

L'ecran `Entrees d'argent` doit aller plus loin que la simple carte par source.

Sous les cartes de synthese, ajouter un bloc de detail operationnel :

- `Encours commandes classiques`
- `Encours anti-gaspi`
- `Encours ventes flash`

Ce detail doit montrer la part restaurateur `90%` non encore facturee a TOK pour chaque source.

Si une source est a zero, elle reste visible avec `0.00 CHF`.

Objectif :

- que le restaurateur comprenne immediatement d'ou viennent les montants a recevoir
- que `anti-gaspi` et `ventes flash` soient visibles non seulement dans la synthese, mais aussi dans l'encours

## Regles de classification

### Commandes dashboard

Une commande dashboard doit etre classee dans exactement un type :

- `anti_gaspi`
- `flash_sales`
- `classic`

Priorite de classification :

1. `anti_gaspi` si metadata indique une offre anti-gaspi
2. `flash_sales` si metadata indique une vente flash
3. `classic` sinon

`Zero Attente` reste hors du dashboard commandes et continue d'appartenir au flux reservations.

### Comptabilite

La comptabilite restaurateur conserve la classification existante basee sur les helpers partages.

Pour ce chantier, il faut s'assurer que :

- `anti-gaspi` alimente bien `anti_gaspi`
- `ventes-flash` alimente bien `flash_sales`
- aucune de ces commandes ne retombe visuellement dans `Commandes` sans detail explicite

## Architecture proposee

### Helpers

Ajouter un helper frontend dedie au dashboard commandes, distinct du helper comptable :

- `src/lib/dashboardOrderTypes.ts`

Responsabilites :

- detecter le type visuel d'une commande dashboard
- fournir le label et les classes UI associees
- produire un regroupement par jour et par type si necessaire

Ne pas reutiliser tel quel le helper comptable, car les besoins sont differents :

- compta : source financiere
- dashboard commandes : presentation operationnelle

En revanche, les conditions de detection doivent rester coherentes.

### Pages touchees

- `src/pages/dashboard/DashboardCommandes.tsx`
- `src/pages/dashboard/DashboardFactures.tsx`
- `src/pages/dashboard/DashboardFacturesInflow.tsx`
- `src/pages/dashboard/dashboardFacturesShared.ts`

### Tests

Ajouter des tests unitaires sur la classification dashboard :

- `src/test/dashboard-order-types.test.ts`

## Detaillants d'implementation

### DashboardCommandes

Dans chaque groupe de jour :

- calculer :
  - nombre de commandes classiques
  - nombre de commandes anti-gaspi
  - nombre de commandes ventes flash
  - chiffre d'affaires de chaque groupe
- afficher ces compteurs avant la liste
- sur chaque carte commande :
  - ajouter le badge de type si special
  - conserver la logique existante de statut, de detail client et de breakdown paiement

### Compta restaurateur

Dans `dashboardFacturesShared.ts` :

- exposer un detail `uninvoicedRestaurantShareBySource`
- garantir que les clés `anti_gaspi` et `flash_sales` sont disponibles dans le retour du hook

Dans `DashboardFacturesInflow.tsx` :

- ajouter un bloc `Encours par source`
- afficher au minimum :
  - `Commandes`
  - `Anti-gaspi`
  - `Ventes flash`
- laisser visibles aussi les autres sources existantes pour conserver la symetrie globale

## Non-objectifs

Ce chantier ne modifie pas :

- le dashboard admin
- les reservations
- la logique de paiement Stripe
- la creation d'offres anti-gaspi ou ventes flash
- le schema Supabase

## Risques

### 1. Source RPC dashboard

Si `get_restaurant_orders_dashboard` filtre deja certaines commandes speciales, un ajustement backend ou SQL pourrait etre necessaire.

Verification obligatoire avant implementation :

- confirmer que les commandes anti-gaspi et ventes flash remontent bien deja dans la RPC
- si non, corriger a la source avant le travail UI

### 2. Double logique de classification

Le dashboard commandes et la comptabilite n'ont pas exactement les memes besoins. Il faut donc :

- separer les helpers
- mais garder une detection fonctionnellement coherente

### 3. Regression visuelle

Le dashboard commandes a deja une logique d'accordions par jour. Les nouvelles sections ne doivent pas :

- casser l'ouverture automatique du jour courant
- casser la fermeture exclusive
- surcharger visuellement chaque jour

## Validation attendue

### Dashboard Commandes

1. une commande anti-gaspi apparait dans la journee concernee
2. une commande vente flash apparait dans la journee concernee
3. chaque commande speciale a un badge explicite
4. chaque jour affiche un resume par type
5. les commandes speciales restent dans la liste chronologique generale

### Comptabilite restaurateur

1. la home compta affiche toujours `Anti-gaspi` et `Ventes flash` comme sources distinctes
2. l'ecran `Entrees d'argent` affiche un encours par source
3. `Anti-gaspi` et `Ventes flash` ont chacune une ligne visible, meme a `0.00 CHF`
4. les montants par source restent coherents avec la logique `90% restaurant / 10% TOK`

## Resume

Le restaurateur doit pouvoir :

- voir ses commandes anti-gaspi et ventes flash dans l'outil commandes
- les reperer immediatement via badge et resume journalier
- comprendre dans l'outil comptable combien ces deux sources representent, en synthese et en encours

