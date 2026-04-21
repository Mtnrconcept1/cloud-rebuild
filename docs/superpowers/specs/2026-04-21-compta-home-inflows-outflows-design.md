# Refonte compta: accueil + entrees/sorties

**Date** : 2026-04-21
**Status** : Approuve
**Auteur** : Collaboration utilisateur <-> Codex

## Contexte

Les ecrans comptables actuels melangent plusieurs natures de flux :

- ce que TOK encaisse
- ce que TOK reverse
- ce que le restaurateur doit recevoir
- ce que le restaurateur doit payer

Cette structure rend la lecture metier difficile, surtout pour l'admin qui doit comprendre rapidement :

1. combien TOK a encaisse sur la periode
2. d'ou viennent les commissions de 10%
3. combien TOK doit reverser aux restaurateurs
4. combien TOK doit encore encaisser via les factures recues des restaurateurs

Le besoin est donc de transformer la comptabilite en cockpit financier clair, separe en flux entrants et flux sortants, avec la meme logique cote admin et cote restaurateur.

## Objectifs

1. Ajouter une page d'accueil compta admin avec une vue d'ensemble immediate.
2. Ajouter une page d'accueil compta restaurateur avec une vue d'ensemble immediate.
3. Scinder chaque espace comptable en 2 ecrans metiers distincts :
   - `Entrees d'argent`
   - `Sorties d'argent`
4. Afficher clairement l'origine des commissions 10% par source de paiement.
5. Garder une logique symetrique entre admin et restaurateur.
6. Conserver les regles metier existantes de facturation et de commission.

## Regle metier centrale

Des qu'un paiement existe, TOK percoit 10%.

Cette commission doit etre ventilee par source. Les categories a distinguer sont :

- commandes classiques
- Zero Attente
- Chef's Table
- ventes flash
- anti-gaspi

Les frais fixes de reservation restent un flux separe des commissions 10%.

## Hors scope

- changement du taux de commission
- changement des schemas Supabase ou creation de nouvelles tables
- modification des regles de creation de facture
- nouveau moteur de rapprochement comptable
- export comptable / CSV / PDF supplementaires

## Experience cible

## 1. Admin

### 1.1 Accueil compta admin

La page d'accueil compta admin doit afficher, au-dessus de tout historique detaille, une lecture immediate en 3 zones :

#### Zone A - Vue d'ensemble TOK

- total encaisse par TOK sur la periode
- total des commissions 10%
- total des frais de reservation
- net encaisse

#### Zone B - Origine des 10%

Chaque source doit etre isolee avec son propre montant :

- commandes classiques
- Zero Attente
- Chef's Table
- ventes flash
- anti-gaspi

Pour chaque source, on veut afficher au minimum :

- montant brut paye
- commission TOK correspondante

#### Zone C - Navigation principale

Au centre de l'ecran, deux gros boutons distincts :

- `Factures faites aux restaurateurs`
- `Factures recues des restaurateurs`

Ces boutons ouvrent deux ecrans separes, pas un simple changement d'onglet dans la meme page.

### 1.2 Ecran admin `Entrees d'argent`

Cet ecran regroupe ce que TOK encaisse :

- vue synthese des commissions 10%
- ventilation par source
- frais de reservation encaises / a encaisser
- historique des factures recues des restaurateurs
- historique des encaissements lies a ces flux

### 1.3 Ecran admin `Sorties d'argent`

Cet ecran regroupe ce que TOK doit payer :

- factures faites aux restaurateurs
- total a reverser
- total deja paye
- total restant a payer
- historique des sorties d'argent vers les restaurateurs

## 2. Restaurateur

### 2.1 Accueil compta restaurateur

La page d'accueil compta restaurateur reprend la meme logique, mais vue depuis le restaurant :

#### Zone A - Vue d'ensemble restaurateur

- ce que le restaurateur doit recevoir de TOK
- ce qu'il doit payer a TOK
- net du flux sur la periode

#### Zone B - Detail des flux

Separer clairement :

- les 90% a recevoir de TOK
- les frais fixes / factures a payer a TOK

La ventilation des 90% doit etre visible par source :

- commandes classiques
- Zero Attente
- Chef's Table
- ventes flash
- anti-gaspi

#### Zone C - Navigation principale

Deux gros boutons centraux :

- `Factures faites a TOK`
- `Factures recues de TOK`

### 2.2 Ecran restaurateur `Entrees d'argent`

Cet ecran regroupe les entrees cote restaurant :

- montants a recevoir de TOK
- detail des 90% par source
- historique des factures recues de TOK quand TOK a regle

### 2.3 Ecran restaurateur `Sorties d'argent`

Cet ecran regroupe les sorties cote restaurant :

- factures faites a TOK
- frais de reservation
- autres factures TOK si presentes
- historique des factures deja payees a TOK

## Sources et classification des 10%

La classification des commissions doit etre centralisee dans un helper unique partage admin/restaurateur.

## Categories de classification

### Commandes classiques

Commandes payees qui ne sont ni :

- Zero Attente
- Chef's Table
- ventes flash
- anti-gaspi

