# Annulation avec remboursement (restaurateur + admin) & nettoyage Miamz — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux restaurateurs d'annuler des commandes/réservations payées avec remboursement intégral consenti, à l'admin de traiter une file de remboursements clients (avec choix intégral/partiel + motif), et retirer toute mention « Miamz » du dashboard restaurateur.

**Architecture:** Edge function unique `process-refund` qui centralise tous les appels Stripe Refund. Les RPC d'annulation posent uniquement le flag d'état ; le front chaîne explicitement annulation puis refund. La file admin est calculée par requête SQL filtrée. Réversion comptable automatique via `gross - refunded_amount_chf` dans la base de calcul des commissions.

**Tech Stack:** Supabase (Postgres + Edge Functions Deno), Stripe SDK npm:stripe@18.5.0, React + TypeScript + TanStack Query côté front, vitest pour les tests unitaires TS, deno test pour la edge function.

**Référence design** : `docs/superpowers/specs/2026-04-25-cancellation-refund-and-miamz-cleanup-design.md`

---

## File Structure

### Nouveaux fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql` | Ajoute colonnes refund_*, modifie `is_special_paid_*_locked` pour bypass service_role/admin |
| `supabase/migrations/20260426000100_cancel_order_by_restaurant.sql` | Crée RPC `cancel_order_by_restaurant`, lève le lock paid pour les annulations clients (file admin) |
| `supabase/migrations/20260426000200_refund_rpcs.sql` | Crée `mark_refund_applied` + `admin_get_refund_queue` |
| `supabase/functions/process-refund/index.ts` | Edge function : auth, calcul montant, appel Stripe, mark_refund_applied |
| `supabase/functions/process-refund/index.test.ts` | Tests Deno de la edge function (mock Stripe, mock supabase) |
| `src/lib/refundMutations.ts` | Helper client : `processRefund(...)` |
| `src/lib/__tests__/refundMutations.test.ts` | Tests unitaires du helper |
| `src/lib/__tests__/comptaCommissionSources.test.ts` | Tests pour la base = gross - refund |
| `src/components/admin/AdminRefundDialog.tsx` | Dialog admin choix intégral/partiel + motif |
| `src/pages/admin/useAdminRefundQueue.ts` | Hook tanstack-query pour `admin_get_refund_queue` |

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/components/RestaurantCancellationDialog.tsx` | Ajout props `isPaid`, `amountChf`, `paymentLabel`, `entityType` + bloc consentement refund |
| `src/lib/orderMutations.ts` | Ajout `cancelOrderByRestaurant` |
| `src/lib/reservationMutations.ts` | Pas de changement de signature, mais commentaires sur le chainage refund |
| `src/lib/comptaCommissionSources.ts` | `classifyOrderCommissionSource` et `classifyReservationCommissionSource` reçoivent désormais `refunded_amount_chf` ; nouveau helper `getNetCommissionGross` |
| `src/pages/dashboard/DashboardCommandes.tsx` | Bouton « Annuler la commande » + dialog wiring + chaînage refund |
| `src/pages/dashboard/DashboardReservations.tsx` | Enrichissement props passés au dialog (isPaid, amountChf) + chaînage refund après annulation |
| `src/pages/dashboard/DashboardFactures.tsx` | Suppression Miamz : carte métrique + panel |
| `src/pages/dashboard/dashboardFacturesShared.ts` | Suppression calculs Miamz du retour ; intégration `refunded_amount_chf` dans bases de calcul + `isBillableReservationFee` |
| `src/pages/dashboard/DashboardFacturesInflow.tsx` | Audit + retrait colonnes/labels Miamz |
| `src/pages/dashboard/DashboardFacturesOutflow.tsx` | Audit + retrait colonnes/labels Miamz |
| `src/pages/admin/AdminCompta.tsx` | Nouveau panneau « Remboursements émis ce mois » |
| `src/pages/admin/adminComptaShared.ts` | Intégration `refunded_amount_chf` dans bases de calcul + `useRefundsEmittedThisMonth` |
| `src/pages/admin/AdminOrdersReservations.tsx` | Onglet « Remboursements » + intégration dialog |
| `src/components/orders/OrderPaymentBreakdown.tsx` | Prop `audience: "restaurateur" \| "admin" \| "customer"` (masque Miamz si restaurateur) |

---

## Phase A — Database migrations

### Task 1: Schema — colonnes refund + bypass des locks

**Files:**
- Create: `supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- Adds refund tracking columns and lifts paid-special locks for service_role/admin contexts.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refunded_amount_chf numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refund_initiated_by text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refunded_amount_chf numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refund_initiated_by text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_refund_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN ('pending', 'partial', 'refunded', 'failed'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_refund_status_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN ('pending', 'partial', 'refunded', 'failed'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_refund_initiated_by_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_refund_initiated_by_check
  CHECK (refund_initiated_by IS NULL OR refund_initiated_by IN ('customer', 'restaurant', 'admin', 'system'));

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_refund_initiated_by_check;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_refund_initiated_by_check
  CHECK (refund_initiated_by IS NULL OR refund_initiated_by IN ('customer', 'restaurant', 'admin', 'system'));

CREATE INDEX IF NOT EXISTS idx_orders_refund_queue
  ON public.orders (status, payment_status, refund_status, cancelled_by)
  WHERE status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_reservations_refund_queue
  ON public.reservations (status, refund_status, cancelled_by)
  WHERE status = 'cancelled';

-- Lift the lock for service_role and admin contexts so RPCs marked SECURITY DEFINER
-- can flip status to cancelled / update refund columns even on paid-special items.

CREATE OR REPLACE FUNCTION public.is_special_paid_reservation_locked(
  p_feature text,
  p_status text,
  p_total_amount numeric,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_feature text := lower(COALESCE(trim(p_feature), ''));
  v_status text := lower(COALESCE(trim(p_status), ''));
BEGIN
  -- service_role and admin callers may always cancel + refund.
  IF auth.role() = 'service_role' OR public.auth_is_admin() THEN
    RETURN false;
  END IF;

  IF v_feature NOT IN ('zero-attente', 'chefs_table') THEN
    RETURN false;
  END IF;

  IF public.is_truthy_text(COALESCE(p_metadata ->> 'paid', NULL)) THEN
    RETURN true;
  END IF;

  RETURN COALESCE(p_total_amount, 0) > 0
    AND v_status NOT IN ('pending', 'pending_payment');
END;
$$;

CREATE OR REPLACE FUNCTION public.is_special_paid_order_locked(
  p_order_id uuid,
  p_payment_status text,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_status text := lower(COALESCE(trim(p_payment_status), ''));
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_feature text := lower(COALESCE(trim(v_metadata ->> 'feature'), ''));
BEGIN
  -- service_role and admin callers may always cancel + refund.
  IF auth.role() = 'service_role' OR public.auth_is_admin() THEN
    RETURN false;
  END IF;

  IF v_payment_status NOT IN ('captured', 'paid') THEN
    RETURN false;
  END IF;

  IF v_feature IN (
    'anti-gaspi', 'anti_waste', 'zero-gaspi',
    'ventes-flash', 'ventes_flash', 'flash_sale', 'flash-sale'
  ) THEN
    RETURN true;
  END IF;

  IF public.is_truthy_text(v_metadata ->> 'has_anti_gaspi')
     OR public.is_truthy_text(v_metadata ->> 'is_anti_waste')
     OR NULLIF(trim(COALESCE(v_metadata ->> 'anti_waste_offer_id', '')), '') IS NOT NULL THEN
    RETURN true;
  END IF;

  IF public.is_truthy_text(v_metadata ->> 'has_flash_sale')
     OR public.is_truthy_text(v_metadata ->> 'is_flash_sale')
     OR NULLIF(trim(COALESCE(v_metadata ->> 'flash_sale_id', '')), '') IS NOT NULL THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND (
        oi.anti_waste_offer_id IS NOT NULL
        OR NULLIF(trim(COALESCE(oi.metadata ->> 'flash_sale_id', '')), '') IS NOT NULL
        OR public.is_truthy_text(oi.metadata ->> 'is_anti_waste')
        OR public.is_truthy_text(oi.metadata ->> 'is_flash_sale')
      )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Vérifier la syntaxe avec supabase CLI (lint local)**

Run: `cd c:/Users/Pc/cloud-rebuild-recovered && npx supabase db lint --schema public 2>&1 | head -40`
Expected: pas d'erreur sur le nouveau fichier.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260426000000_refund_columns_and_lock_lift.sql
git commit -m "feat(db): add refund tracking columns + lift paid-special locks for service_role/admin"
```

---

### Task 2: RPC `cancel_order_by_restaurant` + relâchement client

**Files:**
- Create: `supabase/migrations/20260426000100_cancel_order_by_restaurant.sql`

Le restaurateur n'a pas aujourd'hui de RPC pour annuler une commande. Le client a `cancel_order_by_customer` mais qui rejette les commandes spéciales payées (`paid_locked`). Cette migration :
1. Crée `cancel_order_by_restaurant` (miroir de `cancel_reservation_by_restaurant`).
2. Modifie `cancel_order_by_customer` et `cancel_reservation_by_customer` pour **autoriser** la cancellation de spécial-paid (le refund sera traité dans la file admin).

- [ ] **Step 1: Créer la migration**

```sql
-- Adds restaurant-side order cancellation RPC and loosens customer cancel paths
-- so that paid special items can be cancelled and queued for admin refund.

CREATE OR REPLACE FUNCTION public.cancel_order_by_restaurant(
  p_order_id uuid,
  p_reason_code text,
  p_reason_details text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text,
  payment_intent_id text,
  payment_status text,
  refund_eligible boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_allowed text[] := ARRAY['closure','overbooking','kitchen_issue',
                            'customer_unreachable','private_event','duplicate_error','other'];
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Commande introuvable.';
    payment_intent_id := NULL; payment_status := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_order.restaurant_id) THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    payment_intent_id := NULL; payment_status := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF lower(COALESCE(v_order.status, '')) = 'cancelled' THEN
    ok := false; error_code := 'already_cancelled';
    error_message := 'Cette commande est deja annulee.';
    payment_intent_id := NULL; payment_status := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF lower(COALESCE(v_order.status, '')) IN ('delivered', 'delivering') THEN
    ok := false; error_code := 'invalid_state';
    error_message := 'Une commande livree ou en livraison ne peut plus etre annulee.';
    payment_intent_id := NULL; payment_status := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code IS NULL OR NOT (p_reason_code = ANY (v_allowed)) THEN
    ok := false; error_code := 'invalid_reason';
    error_message := 'Raison d''annulation invalide.';
    payment_intent_id := NULL; payment_status := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code = 'other'
     AND (p_reason_details IS NULL OR length(trim(p_reason_details)) < 3) THEN
    ok := false; error_code := 'missing_details';
    error_message := 'Les details sont requis pour la raison "Autre".';
    payment_intent_id := NULL; payment_status := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_at = COALESCE(cancelled_at, now()),
      cancelled_by = 'restaurant',
      cancellation_reason = COALESCE(NULLIF(trim(p_reason_details), ''), p_reason_code),
      updated_at = now()
  WHERE id = p_order_id;

  ok := true;
  error_code := NULL;
  error_message := NULL;
  payment_intent_id := v_order.stripe_payment_intent_id;
  payment_status := v_order.payment_status;
  refund_eligible := lower(COALESCE(v_order.payment_status, '')) IN ('paid', 'captured')
                     AND v_order.stripe_payment_intent_id IS NOT NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) TO service_role;

-- Update existing cancel_order_by_customer:
--   - allow cancel of paid-special items (refund will be queued for admin)
--   - return payment_intent_id / refund_eligible so the front can show "remboursement en cours"

CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(
  p_order_id uuid
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text,
  payment_intent_id text,
  refund_eligible boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Commande introuvable.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_order.user_id THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF lower(COALESCE(v_order.status, '')) = 'cancelled' THEN
    ok := false; error_code := 'already_cancelled';
    error_message := 'Cette commande est deja annulee.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF lower(COALESCE(v_order.status, '')) NOT IN ('confirmed', 'preparing', 'pending_payment') THEN
    ok := false; error_code := 'invalid_state';
    error_message := 'Cette commande ne peut plus etre annulee.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      cancelled_at = COALESCE(cancelled_at, now()),
      cancellation_reason = COALESCE(NULLIF(trim(COALESCE(cancellation_reason, '')), ''), 'customer_cancelled'),
      cancelled_by = 'customer',
      updated_at = now()
  WHERE id = p_order_id;

  ok := true;
  error_code := NULL;
  error_message := NULL;
  payment_intent_id := v_order.stripe_payment_intent_id;
  refund_eligible := lower(COALESCE(v_order.payment_status, '')) IN ('paid', 'captured')
                     AND v_order.stripe_payment_intent_id IS NOT NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) TO service_role;

-- Update cancel_reservation_by_customer to drop the paid_locked rejection so Zero
-- Attente / Chef's Table reservations can be cancelled and queued for admin refund.

CREATE OR REPLACE FUNCTION public.cancel_reservation_by_customer(
  p_reservation_id uuid
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text,
  payment_intent_id text,
  refund_eligible boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_charge public.payment_transactions%ROWTYPE;
  v_effective_dt timestamptz;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_res.user_id THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status IN ('cancelled','no_show') THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  v_effective_dt := (v_res.date::timestamp + v_res.time::time) AT TIME ZONE 'UTC';
  IF v_effective_dt - now() < interval '2 hours' THEN
    ok := false; error_code := 'too_late';
    error_message := 'Annulation impossible moins de 2h avant la reservation.';
    payment_intent_id := NULL; refund_eligible := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason_code = NULL,
      cancellation_reason_details = NULL,
      updated_at = now()
  WHERE id = p_reservation_id;

  -- Lookup the original Stripe charge to surface payment_intent_id for the refund queue.
  SELECT * INTO v_charge
  FROM public.payment_transactions
  WHERE type = 'charge'
    AND status = 'succeeded'
    AND metadata ->> 'reservation_id' = p_reservation_id::text
  ORDER BY created_at DESC
  LIMIT 1;

  ok := true;
  error_code := NULL;
  error_message := NULL;
  payment_intent_id := v_charge.stripe_payment_intent_id;
  refund_eligible := COALESCE(v_res.total_amount, 0) > 0
                     AND v_charge.stripe_payment_intent_id IS NOT NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260426000100_cancel_order_by_restaurant.sql
git commit -m "feat(db): cancel_order_by_restaurant + loosen customer cancel for paid items"
```

---

### Task 3: RPC `mark_refund_applied` + `admin_get_refund_queue`

**Files:**
- Create: `supabase/migrations/20260426000200_refund_rpcs.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- Marks a Stripe refund as applied to an order or reservation, and exposes the
-- admin refund queue (cancelled paid items awaiting refund).

CREATE OR REPLACE FUNCTION public.mark_refund_applied(
  p_entity_type text,
  p_entity_id uuid,
  p_amount_chf numeric,
  p_stripe_refund_id text,
  p_reason text,
  p_initiated_by text
)
RETURNS TABLE (
  ok boolean,
  refund_status text,
  refunded_amount_chf numeric,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_amount numeric;
  v_already numeric;
  v_new_total numeric;
  v_status text;
  v_initiated text := lower(COALESCE(trim(p_initiated_by), ''));
  v_existing_refund_id text;
  v_user_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    ok := false; refund_status := NULL; refunded_amount_chf := 0;
    error_code := 'forbidden'; error_message := 'Service role required.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_initiated NOT IN ('customer', 'restaurant', 'admin', 'system') THEN
    ok := false; refund_status := NULL; refunded_amount_chf := 0;
    error_code := 'invalid_initiator'; error_message := 'initiator invalid';
    RETURN NEXT; RETURN;
  END IF;

  IF p_amount_chf IS NULL OR p_amount_chf <= 0 THEN
    ok := false; refund_status := NULL; refunded_amount_chf := 0;
    error_code := 'invalid_amount'; error_message := 'amount must be > 0';
    RETURN NEXT; RETURN;
  END IF;

  IF p_entity_type = 'order' THEN
    SELECT total_amount, refunded_amount_chf, stripe_refund_id, user_id
      INTO v_total_amount, v_already, v_existing_refund_id, v_user_id
    FROM public.orders WHERE id = p_entity_id;
  ELSIF p_entity_type = 'reservation' THEN
    SELECT total_amount, refunded_amount_chf, stripe_refund_id, user_id
      INTO v_total_amount, v_already, v_existing_refund_id, v_user_id
    FROM public.reservations WHERE id = p_entity_id;
  ELSE
    ok := false; refund_status := NULL; refunded_amount_chf := 0;
    error_code := 'invalid_entity_type'; error_message := 'entity_type must be order or reservation';
    RETURN NEXT; RETURN;
  END IF;

  IF v_total_amount IS NULL THEN
    ok := false; refund_status := NULL; refunded_amount_chf := 0;
    error_code := 'not_found'; error_message := 'entity not found';
    RETURN NEXT; RETURN;
  END IF;

  -- Idempotency: same stripe_refund_id replayed = no-op.
  IF v_existing_refund_id IS NOT NULL AND v_existing_refund_id = p_stripe_refund_id THEN
    ok := true;
    refunded_amount_chf := v_already;
    refund_status := CASE
      WHEN v_already >= COALESCE(v_total_amount, 0) THEN 'refunded'
      WHEN v_already > 0 THEN 'partial'
      ELSE NULL
    END;
    error_code := NULL; error_message := NULL;
    RETURN NEXT; RETURN;
  END IF;

  v_new_total := COALESCE(v_already, 0) + p_amount_chf;
  IF v_new_total > COALESCE(v_total_amount, 0) + 0.005 THEN
    ok := false; refund_status := NULL; refunded_amount_chf := COALESCE(v_already, 0);
    error_code := 'amount_exceeds_total'; error_message := 'refund exceeds remaining';
    RETURN NEXT; RETURN;
  END IF;

  v_status := CASE
    WHEN v_new_total >= COALESCE(v_total_amount, 0) - 0.005 THEN 'refunded'
    ELSE 'partial'
  END;

  IF p_entity_type = 'order' THEN
    UPDATE public.orders
    SET refund_status = v_status,
        refunded_amount_chf = v_new_total,
        refunded_at = now(),
        refund_reason = p_reason,
        refund_initiated_by = v_initiated,
        stripe_refund_id = p_stripe_refund_id,
        updated_at = now()
    WHERE id = p_entity_id;
  ELSE
    UPDATE public.reservations
    SET refund_status = v_status,
        refunded_amount_chf = v_new_total,
        refunded_at = now(),
        refund_reason = p_reason,
        refund_initiated_by = v_initiated,
        stripe_refund_id = p_stripe_refund_id,
        updated_at = now()
    WHERE id = p_entity_id;
  END IF;

  -- Negative payment_transactions row for accounting traceability.
  INSERT INTO public.payment_transactions (
    user_id, stripe_payment_intent_id, amount, currency, type, status, metadata
  )
  VALUES (
    v_user_id,
    NULL,
    -p_amount_chf,
    'CHF',
    'refund',
    'succeeded',
    jsonb_build_object(
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'stripe_refund_id', p_stripe_refund_id,
      'initiated_by', v_initiated,
      'reason', p_reason
    )
  );

  ok := true;
  refund_status := v_status;
  refunded_amount_chf := v_new_total;
  error_code := NULL;
  error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, numeric, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, numeric, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_refund_queue(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  entity_id uuid,
  entity_type text,
  restaurant_id uuid,
  restaurant_name text,
  customer_user_id uuid,
  customer_name text,
  reference text,
  total_amount numeric,
  refunded_amount_chf numeric,
  available_to_refund numeric,
  cancelled_at timestamptz,
  cancellation_reason text,
  payment_intent_id text,
  refund_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    'order'::text,
    o.restaurant_id,
    rest.name,
    o.user_id,
    p.full_name,
    o.order_number,
    COALESCE(o.total_amount, 0)::numeric,
    COALESCE(o.refunded_amount_chf, 0)::numeric,
    GREATEST(COALESCE(o.total_amount, 0) - COALESCE(o.refunded_amount_chf, 0), 0)::numeric,
    o.cancelled_at,
    o.cancellation_reason,
    o.stripe_payment_intent_id,
    o.refund_status
  FROM public.orders o
  JOIN public.restaurants rest ON rest.id = o.restaurant_id
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE lower(COALESCE(o.status, '')) = 'cancelled'
    AND lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')
    AND lower(COALESCE(o.cancelled_by, '')) = 'customer'
    AND (o.refund_status IS NULL OR o.refund_status IN ('partial', 'failed'))
    AND o.stripe_payment_intent_id IS NOT NULL
  UNION ALL
  SELECT
    r.id,
    'reservation'::text,
    r.restaurant_id,
    rest.name,
    r.user_id,
    p.full_name,
    r.order_reference,
    COALESCE(r.total_amount, 0)::numeric,
    COALESCE(r.refunded_amount_chf, 0)::numeric,
    GREATEST(COALESCE(r.total_amount, 0) - COALESCE(r.refunded_amount_chf, 0), 0)::numeric,
    r.cancelled_at,
    r.cancellation_reason_details,
    pt.stripe_payment_intent_id,
    r.refund_status
  FROM public.reservations r
  JOIN public.restaurants rest ON rest.id = r.restaurant_id
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  LEFT JOIN LATERAL (
    SELECT stripe_payment_intent_id
    FROM public.payment_transactions
    WHERE type = 'charge' AND status = 'succeeded'
      AND metadata ->> 'reservation_id' = r.id::text
    ORDER BY created_at DESC LIMIT 1
  ) pt ON true
  WHERE lower(COALESCE(r.status, '')) = 'cancelled'
    AND lower(COALESCE(r.cancelled_by, '')) = 'customer'
    AND COALESCE(r.total_amount, 0) > 0
    AND (r.refund_status IS NULL OR r.refund_status IN ('partial', 'failed'))
    AND pt.stripe_payment_intent_id IS NOT NULL
  ORDER BY 11 DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_refund_queue(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_refund_queue(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_queue(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_queue(integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260426000200_refund_rpcs.sql
git commit -m "feat(db): mark_refund_applied + admin_get_refund_queue RPCs"
```

---

## Phase B — Edge function

### Task 4: Edge function `process-refund` (test first)

**Files:**
- Create: `supabase/functions/process-refund/index.ts`
- Test: `supabase/functions/process-refund/index.test.ts`

- [ ] **Step 1: Écrire le test Deno (qui échoue car le fichier n'existe pas encore)**

```ts
// supabase/functions/process-refund/index.test.ts
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";

// Stub Stripe before importing the handler.
const fakeStripe = {
  refunds: {
    create: (_args: any) => Promise.resolve({ id: "re_123", amount: 8900, status: "succeeded" }),
  },
};

const handlerModule = await import("./index.ts");

Deno.test("rejects unauthenticated requests", async () => {
  const req = new Request("http://x/", { method: "POST", body: JSON.stringify({}) });
  const res = await handlerModule.handle(req, { stripe: fakeStripe as any, supabase: makeSupabaseStub({ user: null }) });
  assertStrictEquals(res.status, 401);
});

Deno.test("rejects partial refund without amount", async () => {
  const req = makeRequest({ entity_type: "order", entity_id: "00000000-0000-0000-0000-000000000001", refund_mode: "partial", reason: "test test" });
  const res = await handlerModule.handle(req, makeContext({ entity: paidCancelledOrder() }));
  assertStrictEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error_code, "missing_amount");
});

Deno.test("computes full refund as remaining = total - already_refunded", async () => {
  const stripeMock = { refunds: { create: stub(fakeStripe.refunds, "create") as any } };
  const req = makeRequest({ entity_type: "order", entity_id: "00000000-0000-0000-0000-000000000001", refund_mode: "full", reason: "owner cancel" });
  const ctx = makeContext({
    entity: paidCancelledOrder({ total_amount: 100, refunded_amount_chf: 30 }),
    stripe: stripeMock as any,
  });
  await handlerModule.handle(req, ctx);
  const callArg = (stripeMock.refunds.create as any).calls[0].args[0];
  assertEquals(callArg.amount, 7000); // (100 - 30) * 100
});

Deno.test("rejects partial > remaining without calling Stripe", async () => {
  const created = stub(fakeStripe.refunds, "create");
  const req = makeRequest({ entity_type: "order", entity_id: "00000000-0000-0000-0000-000000000001", refund_mode: "partial", amount_chf: 200, reason: "test test" });
  const ctx = makeContext({ entity: paidCancelledOrder({ total_amount: 100, refunded_amount_chf: 0 }), stripe: { refunds: created } as any });
  const res = await handlerModule.handle(req, ctx);
  assertStrictEquals(res.status, 422);
  assertEquals((created as any).calls.length, 0);
});

// --- Test helpers ---

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://x/", {
    method: "POST",
    headers: { authorization: "Bearer fake-jwt", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paidCancelledOrder(over: Partial<any> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    restaurant_id: "rest-1",
    user_id: "user-1",
    status: "cancelled",
    payment_status: "paid",
    total_amount: 100,
    refunded_amount_chf: 0,
    refund_status: null,
    stripe_payment_intent_id: "pi_123",
    ...over,
  };
}

function makeSupabaseStub(opts: { user: any }) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: opts.user }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    rpc: () => Promise.resolve({ data: [{ ok: true, refund_status: "refunded", refunded_amount_chf: 100 }], error: null }),
  };
}

function makeContext(opts: { entity: any; stripe?: any }) {
  return {
    stripe: opts.stripe ?? fakeStripe,
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-1", app_metadata: { roles: ["admin"] } } }, error: null }) },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.entity, error: null }),
          }),
        }),
      }),
      rpc: (_fn: string, _args: any) => Promise.resolve({
        data: [{ ok: true, refund_status: "refunded", refunded_amount_chf: opts.entity.total_amount }],
        error: null,
      }),
    },
  };
}
```

- [ ] **Step 2: Vérifier que les tests échouent (fichier index.ts manquant)**

Run: `cd c:/Users/Pc/cloud-rebuild-recovered && deno test supabase/functions/process-refund/index.test.ts --allow-net --allow-env --no-check 2>&1 | tail -10`
Expected: `error: Module not found` ou similaire.

- [ ] **Step 3: Implémenter la edge function**

```ts
// supabase/functions/process-refund/index.ts
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

