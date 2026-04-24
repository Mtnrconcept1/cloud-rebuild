-- Align reservation accounting with the actual payable event timestamp instead of
-- the service date. This fixes Chef's Table (and any paid reservation created in
-- one month for a later service month) being omitted from admin monthly accounting
-- and TOK payable invoice generation.

CREATE OR REPLACE FUNCTION public.generate_tok_payable_invoice(
  p_restaurant_id uuid,
  p_month date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target date := COALESCE(p_month, (date_trunc('month', now()) - interval '1 month')::date);
  v_period_s date := date_trunc('month', v_target)::date;
  v_period_e date := (v_period_s + interval '1 month - 1 day')::date;
  v_next_num integer;
  v_invoice_id uuid;
  v_item_count integer := 0;
  v_total_ttc numeric := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DROP TABLE IF EXISTS pg_temp.tmp_payable_invoice_items;
  CREATE TEMP TABLE pg_temp.tmp_payable_invoice_items (
    item_kind text NOT NULL,
    source_table text,
    source_id uuid,
    source_label text,
    occurred_at timestamptz NOT NULL,
    quantity numeric NOT NULL DEFAULT 1,
    unit_amount numeric NOT NULL DEFAULT 0,
    base_amount numeric NOT NULL DEFAULT 0,
    rate_label text,
    rate_value numeric,
    amount_ht numeric NOT NULL DEFAULT 0,
    amount_tva numeric NOT NULL DEFAULT 0,
    amount_ttc numeric NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.tmp_payable_invoice_items (
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  )
  SELECT
    'order_commission',
    'orders',
    o.id,
    CONCAT(
      'Commande ',
      COALESCE(NULLIF(trim(COALESCE(o.order_number, '')), ''), '#' || left(o.id::text, 8))
    ),
    o.created_at,
    1,
    ROUND(
      COALESCE(o.total_amount, 0)
      + COALESCE((o.metadata ->> 'points_discount_amount')::numeric, 0),
      2
    ),
    ROUND(
      COALESCE(o.total_amount, 0)
      + COALESCE((o.metadata ->> 'points_discount_amount')::numeric, 0),
      2
    ),
    '10%',
    0.10,
    ROUND((
      COALESCE(o.total_amount, 0)
      + COALESCE((o.metadata ->> 'points_discount_amount')::numeric, 0)
    ) * 0.10, 2),
    0,
    ROUND((
      COALESCE(o.total_amount, 0)
      + COALESCE((o.metadata ->> 'points_discount_amount')::numeric, 0)
    ) * 0.10, 2),
    jsonb_build_object(
      'order_number', o.order_number,
      'payment_status', o.payment_status,
      'status', o.status
    )
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= v_period_s::timestamptz
    AND o.created_at < (v_period_e + 1)::timestamptz
    AND lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')
    AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
    AND NOT EXISTS (
      SELECT 1
      FROM public.restaurant_invoice_line_items li
      WHERE li.source_table = 'orders'
        AND li.source_id = o.id
        AND li.item_kind = 'order_commission'
    );

  INSERT INTO pg_temp.tmp_payable_invoice_items (
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  )
  SELECT
    'reservation_commission',
    'reservations',
    r.id,
    CASE
      WHEN NULLIF(trim(COALESCE(r.order_reference, '')), '') IS NOT NULL
        THEN CONCAT('Reservation ', r.order_reference)
      ELSE CONCAT('Reservation #', left(r.id::text, 8))
    END,
    COALESCE(r.confirmed_at, r.created_at, r.updated_at, r.date::timestamptz, now()),
    1,
    ROUND(COALESCE(r.total_amount, 0), 2),
    ROUND(COALESCE(r.total_amount, 0), 2),
    '10%',
    0.10,
    ROUND(COALESCE(r.total_amount, 0) * 0.10, 2),
    0,
    ROUND(COALESCE(r.total_amount, 0) * 0.10, 2),
    jsonb_build_object(
      'feature', r.feature,
      'status', r.status
    )
  FROM public.reservations r
  WHERE r.restaurant_id = p_restaurant_id
    AND COALESCE(r.confirmed_at, r.created_at, r.updated_at, r.date::timestamptz) >= v_period_s::timestamptz
    AND COALESCE(r.confirmed_at, r.created_at, r.updated_at, r.date::timestamptz) < (v_period_e + 1)::timestamptz
    AND COALESCE(r.total_amount, 0) > 0
    AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND NOT EXISTS (
      SELECT 1
      FROM public.restaurant_invoice_line_items li
      WHERE li.source_table = 'reservations'
        AND li.source_id = r.id
        AND li.item_kind = 'reservation_commission'
    );

  INSERT INTO pg_temp.tmp_payable_invoice_items (
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  )
  SELECT
    'reservation_fee',
    'reservations',
    r.id,
    CASE
      WHEN NULLIF(trim(COALESCE(r.order_reference, '')), '') IS NOT NULL
        THEN CONCAT('Reservation ', r.order_reference)
      ELSE CONCAT('Reservation #', left(r.id::text, 8))
    END,
    COALESCE(r.confirmed_at, r.created_at, r.updated_at, now()),
    1,
    ROUND(COALESCE(r.billing_fee_chf, 0), 2),
    ROUND(COALESCE(r.billing_fee_chf, 0), 2),
    CONCAT(ROUND(COALESCE(r.billing_fee_chf, 0), 2), ' CHF / reservation'),
    NULL,
    ROUND(COALESCE(r.billing_fee_chf, 0), 2),
    0,
    ROUND(COALESCE(r.billing_fee_chf, 0), 2),
    jsonb_build_object(
      'status', r.status,
      'cancelled_by', r.cancelled_by,
      'feature', r.feature
    )
  FROM public.reservations r
  WHERE r.restaurant_id = p_restaurant_id
    AND r.confirmed_at IS NOT NULL
    AND r.confirmed_at::date BETWEEN v_period_s AND v_period_e
    AND r.reservation_fee_invoice_id IS NULL
    AND (r.cancelled_by IS NULL OR r.cancelled_by NOT IN ('customer', 'admin'))
    AND NOT EXISTS (
      SELECT 1
      FROM public.restaurant_invoice_line_items li
      WHERE li.source_table = 'reservations'
        AND li.source_id = r.id
        AND li.item_kind = 'reservation_fee'
    );

  INSERT INTO pg_temp.tmp_payable_invoice_items (
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  )
  SELECT
    'campaign_payment',
    'ad_campaigns',
    c.id,
    COALESCE(NULLIF(trim(COALESCE(c.title, '')), ''), 'Campagne publicitaire'),
    COALESCE(c.created_at, now()),
    1,
    ROUND(
      CASE
        WHEN COALESCE(c.paid_amount, 0) > 0 THEN c.paid_amount
        ELSE COALESCE(c.total_budget, 0)
      END,
      2
    ),
    ROUND(
      CASE
        WHEN COALESCE(c.paid_amount, 0) > 0 THEN c.paid_amount
        ELSE COALESCE(c.total_budget, 0)
      END,
      2
    ),
    'Montant facture',
    NULL,
    ROUND(
      CASE
        WHEN COALESCE(c.paid_amount, 0) > 0 THEN c.paid_amount
        ELSE COALESCE(c.total_budget, 0)
      END,
      2
    ),
    0,
    ROUND(
      CASE
        WHEN COALESCE(c.paid_amount, 0) > 0 THEN c.paid_amount
        ELSE COALESCE(c.total_budget, 0)
      END,
      2
    ),
    jsonb_build_object(
      'payment_status', c.payment_status,
      'status', c.status
    )
  FROM public.ad_campaigns c
  WHERE c.restaurant_id = p_restaurant_id
    AND COALESCE(c.payment_status, 'unpaid') = 'paid'
    AND c.created_at >= v_period_s::timestamptz
    AND c.created_at < (v_period_e + 1)::timestamptz
    AND NOT EXISTS (
      SELECT 1
      FROM public.restaurant_invoice_line_items li
      WHERE li.source_table = 'ad_campaigns'
        AND li.source_id = c.id
        AND li.item_kind = 'campaign_payment'
    );

  SELECT COUNT(*), COALESCE(SUM(amount_ttc), 0)
    INTO v_item_count, v_total_ttc
  FROM pg_temp.tmp_payable_invoice_items;

  IF v_item_count = 0 OR v_total_ttc <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
    INTO v_next_num
  FROM public.restaurant_invoices
  WHERE restaurant_id = p_restaurant_id
    AND invoice_type IN ('payable', 'reservation_fees');

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
    ROUND(v_total_ttc, 2),
    0,
    ROUND(v_total_ttc, 2),
    'pending',
    'TOK-' || TO_CHAR(v_period_s, 'YYYYMM') || '-' || LPAD(v_next_num::text, 4, '0'),
    (v_period_e + interval '30 days')::timestamptz,
    'payable'
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.restaurant_invoice_line_items (
    invoice_id,
    restaurant_id,
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  )
  SELECT
    v_invoice_id,
    p_restaurant_id,
    item_kind,
    source_table,
    source_id,
    source_label,
    occurred_at,
    quantity,
    unit_amount,
    base_amount,
    rate_label,
    rate_value,
    amount_ht,
    amount_tva,
    amount_ttc,
    metadata
  FROM pg_temp.tmp_payable_invoice_items
  ORDER BY occurred_at ASC, source_label ASC;

  UPDATE public.reservations
     SET reservation_fee_invoice_id = v_invoice_id,
         updated_at = now()
   WHERE id IN (
     SELECT source_id
     FROM pg_temp.tmp_payable_invoice_items
     WHERE item_kind = 'reservation_fee'
       AND source_id IS NOT NULL
   );

  RETURN v_invoice_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoice(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_tok_payable_invoices_all(
  p_month date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    FROM (
      SELECT o.restaurant_id
      FROM public.orders o
      WHERE o.created_at >= v_period_s::timestamptz
        AND o.created_at < (v_period_e + 1)::timestamptz
        AND lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')
        AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
        AND NOT EXISTS (
          SELECT 1
          FROM public.restaurant_invoice_line_items li
          WHERE li.source_table = 'orders'
            AND li.source_id = o.id
            AND li.item_kind = 'order_commission'
        )
      UNION
      SELECT r.restaurant_id
      FROM public.reservations r
      WHERE COALESCE(r.confirmed_at, r.created_at, r.updated_at, r.date::timestamptz) >= v_period_s::timestamptz
        AND COALESCE(r.confirmed_at, r.created_at, r.updated_at, r.date::timestamptz) < (v_period_e + 1)::timestamptz
        AND COALESCE(r.total_amount, 0) > 0
        AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show', 'pending')
        AND NOT EXISTS (
          SELECT 1
          FROM public.restaurant_invoice_line_items li
          WHERE li.source_table = 'reservations'
            AND li.source_id = r.id
            AND li.item_kind = 'reservation_commission'
        )
      UNION
      SELECT r.restaurant_id
      FROM public.reservations r
      WHERE r.confirmed_at IS NOT NULL
        AND r.confirmed_at::date BETWEEN v_period_s AND v_period_e
        AND r.reservation_fee_invoice_id IS NULL
        AND (r.cancelled_by IS NULL OR r.cancelled_by NOT IN ('customer', 'admin'))
        AND NOT EXISTS (
          SELECT 1
          FROM public.restaurant_invoice_line_items li
          WHERE li.source_table = 'reservations'
            AND li.source_id = r.id
            AND li.item_kind = 'reservation_fee'
        )
      UNION
      SELECT c.restaurant_id
      FROM public.ad_campaigns c
      WHERE COALESCE(c.payment_status, 'unpaid') = 'paid'
        AND c.created_at >= v_period_s::timestamptz
        AND c.created_at < (v_period_e + 1)::timestamptz
        AND NOT EXISTS (
          SELECT 1
          FROM public.restaurant_invoice_line_items li
          WHERE li.source_table = 'ad_campaigns'
            AND li.source_id = c.id
            AND li.item_kind = 'campaign_payment'
        )
    ) AS billable_restaurants
  LOOP
    IF public.generate_tok_payable_invoice(v_restaurant, v_target) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_tok_payable_invoices_all(date) TO service_role;

NOTIFY pgrst, 'reload schema';