### Zero Attente

Paiements rattaches au parcours `zero-attente`.

### Chef's Table

Paiements rattaches a `feature = chefs_table`.

### Ventes flash

Paiements ou metadata / flags indiquent une vente flash.

### Anti-gaspi

Paiements ou metadata / flags indiquent une offre anti-gaspi.

## Contraintes de classification

1. chaque paiement doit tomber dans une seule categorie
2. aucune ligne ne doit etre comptee deux fois
3. admin et restaurateur doivent reutiliser exactement la meme classification
4. les frais de reservation ne doivent pas etre melanges aux commissions 10%

## Architecture recommandee

## Admin

Conserver la route compta admin existante comme accueil, puis ajouter 2 routes metiers.

### Pages

- `src/pages/admin/AdminCompta.tsx`
  - devient l'accueil compta admin
- `src/pages/admin/AdminComptaInflow.tsx`
  - entrees d'argent de TOK
- `src/pages/admin/AdminComptaOutflow.tsx`
  - sorties d'argent de TOK

## Restaurateur

Conserver la route dashboard factures existante comme accueil, puis ajouter 2 sous-routes metiers.

### Pages

- `src/pages/dashboard/DashboardFactures.tsx`
  - devient l'accueil compta restaurateur
- `src/pages/dashboard/DashboardFacturesInflow.tsx`
  - entrees d'argent du restaurateur
- `src/pages/dashboard/DashboardFacturesOutflow.tsx`
  - sorties d'argent du restaurateur

## Routing

### Admin

- accueil compta admin : route compta actuelle
- entrees : nouvelle route dediee
- sorties : nouvelle route dediee

### Restaurateur

- accueil compta restaurateur : `/dashboard/factures`
- entrees : `/dashboard/factures/entrees`
- sorties : `/dashboard/factures/sorties`

## Reutilisation de l'existant

Le design recommande de reutiliser les donnees et calculs existants autant que possible.

### A reutiliser

- historique de paiements
- factures `payout`
- factures `reservation_fees`
- calculs actuels des 90%
- historique reservations
- historique commandes

### A ajouter

- helper de classification de source de commission
- helper de synthese `inflow` / `outflow`
- nouvelles pages d'accueil et de separation des flux

## Presentation visuelle attendue

## Accueil admin / restaurateur

L'accueil compta ne doit pas commencer par un tableau.
Il doit commencer par :

1. une synthese haut niveau
2. des blocs de ventilation par source
3. deux gros boutons centraux de navigation

Les boutons doivent etre des CTA de premier niveau, clairement separes visuellement, pas de petits liens secondaires.

## Ecrans de flux

Les ecrans `Entrees d'argent` et `Sorties d'argent` doivent assumer une logique unique :

- un seul sens de flux par ecran
- aucun melange entre argent entrant et argent sortant
- historiques et factures ranges sous le bon sens de flux

## Changements fichiers

### A creer

- `src/lib/comptaFlow.ts` ou equivalent
- `src/lib/comptaCommissionSources.ts` ou equivalent
- `src/pages/admin/AdminComptaInflow.tsx`
- `src/pages/admin/AdminComptaOutflow.tsx`
- `src/pages/dashboard/DashboardFacturesInflow.tsx`
- `src/pages/dashboard/DashboardFacturesOutflow.tsx`

### A modifier

- `src/pages/admin/AdminCompta.tsx`
- `src/pages/dashboard/DashboardFactures.tsx`
- `src/App.tsx`
- tout helper comptable existant necessaire pour mutualiser les calculs

## Verification

### Manuel

1. ouvrir l'accueil compta admin
2. verifier que la vue d'ensemble TOK apparait avant tout historique
3. verifier que les commissions 10% sont ventilees par source
4. verifier que les 2 gros boutons ouvrent bien 2 ecrans separes
5. verifier que l'ecran `Entrees d'argent` admin ne montre que des flux entrants
6. verifier que l'ecran `Sorties d'argent` admin ne montre que des flux sortants
7. refaire les memes controles cote restaurateur
8. verifier qu'un paiement Zero Attente apparait dans la bonne categorie
9. verifier qu'une vente flash / anti-gaspi apparait dans la bonne categorie
10. verifier qu'aucun paiement n'est compte 2 fois

### Regressions a surveiller

- mismatch entre les totaux admin et restaurateur
- classifications incoherentes entre `orders` et `reservations`
- confusion entre frais fixes et commissions 10%
- routes cassées depuis les menus dashboard/admin

## Risques

### Risque principal

Le risque principal est la mauvaise classification des paiements par source. Toute l'implementation doit donc centraliser cette regle dans un helper pur, teste et partage.

### Risque secondaire

Le second risque est de surcharger les pages d'accueil compta avec trop de detail. Elles doivent rester des cockpits synthese, pas redevenir des historiques de bas de page.

## Recommandation d'implementation

1. construire d'abord le helper unique de classification des flux 10%
2. produire ensuite les syntheses `inflow` / `outflow`
3. mettre en place les nouvelles routes
4. finir par la redistribution des ecrans admin/restaurateur