type EntityType = "order" | "reservation";
type RefundMode = "full" | "partial";

type Body = {
  entity_type?: EntityType;
  entity_id?: string;
  refund_mode?: RefundMode;
  amount_chf?: number;
  reason?: string;
};

type Ctx = {
  stripe: Stripe;
  supabase: ReturnType<typeof createClient>;
};

function json(payload: Record<string, unknown>, status: number, req?: Request) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...(req ? buildCorsHeaders(req) : {}),
    },
  });
}

function getEnv(name: string) {
  return Deno.env.get(name)?.trim() || "";
}

function defaultCtx(req: Request): Ctx {
  const adminToken = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";

  return {
    stripe: new Stripe(getEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-11-20.acacia" }),
    supabase: createClient(getEnv("SUPABASE_URL"), adminToken, {
      global: { headers: { authorization: `Bearer ${userToken}` } },
    }),
  };
}

async function resolveCallerRole(ctx: Ctx) {
  const { data: userData } = await ctx.supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { user: null, role: null as null | "admin" | "restaurant" };

  // Admin role check via user_roles table.
  const { data: rolesData } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = (rolesData || []).some((r: any) => r.role === "admin" || r.role === "super_admin");
  if (isAdmin) return { user, role: "admin" as const };

  return { user, role: "restaurant" as const };
}

async function loadEntity(ctx: Ctx, type: EntityType, id: string) {
  const table = type === "order" ? "orders" : "reservations";
  const { data, error } = await ctx.supabase
    .from(table)
    .select("id, restaurant_id, user_id, status, payment_status, total_amount, refunded_amount_chf, refund_status, stripe_payment_intent_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function ensureOwnership(ctx: Ctx, userId: string, restaurantId: string) {
  const { data, error } = await ctx.supabase
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function fetchPaymentIntent(ctx: Ctx, type: EntityType, entity: any): Promise<string | null> {
  if (type === "order") return entity.stripe_payment_intent_id ?? null;

  const { data } = await ctx.supabase
    .from("payment_transactions")
    .select("stripe_payment_intent_id")
    .eq("type", "charge")
    .eq("status", "succeeded")
    .filter("metadata->>reservation_id", "eq", entity.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.stripe_payment_intent_id ?? null;
}

export async function handle(req: Request, ctx: Ctx = defaultCtx(req)): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsPreflight(req)!;
  if (req.method !== "POST") return json({ ok: false, error_code: "method_not_allowed", error_message: "POST required" }, 405, req);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error_code: "invalid_body", error_message: "JSON body required" }, 400, req);
  }

  const entityType = body.entity_type;
  const entityId = body.entity_id;
  const refundMode = body.refund_mode;
  const reason = (body.reason || "").trim();

  if (entityType !== "order" && entityType !== "reservation") {
    return json({ ok: false, error_code: "invalid_entity_type", error_message: "entity_type must be order|reservation" }, 400, req);
  }
  if (!entityId) {
    return json({ ok: false, error_code: "missing_entity_id", error_message: "entity_id required" }, 400, req);
  }
  if (refundMode !== "full" && refundMode !== "partial") {
    return json({ ok: false, error_code: "invalid_refund_mode", error_message: "refund_mode must be full|partial" }, 400, req);
  }
  if (refundMode === "partial" && (typeof body.amount_chf !== "number" || body.amount_chf <= 0)) {
    return json({ ok: false, error_code: "missing_amount", error_message: "amount_chf required for partial" }, 422, req);
  }
  if (reason.length < 3) {
    return json({ ok: false, error_code: "missing_reason", error_message: "reason required (>= 3 chars)" }, 422, req);
  }

  const { user, role } = await resolveCallerRole(ctx);
  if (!user || !role) return json({ ok: false, error_code: "unauthenticated", error_message: "auth required" }, 401, req);

  const entity = await loadEntity(ctx, entityType, entityId);
  if (!entity) return json({ ok: false, error_code: "not_found", error_message: "entity not found" }, 404, req);

  let initiatedBy: "admin" | "restaurant";
  if (role === "admin") {
    initiatedBy = "admin";
  } else {
    const owns = await ensureOwnership(ctx, user.id, entity.restaurant_id);
    if (!owns) return json({ ok: false, error_code: "forbidden", error_message: "not your restaurant" }, 403, req);
    initiatedBy = "restaurant";
  }

  if (String(entity.status).toLowerCase() !== "cancelled") {
    return json({ ok: false, error_code: "not_cancelled", error_message: "entity must be cancelled before refund" }, 409, req);
  }
  if (entityType === "order" && !["paid", "captured"].includes(String(entity.payment_status).toLowerCase())) {
    return json({ ok: false, error_code: "not_paid", error_message: "entity payment_status must be paid|captured" }, 422, req);
  }
  if (entity.refund_status === "refunded") {
    return json({ ok: false, error_code: "already_refunded", error_message: "entity already refunded" }, 409, req);
  }

  const total = Number(entity.total_amount || 0);
  const already = Number(entity.refunded_amount_chf || 0);
  const remaining = Math.max(total - already, 0);
  const amount = refundMode === "full" ? remaining : Number(body.amount_chf);

  if (amount <= 0) {
    return json({ ok: false, error_code: "nothing_to_refund", error_message: "no remaining balance" }, 422, req);
  }
  if (amount > remaining + 0.005) {
    return json({ ok: false, error_code: "amount_exceeds_remaining", error_message: `max ${remaining.toFixed(2)} CHF` }, 422, req);
  }

  const paymentIntent = await fetchPaymentIntent(ctx, entityType, entity);
  if (!paymentIntent) {
    return json({ ok: false, error_code: "no_payment_intent", error_message: "missing payment_intent_id" }, 422, req);
  }

  let refund: Stripe.Refund;
  try {
    refund = await ctx.stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount: Math.round(amount * 100),
        metadata: {
          entity_type: entityType,
          entity_id: entityId,
          initiated_by: initiatedBy,
          reason,
        },
      },
      { idempotencyKey: `${entityType}:${entityId}:${already.toFixed(2)}` },
    );
  } catch (err) {
    const code = (err as any)?.code || "stripe_error";
    return json({ ok: false, error_code: code, error_message: (err as Error).message }, 502, req);
  }

  const { data: rpcData, error: rpcError } = await ctx.supabase.rpc("mark_refund_applied", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_amount_chf: amount,
    p_stripe_refund_id: refund.id,
    p_reason: reason,
    p_initiated_by: initiatedBy,
  });
  if (rpcError) {
    return json({ ok: false, error_code: "mark_refund_failed", error_message: rpcError.message, stripe_refund_id: refund.id }, 500, req);
  }

  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return json({
    ok: true,
    refunded_amount: Number(result?.refunded_amount_chf || amount),
    refund_status: String(result?.refund_status || "refunded"),
    stripe_refund_id: refund.id,
  }, 200, req);
}

