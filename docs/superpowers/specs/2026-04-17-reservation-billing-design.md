# Facturation des réservations (5.-/resa) & détection anti-fraude

**Date** : 2026-04-17
**Status** : Approuvé
**Auteur** : Collaboration mtnrconcept ↔ Claude

## Contexte

Aujourd'hui, seules les commandes génèrent des revenus pour Tok (commission 10% sur le CA brut). Les réservations, pourtant coûteuses en ressources plateforme (notifications, validation, sécurité anti-no-show…), ne rapportent rien.

Nouvelle règle métier : **Tok facture 5 CHF par réservation confirmée au restaurateur.** Le risque principal est la fraude : un restaurateur pourrait être tenté d'annuler des réservations légitimes et prétendre que le client ne s'est pas présenté pour éviter les 5.-. Il faut donc :

1. Empêcher le restaurateur d'annuler "en un clic" (exiger une raison structurée).
2. Différencier strictement les annulations **client** (pas facturées) des annulations **restaurateur** (facturées).
3. Fournir aux admins un tableau d'audit leur permettant de repérer les patterns suspects.

## Règles de facturation

Une réservation est **facturable 5.-** dès qu'elle atteint le statut `confirmed` (tracé via `confirmed_at`), SAUF si elle est annulée par le client.

| Statut final | Annulée par | Facturable |
|---|---|---|
| `pending` | — | NON (jamais confirmée) |
| `confirmed` / `arrived` / `no_show` | — | OUI |
| `cancelled` | `customer` | NON |
| `cancelled` | `restaurant` | **OUI** (anti-fraude) |
| `cancelled` | `admin` | NON |

## Modèle de données

### Migration : `ALTER TABLE public.reservations`

```sql
ALTER TABLE public.reservations
  ADD COLUMN confirmed_at              timestamptz,
  ADD COLUMN cancelled_at              timestamptz,
  ADD COLUMN cancelled_by              text CHECK (cancelled_by IN ('customer','restaurant','admin','system')),
  ADD COLUMN cancellation_reason_code  text,
  ADD COLUMN cancellation_reason_details text,
  ADD COLUMN billing_fee_chf           numeric NOT NULL DEFAULT 5.00,
  ADD COLUMN restaurant_invoice_id     uuid REFERENCES public.restaurant_invoices(id) ON DELETE SET NULL,
  ADD COLUMN updated_at                timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_reservations_billing_pending
  ON public.reservations(restaurant_id, confirmed_at)
  WHERE confirmed_at IS NOT NULL
    AND restaurant_invoice_id IS NULL
    AND NOT (status = 'cancelled' AND cancelled_by = 'customer')
    AND NOT (status = 'cancelled' AND cancelled_by = 'admin');

CREATE INDEX idx_reservations_cancellation_audit
  ON public.reservations(restaurant_id, cancelled_at)
  WHERE cancelled_by = 'restaurant';
```

