# Reservation Billing & Anti-Fraud Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bill restaurateurs 5 CHF per confirmed reservation, differentiate customer vs restaurant cancellations (with mandatory reasons), integrate fees into monthly invoices, and expose an anti-fraud admin dashboard.

**Architecture:** Extend `reservations` with billing/cancellation columns. Split cancellation into two dedicated RPCs (customer vs restaurant, the latter requiring a reason code). Extend `generate_restaurant_payout_invoice` to add `reservations_confirmées × 5 CHF` to `amount_ht` and link reservations via `restaurant_invoice_id`. Add a "Réservations" tab in `AdminCompta.tsx` with KPIs, history, and cancellation-rate fraud analysis.

**Tech Stack:** Supabase (PostgreSQL, plpgsql, RPC with SECURITY DEFINER), React 18 + Vite, TanStack Query, shadcn/ui (Dialog, Select, Textarea, Table, Tabs), Tailwind, date-fns, TypeScript.

---

## File Structure

**New files:**
- `supabase/migrations/20260417120000_reservation_billing_schema.sql` — ALTER TABLE + indexes + backfill
- `supabase/migrations/20260417120100_reservation_billing_rpcs.sql` — new + updated RPCs
- `src/components/RestaurantCancellationDialog.tsx` — modal with reason select + details

**Modified files:**
- `src/lib/reservationMutations.ts` — add customer + restaurant cancel helpers, export reason catalog
- `src/components/ReservationDetailModal.tsx` — use new `cancelReservationByCustomer` RPC
- `src/pages/dashboard/DashboardReservations.tsx` — add "Annuler" button opening the dialog
- `src/pages/dashboard/DashboardFactures.tsx` — show reservation-fees line in encours + invoice detail
- `src/pages/admin/AdminCompta.tsx` — add "Réservations" tab (KPI + history + fraud metrics)
- `src/integrations/supabase/types.ts` — regenerated after migrations

---

## Task 1 : Schema migration (columns + indexes + backfill)

**Files:**
- Create: `supabase/migrations/20260417120000_reservation_billing_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260417120000_reservation_billing_schema.sql
-- Reservation billing: add confirmation / cancellation / billing tracking columns.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS confirmed_at                timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at                timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by                text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code    text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_details text,
  ADD COLUMN IF NOT EXISTS billing_fee_chf             numeric NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS restaurant_invoice_id       uuid,
  ADD COLUMN IF NOT EXISTS updated_at                  timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_cancelled_by_check'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer','restaurant','admin','system'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_invoice_fk'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_invoice_fk
      FOREIGN KEY (restaurant_invoice_id)
      REFERENCES public.restaurant_invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: existing confirmed/arrived/no_show reservations are considered already confirmed
UPDATE public.reservations
SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status IN ('confirmed','arrived','no_show')
  AND confirmed_at IS NULL;

-- Backfill: existing cancelled reservations are considered customer-cancelled (safe default,
-- avoids retroactive billing of historical data the restaurant has no traceable reason for).
UPDATE public.reservations
SET cancelled_at = COALESCE(cancelled_at, created_at),
    cancelled_by = COALESCE(cancelled_by, 'customer')
WHERE status = 'cancelled'
  AND cancelled_by IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reservations_billing_pending
  ON public.reservations(restaurant_id, confirmed_at)
  WHERE confirmed_at IS NOT NULL
    AND restaurant_invoice_id IS NULL
    AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'));

CREATE INDEX IF NOT EXISTS idx_reservations_cancellation_audit
  ON public.reservations(restaurant_id, cancelled_at)
  WHERE cancelled_by = 'restaurant';

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `name="reservation_billing_schema"` and the SQL above.
Expected: success; `reservations` table now has the new columns.

- [ ] **Step 3: Verify columns exist**

Run via `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='reservations'
  AND column_name IN ('confirmed_at','cancelled_at','cancelled_by','cancellation_reason_code','cancellation_reason_details','billing_fee_chf','restaurant_invoice_id');
