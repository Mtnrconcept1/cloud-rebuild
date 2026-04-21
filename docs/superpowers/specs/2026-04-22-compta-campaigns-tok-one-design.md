# Comptabilite TOK - campagnes publicitaires et abonnements Tok One

Date: 2026-04-22
Statut: draft valide pour relecture utilisateur

## Objectif

Ameliorer la lisibilite des tableaux de bord financiers en faisant apparaitre :

1. les paiements de campagnes publicitaires dans :
   - la comptabilite admin
   - la comptabilite restaurateur
2. les paiements d'abonnements Tok One sur :
   - la page d'accueil admin generale

Ces flux doivent etre visibles sans etre melanges avec la ventilation existante des `10% / 90%`.

## Decision produit

Les flux sont separes en trois familles :

1. `Commissions marketplace`
   - commandes
   - zero attente
   - chef's table
   - ventes flash
   - anti-gaspi
   - logique existante `10% TOK / 90% restaurateur`
2. `Campagnes publicitaires`
   - paiements faits par les restaurants pour promouvoir leur visibilite
   - bloc comptable distinct
   - hors ventilation `10% / 90%`
3. `Abonnements Tok One`
   - revenu plateforme distinct
   - visible sur l'accueil admin general
   - hors comptabilite restaurateur

## Constat actuel

### Compta admin

La home compta admin affiche deja :

- les paiements clients passes par TOK
- les commissions TOK `10%`
- les factures faites aux restaurateurs
- les reversements a regler
- la ventilation des `10%` par source

Mais elle ne distingue pas encore les encaissements de campagnes publicitaires.

### Compta restaurateur

La compta restaurateur expose deja :

- la part restaurant `90%`
- les factures faites a TOK
- l'encours non facture
- la ventilation par source de commandes et reservations

Mais elle ne fait pas apparaitre les campagnes publicitaires comme depense separee.

### Home admin generale

La page d'accueil admin generale affiche deja :

- stats restaurants
- stats commandes
- stats reservations
- GMV recent
- commandes recentes
- audit logs

Mais elle ne montre pas encore le revenu lie a Tok One.

## Experience cible

### 1. Comptabilite admin

La page [AdminCompta.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminCompta.tsx) garde sa structure actuelle.

Sous les cartes et la ventilation `Origine des 10% TOK`, ajouter un bloc separe :

- titre: `Autres encaissements TOK`
- sous-bloc principal: `Campagnes publicitaires`

Le bloc doit afficher au minimum :

- montant encaisse du mois
- nombre de campagnes payees
- portee du filtre courant :
  - tous les restaurateurs
  - ou restaurant selectionne

Le montant campagnes ne doit jamais etre ajoute a `Commissions TOK 10%`.

### 2. Comptabilite restaurateur

La home [DashboardFactures.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardFactures.tsx) et l'ecran [DashboardFacturesInflow.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardFacturesInflow.tsx) doivent rendre visibles les campagnes publicitaires comme depense marketing separee.

La lecture cible est :

- commissions marketplace
- depenses marketing

Ajouts attendus :

- un bloc `Depenses marketing`
- une ligne explicite `Campagnes publicitaires`
- montant paye par le restaurant
- nombre de campagnes payees si disponible

Ce bloc reste en dehors de :

- `Part restaurant 90%`
- `Encours par source`
- `Factures faites a TOK`

Autrement dit, il s'agit d'un flux de depense distinct, pas d'un revenu restaurateur.

### 3. Accueil admin general

La page [AdminHome.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminHome.tsx) doit recevoir une carte de synthese supplementaire :

- titre: `Abonnements Tok One`
- montant estime des abonnements actifs
- indicateur de volume :
  - nombre d'abonnements actifs si proprement disponible

Cette carte reste sur la home admin generale, pas dans la compta admin.

## Sources de donnees

### Campagnes publicitaires

Source principale :

- table `ad_campaigns`

Champs utiles deja presents :

- `restaurant_id`
- `title`
- `created_at`
- `payment_status`
- `paid_amount`
- `total_budget`

Regle de calcul :

1. ne retenir que les campagnes avec `payment_status = "paid"`
2. montant retenu :
   - priorite a `paid_amount`
   - fallback sur `total_budget` si `paid_amount` est absent, nul ou a `0`

Filtres :

- admin compta :
  - filtre restaurant existant
  - filtre mois existant
- restaurateur compta :
  - restaurant selectionne
  - sans nouveau filtre date pour cette iteration, sauf si deja porte par l'ecran cible

### Abonnements Tok One

Sources :

- table `tok_one_subscriptions`
- table `user_subscription_plans`

Champs utiles deja presents :

- `tok_one_subscriptions.status`
- `tok_one_subscriptions.current_period_start`
- `tok_one_subscriptions.current_period_end`
- `tok_one_subscriptions.plan_id`
- `tok_one_subscriptions.billing_period` si disponible en pratique
- `user_subscription_plans.price_monthly`
- `user_subscription_plans.price_yearly`
- `user_subscription_plans.name`

