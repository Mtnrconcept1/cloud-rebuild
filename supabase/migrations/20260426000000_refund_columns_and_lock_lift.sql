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