Deno.serve((req) => handle(req));
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `deno test supabase/functions/process-refund/index.test.ts --allow-net --allow-env --no-check`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/process-refund/index.ts supabase/functions/process-refund/index.test.ts
git commit -m "feat(edge): process-refund edge function with Stripe + idempotency"
```

---

## Phase C — Client utilities

### Task 5: `refundMutations.ts` + `cancelOrderByRestaurant`

**Files:**
- Create: `src/lib/refundMutations.ts`
- Test: `src/lib/__tests__/refundMutations.test.ts`
- Modify: `src/lib/orderMutations.ts`

- [ ] **Step 1: Écrire le test pour `processRefund` et `cancelOrderByRestaurant`**

```ts
// src/lib/__tests__/refundMutations.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({
  invokeSupabaseFunction: vi.fn(),
}));

import { invokeSupabaseFunction } from "@/lib/session";
import { processRefund } from "../refundMutations";

describe("processRefund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects partial without amount before calling the function", async () => {
    const result = await processRefund({
      entityType: "order",
      entityId: "abc",
      refundMode: "partial",
      reason: "test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("missing_amount");
    expect(invokeSupabaseFunction).not.toHaveBeenCalled();
  });

  it("returns success when edge function returns ok payload", async () => {
    (invokeSupabaseFunction as any).mockResolvedValue({
      data: { ok: true, refunded_amount: 89, refund_status: "refunded", stripe_refund_id: "re_1" },
      error: null,
    });
    const result = await processRefund({
      entityType: "order",
      entityId: "abc",
      refundMode: "full",
      reason: "client refund",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refundedAmount).toBe(89);
      expect(result.stripeRefundId).toBe("re_1");
      expect(result.refundStatus).toBe("refunded");
    }
  });

  it("returns failure on transport error", async () => {
    (invokeSupabaseFunction as any).mockResolvedValue({ data: null, error: new Error("network down") });
    const result = await processRefund({
      entityType: "order",
      entityId: "abc",
      refundMode: "full",
      reason: "client refund",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("transport_error");
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue (fichier manquant)**

Run: `npx vitest run src/lib/__tests__/refundMutations.test.ts 2>&1 | tail -15`
Expected: FAIL — `Cannot find module '../refundMutations'`.

- [ ] **Step 3: Implémenter `refundMutations.ts`**

```ts
// src/lib/refundMutations.ts
import { invokeSupabaseFunction } from "@/lib/session";

export type RefundEntityType = "order" | "reservation";
export type RefundMode = "full" | "partial";

export type ProcessRefundInput = {
  entityType: RefundEntityType;
  entityId: string;
  refundMode: RefundMode;
  amountChf?: number;
  reason: string;
};

export type ProcessRefundResult =
  | { ok: true; refundedAmount: number; stripeRefundId: string; refundStatus: "partial" | "refunded" }
  | { ok: false; errorCode: string; errorMessage: string };

export async function processRefund(input: ProcessRefundInput): Promise<ProcessRefundResult> {
  if (input.refundMode === "partial" && (typeof input.amountChf !== "number" || input.amountChf <= 0)) {
    return { ok: false, errorCode: "missing_amount", errorMessage: "Montant requis pour un remboursement partiel." };
  }
  if (!input.reason || input.reason.trim().length < 3) {
    return { ok: false, errorCode: "missing_reason", errorMessage: "Motif requis (3 caracteres min)." };
  }

  const { data, error } = await invokeSupabaseFunction("process-refund", {
    body: {
      entity_type: input.entityType,
      entity_id: input.entityId,
      refund_mode: input.refundMode,
      amount_chf: input.amountChf,
      reason: input.reason.trim(),
    },
  });

  if (error) {
    return { ok: false, errorCode: "transport_error", errorMessage: error.message };
  }
  if (!data?.ok) {
    return {
      ok: false,
      errorCode: String(data?.error_code || "unknown_error"),
      errorMessage: String(data?.error_message || "Remboursement impossible."),
    };
  }

  return {
    ok: true,
    refundedAmount: Number(data.refunded_amount),
    stripeRefundId: String(data.stripe_refund_id),
    refundStatus: data.refund_status === "partial" ? "partial" : "refunded",
  };
}
```

- [ ] **Step 4: Ajouter `cancelOrderByRestaurant` à `orderMutations.ts`**

Modifier `src/lib/orderMutations.ts` — ajouter en bas du fichier, avant le dernier `}` :

```ts
import type { CancellationReasonCode } from "@/lib/reservationMutations";

type SafeCancelOrderByRestaurantRow = {
  ok: boolean | null;
  error_code: string | null;
  error_message: string | null;
  payment_intent_id: string | null;
  payment_status: string | null;
  refund_eligible: boolean | null;
};

export type CancelOrderByRestaurantResult = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
  refundEligible?: boolean;
};

export async function cancelOrderByRestaurant(
  orderId: string,
  reasonCode: CancellationReasonCode,
  reasonDetails: string | null,
): Promise<CancelOrderByRestaurantResult> {
  const { data, error } = await (getSupabase().rpc as any)("cancel_order_by_restaurant", {
    p_order_id: orderId,
    p_reason_code: reasonCode,
    p_reason_details: reasonDetails,
  });

  if (error) throw error;

  const result = getFirstRow<SafeCancelOrderByRestaurantRow>(data);
  if (!result) {
    throw new Error("Reponse serveur invalide.");
  }

  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.error_code || "validation_error",
      errorMessage: result.error_message || "Annulation impossible.",
    };
  }

  return {
    ok: true,
    paymentIntentId: result.payment_intent_id,
    paymentStatus: result.payment_status,
    refundEligible: Boolean(result.refund_eligible),
  };
}
```

- [ ] **Step 5: Vérifier que les tests passent**

Run: `npx vitest run src/lib/__tests__/refundMutations.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/refundMutations.ts src/lib/__tests__/refundMutations.test.ts src/lib/orderMutations.ts
git commit -m "feat(client): processRefund helper + cancelOrderByRestaurant"
```

---

## Phase D — Restaurateur UI

### Task 6: Étendre `RestaurantCancellationDialog` avec consentement refund

**Files:**
- Modify: `src/components/RestaurantCancellationDialog.tsx`

- [ ] **Step 1: Réécrire le composant avec props refund**

Remplacer tout le contenu de `src/components/RestaurantCancellationDialog.tsx` par :

```tsx
import { useState } from "react";
import { AlertTriangle, CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CANCELLATION_REASONS, type CancellationReasonCode } from "@/lib/reservationMutations";

type Props = {
  open: boolean;
  reservationLabel?: string;
  submitting?: boolean;
  isPaid?: boolean;
  amountChf?: number;
  paymentLabel?: string;
  entityType?: "order" | "reservation";
  onOpenChange: (open: boolean) => void;
  onConfirm: (reasonCode: CancellationReasonCode, details: string | null) => void;
};

export default function RestaurantCancellationDialog({
  open,
  reservationLabel,
  submitting = false,
  isPaid = false,
  amountChf,
  paymentLabel,
  entityType = "reservation",
  onOpenChange,
  onConfirm,
}: Props) {
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | "">("");
  const [details, setDetails] = useState("");
  const [refundConsent, setRefundConsent] = useState(false);

  const needsDetails = reasonCode === "other";
  const detailsTooShort = needsDetails && details.trim().length < 3;
  const refundOk = !isPaid || refundConsent;
  const canSubmit = reasonCode !== "" && !detailsTooShort && refundOk && !submitting;
  const noun = entityType === "order" ? "commande" : "reservation";
  const formattedAmount = typeof amountChf === "number" ? `${amountChf.toFixed(2)} CHF` : "";

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(reasonCode as CancellationReasonCode, details.trim() ? details.trim() : null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReasonCode("");
      setDetails("");
      setRefundConsent(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Annuler cette {noun} ?
          </DialogTitle>
          <DialogDescription>
            {reservationLabel ? <span className="font-medium">{reservationLabel}. </span> : null}
            Une raison est obligatoire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Raison</Label>
            <Select
              value={reasonCode}
              onValueChange={(value) => setReasonCode(value as CancellationReasonCode)}
            >
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder="Selectionner une raison" />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-details">
              Details{" "}
              {needsDetails ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground">(optionnel)</span>
              )}
            </Label>
            <Textarea
              id="cancel-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={
                needsDetails
                  ? "Expliquez la raison de l'annulation"
                  : "Informations additionnelles"
              }
              rows={3}
            />
            {detailsTooShort ? (
              <p className="text-xs text-destructive">Au moins 3 caracteres requis.</p>
            ) : null}
          </div>

          {isPaid ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="flex items-start gap-2">
                <CreditCard className="mt-0.5 h-4 w-4 text-amber-700" />
                <div className="flex-1 space-y-2">
                  <p className="font-medium text-amber-900">
                    Cette {noun} a ete payee {formattedAmount}
                    {paymentLabel ? ` (${paymentLabel})` : ""}.
                  </p>
                  <p className="text-amber-800">
                    L'annulation declenchera un remboursement integral au client via Stripe.
                  </p>
                  <label className="flex items-start gap-2 text-amber-900">
                    <Checkbox
                      checked={refundConsent}
                      onCheckedChange={(value) => setRefundConsent(value === true)}
                      className="mt-0.5"
                    />
                    <span>Je confirme le remboursement integral au client.</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Ne pas annuler
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canSubmit}>
            Confirmer l'annulation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Vérifier la compilation TS**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep RestaurantCancellationDialog`
Expected: aucune erreur sur ce fichier.

- [ ] **Step 3: Commit**

```bash
git add src/components/RestaurantCancellationDialog.tsx
git commit -m "feat(ui): RestaurantCancellationDialog supports paid items + refund consent"
```

---

### Task 7: Bouton « Annuler la commande » + chaînage refund dans `DashboardCommandes`

**Files:**
- Modify: `src/pages/dashboard/DashboardCommandes.tsx`

- [ ] **Step 1: Ajouter les imports**

Au sommet du fichier, après les autres imports, ajouter :

```tsx
import { Button } from "@/components/ui/button";
import { Ban } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import RestaurantCancellationDialog from "@/components/RestaurantCancellationDialog";
import { cancelOrderByRestaurant } from "@/lib/orderMutations";
import { processRefund } from "@/lib/refundMutations";
import type { CancellationReasonCode } from "@/lib/reservationMutations";
```

- [ ] **Step 2: Ajouter l'état et la mutation au composant**

Dans le corps de `DashboardCommandes`, après les `useState` existants, ajouter :

```tsx
const [cancelTarget, setCancelTarget] = useState<DashboardOrder | null>(null);

const cancelOrderMutation = useMutation({
  mutationFn: async ({
    order,
    reasonCode,
    details,
  }: {
    order: DashboardOrder;
    reasonCode: CancellationReasonCode;
    details: string | null;
  }) => {
    const cancellation = await cancelOrderByRestaurant(order.id, reasonCode, details);
    if (!cancellation.ok) {
      throw new Error(cancellation.errorMessage || "Annulation impossible.");
    }
    if (cancellation.refundEligible) {
      const refund = await processRefund({
        entityType: "order",
        entityId: order.id,
        refundMode: "full",
        reason: details || reasonCode,
      });
      if (!refund.ok) {
        return { cancelled: true, refunded: false, refundError: refund.errorMessage };
      }
      return { cancelled: true, refunded: true };
    }
    return { cancelled: true, refunded: false };
  },
  onSuccess: (result) => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-all-orders", selectedId] });
    setCancelTarget(null);
    if (result.refunded) {
      toast({ title: "Commande annulee", description: "Le client a ete rembourse integralement." });
    } else if (result.refundError) {
      toast({
        title: "Commande annulee mais refund echoue",
        description: `${result.refundError}. Contactez l'admin pour terminer le remboursement.`,
        variant: "destructive",
      });
    } else {
      toast({ title: "Commande annulee", description: "La raison a ete enregistree." });
    }
  },
  onError: (error: Error) => {
    toast({ title: "Annulation impossible", description: error.message, variant: "destructive" });
  },
});