```
Expected: 7 rows, `billing_fee_chf` NOT NULL with default 5.00.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260417120000_reservation_billing_schema.sql
git commit -m "Add reservation billing schema (confirmed_at, cancellation columns, fee)"
```

---

## Task 2 : RPCs (cancel customer/restaurant, update existing status RPC, invoice RPC, admin audit)

**Files:**
- Create: `supabase/migrations/20260417120100_reservation_billing_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260417120100_reservation_billing_rpcs.sql

-- ---------- 1. Customer-initiated cancellation ----------
CREATE OR REPLACE FUNCTION public.cancel_reservation_by_customer(
  p_reservation_id uuid
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_effective_dt timestamptz;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_res.user_id THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status IN ('cancelled','no_show') THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    RETURN NEXT; RETURN;
  END IF;

  v_effective_dt := (v_res.date::timestamp + v_res.time::time) AT TIME ZONE 'UTC';
  IF v_effective_dt - now() < interval '2 hours' THEN
    ok := false; error_code := 'too_late';
    error_message := 'Annulation impossible moins de 2h avant la reservation.';
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

  ok := true; error_code := NULL; error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO authenticated, service_role;

-- ---------- 2. Restaurant-initiated cancellation (requires reason) ----------
CREATE OR REPLACE FUNCTION public.cancel_reservation_by_restaurant(
  p_reservation_id uuid,
  p_reason_code text,
  p_reason_details text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res public.reservations%ROWTYPE;
  v_allowed text[] := ARRAY['closure','overbooking','kitchen_issue',
                            'customer_unreachable','private_event','duplicate_error','other'];
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_res.restaurant_id) THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status IN ('cancelled','no_show') THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code IS NULL OR NOT (p_reason_code = ANY (v_allowed)) THEN
    ok := false; error_code := 'invalid_reason';
    error_message := 'Raison d''annulation invalide.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code = 'other'
     AND (p_reason_details IS NULL OR length(trim(p_reason_details)) < 3) THEN
    ok := false; error_code := 'missing_details';
    error_message := 'Les details sont requis pour la raison "Autre".';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'restaurant',
      cancellation_reason_code = p_reason_code,
      cancellation_reason_details = NULLIF(trim(COALESCE(p_reason_details,'')), ''),
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true; error_code := NULL; error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) TO authenticated, service_role;

-- ---------- 3. Update restaurant status RPC: forbid direct cancellation + stamp confirmed_at ----------
CREATE OR REPLACE FUNCTION public.update_restaurant_reservation_status_safe(
  p_reservation_id uuid,
  p_status text
)
RETURNS TABLE (
  updated boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_status text := lower(COALESCE(trim(p_status), ''));
BEGIN
  IF v_status = 'cancelled' THEN
    updated := false; error_code := 'use_cancel_rpc';
    error_message := 'Utilisez cancel_reservation_by_restaurant avec une raison.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_status NOT IN ('pending', 'confirmed', 'arrived', 'no_show') THEN
    updated := false; error_code := 'invalid_status';
    error_message := 'Statut de reservation invalide.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    updated := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_reservation.restaurant_id) THEN
    updated := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  BEGIN
    UPDATE public.reservations
    SET status = v_status,
        confirmed_at = CASE
          WHEN v_reservation.confirmed_at IS NULL
            AND v_status IN ('confirmed','arrived','no_show')
          THEN now()
          ELSE v_reservation.confirmed_at
        END,
        updated_at = now()
    WHERE id = p_reservation_id;

    updated := true; error_code := NULL; error_message := NULL;
    RETURN NEXT; RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      updated := false; error_code := 'validation_error'; error_message := SQLERRM;
      RETURN NEXT; RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO authenticated, service_role;

-- ---------- 4. Extend invoice generation to include reservation fees ----------
-- Helper: compute billable reservation total for a restaurant+period
CREATE OR REPLACE FUNCTION public.compute_restaurant_reservation_fees(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS TABLE (
  reservations_count integer,
  reservations_amount numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(billing_fee_chf),0)::numeric
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND confirmed_at IS NOT NULL
    AND confirmed_at::date BETWEEN p_period_start AND p_period_end
    AND restaurant_invoice_id IS NULL
    AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'));
$$;

REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) TO authenticated, service_role;

-- RPC to attach reservations to an invoice (to be called post-invoice-creation)
CREATE OR REPLACE FUNCTION public.attach_reservations_to_invoice(
  p_invoice_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_invoice FROM public.restaurant_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  WITH updated AS (
    UPDATE public.reservations
    SET restaurant_invoice_id = v_invoice.id,
        updated_at = now()
    WHERE restaurant_id = v_invoice.restaurant_id
      AND confirmed_at IS NOT NULL
      AND confirmed_at::date BETWEEN v_invoice.period_start AND v_invoice.period_end
      AND restaurant_invoice_id IS NULL
      AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'))
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_reservations_to_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_reservations_to_invoice(uuid) TO service_role;

-- ---------- 5. Admin audit RPCs ----------
CREATE OR REPLACE FUNCTION public.admin_get_reservation_billing_history(
  p_restaurant_id uuid,
  p_month date
)
RETURNS TABLE (
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  reservation_date date,
  reservation_time time,
  party_size integer,
  customer_name text,
  status text,
  cancelled_by text,
  cancellation_reason_code text,
  cancellation_reason_details text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  billable boolean,
  billing_fee_chf numeric,
  invoice_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.restaurant_id,
    rest.name,
    r.date,
    r.time,
    r.party_size,
    p.full_name,
    r.status,
    r.cancelled_by,
    r.cancellation_reason_code,
    r.cancellation_reason_details,
    r.confirmed_at,
    r.cancelled_at,
    (r.confirmed_at IS NOT NULL
      AND NOT (r.status = 'cancelled' AND r.cancelled_by IN ('customer','admin'))) AS billable,
    r.billing_fee_chf,
    r.restaurant_invoice_id
  FROM public.reservations r
  JOIN public.restaurants rest ON rest.id = r.restaurant_id
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  WHERE (p_restaurant_id IS NULL OR r.restaurant_id = p_restaurant_id)
    AND r.date BETWEEN v_start AND v_end
  ORDER BY r.date DESC, r.time DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_cancellation_fraud_metrics(
  p_month date
)
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  confirmed_count integer,
  cancelled_by_restaurant_count integer,
  cancellation_rate numeric,
  late_cancellations_count integer,
  top_reason_code text,
  top_reason_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.*, rest.name AS rname
    FROM public.reservations r
    JOIN public.restaurants rest ON rest.id = r.restaurant_id
    WHERE r.date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT
      b.restaurant_id,
      MAX(b.rname) AS restaurant_name,
      COUNT(*) FILTER (WHERE b.confirmed_at IS NOT NULL)::integer AS confirmed_count,
      COUNT(*) FILTER (WHERE b.cancelled_by = 'restaurant')::integer AS cancelled_by_restaurant_count,
      COUNT(*) FILTER (
        WHERE b.cancelled_by = 'restaurant'
          AND b.cancelled_at IS NOT NULL
          AND ((b.date::timestamp + b.time::time) AT TIME ZONE 'UTC' - b.cancelled_at) < interval '2 hours'
      )::integer AS late_cancellations_count
    FROM base b
    GROUP BY b.restaurant_id
  ),
  reasons AS (
    SELECT
      b.restaurant_id,
      b.cancellation_reason_code,
      COUNT(*)::integer AS reason_count,
      ROW_NUMBER() OVER (
        PARTITION BY b.restaurant_id
        ORDER BY COUNT(*) DESC
      ) AS rn
    FROM base b
    WHERE b.cancelled_by = 'restaurant'
      AND b.cancellation_reason_code IS NOT NULL
    GROUP BY b.restaurant_id, b.cancellation_reason_code
  )
  SELECT
    a.restaurant_id,
    a.restaurant_name,
    a.confirmed_count,
    a.cancelled_by_restaurant_count,
    CASE WHEN a.confirmed_count > 0
         THEN ROUND((a.cancelled_by_restaurant_count::numeric / a.confirmed_count) * 100, 2)
         ELSE 0
    END AS cancellation_rate,
    a.late_cancellations_count,
    (SELECT r.cancellation_reason_code FROM reasons r WHERE r.restaurant_id = a.restaurant_id AND r.rn = 1) AS top_reason_code,
    (SELECT r.reason_count FROM reasons r WHERE r.restaurant_id = a.restaurant_id AND r.rn = 1) AS top_reason_count
  FROM agg a
  ORDER BY cancellation_rate DESC NULLS LAST, a.cancelled_by_restaurant_count DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_cancellation_fraud_metrics(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_cancellation_fraud_metrics(date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `name="reservation_billing_rpcs"` and SQL above.
Expected: success.

- [ ] **Step 3: Verify functions exist**

```sql
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'cancel_reservation_by_customer',
    'cancel_reservation_by_restaurant',
    'compute_restaurant_reservation_fees',
    'attach_reservations_to_invoice',
    'admin_get_reservation_billing_history',
    'admin_get_cancellation_fraud_metrics'
  );
