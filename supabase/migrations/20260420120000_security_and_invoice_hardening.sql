-- Harden financial access, canonicalize order/reservation side-effect triggers,
-- tighten payout eligibility, and expose a safe customer order cancellation RPC.

-- Remove drifted broad self-management policies and retire direct customer table
-- updates for reservations in favor of the dedicated safe RPCs.
DROP POLICY IF EXISTS "Users manage own orders" ON public.orders;
DROP POLICY IF EXISTS "Users manage own reservations" ON public.reservations;
DROP POLICY IF EXISTS "Users manage own payment_transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users can cancel their reservations" ON public.reservations;

DO $$
BEGIN
  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for payment_intents" ON public.payment_intents';
    EXECUTE 'DROP POLICY IF EXISTS "payment_intents_admin_all" ON public.payment_intents';
    EXECUTE 'CREATE POLICY "payment_intents_admin_all" ON public.payment_intents ' ||
            'FOR ALL TO authenticated ' ||
            'USING (public.auth_is_admin()) ' ||
            'WITH CHECK (public.auth_is_admin())';
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Require auth for invoices" ON public.invoices';
    EXECUTE 'DROP POLICY IF EXISTS "invoices_admin_all" ON public.invoices';
    EXECUTE 'CREATE POLICY "invoices_admin_all" ON public.invoices ' ||
            'FOR ALL TO authenticated ' ||
            'USING (public.auth_is_admin()) ' ||
            'WITH CHECK (public.auth_is_admin())';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice(
  p_restaurant_id uuid,
  p_month text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  inv_id uuid;
  next_num integer;
  rev numeric := 0;
  res_rev numeric := 0;
  tva_rate numeric := 0.077;
  unpaid_orders_count integer := 0;
  unpaid_reservations_count integer := 0;
  min_date timestamptz;
  max_date timestamptz;
  inv_period_s date;
  inv_period_e date;
BEGIN
  SELECT
    COUNT(id),
    COALESCE(SUM(total_amount + COALESCE((metadata->>'points_discount_amount')::numeric, 0)), 0),
    MIN(created_at),
    MAX(created_at)
  INTO unpaid_orders_count, rev, min_date, max_date
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending')
    AND lower(COALESCE(payment_status, '')) IN ('paid', 'captured');

  SELECT
    COUNT(id),
    COALESCE(SUM(total_amount), 0),
    LEAST(min_date, MIN(created_at)),
    GREATEST(max_date, MAX(created_at))
  INTO unpaid_reservations_count, res_rev, min_date, max_date
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  IF unpaid_orders_count = 0 AND unpaid_reservations_count = 0 THEN
    RETURN 0;
  END IF;

  rev := rev + res_rev;
  rev := rev * 0.90;

  inv_period_s := COALESCE(min_date::date, CURRENT_DATE);
  inv_period_e := COALESCE(max_date::date, CURRENT_DATE);

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
  INTO next_num
  FROM public.restaurant_invoices
  WHERE restaurant_id = p_restaurant_id
    AND COALESCE(invoice_type, 'payout') = 'payout';

  INSERT INTO public.restaurant_invoices (
    restaurant_id,
    period_start,
    period_end,
    amount_ht,
    amount_tva,
    amount_ttc,
    status,
    invoice_number,
    due_at,
    invoice_type
  )
  VALUES (
    p_restaurant_id,
    inv_period_s,
    inv_period_e,
    ROUND(rev / (1 + tva_rate), 2),
    ROUND(rev - rev / (1 + tva_rate), 2),
    ROUND(rev, 2),
    'pending',
    'FAC-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
    (CURRENT_DATE + interval '30 days')::timestamptz,
    'payout'
  )
  RETURNING id INTO inv_id;

  UPDATE public.orders
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending')
    AND lower(COALESCE(payment_status, '')) IN ('paid', 'captured');

  UPDATE public.reservations
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  RETURN 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_order_by_customer(
  p_order_id uuid
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
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    ok := false;
    error_code := 'not_found';
    error_message := 'Commande introuvable.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_order.user_id THEN
    ok := false;
    error_code := 'forbidden';
    error_message := 'Acces refuse.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(COALESCE(v_order.status, '')) = 'cancelled' THEN
    ok := false;
    error_code := 'already_cancelled';
    error_message := 'Cette commande est deja annulee.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'confirmed' THEN
    ok := false;
    error_code := 'invalid_state';
    error_message := 'Seules les commandes confirmees peuvent etre annulees.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF public.is_special_paid_order_locked(
    v_order.id,
    v_order.payment_status,
    v_order.metadata
  ) THEN
    ok := false;
    error_code := 'paid_locked';
    error_message := 'Cette commande speciale payee ne peut plus changer de statut.';
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancellation_reason = COALESCE(NULLIF(trim(COALESCE(cancellation_reason, '')), ''), 'customer_cancelled'),
        updated_at = now()
    WHERE id = p_order_id;

    ok := true;
    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'Cette commande speciale payee ne peut plus changer de statut.' THEN
        ok := false;
        error_code := 'paid_locked';
        error_message := SQLERRM;
      ELSE
        ok := false;
        error_code := 'validation_error';
        error_message := SQLERRM;
      END IF;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_customer(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_zero_attente_reservation_lookup
  ON public.payment_transactions ((metadata ->> 'reservation_id'))
  WHERE type = 'charge'
    AND status = 'succeeded'
    AND NULLIF(trim(COALESCE(metadata ->> 'reservation_id', '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_zero_attente_session_unique
  ON public.payment_transactions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL
    AND type = 'charge'
    AND status = 'succeeded'
    AND lower(COALESCE(metadata ->> 'feature', '')) = 'zero-attente';

DROP TRIGGER IF EXISTS audit_orders ON public.orders;
DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
CREATE TRIGGER trg_audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_reservations ON public.reservations;
DROP TRIGGER IF EXISTS trg_audit_reservations ON public.reservations;
CREATE TRIGGER trg_audit_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS set_updated_at ON public.orders;
DROP TRIGGER IF EXISTS set_updated_at_orders ON public.orders;
DROP TRIGGER IF EXISTS trg_updated_at_orders ON public.orders;
CREATE TRIGGER trg_updated_at_orders
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_order_status_notification ON public.orders;
DROP TRIGGER IF EXISTS trg_order_status_notification ON public.orders;
DROP TRIGGER IF EXISTS after_order_status_update ON public.orders;
CREATE TRIGGER after_order_status_update
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_order_status_notification();

DROP TRIGGER IF EXISTS after_reservation_notification ON public.reservations;
CREATE TRIGGER after_reservation_notification
  AFTER INSERT OR UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_reservation_notifications();

NOTIFY pgrst, 'reload schema';