const isOrderCancellable = (order: DashboardOrder) => {
  const status = String(order.status || "").toLowerCase();
  return ["confirmed", "preparing", "ready", "pending_payment"].includes(status);
};

const isOrderPaid = (order: DashboardOrder) => {
  const meta = order.metadata || {};
  const paymentStatus = String((meta as any).payment_status || "").toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "captured" || Number(order.total_amount) > 0;
};
```

- [ ] **Step 3: Ajouter le bouton dans le rendu de chaque commande**

Localiser le bloc de rendu d'une commande (recherche le `<Card>` ou `<AccordionItem>` qui affiche `order.order_number`). Ajouter à la fin de la zone de boutons d'action :

```tsx
{isOrderCancellable(order) ? (
  <Button
    variant="destructive"
    size="sm"
    onClick={() => setCancelTarget(order)}
  >
    <Ban className="mr-2 h-3.5 w-3.5" />
    Annuler la commande
  </Button>
) : null}
```

- [ ] **Step 4: Ajouter le rendu du dialog en bas du composant (avant la fermeture du `DashboardLayout`)**

```tsx
<RestaurantCancellationDialog
  open={!!cancelTarget}
  reservationLabel={cancelTarget ? `Commande #${cancelTarget.order_number || cancelTarget.id.slice(0, 8)}` : undefined}
  submitting={cancelOrderMutation.isPending}
  entityType="order"
  isPaid={cancelTarget ? isOrderPaid(cancelTarget) : false}
  amountChf={cancelTarget ? Number(cancelTarget.total_amount || 0) : undefined}
  onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
  onConfirm={(reasonCode, details) => {
    if (cancelTarget) {
      cancelOrderMutation.mutate({ order: cancelTarget, reasonCode, details });
    }
  }}