```
Expected: 6 rows.

- [ ] **Step 4: Test restaurant cancel rejection without reason**

```sql
SELECT * FROM public.cancel_reservation_by_restaurant(
  (SELECT id FROM public.reservations LIMIT 1),
  NULL, NULL
);
```
Expected: `ok=false, error_code='invalid_reason'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260417120100_reservation_billing_rpcs.sql
git commit -m "Add reservation billing RPCs (cancel, invoice attach, admin audit)"
```

---

## Task 3 : Regenerate Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerated)

- [ ] **Step 1: Regenerate types**

Use `mcp__claude_ai_Supabase__generate_typescript_types` to fetch the new schema, then overwrite `src/integrations/supabase/types.ts` with the result.

- [ ] **Step 2: Verify new columns & RPCs**

Grep `src/integrations/supabase/types.ts` for `cancel_reservation_by_customer` and `cancellation_reason_code` — both should now appear.

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "Regenerate Supabase types for reservation billing"
```

---

## Task 4 : Extend `reservationMutations.ts` with cancel helpers + reason catalog

**Files:**
- Modify: `src/lib/reservationMutations.ts`

- [ ] **Step 1: Append new helpers and reason catalog**

Add at the bottom of `src/lib/reservationMutations.ts`:

```ts
export type CancellationReasonCode =
  | "closure"
  | "overbooking"
  | "kitchen_issue"
  | "customer_unreachable"
  | "private_event"
  | "duplicate_error"
  | "other";

export const CANCELLATION_REASONS: Array<{
  code: CancellationReasonCode;
  label: string;
  description?: string;
}> = [
  { code: "closure", label: "Fermeture exceptionnelle", description: "Intemperies, panne, force majeure" },
  { code: "overbooking", label: "Surbooking / table indisponible" },
  { code: "kitchen_issue", label: "Probleme de cuisine", description: "Penurie, equipe absente" },
  { code: "customer_unreachable", label: "Client injoignable" },
  { code: "private_event", label: "Evenement prive prioritaire" },
  { code: "duplicate_error", label: "Doublon ou erreur de saisie" },
  { code: "other", label: "Autre raison (details requis)" },
];

type CancelResult =
  | { ok: true }
  | { ok: false; errorCode: string; errorMessage: string };

export async function cancelReservationByCustomer(
  reservationId: string,
): Promise<CancelResult> {
  const { data, error } = await (supabase.rpc as any)("cancel_reservation_by_customer", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Reponse serveur invalide.");
  if (!row.ok) {
    return { ok: false, errorCode: row.error_code || "unknown", errorMessage: row.error_message || "Annulation impossible." };
  }
  return { ok: true };
}

export async function cancelReservationByRestaurant(
  reservationId: string,
  reasonCode: CancellationReasonCode,
  reasonDetails?: string | null,
): Promise<CancelResult> {
  const { data, error } = await (supabase.rpc as any)("cancel_reservation_by_restaurant", {
    p_reservation_id: reservationId,
    p_reason_code: reasonCode,
    p_reason_details: reasonDetails ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Reponse serveur invalide.");
  if (!row.ok) {
    return { ok: false, errorCode: row.error_code || "unknown", errorMessage: row.error_message || "Annulation impossible." };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/reservationMutations.ts
git commit -m "Add customer/restaurant cancel helpers and reason catalog"
```

