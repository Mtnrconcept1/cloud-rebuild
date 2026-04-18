-- Generalize generate_restaurant_payout_invoice so it covers ALL paid reservations
-- (Zero attente, Chef's Table, promo formules, anti-gaspi, etc.) instead of being
-- limited to feature='zero-attente'. Any reservation with total_amount > 0 was paid
-- by the customer through Stripe and must therefore be re-invoiced to TOK at 90%.

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
  FROM orders
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending');

  SELECT
    COUNT(id),
    COALESCE(SUM(total_amount), 0),
    LEAST(min_date, MIN(created_at)),
    GREATEST(max_date, MAX(created_at))
  INTO unpaid_reservations_count, res_rev, min_date, max_date
  FROM reservations
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
  FROM restaurant_invoices
  WHERE restaurant_id = p_restaurant_id
    AND COALESCE(invoice_type, 'payout') = 'payout';

  INSERT INTO restaurant_invoices (
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

  UPDATE orders
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending');

  -- Generalized: any paid reservation (not just feature='zero-attente') is now linked
  -- to the payout invoice. Chef's Table, promo formules, anti-gaspi etc. all qualify.
  UPDATE reservations
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  RETURN 1;
END;
$function$;

NOTIFY pgrst, 'reload schema';