/>
```

- [ ] **Step 5: Vérifier le build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "DashboardCommandes" | head -10`
Expected: aucune erreur.

- [ ] **Step 6: Smoke test (dev server)**

Run: `npm run dev` (à laisser tourner manuellement). Ouvrir une commande `confirmed` dans le dashboard restaurateur, cliquer « Annuler la commande », vérifier que le dialog apparait et que la case de consentement s'affiche si la commande est payée.

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboard/DashboardCommandes.tsx
git commit -m "feat(ui): cancel button + refund chain on DashboardCommandes"
```

---

### Task 8: Chaînage refund dans `DashboardReservations`

**Files:**
- Modify: `src/pages/dashboard/DashboardReservations.tsx`

- [ ] **Step 1: Ajouter `processRefund` à l'import**

Ajouter en haut du fichier :

```tsx
import { processRefund } from "@/lib/refundMutations";
```

- [ ] **Step 2: Étendre `cancelMutation` pour chaîner le refund**

Localiser le `cancelMutation` (vers ligne 183). Remplacer son contenu par :

```tsx
const cancelMutation = useMutation({
  mutationFn: async ({
    id,
    reasonCode,
    details,
    isPaid,
  }: {
    id: string;
    reasonCode: CancellationReasonCode;
    details: string | null;
    isPaid: boolean;
  }) => {
    const result = await cancelReservationByRestaurant(id, reasonCode, details);
    if (!result.ok) {
      throw new Error(result.errorMessage);
    }

    try {
      await dispatchQueuedNotifications("dashboard-reservation-status");
    } catch (dispatchError) {
      console.error("Reservation cancellation notification dispatch failed:", dispatchError);
    }

    if (isPaid) {
      const refund = await processRefund({
        entityType: "reservation",
        entityId: id,
        refundMode: "full",
        reason: details || reasonCode,
      });
      if (!refund.ok) {
        return { id, refunded: false, refundError: refund.errorMessage };
      }
      return { id, refunded: true };
    }

    return { id, refunded: false };
  },
  onSuccess: (result) => {
    if (result.refunded) {
      toast({ title: "Reservation annulee", description: "Le client a ete rembourse integralement." });
    } else if ("refundError" in result && result.refundError) {
      toast({
        title: "Reservation annulee mais refund echoue",
        description: `${result.refundError}. Contactez l'admin pour terminer le remboursement.`,
        variant: "destructive",
      });
    } else {
      toast({ title: "Reservation annulee", description: "La raison a ete enregistree." });
    }
    queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
    setCancelTarget(null);
  },
  onError: (error: Error) => {
    toast({ title: "Annulation impossible", description: error.message, variant: "destructive" });
  },
});
```

- [ ] **Step 3: Calculer `isPaid` côté UI et passer les props au dialog**

Localiser le rendu de `RestaurantCancellationDialog` (recherche `RestaurantCancellationDialog` dans le fichier). Remplacer le bloc par :

```tsx
{cancelTarget ? (() => {
  const totalAmount = Number(cancelTarget.total_amount || 0);
  const feature = String((cancelTarget.feature || "")).toLowerCase();
  const isPaid = feature === "zero-attente" || feature === "chefs_table" || totalAmount > 0;
  return (
    <RestaurantCancellationDialog
      open={true}
      reservationLabel={`Reservation ${cancelTarget.date} ${cancelTarget.time?.slice(0, 5) || ""} - ${cancelTarget.party_size} pers.`}
      submitting={cancelMutation.isPending}
      entityType="reservation"
      isPaid={isPaid}
      amountChf={isPaid ? totalAmount : undefined}
      onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
      onConfirm={(reasonCode, details) =>
        cancelMutation.mutate({
          id: cancelTarget.id,
          reasonCode,
          details,
          isPaid,
        })
      }
    />
  );
})() : null}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep DashboardReservations | head -5`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/DashboardReservations.tsx
git commit -m "feat(ui): chain refund after restaurant-side reservation cancellation"
```