Backfill : pour les réservations existantes avec `status IN ('confirmed','arrived','no_show')`, `confirmed_at = created_at`. Pour `status = 'cancelled'`, `cancelled_at = created_at` et `cancelled_by = 'customer'` par défaut (prudent — ne facture pas l'existant).

### Liste des raisons d'annulation (enum applicatif)

| Code | Libellé |
|---|---|
| `closure` | Fermeture exceptionnelle |
| `overbooking` | Surbooking / table indisponible |
| `kitchen_issue` | Problème de cuisine |
| `customer_unreachable` | Client injoignable |
| `private_event` | Événement privé prioritaire |
| `duplicate_error` | Doublon ou erreur de saisie |
| `other` | Autre (texte libre obligatoire) |

Stocké en `text` dans `cancellation_reason_code` (pas de contrainte SQL stricte pour garder la flexibilité ; la validation se fait côté RPC + UI).

## Flows

### Annulation côté client (préservée)

- `ReservationDetailModal.tsx` continue d'autoriser l'annulation si `>= 2h` avant le créneau.
- Migration du code existant vers une nouvelle RPC `cancel_reservation_by_customer(p_reservation_id)` qui :
  - Vérifie que `auth.uid()` est bien le `user_id` de la réservation
  - Set `status='cancelled'`, `cancelled_by='customer'`, `cancelled_at=now()`
  - **Jamais facturée** (règle appliquée au moment de la génération de facture)

### Annulation côté restaurateur (nouveau)

- `update_restaurant_reservation_status_safe` : **rejette** désormais `p_status='cancelled'` avec un code d'erreur `use_cancel_rpc`.
- Nouvelle RPC `cancel_reservation_by_restaurant(p_reservation_id, p_reason_code, p_reason_details)` :
  - Vérifie que le restaurateur possède le restaurant (via `auth_owns_restaurant`)
  - Exige `p_reason_code` dans la liste blanche
  - Exige `p_reason_details` non vide si `p_reason_code='other'`
  - Set `status='cancelled'`, `cancelled_by='restaurant'`, `cancelled_at=now()`, `cancellation_reason_code`, `cancellation_reason_details`
  - Si `confirmed_at IS NOT NULL` → reste facturable (aucun changement de `restaurant_invoice_id` ni `billing_fee_chf`)
- Nouveau composant React `RestaurantCancellationDialog.tsx` :
  - `Select` (shadcn) avec les 7 raisons
  - `Textarea` conditionnel affiché si `other` ou sur demande explicite
  - Submit désactivé si raison manquante ou si `other` sans détails
- Intégration dans `DashboardReservations.tsx` : quand le restaurateur clique `Annuler` sur une carte, ouvre ce dialog (au lieu de l'appel direct à `updateRestaurantReservationStatus`).

### Confirmation (marquage `confirmed_at`)

- Toute transition de statut vers `confirmed` dans `update_restaurant_reservation_status_safe` doit aussi set `confirmed_at = now()` si `confirmed_at IS NULL`.
- Idem pour `arrived` et `no_show` (si arrivée directe sans passer par confirmed, on set `confirmed_at = now()` pour tracer la facturabilité).

## Intégration à la facturation mensuelle

### Modification de `generate_restaurant_payout_invoice`

1. Calcul existant (somme des orders, commission 10%, etc.) — inchangé.
2. Nouveau calcul : `SELECT COUNT(*) * 5.00 FROM reservations WHERE restaurant_id = p_restaurant_id AND confirmed_at BETWEEN period_start AND period_end AND restaurant_invoice_id IS NULL AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'))`.
3. Ajouté à `amount_ht`.
4. Après création de la facture : `UPDATE reservations SET restaurant_invoice_id = <id> WHERE <mêmes critères>`.
5. Métadonnées de la facture enrichies (si champ JSON dispo) : `{ reservations_count, reservations_amount }` — sinon, stocké pour affichage via nouvelle RPC `get_invoice_reservations_breakdown`.

### Affichage restaurateur (`DashboardFactures.tsx`)

- Dans l'encours : ligne "Réservations confirmées (X × 5.-) : Y CHF" à côté des lignes de commandes.
- Dans l'aperçu détaillé d'une facture émise : section listant les réservations incluses (# / date / statut / 5.-).

## Dashboard Admin — `AdminCompta.tsx`

Ajout d'un **3e onglet** : "Réservations" (à côté de "Toutes les transactions" / "Miamz").

### KPI (4 cartes en haut de l'onglet)

1. **Réservations confirmées** (période × restaurant) — `count where confirmed_at between`
2. **Facturables** (= confirmées non annulées-client) — le pot à 5.-
3. **Annulées par le restaurateur** — compteur d'alerte
4. **Revenu Tok (5.-)** — `facturables × 5 CHF`

### Table "Historique des réservations"

Colonnes : `#Resa / Date+heure / Client / Restaurant / Statut / Annulé par / Raison / Facturable / 5.-`.
Filtres hérités du header (restaurant, mois).

### Section "Analyse anti-fraude"

- **Top restaurants à risque** : classement par taux d'annulation restaurateur = `annulées_resto / confirmées` sur la période
  - Vert : < 10 %
  - Orange : 10 – 25 %
  - Rouge : > 25 %
- **Top raisons invoquées** par restaurant sélectionné (ou global) — bar chart / liste triée
- **Annulations tardives** : nombre d'annulations restaurateur < 2h avant le créneau (signal renforcé)
- Cliquer sur une ligne de resto ouvre son historique détaillé d'annulations (date, client, raison, détails, heure d'annulation vs heure de réservation)

### Nouvelles RPC pour l'admin

- `admin_get_reservation_billing_history(p_restaurant_id uuid, p_month date)` → rows avec tout le détail requis par la table
- `admin_get_cancellation_fraud_metrics(p_month date)` → KPI agrégés par restaurant (total confirmées, annulations resto, taux, top raison, annulations tardives)

Toutes en `SECURITY DEFINER` avec garde `auth_is_admin()`.

## Changements fichiers

### Backend (migrations Supabase)

- `supabase/migrations/YYYYMMDDHHMMSS_reservation_billing.sql` : ALTER TABLE + indexes + backfill
- `supabase/migrations/YYYYMMDDHHMMSS_reservation_billing_rpcs.sql` : nouvelles RPC (`cancel_reservation_by_customer`, `cancel_reservation_by_restaurant`, update de `update_restaurant_reservation_status_safe`, update de `generate_restaurant_payout_invoice`, `admin_get_reservation_billing_history`, `admin_get_cancellation_fraud_metrics`)

### Frontend

- `src/lib/reservationMutations.ts` : ajouter `cancelReservationByCustomer`, `cancelReservationByRestaurant` + constante `CANCELLATION_REASONS`
- `src/components/RestaurantCancellationDialog.tsx` (nouveau)
- `src/components/ReservationDetailModal.tsx` : remplacer l'annulation directe par l'appel à `cancelReservationByCustomer`
- `src/pages/dashboard/DashboardReservations.tsx` : intercepter "Annuler" → ouvrir `RestaurantCancellationDialog`
- `src/pages/dashboard/DashboardFactures.tsx` : afficher la ligne "Réservations confirmées" dans encours + détails facture
- `src/pages/admin/AdminCompta.tsx` : ajouter onglet "Réservations" avec KPI, table historique, section anti-fraude

### Types

- Régénération des types Supabase après migrations (`src/integrations/supabase/types.ts` mis à jour).

## Plan de vérification

### Automatisé

- Tests RPC : confirmer qu'une réservation `confirmed` puis `cancelled` par restaurateur reste facturable ; inversement qu'une réservation `cancelled` par client n'apparaît jamais dans la facture.
- Test unitaire du calcul de facture : comparer `amount_ht` avant/après intégration des 5.-.

### Manuel

1. Création d'une réservation côté client → passage `confirmed` par le restaurateur → vérifier `confirmed_at` set.
2. Annulation par le client avant 2h → `cancelled_by='customer'`, pas de ligne facture.
3. Annulation par le restaurateur sans raison → rejet ; avec raison `other` sans détails → rejet ; avec raison valide → OK, ligne reste facturable.
4. Génération d'une facture mensuelle → `amount_ht` contient les 5.- × N ; `restaurant_invoice_id` set sur chaque réservation.
5. Admin ouvre `AdminCompta` → onglet Réservations → voit le KPI, l'historique, et la section anti-fraude avec codes couleur.

## Hors scope

- Configuration dynamique du montant 5.- (restera constante `billing_fee_chf DEFAULT 5.00` modifiable par migration)
- Notifications automatiques (alerte admin quand un resto dépasse 25%) — reportable en phase 2
- Intégration Stripe pour prélèvement direct — l'intégration se limite à l'inclusion dans la facture mensuelle existante
