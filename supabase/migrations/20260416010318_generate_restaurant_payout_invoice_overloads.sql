-- Reconstructed from the production catalog on 2026-04-17.
-- The original migration file is missing from the repository, but this
-- version reproduces the production RPC overloads needed to reconcile
-- migration history for project wwcrtyoueexyxkkikaos.

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice(
  p_restaurant_id uuid,
  p_month date DEFAULT NULL::date
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  target_month date;
  period_s date;
  period_e date;
  ext_period record;
  inv_count integer := 0;
  next_num integer;
  rev numeric;
  za_rev numeric;
  tva_rate numeric := 0.077;
BEGIN
  target_month := COALESCE(
    p_month::date,
    (date_trunc('month', now()) - interval '1 month')::date
  );
  period_s := date_trunc('month', target_month)::date;
  period_e := (period_s + interval '1 month' - interval '1 day')::date;

  IF EXISTS (
    SELECT 1
    FROM restaurant_invoices
    WHERE restaurant_id = p_restaurant_id
      AND period_start = period_s
      AND period_end = period_e
  ) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
    SUM(total_amount + COALESCE((metadata->>'points_discount_amount')::numeric, 0)),
    0
  )
  INTO rev
  FROM orders
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    AND created_at >= period_s::timestamptz
    AND created_at < (period_e + interval '1 day')::timestamptz;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO za_rev
  FROM reservations
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
    AND total_amount > 0
    AND date >= period_s
    AND date <= period_e;

  rev := rev + za_rev;
  rev := rev * 0.90;

  IF rev > 0 THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
    INTO next_num
    FROM restaurant_invoices
    WHERE restaurant_id = p_restaurant_id;

    INSERT INTO restaurant_invoices (
      restaurant_id,
      period_start,
      period_end,
      amount_ht,
      amount_tva,
      amount_ttc,
      status,
      invoice_number,
      due_at
    )
    VALUES (
      p_restaurant_id,
      period_s,
      period_e,
      ROUND(rev / (1 + tva_rate), 2),
      ROUND(rev - rev / (1 + tva_rate), 2),
      ROUND(rev, 2),
      'draft',
      'FAC-' || TO_CHAR(period_s, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
      (period_e + interval '30 days')::timestamptz
    );
    inv_count := 1;
  END IF;

  RETURN inv_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice(
  p_restaurant_id uuid,
  p_month text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  inv_id uuid;
  next_num integer;
  rev numeric := 0;
  za_rev numeric := 0;
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
  FROM orders
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending');

  SELECT
    COUNT(id),
    COALESCE(SUM(total_amount), 0),
    LEAST(min_date, MIN(created_at)),
    GREATEST(max_date, MAX(created_at))
  INTO unpaid_reservations_count, za_rev, min_date, max_date
  FROM reservations
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  IF unpaid_orders_count = 0 AND unpaid_reservations_count = 0 THEN
    RETURN 0;
  END IF;

  rev := rev + za_rev;
  rev := rev * 0.90;

  inv_period_s := COALESCE(min_date::date, CURRENT_DATE);
  inv_period_e := COALESCE(max_date::date, CURRENT_DATE);

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
  INTO next_num
  FROM restaurant_invoices
  WHERE restaurant_id = p_restaurant_id;

  INSERT INTO restaurant_invoices (
    restaurant_id,
    period_start,
    period_end,
    amount_ht,
    amount_tva,
    amount_ttc,
    status,
    invoice_number,
    due_at
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
    (CURRENT_DATE + interval '30 days')::timestamptz
  )
  RETURNING id INTO inv_id;

  UPDATE orders
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending');

  UPDATE reservations
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  RETURN 1;
END;
$function$;

NOTIFY pgrst, 'reload schema';