---

## Phase E — Admin refund queue

### Task 9: Hook + page tab + dialog admin

**Files:**
- Create: `src/pages/admin/useAdminRefundQueue.ts`
- Create: `src/components/admin/AdminRefundDialog.tsx`
- Modify: `src/pages/admin/AdminOrdersReservations.tsx`

- [ ] **Step 1: Créer le hook `useAdminRefundQueue`**

```ts
// src/pages/admin/useAdminRefundQueue.ts
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";

export type AdminRefundQueueItem = {
  entityId: string;
  entityType: "order" | "reservation";
  restaurantId: string;
  restaurantName: string;
  customerUserId: string | null;
  customerName: string | null;
  reference: string | null;
  totalAmount: number;
  refundedAmountChf: number;
  availableToRefund: number;
  cancelledAt: string;
  cancellationReason: string | null;
  paymentIntentId: string;
  refundStatus: string | null;
};

const supabase = getSupabase();

export function useAdminRefundQueue() {
  return useQuery({
    queryKey: ["admin-refund-queue"],
    queryFn: async (): Promise<AdminRefundQueueItem[]> => {
      const { data, error } = await (supabase.rpc as any)("admin_get_refund_queue", {
        p_limit: 200,
        p_offset: 0,
      });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        entityId: String(row.entity_id),
        entityType: row.entity_type === "reservation" ? "reservation" : "order",
        restaurantId: String(row.restaurant_id || ""),
        restaurantName: String(row.restaurant_name || ""),
        customerUserId: row.customer_user_id ? String(row.customer_user_id) : null,
        customerName: row.customer_name ? String(row.customer_name) : null,
        reference: row.reference ? String(row.reference) : null,
        totalAmount: Number(row.total_amount || 0),
        refundedAmountChf: Number(row.refunded_amount_chf || 0),
        availableToRefund: Number(row.available_to_refund || 0),
        cancelledAt: String(row.cancelled_at || ""),
        cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
        paymentIntentId: String(row.payment_intent_id || ""),
        refundStatus: row.refund_status ? String(row.refund_status) : null,
      }));
    },
  });
}
```

- [ ] **Step 2: Créer le composant `AdminRefundDialog`**

```tsx
// src/components/admin/AdminRefundDialog.tsx
import { useState } from "react";
import { Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { AdminRefundQueueItem } from "@/pages/admin/useAdminRefundQueue";

type Props = {
  open: boolean;
  item: AdminRefundQueueItem | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (mode: "full" | "partial", amount: number, reason: string) => void;
};

export default function AdminRefundDialog({ open, item, submitting, onOpenChange, onConfirm }: Props) {
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState("");

  if (!item) return null;

  const partialAmount = Number(amountInput.replace(",", "."));
  const partialInvalid = mode === "partial" && (!Number.isFinite(partialAmount)
    || partialAmount <= 0
    || partialAmount > item.availableToRefund + 0.005);
  const reasonTooShort = reason.trim().length < 5;
  const canSubmit = !submitting && !partialInvalid && !reasonTooShort;

  const handleClose = (next: boolean) => {
    if (!next) {
      setMode("full");
      setAmountInput("");
      setReason("");
    }
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (!canSubmit) return;
    const amount = mode === "full" ? item.availableToRefund : partialAmount;
    onConfirm(mode, amount, reason.trim());
  };

  const ref = item.reference || item.entityId.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Remboursement {item.entityType === "order" ? "commande" : "reservation"} #{ref}
          </DialogTitle>
          <DialogDescription>
            {item.restaurantName} - {item.customerName || "Client inconnu"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/40 p-3">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Paye</p>
              <p className="font-medium">{item.totalAmount.toFixed(2)} CHF</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Deja remb.</p>
              <p className="font-medium">{item.refundedAmountChf.toFixed(2)} CHF</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Disponible</p>
              <p className="font-semibold text-emerald-700">{item.availableToRefund.toFixed(2)} CHF</p>
            </div>
          </div>

          <RadioGroup value={mode} onValueChange={(value) => setMode(value as "full" | "partial")} className="space-y-2">
            <label className="flex items-center gap-2">
              <RadioGroupItem value="full" />
              <span>Remboursement integral ({item.availableToRefund.toFixed(2)} CHF)</span>
            </label>
            <label className="flex items-center gap-2">
              <RadioGroupItem value="partial" />
              <span>Remboursement partiel</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                disabled={mode !== "partial"}
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                className="ml-2 h-8 w-28"
              />
              <span className="text-muted-foreground">CHF</span>
            </label>
          </RadioGroup>

          {partialInvalid ? (
            <p className="text-xs text-destructive">
              Montant invalide (entre 0.01 et {item.availableToRefund.toFixed(2)} CHF).
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="refund-reason">Motif (5 caracteres min.)</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex: annulation client > 24h, faute de service, geste commercial..."
              rows={3}
            />
            {reasonTooShort && reason.length > 0 ? (
              <p className="text-xs text-destructive">5 caracteres min.</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            Confirmer le refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Intégrer l'onglet « Remboursements » dans `AdminOrdersReservations.tsx`**

Localiser le `Tabs` existant. Ajouter un troisième `TabsTrigger` puis un `TabsContent` correspondant.

Au niveau des imports en haut du fichier, ajouter :

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AdminRefundDialog from "@/components/admin/AdminRefundDialog";
import { useAdminRefundQueue, type AdminRefundQueueItem } from "./useAdminRefundQueue";
import { processRefund } from "@/lib/refundMutations";
import { Banknote } from "lucide-react";
```

Dans le composant `AdminOrdersReservations`, ajouter après les autres `useState`/`useQuery` :

```tsx
const queryClient = useQueryClient();
const refundQueueQuery = useAdminRefundQueue();
const [refundTarget, setRefundTarget] = useState<AdminRefundQueueItem | null>(null);

const refundMutation = useMutation({
  mutationFn: async ({ item, mode, amount, reason }: { item: AdminRefundQueueItem; mode: "full" | "partial"; amount: number; reason: string }) => {
    const result = await processRefund({
      entityType: item.entityType,
      entityId: item.entityId,
      refundMode: mode,
      amountChf: mode === "partial" ? amount : undefined,
      reason,
    });
    if (!result.ok) throw new Error(result.errorMessage);
    return result;
  },
  onSuccess: () => {
    setRefundTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-refund-queue"] });
    queryClient.invalidateQueries({ queryKey: ["admin-orders-history"] });
  },
});
```

Ajouter `<TabsTrigger value="refunds">` (avec badge compteur) à côté des triggers existants :

```tsx
<TabsTrigger value="refunds" className="gap-2">
  <Banknote className="h-4 w-4" />
  Remboursements
  {refundQueueQuery.data && refundQueueQuery.data.length > 0 ? (
    <Badge variant="destructive" className="ml-1">{refundQueueQuery.data.length}</Badge>
  ) : null}
</TabsTrigger>
```

Ajouter le `TabsContent` correspondant :

```tsx
<TabsContent value="refunds" className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle className="text-base">File de remboursements en attente</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Annule le</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Restaurant</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">A rembourser</TableHead>
            <TableHead>Motif</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {refundQueueQuery.isLoading ? (
            <TableRow><TableCell colSpan={8}>Chargement...</TableCell></TableRow>
          ) : refundQueueQuery.data && refundQueueQuery.data.length > 0 ? (
            refundQueueQuery.data.map((item) => (
              <TableRow key={`${item.entityType}-${item.entityId}`}>
                <TableCell>{formatDateTime(item.cancelledAt)}</TableCell>
                <TableCell>{item.entityType === "order" ? "Commande" : "Reservation"}</TableCell>
                <TableCell>{item.reference || item.entityId.slice(0, 8)}</TableCell>
                <TableCell>{item.restaurantName}</TableCell>
                <TableCell>{item.customerName || "-"}</TableCell>
                <TableCell className="text-right font-medium">{item.availableToRefund.toFixed(2)} CHF</TableCell>
                <TableCell className="max-w-[180px] truncate" title={item.cancellationReason || ""}>{item.cancellationReason || "-"}</TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => setRefundTarget(item)}>
                    Rembourser
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                Aucun remboursement en attente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </CardContent>
  </Card>

  <AdminRefundDialog
    open={!!refundTarget}
    item={refundTarget}
    submitting={refundMutation.isPending}
    onOpenChange={(open) => { if (!open) setRefundTarget(null); }}
    onConfirm={(mode, amount, reason) => {
      if (refundTarget) refundMutation.mutate({ item: refundTarget, mode, amount, reason });
    }}
  />
</TabsContent>
```

- [ ] **Step 4: Vérifier le build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "(AdminRefundDialog|useAdminRefundQueue|AdminOrdersReservations)" | head -10`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/useAdminRefundQueue.ts src/components/admin/AdminRefundDialog.tsx src/pages/admin/AdminOrdersReservations.tsx
git commit -m "feat(admin): refund queue tab + manual full/partial refund dialog"
```

---

## Phase F — Réversion comptable

### Task 10: Mise à jour de `comptaCommissionSources` (TDD)

**Files:**
- Create: `src/lib/__tests__/comptaCommissionSources.test.ts`
- Modify: `src/lib/comptaCommissionSources.ts`

- [ ] **Step 1: Écrire le test**

```ts
// src/lib/__tests__/comptaCommissionSources.test.ts
import { describe, expect, it } from "vitest";
import { computeOrderCommissionGross, computeReservationCommissionGross } from "../comptaCommissionSources";

describe("comptaCommissionSources — refund net", () => {
  it("returns 0 when an order is fully refunded", () => {
    const gross = computeOrderCommissionGross({
      total_amount: 100,
      metadata: { points_discount_amount: 5 },
      refunded_amount_chf: 105, // including miamz boost
    });
    expect(gross).toBeCloseTo(0);
  });

  it("returns proportional gross on partial refund", () => {
    const gross = computeOrderCommissionGross({
      total_amount: 100,
      metadata: {},
      refunded_amount_chf: 30,
    });
    expect(gross).toBeCloseTo(70);
  });

  it("ignores refund column on reservations refunded fully", () => {
    const gross = computeReservationCommissionGross({
      total_amount: 50,
      refunded_amount_chf: 50,
    });
    expect(gross).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run src/lib/__tests__/comptaCommissionSources.test.ts`