---

## Task 5 : `RestaurantCancellationDialog` component

**Files:**
- Create: `src/components/RestaurantCancellationDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CANCELLATION_REASONS,
  type CancellationReasonCode,
} from "@/lib/reservationMutations";

interface Props {
  open: boolean;
  reservationLabel?: string;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reasonCode: CancellationReasonCode, details: string | null) => void;
}

export default function RestaurantCancellationDialog({
  open,
  onOpenChange,
  reservationLabel,
  onConfirm,
  submitting = false,
}: Props) {
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | "">("");
  const [details, setDetails] = useState("");

  const needsDetails = reasonCode === "other";
  const detailsTooShort = needsDetails && details.trim().length < 3;
  const canSubmit = reasonCode !== "" && !detailsTooShort && !submitting;

  const handleConfirm = () => {
    if (!canSubmit || reasonCode === "") return;
    const payload = details.trim() ? details.trim() : null;
    onConfirm(reasonCode as CancellationReasonCode, payload);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReasonCode("");
      setDetails("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Annuler cette reservation ?
          </DialogTitle>
          <DialogDescription>
            {reservationLabel ? <span className="font-medium">{reservationLabel}. </span> : null}
            Une raison est obligatoire. Les frais de reservation restent dus : seul le client peut annuler sans facturation.
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
              Details {needsDetails ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optionnel)</span>}
            </Label>
            <Textarea
              id="cancel-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={needsDetails ? "Expliquez la raison de l'annulation" : "Informations additionnelles"}
              rows={3}
            />
            {detailsTooShort ? (
              <p className="text-xs text-destructive">Au moins 3 caracteres requis.</p>
            ) : null}
          </div>
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

- [ ] **Step 2: Commit**

```bash
git add src/components/RestaurantCancellationDialog.tsx
git commit -m "Add RestaurantCancellationDialog with reason selection"
```

---

## Task 6 : Wire `DashboardReservations.tsx` to use the dialog + add "Annuler" button

**Files:**
- Modify: `src/pages/dashboard/DashboardReservations.tsx`

- [ ] **Step 1: Add imports and state**

At the top of the file (after existing imports), add:

```ts
import RestaurantCancellationDialog from "@/components/RestaurantCancellationDialog";
import { cancelReservationByRestaurant, type CancellationReasonCode } from "@/lib/reservationMutations";
```

Also import the `Ban` icon from lucide-react (merge into existing `lucide-react` import line): add `Ban` to the list.

- [ ] **Step 2: Add state + cancellation mutation inside the component**

Inside `DashboardReservations` component, after `const [isCompactMode, setIsCompactMode] = useState(false);`, add:

```ts
  const [cancelTarget, setCancelTarget] = useState<ReservationWithProfile | null>(null);

  const cancelMutation = useMutation({
    mutationFn: async ({
      id,
      reasonCode,
      details,
    }: {
      id: string;
      reasonCode: CancellationReasonCode;
      details: string | null;
    }) => {
      const result = await cancelReservationByRestaurant(id, reasonCode, details);
      if (!result.ok) throw new Error(result.errorMessage);
      return { id };
    },
    onSuccess: () => {
      toast({ title: "Reservation annulee", description: "La raison a ete enregistree." });
      queryClient.invalidateQueries({ queryKey: ["dashboard-all-reservations", selectedId] });
      setCancelTarget(null);
    },
    onError: (error: Error) => {
      toast({ title: "Annulation impossible", description: error.message, variant: "destructive" });
    },
  });
