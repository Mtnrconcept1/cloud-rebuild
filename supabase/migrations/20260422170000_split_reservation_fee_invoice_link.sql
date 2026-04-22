-- Split reservation payout linkage from TOK reservation-fee linkage.
-- Root cause:
-- reservations.restaurant_invoice_id was used for BOTH:
--   1) payout invoices (TOK -> restaurant, 90%)
--   2) reservation fee invoices (TOK <- restaurant, 5 CHF / reservation)
-- As soon as a reservation was linked to a payout invoice, it disappeared from
-- the 5 CHF accounting helpers because they filtered on restaurant_invoice_id IS NULL.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_fee_invoice_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_reservation_fee_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_reservation_fee_invoice_id_fkey
      FOREIGN KEY (reservation_fee_invoice_id)
      REFERENCES public.restaurant_invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservations_reservation_fee_invoice_id
  ON public.reservations(reservation_fee_invoice_id)
  WHERE reservation_fee_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_pending_fee_billing
  ON public.reservations(restaurant_id, confirmed_at)
  WHERE confirmed_at IS NOT NULL
    AND reservation_fee_invoice_id IS NULL;

-- Backfill historical reservation-fee invoices into the dedicated column.
-- Any reservation currently linked to a reservation_fees invoice must stop using
-- restaurant_invoice_id so payout invoicing and fee invoicing can coexist.
UPDATE public.reservations r
SET reservation_fee_invoice_id = r.restaurant_invoice_id,
    restaurant_invoice_id = NULL,
    updated_at = now()
FROM public.restaurant_invoices i
WHERE r.restaurant_invoice_id = i.id
  AND i.invoice_type = 'reservation_fees'
  AND (
    r.reservation_fee_invoice_id IS DISTINCT FROM r.restaurant_invoice_id
    OR r.restaurant_invoice_id IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.compute_restaurant_reservation_fees(
  p_restaurant_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  reservations_count integer,
  reservations_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(billing_fee_chf), 0)::numeric
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND confirmed_at IS NOT NULL
    AND confirmed_at::date BETWEEN p_period_start AND p_period_end
    AND reservation_fee_invoice_id IS NULL
    AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer', 'admin'));
$$;

REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_tok_reservation_fee_invoice(
  p_restaurant_id uuid,
  p_month date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target date := COALESCE(p_month, (date_trunc('month', now()) - interval '1 month')::date);
  v_period_s date := date_trunc('month', v_target)::date;
  v_period_e date := (v_period_s + interval '1 month - 1 day')::date;
  v_count integer := 0;
  v_amount numeric := 0;
  v_next_num integer;
  v_invoice_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*)::integer, COALESCE(SUM(billing_fee_chf), 0)::numeric
    INTO v_count, v_amount
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND confirmed_at IS NOT NULL
    AND confirmed_at::date BETWEEN v_period_s AND v_period_e
    AND reservation_fee_invoice_id IS NULL
    AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer', 'admin'));

  IF v_count = 0 OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
    INTO v_next_num
  FROM public.restaurant_invoices
  WHERE restaurant_id = p_restaurant_id
    AND invoice_type = 'reservation_fees';

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
    v_period_s,
    v_period_e,
    v_amount,
    0,
    v_amount,
    'pending',
    'TOK-' || TO_CHAR(v_period_s, 'YYYYMM') || '-' || LPAD(v_next_num::text, 4, '0'),
    (v_period_e + interval '30 days')::timestamptz,
    'reservation_fees'
  )
  RETURNING id INTO v_invoice_id;

  UPDATE public.reservations
     SET reservation_fee_invoice_id = v_invoice_id,
         updated_at = now()
   WHERE restaurant_id = p_restaurant_id
     AND confirmed_at IS NOT NULL
     AND confirmed_at::date BETWEEN v_period_s AND v_period_e
     AND reservation_fee_invoice_id IS NULL
     AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer', 'admin'));

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_tok_reservation_fee_invoices_all(
  p_month date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_target date := COALESCE(p_month, (date_trunc('month', now()) - interval '1 month')::date);
  v_period_s date := date_trunc('month', v_target)::date;
  v_period_e date := (v_period_s + interval '1 month - 1 day')::date;
  v_restaurant uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_restaurant IN
    SELECT DISTINCT restaurant_id
    FROM public.reservations
    WHERE confirmed_at IS NOT NULL
      AND confirmed_at::date BETWEEN v_period_s AND v_period_e
      AND reservation_fee_invoice_id IS NULL
      AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer', 'admin'))
  LOOP
    IF public.generate_tok_reservation_fee_invoice(v_restaurant, v_target) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoices_all(date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_reservation_fee_invoice_lines(
  p_invoice_id uuid
)
RETURNS TABLE (
  reservation_id uuid,
  reservation_date date,
  reservation_time time,
  party_size integer,
  status text,
  cancelled_by text,
  cancellation_reason_code text,
  billing_fee_chf numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM public.restaurant_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  IF NOT (
    auth.role() = 'service_role'
    OR public.auth_is_admin()
    OR public.auth_owns_restaurant(v_invoice.restaurant_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.date,
    r.time,
    r.party_size,
    r.status,
    r.cancelled_by,
    r.cancellation_reason_code,
    r.billing_fee_chf
  FROM public.reservations r
  WHERE r.reservation_fee_invoice_id = p_invoice_id
  ORDER BY r.date ASC, r.time ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) TO service_role;

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    (
      r.confirmed_at IS NOT NULL
      AND (r.cancelled_by IS NULL OR r.cancelled_by NOT IN ('customer', 'admin'))
      AND r.reservation_fee_invoice_id IS NULL
    ) AS billable,
    r.billing_fee_chf,
    r.reservation_fee_invoice_id
  FROM public.reservations r
  JOIN public.restaurants rest ON rest.id = r.restaurant_id
  LEFT JOIN public.profiles p ON p.user_id = r.user_id
  WHERE (p_restaurant_id IS NULL OR r.restaurant_id = p_restaurant_id)
    AND r.date BETWEEN v_start AND v_end
  ORDER BY r.date DESC, r.time DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) TO service_role;

NOTIFY pgrst, 'reload schema';