Expected: FAIL — `computeOrderCommissionGross is not exported`.

- [ ] **Step 3: Ajouter les helpers à `comptaCommissionSources.ts`**

Ajouter en bas du fichier `src/lib/comptaCommissionSources.ts` :

```ts
export function computeOrderCommissionGross(order: {
  total_amount?: number | string | null;
  metadata?: Record<string, unknown> | null;
  refunded_amount_chf?: number | string | null;
}): number {
  const total = toAmount(order.total_amount);
  const points = getPointsDiscountAmount(order.metadata);
  const refunded = toAmount(order.refunded_amount_chf);
  return Math.max(total + points - refunded, 0);
}

export function computeReservationCommissionGross(reservation: {
  total_amount?: number | string | null;
  refunded_amount_chf?: number | string | null;
}): number {
  const total = toAmount(reservation.total_amount);
  const refunded = toAmount(reservation.refunded_amount_chf);
  return Math.max(total - refunded, 0);
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run src/lib/__tests__/comptaCommissionSources.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comptaCommissionSources.ts src/lib/__tests__/comptaCommissionSources.test.ts
git commit -m "feat(compta): commission gross subtracts refunded_amount_chf"
```

---

### Task 11: Intégrer la base nette dans `dashboardFacturesShared.ts`

**Files:**
- Modify: `src/pages/dashboard/dashboardFacturesShared.ts`

- [ ] **Step 1: Mettre à jour les types et imports**

Au sommet du fichier, ajouter à l'import existant :

```ts
import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  COMMISSION_SOURCE_ORDER,
  computeOrderCommissionGross,
  computeReservationCommissionGross,
  createEmptyCommissionBaseTotals,
  getPointsDiscountAmount,
} from "@/lib/comptaCommissionSources";
```

Ajouter le champ `refunded_amount_chf` aux types `RestaurantOrderRow` et `RestaurantReservationPaymentRow` :

```ts
export type RestaurantOrderRow = {
  // … champs existants
  refunded_amount_chf?: number | string | null;
  refund_status?: string | null;
};

export type RestaurantReservationPaymentRow = {
  // … champs existants
  refunded_amount_chf?: number | string | null;
  refund_status?: string | null;
};
```

Idem pour `RestaurantReservationFeeRow` :

```ts
type RestaurantReservationFeeRow = {
  // … existants
  refund_status: string | null;
};
```

- [ ] **Step 2: Étendre les SELECT pour récupérer les nouveaux champs**

Localiser `ordersQuery` (vers la ligne 466). Modifier le `select` :

```ts
.select("id, created_at, total_amount, payment_status, status, order_number, metadata, restaurant_id, restaurant_invoice_id, refunded_amount_chf, refund_status")
.eq("restaurant_id", selectedId!)
.in("payment_status", ["paid", "captured"])
.order("created_at", { ascending: false });
```

(On retire le filtre `.not("status", "in", "(cancelled,…)")` afin de garder les lignes refundées dans la base de calcul — la déduction `refunded_amount_chf` les neutralise).

Localiser `reservationsQuery` :

```ts
.select("id, created_at, date, feature, metadata, total_amount, status, restaurant_id, restaurant_invoice_id, refunded_amount_chf, refund_status")
.eq("restaurant_id", selectedId!)
.gt("total_amount", 0)
.order("created_at", { ascending: false });
```

(Idem : retrait du filtre status restrictif).

Localiser `reservationFeeRowsQuery` :

```ts
.select("id, restaurant_id, confirmed_at, billing_fee_chf, cancelled_by, reservation_fee_invoice_id, refund_status")
```

- [ ] **Step 3: Mettre à jour `buildCommissionBases` pour utiliser les helpers**

Remplacer la fonction `buildCommissionBases` par :

```ts
function buildCommissionBases(
  orders: readonly RestaurantOrderRow[],
  reservations: readonly RestaurantReservationPaymentRow[],
) {
  const totals = createEmptyCommissionBaseTotals();

  orders.forEach((order) => {
    const source = classifyOrderCommissionSource(order);
    if (!source) return;
    totals[source] += computeOrderCommissionGross(order);
  });

  reservations.forEach((reservation) => {
    const source = classifyReservationCommissionSource(reservation);
    if (!source) return;
    totals[source] += computeReservationCommissionGross(reservation);
  });

  return totals;
}
```

- [ ] **Step 4: Mettre à jour `isBillableReservationFee`**

Remplacer la fonction par :

```ts
function isBillableReservationFee(reservation: { cancelled_by: string | null; refund_status: string | null }) {
  if (reservation.refund_status === "refunded") return false;
  const normalized = String(reservation.cancelled_by || "").trim().toLowerCase();
  return normalized === "" || (normalized !== "customer" && normalized !== "admin");
}
```

Mettre à jour les 2 sites d'appel pour passer un objet :

```ts
// Dans buildPayableAccrualSummary :
if (!isBillableReservationFee({ cancelled_by: reservationFee.cancelled_by, refund_status: reservationFee.refund_status })) return;

// Dans le useMemo `reservationFees` :
const reservationFees = useMemo(() => {
  return (reservationFeeRowsQuery.data || []).reduce<ReservationFeeSummary>((accumulator, reservation) => {
    if (!isBillableReservationFee({ cancelled_by: reservation.cancelled_by, refund_status: reservation.refund_status })) {
      return accumulator;
    }
    if (reservation.reservation_fee_invoice_id) {
      return accumulator;
    }
    accumulator.count += 1;
    accumulator.amount += toAmount(reservation.billing_fee_chf);
    return accumulator;
  }, { count: 0, amount: 0 });
}, [reservationFeeRowsQuery.data]);
```

- [ ] **Step 5: Vérifier le build et lancer les tests**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep dashboardFacturesShared | head -5
npx vitest run src/lib/__tests__/comptaCommissionSources.test.ts
```

Expected: pas d'erreurs TS, 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/dashboardFacturesShared.ts
git commit -m "feat(compta): subtract refunds from commission base + skip billing_fee on full refund"
```

---

### Task 12: Idem pour `adminComptaShared.ts` + nouveau panneau « Remboursements émis »

**Files:**
- Modify: `src/pages/admin/adminComptaShared.ts`
- Modify: `src/pages/admin/AdminCompta.tsx`

- [ ] **Step 1: Lire le fichier `adminComptaShared.ts`**

Run: `wc -l src/pages/admin/adminComptaShared.ts`
Note le nombre de lignes pour ajustements ciblés.

- [ ] **Step 2: Appliquer les mêmes changements que Task 11**

Dans `adminComptaShared.ts` :
- Importer `computeOrderCommissionGross`, `computeReservationCommissionGross`.
- Étendre les SELECT orders/reservations avec `refunded_amount_chf, refund_status`.
- Retirer les filtres status restrictifs sur orders/reservations (mais GARDER `payment_status IN ('paid','captured')` pour orders).
- Remplacer `buildCommissionBases` par la version utilisant les helpers.
- Mettre à jour `isBillableReservationFee` (si présent — sinon symétrie avec dashboardFacturesShared).

- [ ] **Step 3: Ajouter `useRefundsEmittedThisMonth`**

À la fin de `adminComptaShared.ts`, ajouter :

```ts
export function useRefundsEmittedThisMonth(month: string /* "YYYY-MM" */) {
  return useQuery({
    queryKey: ["admin-refunds-emitted", month],
    queryFn: async () => {
      const start = `${month}-01T00:00:00Z`;
      const next = new Date(`${month}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const end = next.toISOString();

      const { data, error } = await supabase
        .from("payment_transactions")
        .select("amount, metadata")
        .eq("type", "refund")
        .eq("status", "succeeded")
        .gte("created_at", start)
        .lt("created_at", end);
      if (error) throw error;

      const summary = { total: 0, byInitiator: { admin: 0, restaurant: 0, customer: 0, system: 0 } as Record<string, number> };
      (data || []).forEach((row: any) => {
        const amount = Math.abs(Number(row.amount || 0));
        summary.total += amount;
        const initiator = String((row.metadata as any)?.initiated_by || "system").toLowerCase();
        if (summary.byInitiator[initiator] === undefined) summary.byInitiator[initiator] = 0;
        summary.byInitiator[initiator] += amount;
      });
      return summary;
    },
  });
}
```

- [ ] **Step 4: Ajouter le panneau dans `AdminCompta.tsx`**

Importer le hook au sommet :

```tsx
import { useRefundsEmittedThisMonth } from "./adminComptaShared";
```

Dans le composant, après l'appel à `useAdminComptaData(...)`, ajouter :

```tsx
const refundsThisMonth = useRefundsEmittedThisMonth(selectedMonth);
```

Placer un nouveau `AccountingPanel` dans le grid existant (`xl:grid-cols-3` peut devenir `xl:grid-cols-4`) :

```tsx
<AccountingPanel
  tone="rose"
  icon={Banknote}
  eyebrow="Comprendre les flux"
  title="Remboursements emis ce mois"
  description="Total des refunds Stripe emis sur la periode, breakdown par initiateur."
  value={formatAmount(refundsThisMonth.data?.total || 0)}
  valueLabel="Refunds"
>
  <AccountingFactList
    tone="rose"
    items={[
      { label: "Initie par admin", value: formatAmount(refundsThisMonth.data?.byInitiator.admin || 0) },
      { label: "Initie par restaurant", value: formatAmount(refundsThisMonth.data?.byInitiator.restaurant || 0) },
      { label: "Initie par client (auto)", value: formatAmount(refundsThisMonth.data?.byInitiator.customer || 0) },
    ]}
  />
