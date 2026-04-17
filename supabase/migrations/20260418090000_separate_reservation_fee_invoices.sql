-- Separate invoice flows: payout (restaurant -> TOK) vs reservation fees (TOK -> restaurant).
-- The 5 CHF reservation fee MUST NOT be added to the restaurant's 90% payout invoice.
-- Instead, TOK issues its own invoice to the restaurant for accumulated reservation fees.

ALTER TABLE public.restaurant_invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'payout';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_invoices_type_check'
  ) THEN
    ALTER TABLE public.restaurant_invoices
      ADD CONSTRAINT restaurant_invoices_type_check
      CHECK (invoice_type IN ('payout','reservation_fees'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurant_invoices_type
  ON public.restaurant_invoices(restaurant_id, invoice_type);

-- Drop the previous attach helper that was bound to the (incorrect) shared invoice model.
DROP FUNCTION IF EXISTS public.attach_reservations_to_invoice(uuid);

-- Generate a TOK -> restaurant invoice covering all unbilled confirmed reservations
-- for the restaurant within the given month. Returns the invoice id (or NULL if nothing to bill).
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
    AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'));

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
     SET restaurant_invoice_id = v_invoice_id,
         updated_at = now()
   WHERE restaurant_id = p_restaurant_id
     AND confirmed_at IS NOT NULL
     AND confirmed_at::date BETWEEN v_period_s AND v_period_e
     AND restaurant_invoice_id IS NULL
     AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'));

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_reservation_fee_invoice(uuid, date) TO service_role;

-- Bulk version: generate TOK reservation-fee invoices for ALL restaurants for a given month.
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
      AND restaurant_invoice_id IS NULL
      AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'))
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

-- Convenience: list line items (reservation fees) for a TOK -> restaurant invoice preview.
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

  IF NOT (auth.role() = 'service_role'
          OR public.auth_is_admin()
          OR public.auth_owns_restaurant(v_invoice.restaurant_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT r.id,
         r.date,
         r.time,
         r.party_size,
         r.status,
         r.cancelled_by,
         r.cancellation_reason_code,
         r.billing_fee_chf
  FROM public.reservations r
  WHERE r.restaurant_invoice_id = p_invoice_id
  ORDER BY r.date ASC, r.time ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reservation_fee_invoice_lines(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