```

- [ ] **Step 3: Add "Annuler" button next to Arrivée / No-show / Confirmée**

Locate the action buttons block (around lines 510–543 of the file, inside the `<div className="flex flex-wrap gap-2 sm:justify-end">` containing the Arrivée / No-show / Confirmée buttons). Add a new button **before** the "No-show" button:

```tsx
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setCancelTarget(reservation)}
                                      disabled={reservation.status === "cancelled" || cancelMutation.isPending}
                                      className="text-destructive"
                                    >
                                      <Ban className="mr-1 h-4 w-4" />
                                      Annuler
                                    </Button>
```

- [ ] **Step 4: Render the dialog at the end of the component tree**

At the very end of the component, just before the closing `</DashboardLayout>`, add:

```tsx
      <RestaurantCancellationDialog
        open={Boolean(cancelTarget)}
        reservationLabel={
          cancelTarget
            ? `${cancelTarget.customer?.full_name ?? "Client"} - ${cancelTarget.date} ${getSafeTime(cancelTarget.time)}`
            : undefined
        }
        submitting={cancelMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onConfirm={(reasonCode, details) => {
          if (!cancelTarget) return;
          cancelMutation.mutate({ id: cancelTarget.id, reasonCode, details });
        }}
      />
```

- [ ] **Step 5: Verify typecheck / build**

Run: `npm run build`
Expected: success (no TS errors related to the new imports/state).

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/DashboardReservations.tsx
git commit -m "Wire DashboardReservations to new cancellation dialog"
```

---

## Task 7 : Migrate `ReservationDetailModal` customer cancellation to new RPC

**Files:**
- Modify: `src/components/ReservationDetailModal.tsx`

- [ ] **Step 1: Locate existing customer cancel call**

Search the file for the current cancel logic (search pattern `reservations` followed by `update` or `.eq(`). Replace the direct Supabase update with `cancelReservationByCustomer`.

- [ ] **Step 2: Add import**

```ts
import { cancelReservationByCustomer } from "@/lib/reservationMutations";
```

- [ ] **Step 3: Replace update block**

Replace any direct `supabase.from("reservations").update({ status: "cancelled" })` call with:

```ts
const result = await cancelReservationByCustomer(reservation.id);
if (!result.ok) {
  toast({ title: "Annulation impossible", description: result.errorMessage, variant: "destructive" });
  return;
}
```

Keep the existing notification dispatch / `onOpenChange(false)` / toast for success.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReservationDetailModal.tsx
git commit -m "Route customer-side cancellation through cancel_reservation_by_customer RPC"
```

---

## Task 8 : `DashboardFactures.tsx` — show reservation-fee line

**Files:**
- Modify: `src/pages/dashboard/DashboardFactures.tsx`

- [ ] **Step 1: Fetch reservation fees for the encours**

Locate the query that builds the restaurateur's "encours" (ongoing invoice preview). Add a parallel query using `compute_restaurant_reservation_fees`:

```ts
const { data: reservationFees } = useQuery({
  queryKey: ["dashboard-reservation-fees", restaurantId, periodStart, periodEnd],
  queryFn: async () => {
    const { data, error } = await (supabase.rpc as any)("compute_restaurant_reservation_fees", {
      p_restaurant_id: restaurantId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      count: Number(row?.reservations_count ?? 0),
      amount: Number(row?.reservations_amount ?? 0),
    };
  },
  enabled: Boolean(restaurantId && periodStart && periodEnd),
});
```

(Exact names of `periodStart/periodEnd/restaurantId` variables vary — adapt to existing code.)

- [ ] **Step 2: Add line to the encours breakdown**

In the UI section that lists breakdown rows (commandes, miamz, …), add before the total:

```tsx
{reservationFees && reservationFees.count > 0 ? (
  <div className="flex items-center justify-between text-sm">
    <span className="text-muted-foreground">Reservations confirmees ({reservationFees.count} x 5.-)</span>
    <span className="font-medium">{reservationFees.amount.toFixed(2)} CHF</span>
  </div>
) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/DashboardFactures.tsx
git commit -m "Show reservation fee line in restaurant invoice preview"
```

---

## Task 9 : `AdminCompta.tsx` — new "Réservations" tab with KPIs, history, fraud analysis

**Files:**
- Modify: `src/pages/admin/AdminCompta.tsx`

- [ ] **Step 1: Add queries for reservation history and fraud metrics**

After the existing `orders` query inside `AdminCompta`, add:

```ts
  const { data: reservationHistory = [] } = useQuery({
    queryKey: ["admin-compta-reservations", selectedRestaurant, selectedMonth],
    queryFn: async () => {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error } = await (supabase.rpc as any)("admin_get_reservation_billing_history", {
        p_restaurant_id: selectedRestaurant === "all" ? null : selectedRestaurant,
        p_month: firstOfMonth,
      });
      if (error) throw error;
      return (data || []) as Array<any>;
    },
  });

  const { data: fraudMetrics = [] } = useQuery({
    queryKey: ["admin-compta-fraud", selectedMonth],
    queryFn: async () => {
      const firstOfMonth = `${selectedMonth}-01`;
      const { data, error } = await (supabase.rpc as any)("admin_get_cancellation_fraud_metrics", {
        p_month: firstOfMonth,
      });
      if (error) throw error;
      return (data || []) as Array<any>;
    },
  });
```

- [ ] **Step 2: Add reservation KPI computations**

After the existing `useMemo` that computes `metrics/standardOrders/miamzOrders`, add:

```ts
  const reservationMetrics = useMemo(() => {
    const confirmed = reservationHistory.filter((r) => !!r.confirmed_at).length;
    const billable = reservationHistory.filter((r) => r.billable).length;
    const cancelledByRestaurant = reservationHistory.filter((r) => r.cancelled_by === "restaurant").length;
    const revenue = reservationHistory
      .filter((r) => r.billable)
      .reduce((sum, r) => sum + Number(r.billing_fee_chf || 0), 0);
    return { confirmed, billable, cancelledByRestaurant, revenue };
  }, [reservationHistory]);
```

- [ ] **Step 3: Add a third `TabsTrigger` and `TabsContent`**

In the existing `<TabsList>`, add (after the Miamz trigger):

```tsx
<TabsTrigger value="reservations">Reservations ({reservationHistory.length})</TabsTrigger>
```

And add a new `<TabsContent value="reservations">` block after the Miamz content:

```tsx
<TabsContent value="reservations" className="mt-0 space-y-6">
  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <Card className="bg-white">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Confirmees</CardTitle></CardHeader>
      <CardContent><p className="text-2xl font-bold">{reservationMetrics.confirmed}</p></CardContent>
    </Card>
    <Card className="bg-emerald-50 border-emerald-200">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-700">Facturables</CardTitle></CardHeader>
      <CardContent><p className="text-2xl font-bold text-emerald-700">{reservationMetrics.billable}</p></CardContent>
    </Card>
    <Card className="bg-orange-50 border-orange-200">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-orange-700">Annulees par le resto</CardTitle></CardHeader>
      <CardContent><p className="text-2xl font-bold text-orange-700">{reservationMetrics.cancelledByRestaurant}</p></CardContent>
    </Card>
    <Card className="bg-primary/5 border-primary/20">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-primary">Revenu TOK (5.-)</CardTitle></CardHeader>
      <CardContent><p className="text-2xl font-bold text-primary">{reservationMetrics.revenue.toFixed(2)} CHF</p></CardContent>
    </Card>
  </div>

  <Card>
    <CardHeader><CardTitle className="text-base">Analyse anti-fraude</CardTitle></CardHeader>
    <CardContent>
      {fraudMetrics.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">Aucune donnee.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead className="text-right">Confirmees</TableHead>
                <TableHead className="text-right">Annulees resto</TableHead>
                <TableHead className="text-right">Taux annulation</TableHead>
                <TableHead className="text-right">Annulations tardives (&lt; 2h)</TableHead>
                <TableHead>Raison la plus invoquee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fraudMetrics.map((row) => {
                const rate = Number(row.cancellation_rate || 0);
                const color = rate > 25 ? "text-red-700 bg-red-50" : rate >= 10 ? "text-orange-700 bg-orange-50" : "text-emerald-700 bg-emerald-50";
                return (
                  <TableRow key={row.restaurant_id}>
                    <TableCell className="font-medium">{row.restaurant_name}</TableCell>
                    <TableCell className="text-right">{row.confirmed_count}</TableCell>
                    <TableCell className="text-right">{row.cancelled_by_restaurant_count}</TableCell>
                    <TableCell className="text-right">
                      <Badge className={color}>{rate.toFixed(1)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.late_cancellations_count}</TableCell>
                    <TableCell className="text-xs">
                      {row.top_reason_code ? `${row.top_reason_code} (x${row.top_reason_count})` : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>

  <Card>
    <CardHeader><CardTitle className="text-base">Historique des reservations</CardTitle></CardHeader>
    <CardContent>
      {reservationHistory.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">Aucune reservation sur cette periode.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                {selectedRestaurant === "all" && <TableHead>Restaurant</TableHead>}
                <TableHead>Client</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Annule par</TableHead>
                <TableHead>Raison</TableHead>
                <TableHead className="text-center">Facturable</TableHead>
                <TableHead className="text-right">5.-</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservationHistory.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">
                    {format(new Date(`${row.reservation_date}T${row.reservation_time}`), "dd MMM HH:mm", { locale: fr })}
                  </TableCell>
                  {selectedRestaurant === "all" && <TableCell className="text-xs">{row.restaurant_name}</TableCell>}
                  <TableCell className="text-xs">{row.customer_name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{row.cancelled_by || "-"}</TableCell>
                  <TableCell className="text-xs">
                    {row.cancellation_reason_code
                      ? `${row.cancellation_reason_code}${row.cancellation_reason_details ? ` - ${row.cancellation_reason_details}` : ""}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.billable ? <Badge className="bg-emerald-100 text-emerald-700">Oui</Badge> : <Badge variant="outline">Non</Badge>}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {row.billable ? Number(row.billing_fee_chf || 0).toFixed(2) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminCompta.tsx
git commit -m "Add Reservations tab with KPIs, history, and fraud metrics to AdminCompta"
```

---

## Task 10 : Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Create a reservation as client → confirm as restaurateur**

- Log in as client, book at a test restaurant
- Log in as restaurateur, click `Confirmée` → verify DB has `confirmed_at` set (via Supabase MCP `execute_sql`)

- [ ] **Step 3: Try to cancel as restaurateur without a reason → rejected**

- Open dialog, leave Select empty → "Confirmer" is disabled
- Select "Autre" without details → "Confirmer" is disabled

- [ ] **Step 4: Cancel with reason "Surbooking" → DB shows billable=true**

```sql
SELECT status, cancelled_by, cancellation_reason_code, confirmed_at IS NOT NULL AS was_confirmed
FROM public.reservations WHERE id = '<test-id>';
```
Expected: `status=cancelled, cancelled_by=restaurant, cancellation_reason_code=overbooking, was_confirmed=true`.

- [ ] **Step 5: Cancel from client-side (Reservations page) → not billable**

Expected: `cancelled_by=customer`, and `admin_get_reservation_billing_history` returns `billable=false`.

- [ ] **Step 6: Visit `/admin/compta` → Réservations tab**

- Verify the 4 KPI cards render
- Verify the fraud analysis table shows the test restaurant with a cancellation rate > 0
- Verify the history table lists the test reservation with the reason

- [ ] **Step 7: Commit any fixups**

If any issues found, fix them and commit with descriptive messages.
