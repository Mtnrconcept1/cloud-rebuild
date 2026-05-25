-- Restore owner/admin/service_role authorization on dashboard performance RPCs.
-- A later revenue migration reintroduced these SECURITY DEFINER functions without
-- the cross-tenant guard from 20260329050000_harden_dashboard_and_loyalty_rpcs.sql.

CREATE OR REPLACE FUNCTION public.get_restaurant_performance(
  p_restaurant_id uuid,
  p_from text,
  p_to text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_order_revenue numeric;
  v_za_revenue numeric;
BEGIN
  IF NOT v_is_service_role
     AND NOT public.auth_is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.restaurants
       WHERE id = p_restaurant_id
         AND owner_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_order_revenue
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    AND created_at >= p_from::date::timestamptz
    AND created_at < (p_to::date + interval '1 day')::timestamptz;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_za_revenue
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
    AND total_amount > 0
    AND date >= p_from::date
    AND date <= p_to::date;

  SELECT json_build_object(
    'total_orders',
      COALESCE((
        SELECT count(*)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_revenue', v_order_revenue + v_za_revenue,
    'avg_ticket',
      COALESCE((
        SELECT avg(total_amount)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_reservations',
      COALESCE((
        SELECT count(*)
        FROM public.reservations
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
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_performance(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_comparison(
  p_restaurant_id uuid,
  p_period text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  days_back integer;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_order_revenue numeric;
  v_za_revenue numeric;
BEGIN
  IF NOT v_is_service_role
     AND NOT public.auth_is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.restaurants
       WHERE id = p_restaurant_id
         AND owner_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  days_back := CASE p_period WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 30 END;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_order_revenue
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    AND created_at >= now() - (days_back || ' days')::interval;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_za_revenue
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
    AND total_amount > 0
    AND date >= (now() - (days_back || ' days')::interval)::date;

  SELECT json_build_object(
    'my_revenue', v_order_revenue + v_za_revenue,
    'my_orders',
      COALESCE((
        SELECT count(*)
        FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_avg_rating',
      COALESCE((SELECT avg(rating) FROM public.reviews WHERE restaurant_id = p_restaurant_id), 0),
    'avg_revenue',
      COALESCE((
        SELECT avg(rev)
        FROM (
          SELECT sum(total_amount) AS rev
          FROM public.orders
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
          FROM public.orders
          WHERE created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_rating',
      COALESCE((SELECT avg(rating) FROM public.reviews), 0)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_comparison(uuid, text) TO service_role;

-- Enforce one active reservation per table and slot. The reservation/table schema
-- stores assignments in reservation_slots, so a trigger is required instead of a
-- partial unique index directly on reservations.
CREATE OR REPLACE FUNCTION public.guard_reservation_table_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation record;
  v_conflict_id uuid;
BEGIN
  SELECT id, restaurant_id, date, time, status
  INTO v_reservation
  FROM public.reservations
  WHERE id = NEW.reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation introuvable.';
  END IF;

  IF lower(COALESCE(v_reservation.status, '')) NOT IN ('pending', 'confirmed', 'arrived', 'seated') THEN
    RETURN NEW;
  END IF;

  SELECT rs.reservation_id
  INTO v_conflict_id
  FROM public.reservation_slots rs
  JOIN public.reservations r ON r.id = rs.reservation_id
  WHERE rs.table_id = NEW.table_id
    AND rs.reservation_id <> NEW.reservation_id
    AND r.restaurant_id = v_reservation.restaurant_id
    AND r.date = v_reservation.date
    AND COALESCE(r.time, '00:00'::time) = COALESCE(v_reservation.time, '00:00'::time)
    AND lower(COALESCE(r.status, '')) IN ('pending', 'confirmed', 'arrived', 'seated')
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Table deja assignee sur ce creneau.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_reservation_table_slot ON public.reservation_slots;
CREATE TRIGGER trg_guard_reservation_table_slot
BEFORE INSERT OR UPDATE OF reservation_id, table_id ON public.reservation_slots
FOR EACH ROW
EXECUTE FUNCTION public.guard_reservation_table_slot();

REVOKE EXECUTE ON FUNCTION public.guard_reservation_table_slot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_reservation_table_slot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_reservation_table_slot() FROM authenticated;

NOTIFY pgrst, 'reload schema';