</AccountingPanel>
```

Importer `Banknote` depuis lucide-react si pas déjà fait. Vérifier que `AccountingPanel` accepte `tone="rose"` (sinon ajouter dans `AccountingCockpit`, ou utiliser un tone existant).

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "(AdminCompta|adminComptaShared)" | head -10`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/adminComptaShared.ts src/pages/admin/AdminCompta.tsx
git commit -m "feat(admin compta): subtract refunds + emit refunds-this-month panel"
```

---

## Phase G — Retrait Miamz côté restaurateur

### Task 13: Suppression Miamz de `DashboardFactures.tsx` et `dashboardFacturesShared.ts`

**Files:**
- Modify: `src/pages/dashboard/DashboardFactures.tsx`
- Modify: `src/pages/dashboard/dashboardFacturesShared.ts`

- [ ] **Step 1: Retirer les calculs Miamz de `dashboardFacturesShared.ts`**

Localiser et supprimer dans `useDashboardFacturesData()` :

```ts
// SUPPRIMER ces 3 useMemo (vers ligne 639-654) :
const miamzReimbursementsTotal = useMemo(...);
const miamzReimbursementsOutstanding = useMemo(...);
const miamzReimbursementsCount = useMemo(...);
```

Et supprimer ces 3 lignes du `return` :

```ts
miamzReimbursementsTotal,
miamzReimbursementsOutstanding,
miamzReimbursementsCount,
```

- [ ] **Step 2: Retirer les blocs Miamz de `DashboardFactures.tsx`**

Dans le bloc destructuré du hook (`const { ... } = useDashboardFacturesData();`), supprimer :

```ts
miamzReimbursementsCount,
miamzReimbursementsOutstanding,
miamzReimbursementsTotal,
```

Supprimer la `AccountingMetricCard` « Remboursements Miamz » (le bloc `<AccountingMetricCard tone="violet" icon={Wallet} label="Remboursements Miamz" ... />`).

Supprimer le `AccountingPanel` « Miamz remboursés par TOK » (le bloc `<AccountingPanel tone="violet" ... title="Miamz rembourses par TOK" ... />`).

Le grid de cards passe de 4 colonnes à 3 colonnes : `<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">` (au lieu de `xl:grid-cols-4`).

Le grid de panels passe de 3 colonnes à 2 : `<div className="grid gap-4 xl:grid-cols-2">` (au lieu de `xl:grid-cols-3`).

Retirer l'import `Wallet` s'il n'est plus utilisé ailleurs dans le fichier :

```ts
import { ArrowDownRight, ArrowUpRight, Coins, Megaphone, ReceiptText, Settings } from "lucide-react";
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "(DashboardFactures|dashboardFacturesShared)" | head -10`
Expected: aucune erreur (une éventuelle erreur sur `miamzReimbursementsTotal` indique qu'il faut nettoyer plus loin).

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/dashboardFacturesShared.ts
git commit -m "feat(dashboard compta): remove Miamz cards and computations from restaurateur view"
```

---

### Task 14: Audit des autres surfaces restaurateur (Inflow / Outflow / composants partagés)

**Files:**
- Modify: `src/pages/dashboard/DashboardFacturesInflow.tsx` (si Miamz présent)
- Modify: `src/pages/dashboard/DashboardFacturesOutflow.tsx` (si Miamz présent)
- Modify: `src/components/orders/OrderPaymentBreakdown.tsx` (si affichage Miamz vu par restaurateur)

- [ ] **Step 1: Lister les occurrences Miamz côté restaurateur**

Run:
```bash
grep -rin "miamz\|points_discount\|Reduction client" src/pages/dashboard/ src/components/ 2>/dev/null | grep -v "__tests__"
```

Note chaque occurrence avec le fichier et numéro de ligne.

- [ ] **Step 2: Pour chaque occurrence côté restaurateur, retirer ou neutraliser**

Pour `DashboardFacturesInflow.tsx` et `DashboardFacturesOutflow.tsx` :
- Si une colonne « Réduction Miamz » apparait dans un tableau → la supprimer.
- Si un libellé « Miamz » apparait dans les détails → le supprimer.
- Conserver les calculs internes (la base de commission utilise `getPointsDiscountAmount` mais ne l'affiche pas).

Pour `OrderPaymentBreakdown.tsx` (composant partagé) :
- Ajouter la prop `audience: "restaurateur" | "admin" | "customer"`.
- Si `audience === "restaurateur"` ET la ligne de breakdown concerne Miamz/points → ne pas afficher cette ligne.
- Mettre à jour les sites d'appel (cherche les usages avec `Grep "OrderPaymentBreakdown"`) pour passer `audience` correctement (admin reçoit `"admin"`, dashboard restaurateur reçoit `"restaurateur"`, panier client reçoit `"customer"`).

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20`
Expected: aucune erreur.

- [ ] **Step 4: Smoke check**

Run: `grep -rin "miamz" src/pages/dashboard/ src/components/orders/ 2>/dev/null`
Expected: aucun résultat (toute mention Miamz côté restaurateur retirée).

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/ src/components/orders/
git commit -m "feat(dashboard compta): scrub remaining Miamz mentions from restaurateur surfaces"
```

---

## Phase H — Vérification finale & déploiement

### Task 15: Test E2E manuel + lancement dev + lint global

**Files:**
- (aucun, vérifications uniquement)

- [ ] **Step 1: Lancer la suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests existants + les 6 nouveaux passent.

- [ ] **Step 2: Lancer le lint**

Run: `npm run lint 2>&1 | tail -40`
Expected: pas de nouvelles erreurs/warnings introduits.

- [ ] **Step 3: Build production**

Run: `npm run build 2>&1 | tail -30`
Expected: build réussit sans erreur.

- [ ] **Step 4: Tester le scénario E2E #1 — Restaurateur annule Zéro Attente payée**

1. Démarrer `npm run dev`.
2. Se connecter en tant que restaurateur (compte de test).
3. Créer une réservation Zéro Attente payée (via le flow client en parallèle).
4. Aller dans le dashboard restaurateur > Réservations.
5. Cliquer « Annuler » sur la réservation.
6. Vérifier que la case « Je confirme le remboursement intégral » apparait.
7. Cocher la case, sélectionner une raison, confirmer.
8. Vérifier (a) toast « rembourse integralement », (b) la réservation passe en statut `cancelled`, (c) en regardant la table `payment_transactions` une ligne `type='refund' amount=-X.XX` apparait, (d) la compta dashboard ne compte plus cette réservation.

- [ ] **Step 5: Tester le scénario E2E #2 — Client annule, admin rembourse partiellement**

1. Côté client : annuler une commande payée.
2. Côté admin : ouvrir `/admin/orders-reservations`, cliquer sur l'onglet « Remboursements ».
3. Vérifier que la commande apparait dans la file.
4. Cliquer « Rembourser », choisir « Partiel », saisir 30% du montant, motif « no-show client ».
5. Confirmer.
6. Vérifier (a) ligne disparait de la file (ou montant disponible mis à jour), (b) commission dashboard restaurateur recalculée sur 70% du gross.

- [ ] **Step 6: Tester le scénario E2E #3 — Restaurateur annule commande non-payée**

1. Créer une commande en `pending_payment` (payment échoué côté client).
2. Restaurateur clique « Annuler ».
3. Vérifier que la case refund n'apparait PAS, l'annulation fonctionne, aucun appel Stripe n'est fait.

- [ ] **Step 7: Vérifier le retrait Miamz**

1. Ouvrir `/dashboard/factures` en restaurateur.
2. Vérifier qu'aucune carte ou panneau ne mentionne « Miamz ».
3. Ouvrir `/admin/compta` en admin.
4. Vérifier que le panneau Miamz est toujours visible.
5. Vérifier que le nouveau panneau « Remboursements émis ce mois » apparait et affiche les bons totaux.

- [ ] **Step 8: Commit final si nécessaire (sinon skip)**

Si des ajustements ont été faits pendant les smoke tests :

```bash
git add -A
git commit -m "fix: address findings from manual E2E"
```

- [ ] **Step 9: Déploiement (avec confirmation utilisateur)**

⚠️ Ne pas exécuter sans confirmation explicite de l'utilisateur — déploie sur la prod.

Pour la dev :
```bash
npm run supabase:db:push:dev
npx supabase functions deploy process-refund
```

Pour la prod (uniquement après validation utilisateur) :
```bash
npm run supabase:db:push:prod
npx supabase functions deploy process-refund --project-ref <PROD_REF>
```

---

## Self-review

### Spec coverage

| Section spec | Tâches qui implémentent |
|---|---|
| §1 — Schéma BDD | T1 (colonnes + lock lift), T2 (cancel_order_by_restaurant + customer cancel loosened), T3 (mark_refund_applied + admin_get_refund_queue) |
| §2 — Edge function process-refund | T4 (test + impl) |
| §3 — UI Restaurateur | T6 (dialog), T7 (DashboardCommandes), T8 (DashboardReservations) + T5 (helpers `processRefund` + `cancelOrderByRestaurant`) |
| §4 — UI Admin | T9 (queue tab + dialog) |
| §5 — Réversion comptable | T10 (helpers gross net), T11 (dashboardFacturesShared), T12 (adminComptaShared + panneau « Refunds émis ») |
| §6 — Retrait Miamz | T13 (DashboardFactures + dashboardFacturesShared), T14 (Inflow/Outflow + composants partagés) |
| §7 — Tests & déploiement | T4 (tests Deno), T5/T10 (vitest), T15 (E2E + déploiement) |

Tous les points de la spec sont couverts.

### Notes de cohérence

- `cancelOrderByRestaurant` (T5) s'appuie sur la RPC créée en T2.
- `processRefund` (T5) appelle l'edge function de T4.
- T11 et T12 dépendent des helpers introduits en T10.
- T14 dépend du composant `OrderPaymentBreakdown` qui n'a pas été lu en détail dans la phase de design — l'audit en T14 step 1 doit être fait avec rigueur, et la prop `audience` doit suivre les conventions du composant.

### Risque résiduel

Le scénario où un client annule mais où le PI n'a jamais été enregistré dans `payment_transactions` (cas atypique pour les commandes anciennes). Le filtrage de `admin_get_refund_queue` exclut les lignes sans `payment_intent_id` — l'admin ne voit donc pas ces cas, ce qui est correct (rien à rembourser via Stripe).

---

Plan complete and saved to `docs/superpowers/plans/2026-04-25-cancellation-refund-and-miamz-cleanup.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
