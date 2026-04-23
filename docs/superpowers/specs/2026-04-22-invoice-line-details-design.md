# Factures compta - detail complet des lignes

Date: 2026-04-22
Statut: draft valide pour relecture utilisateur

## Objectif

Afficher, sous chaque facture emise ou recue dans les outils de comptabilite admin et restaurateur, le detail complet du montant facture.

Le detail doit permettre de comprendre sans ambiguite:

1. quelles reservations sont incluses
2. quelles commandes sont incluses
3. a quelle source metier correspond chaque ligne
4. quel montant brut a ete paye
5. quel montant exact a ete facture sur la ligne

## Besoin metier

Aujourd'hui, les ecrans de comptabilite montrent surtout:

- le numero de facture
- la periode
- le montant TTC
- le statut

Mais ils ne montrent pas le contenu comptable de la facture.

Le besoin demande que sur chaque facture:

- toutes les reservations incluses apparaissent
- toutes les commandes incluses apparaissent
- le montant exact de chaque ligne soit visible

L'utilisateur ne doit plus avoir a deduire le montant d'une facture a partir des cartes de synthese.

## Decision produit

Approche retenue:

1. conserver les tableaux de factures existants
2. ajouter un accordion sous chaque facture
3. charger le detail a la demande
4. utiliser la base comme source de verite pour les lignes de facture

Le detail ne sera pas reconstruit uniquement en frontend. Il sera fourni par des RPC SQL dedies afin que:

- admin et restaurateur lisent exactement la meme verite comptable
- la somme des lignes corresponde au montant de la facture
- la logique de calcul ne soit pas dupliquee dans React

## Factures concernees

### 1. Factures `payout`

Ce sont les factures de reversement restaurant.

Elles doivent afficher:

- toutes les commandes liees a `restaurant_invoice_id = invoice_id`
- toutes les reservations payantes liees a `restaurant_invoice_id = invoice_id`

Pour chaque ligne, on doit voir:

- le montant brut paye par le client
- le taux applique
- le montant facture sur la ligne

Regle metier:

- `invoiced_amount = gross_amount * 0.90`

### 2. Factures `reservation_fees`

Ce sont les factures TOK des frais de reservation.

Elles doivent afficher:

- toutes les reservations liees a `reservation_fee_invoice_id = invoice_id`

Pour chaque ligne, on doit voir:

- la reservation
- sa date et son heure
- son statut
- son montant facture de `5.00 CHF`

Regle metier:

- `invoiced_amount = billing_fee_chf`
- dans la pratique actuelle, la valeur attendue est `5.00 CHF` par reservation billable

## Experience cible

### Comportement global

Chaque ligne de facture du tableau gagne un bouton:

- `Voir le detail`

Quand on clique:

- un accordion s'ouvre directement sous la facture
- le detail est charge a la demande
- si un autre clic referme l'accordion, le tableau redevient compact

Le detail doit contenir:

- un recap de total
- le detail des lignes
- une verification visuelle du total

### Facture `payout`

L'accordion contient 2 sous-sections:

1. `Reservations`
2. `Commandes`

Ordre recommande:

- reservations en premier
- commandes ensuite

Chaque sous-section affiche son sous-total.

Le pied d'accordion affiche:

- `Total des lignes`
- eventuellement `Ecart d'arrondi` si necessaire

### Facture `reservation_fees`

L'accordion contient une seule section:

- `Reservations facturees`

Le pied d'accordion affiche:

- `Total des lignes`

## Donnees a exposer

## 1. Nouvelle RPC payout

Ajouter une RPC:

- `public.get_payout_invoice_lines(p_invoice_id uuid)`

Elle renvoie une liste de lignes normalisees.

### Colonnes de retour

- `line_id uuid`
- `line_type text`
- `source text`
- `reference text`
- `label text`
- `occurred_at timestamptz`
- `gross_amount numeric`
- `rate_applied numeric`
- `invoiced_amount numeric`

### Valeurs attendues

#### `line_type`

- `reservation`
- `order`

#### `source`

Doit rester coherent avec la logique comptable existante:

- `orders`
- `zero_attente`
- `chefs_table`
- `flash_sales`
- `anti_gaspi`

#### `reference`

Doit etre lisible et exploitable par l'utilisateur:

- commande: `order_number` si disponible, sinon id court
- reservation: reference lisible a partir de l'id ou du contexte date/heure

#### `label`

Texte lisible, par exemple:

- `Commande 4128`
- `Reservation 22 avr 2026 19:30`

#### `gross_amount`

- commande: `total_amount + points_discount_amount` si present
- reservation: `total_amount`

#### `rate_applied`

- `0.90` pour toutes les lignes payout

#### `invoiced_amount`

- montant reel compte dans la facture
- calcul ligne par ligne a `90%`

## 2. RPC reservation fees existante

Reutiliser:

- `public.get_reservation_fee_invoice_lines(p_invoice_id uuid)`

Elle existe deja et doit rester la source de verite pour les factures `reservation_fees`.

Le frontend enrichira seulement sa presentation.

## Ecrans impactes

### Admin

- [AdminComptaInflow.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminComptaInflow.tsx)
  factures `reservation_fees`
- [AdminComptaOutflow.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminComptaOutflow.tsx)
  factures `payout`
- [adminComptaShared.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/adminComptaShared.ts)
  nouveaux types et hooks de chargement detail

### Restaurateur

- [DashboardFacturesInflow.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardFacturesInflow.tsx)
  factures `payout`
- [DashboardFacturesOutflow.tsx](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardFacturesOutflow.tsx)
  factures `reservation_fees`
- [dashboardFacturesShared.ts](/C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/dashboardFacturesShared.ts)
  nouveaux types et hooks de chargement detail

### SQL

- nouvelle migration Supabase
- nouvelle RPC `get_payout_invoice_lines`

## Structure UI detaillee

## 1. Tableau de factures

Chaque ligne de facture garde:

- facture
- periode
- montant TTC
- statut
- echeance

Et gagne une action supplementaire:

- `Voir le detail`

Le clic ouvre un bloc detail directement sous la ligne concernee.

## 2. Lignes de detail payout

Pour chaque ligne:

- badge source
- libelle
- date/heure
- montant brut
- taux applique
- montant facture

Exemples:

- `Commande 4128` - `Ventes flash` - `28.00 CHF` - `90%` - `25.20 CHF`
- `Reservation 22 avr 19:30` - `Zero attente` - `40.00 CHF` - `90%` - `36.00 CHF`

## 3. Lignes de detail reservation fees

Pour chaque ligne:

- date
- heure
- couverts
- statut
- `5.00 CHF`

## 4. Etats UI

Pour chaque accordion:

- `Chargement du detail...`
- `Aucune ligne sur cette facture.` si anomalie
- affichage d'un message d'erreur si la RPC echoue

## Regles de coherence

1. la somme des lignes `payout` doit matcher `restaurant_invoices.amount_ttc`
2. la somme des lignes `reservation_fees` doit matcher `restaurant_invoices.amount_ttc`
3. si un ecart de centimes existe a cause d'un arrondi historique, il doit etre affiche explicitement
4. admin et restaurateur doivent voir le meme detail pour une meme facture

## Architecture frontend

Ajouter un composant partage de detail de facture, reutilisable des 4 ecrans:

- proposition: `src/components/invoices/InvoiceDetailAccordion.tsx`

Responsabilites:

- gerer l'ouverture/fermeture
- charger les lignes via React Query
- router vers la bonne source de donnees selon `invoice_type`
- afficher le contenu normalise

Ajouter aussi un composant de ligne:

- proposition: `src/components/invoices/InvoiceLineTable.tsx`

Responsabilites:

- rendu des reservations et commandes
- badges source
- sous-totaux
- total final

## Architecture data frontend

Les hooks partages admin et restaurateur doivent exposer:

- les types de lignes payout
- les types de lignes reservation fees
- un helper de totalisation des lignes

Ils ne doivent pas recalculer la logique comptable de fond. Ils doivent seulement:

- appeler les RPC
- formater
- regrouper pour l'UI

## SQL et securite

La RPC `get_payout_invoice_lines` doit:

- verifier que la facture existe
- verifier que l'utilisateur est admin ou proprietaire du restaurant de la facture
- n'exposer que les lignes liees a cette facture

Le calcul des sources doit reutiliser la logique metier actuelle des metadata:

- anti-gaspi
- ventes flash
- zero attente
- chefs table
- commandes classiques

La fonction doit etre `SECURITY DEFINER` avec un `search_path` explicite.

## Hors scope

Ce chantier ne couvre pas:

- les campagnes publicitaires
- les abonnements Tok One
- les exports PDF enrichis
- un nouveau schema de facture PDF
- la regeneration retroactive de factures historiques

## Risques

### 1. Arrondis historiques

Le total facture peut avoir ete calcule globalement sur la masse plutot que ligne a ligne sur certains historiques. Il faut donc prevoir un affichage d'ecart d'arrondi plutot que forcer une egalite artificielle.

### 2. Sources reservations

La classification de certaines reservations payantes doit rester strictement coherente avec la compta existante, surtout pour `zero_attente` et `chefs_table`.

### 3. Performance

Le detail doit etre charge a la demande, pas precharge pour toutes les factures d'une page.

## Verification attendue

1. ouvrir une facture `payout` admin et verifier:
   - presence des reservations
   - presence des commandes
   - total du detail coherent
2. ouvrir la meme facture cote restaurateur et verifier le meme contenu
3. ouvrir une facture `reservation_fees` admin et restaurateur
4. verifier les cas sans detail
5. verifier les cas payes et historiques
