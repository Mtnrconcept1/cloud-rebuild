CREATE OR REPLACE FUNCTION public.get_restaurant_performance(p_restaurant_id uuid, p_from text, p_to text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_orders',
      COALESCE((
        SELECT count(*)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'avg_ticket',
      COALESCE((
        SELECT avg(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_reservations',
      COALESCE((
        SELECT count(*)
        FROM reservations
        WHERE restaurant_id = p_restaurant_id
          AND date >= p_from::date
          AND date <= p_to::date
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
      ), 0),
    'cancel_rate',
      COALESCE((
        SELECT round(
          count(*) FILTER (WHERE lower(COALESCE(status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
          / NULLIF(count(*), 0) * 100,
          1
        )
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_comparison(p_restaurant_id uuid, p_period text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  days_back integer;
BEGIN
  days_back := CASE p_period WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 30 END;

  SELECT json_build_object(
    'my_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_orders',
      COALESCE((
        SELECT count(*)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_avg_rating',
      COALESCE((SELECT avg(rating) FROM reviews WHERE restaurant_id = p_restaurant_id), 0),
    'avg_revenue',
      COALESCE((
        SELECT avg(rev)
        FROM (
          SELECT sum(total_amount) AS rev
          FROM orders
          WHERE lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
            AND created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_orders',
      COALESCE((
        SELECT avg(cnt)
        FROM (
          SELECT count(*) AS cnt
          FROM orders
          WHERE created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_rating',
      COALESCE((SELECT avg(rating) FROM reviews), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_restaurant_daily_kpis_for_date(p_restaurant_id uuid, p_day text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO restaurant_daily_kpis (
    restaurant_id,
    kpi_date,
    orders_count,
    revenue,
    avg_ticket,
    reservations_count,
    reviews_count,
    satisfaction_score,
    cancel_rate
  )
  SELECT
    p_restaurant_id,
    p_day::date,
    COALESCE(count(o.id), 0),
    COALESCE(sum(o.total_amount) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    ), 0),
    COALESCE(avg(o.total_amount) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    ), 0),
    (
      SELECT count(*)
      FROM reservations r
      WHERE r.restaurant_id = p_restaurant_id
        AND r.date = p_day::date
        AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show')
    ),
    (
      SELECT count(*)
      FROM reviews rev
      WHERE rev.restaurant_id = p_restaurant_id
        AND rev.created_at::date = p_day::date
    ),
    COALESCE((
      SELECT avg(rating)
      FROM reviews rev
      WHERE rev.restaurant_id = p_restaurant_id
        AND rev.created_at::date = p_day::date
    ), 0),
    COALESCE(round(
      count(o.id) FILTER (WHERE lower(COALESCE(o.status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
      / NULLIF(count(o.id), 0) * 100,
      1
    ), 0)
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at::date = p_day::date
  ON CONFLICT (restaurant_id, kpi_date) DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    revenue = EXCLUDED.revenue,
    avg_ticket = EXCLUDED.avg_ticket,
    reservations_count = EXCLUDED.reservations_count,
    reviews_count = EXCLUDED.reviews_count,
    satisfaction_score = EXCLUDED.satisfaction_score,
    cancel_rate = EXCLUDED.cancel_rate,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_month date;
  period_s date;
  period_e date;
  r record;
  inv_count integer := 0;
  next_num integer;
  rev numeric;
  tva_rate numeric := 0.077;
BEGIN
  target_month := COALESCE(p_month::date, (date_trunc('month', now()) - interval '1 month')::date);
  period_s := target_month;
  period_e := (target_month + interval '1 month' - interval '1 day')::date;

  FOR r IN SELECT id, name FROM restaurants WHERE is_active = true LOOP
    IF EXISTS (
      SELECT 1
      FROM restaurant_invoices
      WHERE restaurant_id = r.id
        AND period_start = period_s
        AND period_end = period_e
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(total_amount), 0) INTO rev
    FROM orders
    WHERE restaurant_id = r.id
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
      AND created_at >= period_s::timestamptz
      AND created_at < (period_e + interval '1 day')::timestamptz;

    IF rev > 0 THEN
      SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
      INTO next_num
      FROM restaurant_invoices
      WHERE restaurant_id = r.id;

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
        r.id,
        period_s,
        period_e,
        ROUND(rev / (1 + tva_rate), 2),
        ROUND(rev - rev / (1 + tva_rate), 2),
        ROUND(rev, 2),
        'pending',
        'FAC-' || TO_CHAR(period_s, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
        (period_e + interval '30 days')::timestamptz
      );
      inv_count := inv_count + 1;
    END IF;
  END LOOP;

  RETURN inv_count;
END;
$$;
