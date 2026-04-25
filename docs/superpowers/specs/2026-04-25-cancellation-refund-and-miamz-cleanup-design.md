# Annulation avec remboursement (restaurateur + admin) & nettoyage Miamz

**Date** : 2026-04-25
**Statut** : Design validé, en attente d'écriture du plan d'implémentation

## Contexte

Trois besoins liés exprimés par le restaurateur principal de la plateforme :

1. **Permettre au restaurateur d'annuler une réservation Zéro Attente et toute commande payée**, avec remboursement client. Aujourd'hui les commandes payées « spéciales » (Zéro Attente, Chef's Table, vente flash) sont verrouillées par `is_special_paid_order_locked` et le restaurateur ne peut pas les annuler une fois payées.
2. **Permettre à l'admin de procéder au remboursement directement depuis le dashboard admin** lorsqu'un client annule une commande/réservation payée. Aujourd'hui les RPC `cancel_*_by_customer` posent le flag d'annulation mais ne déclenchent aucun refund Stripe.
3. **Retirer toute mention « Miamz » de la comptabilité côté restaurateur** — l'information n'est utile qu'à l'admin.

## Décisions de scope (validées en brainstorming)

| Question | Choix |
|---|---|
| Annulation restaurateur d'un item payé | Toujours **remboursement intégral** avec **case de confirmation explicite** dans la dialog |
| Annulation client d'un item payé | **File de remboursement** dans le dashboard admin, validation manuelle requise |
| Contrôle admin sur le refund | Choix **intégral / partiel** + champ motif obligatoire |
| Impact comptable du refund | **Réversion automatique complète** (commission, part 90%, billing_fee) |
| Miamz côté restaurateur | **Retrait complet** (cartes, panneaux, libellés dans factures) |

## Architecture retenue (Approche 1)

Edge function unique `process-refund` qui centralise tous les appels à Stripe. Les RPC d'annulation posent uniquement le flag d'état, le front chaîne explicitement annulation puis refund. La file admin est calculée par requête SQL (`status='cancelled' AND payment_status IN ('paid','captured') AND refund_status IS NULL AND cancelled_by='customer'`).

Avantages :
- Un seul point d'entrée Stripe → audit, idempotence et tests faciles.
- La file admin est un simple filtre, sans table dédiée à maintenir.
- L'annulation et le refund restent transactionnellement indépendants : un échec Stripe ne défait pas l'annulation.

## Section 1 — Schéma BDD & couche RPC

### Nouvelles colonnes (sur `public.orders` ET `public.reservations`)

| Colonne | Type | Description |
|---|---|---|
| `refund_status` | text | `null`, `pending`, `partial`, `refunded`, `failed` |
| `refunded_amount_chf` | numeric(12,2) | Cumul remboursé (gère les refunds partiels successifs) |
| `refunded_at` | timestamptz | Date du dernier refund |
| `refund_reason` | text | Motif libre saisi par l'admin (ou code automatique côté restaurateur) |
| `refund_initiated_by` | text | `customer`, `restaurant`, `admin`, `system` |
| `stripe_refund_id` | text | ID du dernier refund Stripe (audit) |

### Nouvelle RPC `cancel_order_by_restaurant(p_order_id, p_reason_code, p_reason_details)`

- Symétrique à `cancel_reservation_by_restaurant` : raison obligatoire, vérifie ownership via `auth_owns_restaurant`.
- **Bypasse** le lock `is_special_paid_order_locked` (puisque la cancellation_reason est documentée et qu'un refund est imminent).
- Retourne `{ ok, payment_intent_id, payment_status, refund_eligible }` pour que le front décide ensuite si appeler `process-refund`.

### RPC `mark_refund_applied(entity_type, entity_id, amount_chf, stripe_refund_id, reason, initiated_by)`

- Appelée par la edge function en `service_role`.
- Met à jour les colonnes refund + insère une ligne `payment_transactions` (montant négatif) pour la traçabilité comptable.
- Idempotente sur `stripe_refund_id` : un second appel avec le même ID ne ré-incrémente pas `refunded_amount_chf`.
- Écrit dans `audit_logs` : `{ action: 'refund_applied', initiated_by, amount, entity_type, entity_id, stripe_refund_id }`.

### RPC `admin_get_refund_queue(p_status_filter, p_limit, p_offset)`

- Vérifie `auth_is_admin()`.
- Liste les commandes/réservations satisfaisant : `status='cancelled' AND payment_status IN ('paid','captured') AND (refund_status IS NULL OR refund_status='failed') AND cancelled_by='customer'`.
- Renvoie : `id, type ('order'|'reservation'), restaurant_id, restaurant_name, customer_name, customer_user_id, total_amount, refunded_amount_chf, available_to_refund, cancelled_at, cancellation_reason, payment_intent_id, refund_status`.

### Lift du lock `is_special_paid_order_locked`

La fonction `is_special_paid_order_locked` actuelle empêche le passage à `status='cancelled'` pour les commandes spéciales payées. On la modifie pour accepter la transition vers `cancelled` quand l'appel provient d'un contexte autorisé :
- L'appelant est `service_role` (les RPCs `cancel_order_by_restaurant` et `mark_refund_applied` tournent en `SECURITY DEFINER` et passent ce check).
- OU l'appelant est admin (`auth_is_admin()`).

Le lock continue de bloquer les UPDATE directs faits par un restaurateur tentant de passer `status='cancelled'` sans passer par la RPC dédiée. Concrètement : on ajoute en début de `is_special_paid_order_locked` un `IF auth.role() = 'service_role' OR public.auth_is_admin() THEN RETURN false; END IF;`.

## Section 2 — Edge function `process-refund`

**Fichier** : `supabase/functions/process-refund/index.ts`

### Inputs (POST JSON)

```ts
{
  entity_type: "order" | "reservation",
  entity_id: string,
  refund_mode: "full" | "partial",
  amount_chf?: number,        // requis si partial
  reason: string,             // motif libre (admin) ou code (restaurateur)
}
```

`initiated_by` est **déduit du caller** (admin via `auth_is_admin()`, restaurant via `auth_owns_restaurant()`), jamais accepté depuis le body.

### Pipeline

1. **Auth** via `_shared/auth.ts` :
   - Si rôle `admin` → autorisé toutes entités, `initiated_by='admin'`.
   - Si rôle `restaurateur` propriétaire de l'entité → autorisé, `initiated_by='restaurant'`.
   - Sinon → 403.
2. **Charge l'entité** via client admin. Vérifie :
   - Statut `cancelled` (sinon 409 — il faut annuler avant).
   - `payment_status IN ('paid','captured')`.
   - `stripe_payment_intent_id` non null (sinon 422).
   - `refund_status` n'est pas déjà `refunded` (idempotence).
3. **Calcul du montant** :
   - `full` → `total_amount - refunded_amount_chf`.
   - `partial` → `amount_chf`, rejeté si `> total_amount - refunded_amount_chf` ou `<= 0`.
4. **Appel Stripe** : `stripe.refunds.create({ payment_intent, amount: Math.round(montant * 100), metadata: { entity_type, entity_id, initiated_by, reason } })` avec `Idempotency-Key = ${entity_type}:${entity_id}:${refunded_amount_chf après update}`.
5. **Sur succès** : appelle RPC `mark_refund_applied` (en service_role) → met à jour colonnes + insère `payment_transactions` négatif + écrit dans `audit_logs`.
6. **Sur échec Stripe** : update `refund_status='failed'`, log l'erreur, retourne 502 avec le code Stripe.
7. **Notifications** : enqueue notification client (« remboursement de X CHF effectué »).

### Schéma de réponse

```ts
{ ok: true, refunded_amount: number, stripe_refund_id: string, refund_status: "partial" | "refunded" }
// ou { ok: false, error_code: string, error_message: string }
```

### Notes

- La fonction n'annule pas l'entité — elle assume que c'est déjà annulé. L'annulation et le refund sont 2 RPC distinctes côté front.
- Conversion CHF → centimes : `Math.round(amount * 100)` (Stripe attend des entiers).

## Section 3 — UI Restaurateur (annulation + refund consenti)

### Extension de `src/components/RestaurantCancellationDialog.tsx`

Nouveaux props :

```ts
type Props = {
  // … existants
  isPaid?: boolean;          // true si payment_status ∈ {paid, captured}
  amountChf?: number;        // montant à rembourser (full)
  paymentLabel?: string;     // ex: "TWINT •••• 1234" pour rappel UX
  entityType?: "order" | "reservation";
};
```

Comportement :
- Si `isPaid=true` → un bloc bordé visible apparait :
  > ⚠️ **Cette {commande|réservation} a été payée {amountChf} CHF**
  > ☐ Je confirme le remboursement intégral au client (obligatoire)
- Le bouton « Confirmer l'annulation » devient `disabled` tant que la case n'est pas cochée.
- Au clic : (1) appelle la RPC d'annulation, (2) si annulation OK ET item payé, appelle `processRefund({ refundMode: 'full' })`. Si le refund échoue, garde l'annulation, signale l'erreur via toast et suggère « contactez l'admin ».

### Intégration dans `src/pages/dashboard/DashboardCommandes.tsx` (nouveau bouton)

- Nouveau bouton **« Annuler la commande »** (variant `destructive`, icône `Ban`) sur les cartes en statut `confirmed`, `preparing`, `ready`, `pending_payment`.
- Pas affiché sur `delivered`, `cancelled`, `delivering`.
- Ouvre `RestaurantCancellationDialog` avec `entityType="order"` et `isPaid` calculé via `payment_status`.

### Nouveau helper `src/lib/orderMutations.ts::cancelOrderByRestaurant`

```ts
export async function cancelOrderByRestaurant(
  orderId: string,
  reasonCode: CancellationReasonCode,
  reasonDetails: string | null,
): Promise<OrderMutationResult>;
```

Miroir exact de `cancelReservationByRestaurant`.

### Intégration dans `src/pages/dashboard/DashboardReservations.tsx`

- Le bouton d'annulation existe déjà. On enrichit les props passés à `RestaurantCancellationDialog` avec `isPaid` (calculé via `feature='zero_attente'` ou `total_amount > 0` ET trace dans `payment_transactions`) et `amountChf`.
- Pour les **Zéro Attente** : `isPaid=true` systématique.

### Nouveau lib `src/lib/refundMutations.ts`

```ts
export async function processRefund(input: {
  entityType: "order" | "reservation";
  entityId: string;
  refundMode: "full" | "partial";
  amountChf?: number;
  reason: string;
}): Promise<
  | { ok: true; refundedAmount: number; stripeRefundId: string; refundStatus: "partial" | "refunded" }
  | { ok: false; errorCode: string; errorMessage: string }
>;
```

Appelle l'edge function `process-refund` via `invokeSupabaseFunction`.

## Section 4 — UI Admin (file de remboursement)

### Lieu

Intégration dans `src/pages/admin/AdminOrdersReservations.tsx` (déjà unifiée commandes+réservations).

### Modifications

- Nouvel onglet `Tabs` à côté de l'onglet existant : **« Remboursements »** (badge avec compteur de la file).
- Quand actif, on appelle `admin_get_refund_queue()` au lieu des requêtes existantes orders/reservations.

### Tableau de la file

| Date annul. | Type | N° référence | Restaurant | Client | Montant à rembourser | Motif client | Action |
|---|---|---|---|---|---|---|---|

### Composant `AdminRefundDialog` (nouveau, `src/components/admin/AdminRefundDialog.tsx`)

```
┌─ Remboursement #ORD-1234 ─────────────────────┐
│ Montant payé : 89.00 CHF                      │
│ Déjà remboursé : 0.00 CHF                     │
│ Disponible : 89.00 CHF                        │
│                                                │
│ ○ Remboursement intégral (89.00 CHF)          │
│ ○ Remboursement partiel  [____.__] CHF        │
│                                                │
│ Motif (obligatoire, min. 5 caractères) :      │
│ ┌──────────────────────────────────────────┐  │
│ │                                          │  │
│ └──────────────────────────────────────────┘  │
│                                                │
│ [Annuler]              [Confirmer le refund]  │
└────────────────────────────────────────────────┘
```

Validation :
- `partial` → `0.01 ≤ amount ≤ disponible`.
- Motif requis (≥ 5 char), persisté en `refund_reason`.
- Au confirm → appelle `processRefund` (le rôle admin est vérifié côté edge function via JWT).

### Bouton « Détails »

- Réutilise le `AdminOperationDetailSheet` existant pour afficher l'historique complet.
- Bouton « Rembourser » directement présent dans le sheet aussi.

### Refresh & sécurité

- Après refund réussi, `queryClient.invalidateQueries(["admin-refund-queue"])` pour retirer la ligne.
- Une commande/réservation refundée intégralement disparait de la file ; refundée partiellement reste avec montant disponible mis à jour.

## Section 5 — Réversion comptable automatique

### Modifications dans `src/lib/comptaCommissionSources.ts`

Calcul de la base de commission (utilisée pour part 90% / commission TOK 10%) :

```ts
// AVANT : grossAmount = total_amount + miamzDiscount
// APRÈS : grossAmount = (total_amount + miamzDiscount) - refunded_amount_chf
```

Idem réservations : `total_amount - refunded_amount_chf`.

### Modifications dans `dashboardFacturesShared.ts` et `adminComptaShared.ts`

On garde les lignes `cancelled` SI elles sont refundées (pour que la réversion soit visible), MAIS la base de calcul devient `gross - refunded_amount_chf`. Une ligne intégralement refundée → contribution nulle. Concrètement : on ajoute `refunded_amount_chf` au SELECT et on retire le filtre `status NOT IN (cancelled,…)` — la base de calcul fait le travail.

### Frais de réservation (`billing_fee_chf`)

Modification de `isBillableReservationFee` dans `dashboardFacturesShared.ts:168-171` :

```ts
function isBillableReservationFee(reservation: { cancelled_by, refund_status }) {
  if (reservation.refund_status === 'refunded') return false;
  // un refund partiel garde le billing_fee dû
  // … logique existante
}
```

Rationale : si le restaurateur annule (donc avec refund), il est juste de retirer le billing_fee.

### Section « Remboursements émis »

Nouveau bloc dans `AdminCompta.tsx` (admin only) : **« Remboursements émis ce mois »** avec total remboursé, breakdown par initiator (admin / restaurant / customer-auto).

Pas de bloc équivalent côté restaurateur.

### Tests à prévoir

- Commande payée 100 CHF refundée intégralement → commission TOK 10 → 0, part 90 → 0.
- Commande payée 100 CHF refundée 30 CHF → base 70 CHF, commission 7, part 63.
- Réservation Zero Attente confirmée puis annulée par restaurateur (refund full) → ni commission ni billing_fee.

## Section 6 — Retrait complet de Miamz côté restaurateur

### Fichiers modifiés

**`src/pages/dashboard/DashboardFactures.tsx`** :
- Supprimer la `AccountingMetricCard` « Remboursements Miamz » (lignes 112-118).
- Supprimer le `AccountingPanel` « Miamz remboursés par TOK » (lignes 204-226).
- Le grid de panneaux passe de `xl:grid-cols-3` à `xl:grid-cols-2`.
- Retirer les imports `Wallet` non utilisés ailleurs.

**`src/pages/dashboard/dashboardFacturesShared.ts`** :
- Supprimer du retour de `useDashboardFacturesData()` :
  - `miamzReimbursementsTotal`
  - `miamzReimbursementsOutstanding`
  - `miamzReimbursementsCount`
- Supprimer leur calcul (lignes 639-654).

**`src/pages/dashboard/DashboardFacturesInflow.tsx`** + **`DashboardFacturesOutflow.tsx`** :
- Audit complet à faire pour retirer toute mention « Miamz », « points », « réduction loyalty » dans les colonnes/badges/libellés.
- Si une ligne de facture détaillée affiche aujourd'hui « brut + remise Miamz », simplifier en montrant uniquement le **montant brut** (= base de commission).

**`src/pages/admin/AdminCompta.tsx`** + **`adminComptaShared.ts`** : **inchangés**.

### Vérification d'autres surfaces

- `grep -i miamz` sur tout `src/pages/dashboard/` et tout composant invoqué.
- Si un composant partagé (ex. `OrderPaymentBreakdown`) affiche « Miamz » → ajouter une prop `hideMiamz?: boolean` ou un mode (`restaurateur` / `admin`).

### Pas touché

- La logique de calcul de Miamz côté serveur (l'admin l'utilise, et `getPointsDiscountAmount` reste valide).
- L'affichage Miamz côté **client** (panier, confirmation, etc.).

## Section 7 — Stratégie de test & déploiement

### Tests unitaires

**`src/lib/__tests__/refundMutations.test.ts`** (vitest) :
- `processRefund` parse correctement la réponse en succès / erreur.
- Validation locale : `refund_mode='partial'` sans `amountChf` → rejette avant l'appel.

**`src/lib/__tests__/comptaCommissionSources.test.ts`** :
- Base de commission = `gross - refunded_amount_chf` (cas full / partial / zéro).

### Tests d'intégration SQL

**`supabase/tests/refunds.sql`** :
- `cancel_order_by_restaurant` → bypasse le lock pour Zero Attente / Chef's Table / flash sale.
- `cancel_order_by_restaurant` → 403 si l'appelant n'est pas owner ni admin.
- `mark_refund_applied` → idempotent sur `stripe_refund_id`.
- `admin_get_refund_queue` → renvoie uniquement annulations clients payées non refundées.

### Tests de la edge function

**`supabase/functions/process-refund/index.test.ts`** (Deno test runner — `deno test`) :
- Auth : 401 sans token, 403 si rôle invalide, 200 si admin/restaurateur owner.
- Idempotence : double appel avec même `Idempotency-Key` retourne le même `stripe_refund_id` (mock Stripe via `Deno.test` + stub).
- Calcul du montant : `full` après partial respecte `total - already_refunded`.
- Refund partial > montant restant → 422 sans appel Stripe.

### Tests E2E manuels (script `scripts/test-refund-flow.md`)

1. **Restaurateur annule Zéro Attente payée** : créer réservation, payer, annuler, vérifier (a) refund Stripe créé, (b) compta restaurateur n'inclut plus la ligne, (c) `billing_fee_chf` retiré.
2. **Client annule commande payée** : annuler côté client, vérifier ligne dans la file admin, refund partiel 30%, vérifier compta = `(total - 30%) × 0.10` en commission.
3. **Restaurateur annule commande non-payée** (`pending_payment`) : pas de case refund affichée, annulation directe, pas d'appel Stripe.

### Déploiement

Ordre des migrations :
1. **Migration SQL** (colonnes + RPCs + lift du lock) — déployable seule.
2. **Edge function `process-refund`** — déployable seule.
3. **Front** — UI restaurateur + admin + retrait Miamz, déployé ensemble.

Variables d'env nouvelles : aucune, on réutilise `STRIPE_SECRET_KEY` déjà présente.

**Rollback** : edge function désactivable, RPCs gardent l'ancien comportement si on retire la colonne `refunded_amount_chf` (zéro par défaut).

## Hors-scope

- Refund automatique selon règles de timing (> 24h / < 24h) — l'admin valide tout manuellement pour le moment.
- Mécanisme d'avoir / re-facturation manuelle pour les cas edge.
- Statistiques agrégées sur la file de remboursements (taux de refund par restaurant, etc.).
- Migration des annulations historiques (avant déploiement) qui n'ont pas été refundées : à traiter manuellement par l'admin via la même file (toutes les `cancelled_by='customer' AND payment_status='paid' AND refund_status IS NULL` apparaitront automatiquement dès activation).
