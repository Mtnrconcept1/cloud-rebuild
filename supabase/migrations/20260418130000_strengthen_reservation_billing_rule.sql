-- Strengthen the reservation billing rule so it is decided by `cancelled_by`
-- alone (regardless of status flips after the fact). Previously the rule
-- relied on `status='cancelled' AND cancelled_by IN (...)` and could leak
-- if a row was manually reverted from 'cancelled' back to another status
-- while keeping cancelled_by set.
--
-- Rule: a reservation is billable when
--   confirmed_at IS NOT NULL
--   AND cancelled_by IS NOT NULL implies cancelled_by NOT IN ('customer','admin')
--
-- Equivalent (used in SQL):
--   confirmed_at IS NOT NULL
--   AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer','admin'))

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
    AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer','admin'));
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
    AND restaurant_invoice_id IS NULL
    AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer','admin'));

  IF v_count = 0 OR v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
    INTO v_next_num
  FROM public.restaurant_invoices
  WHERE restaurant_id = p_restaurant_id
    AND invoice_type = 'reservation_fees';

  INSERT INTO public.restaurant_invoices (
    restaurant_id, period_start, period_end,
    amount_ht, amount_tva, amount_ttc,
    status, invoice_number, due_at, invoice_type
  )
  VALUES (
    p_restaurant_id, v_period_s, v_period_e,
    v_amount, 0, v_amount,
    'pending',
    'TOK-' || TO_CHAR(v_period_s, 'YYYYMM') || '-' || LPAD(v_next_num::text, 4, '0'),
    (v_period_e + interval '30 days')::timestamptz,
    'reservation_fees'
  )
  RETURNING id INTO v_invoice_id;

  UPDATE public.reservations
     SET restaurant_invoice_id = v_invoice_id,
         updated_at = now()
   WHERE restaurant_id = p_restaurant_id
     AND confirmed_at IS NOT NULL
     AND confirmed_at::date BETWEEN v_period_s AND v_period_e
     AND restaurant_invoice_id IS NULL
     AND (cancelled_by IS NULL OR cancelled_by NOT IN ('customer','admin'));

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO service_role;

-- Also mirror the rule in the admin audit RPC.
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
      AND (r.cancelled_by IS NULL OR r.cancelled_by NOT IN ('customer','admin'))) AS billable,
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

REVOKE EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_reservation_billing_history(uuid, date) TO service_role;

NOTIFY pgrst, 'reload schema';