Regle de calcul initiale :

1. ne retenir que les abonnements avec statut ouvrant droit :
   - `active`
   - `trialing`
2. joindre le plan
3. montant affiche sur la home admin :
   - `price_yearly` si `billing_period = "yearly"`
   - sinon `price_monthly`

Fallback explicite :

Si `billing_period` n'est pas suffisamment renseigne de maniere fiable sur les abonnements existants, utiliser `price_monthly` par defaut pour tous les abonnements actifs et documenter l'hypothese dans le code de presentation.

## Regles de separation comptable

### Ce qui reste dans la ventilation `10% / 90%`

- commandes
- zero attente
- chef's table
- ventes flash
- anti-gaspi
- reservations payantes deja prises en charge par la logique existante

### Ce qui doit rester hors de cette ventilation

- campagnes publicitaires
- abonnements Tok One

Ces flux ne doivent pas :

- modifier `summary.inflow.totalCommissions`
- modifier `summary.inflow.bySource`
- modifier `summary.outflow.bySource`

## Architecture proposee

### Admin compta

Etendre [adminComptaShared.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/adminComptaShared.ts) pour retourner, en plus de la synthese existante :

- `paidCampaignsTotal`
- `paidCampaignsCount`
- detail par restaurant si necessaire plus tard

Puis afficher ces valeurs dans [AdminCompta.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminCompta.tsx) dans un bloc distinct `Autres encaissements TOK`.

### Restaurateur compta

Etendre [dashboardFacturesShared.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/dashboardFacturesShared.ts) pour retourner :

- `paidCampaignsTotal`
- `paidCampaignsCount`

Puis afficher ces valeurs dans :

- [DashboardFactures.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardFactures.tsx)
- [DashboardFacturesInflow.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardFacturesInflow.tsx)

Le wording doit etre explicite sur le fait qu'il s'agit de `Depenses marketing`.

### Admin home

Etendre [AdminHome.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminHome.tsx) avec une query dediee ou un petit hook local pour calculer :

- `tokOneActiveCount`
- `tokOneEstimatedMonthlyRevenueEquivalent` ou equivalent de presentation

L'objectif n'est pas de construire un module d'analyse d'abonnements complet, seulement une carte de synthese fiable et lisible.

## UX et wording

### Compta admin

Le bloc campagnes doit parler de :

- `encaissements`
- `campagnes publicitaires`
- `hors commissions marketplace`

### Compta restaurateur

Le bloc campagnes doit parler de :

- `depenses marketing`
- `campagnes publicitaires payees`

Il ne doit pas donner l'impression que TOK doit reverser quelque chose au restaurant sur ce flux.

### Admin home

La carte Tok One doit parler de :

- `Abonnements Tok One`
- `revenu estime actif`

Elle doit rester concise.

## Fichiers cibles

Fichiers modifies prevus :

- `src/pages/admin/AdminHome.tsx`
- `src/pages/admin/AdminCompta.tsx`
- `src/pages/admin/adminComptaShared.ts`
- `src/pages/dashboard/DashboardFactures.tsx`
- `src/pages/dashboard/DashboardFacturesInflow.tsx`
- `src/pages/dashboard/dashboardFacturesShared.ts`

Tests ou helpers additionnels seulement si necessaires apres implementation.

## Non-objectifs

Ce chantier ne modifie pas :

- la logique de checkout Stripe
- l'activation des campagnes apres paiement
- la gestion detaillee des renouvellements Tok One
- les ecrans admin hors home generale et compta
- la ventilation `10% / 90%` existante
- les factures `restaurant_invoices`

## Risques

### 1. Fiabilite de `paid_amount` campagne

Certaines campagnes peuvent avoir `payment_status = "paid"` avec `paid_amount` nul ou incomplet.

Mitigation :

- fallback sur `total_budget`
- regle explicite et centralisee

### 2. Fiabilite de `billing_period` Tok One

Le champ peut etre absent ou heterogene selon l'historique des abonnements.

Mitigation :

- fallback mensuel par defaut
- wording de type `revenu estime`

### 3. Confusion entre commissions et autres revenus

Si les blocs sont trop proches visuellement, l'utilisateur peut croire que campagnes et Tok One font partie des `10%`.

Mitigation :

- sections distinctes
- titres explicites
- wording `hors commissions marketplace`

## Validation attendue

1. En compta admin, les campagnes publicitaires payees apparaissent dans un bloc distinct des commissions TOK.
2. En compta restaurateur, les campagnes publicitaires apparaissent comme depense marketing distincte.
3. Sur l'accueil admin, Tok One apparait comme revenu plateforme distinct.
4. Aucune de ces valeurs n'est injectee dans la ventilation existante `Origine des 10% TOK`.
5. Les ecrans restent lisibles sur desktop et mobile.
