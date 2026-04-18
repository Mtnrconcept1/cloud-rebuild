-- Reservation billing RPCs: customer/restaurant cancel, status guard, invoice helpers, admin audit.

-- ---------- 1. Customer-initiated cancellation ----------
CREATE OR REPLACE FUNCTION public.cancel_reservation_by_customer(
  p_reservation_id uuid
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
  v_res public.reservations%ROWTYPE;
  v_effective_dt timestamptz;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_res.user_id THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status IN ('cancelled','no_show') THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    RETURN NEXT; RETURN;
  END IF;

  v_effective_dt := (v_res.date::timestamp + v_res.time::time) AT TIME ZONE 'UTC';
  IF v_effective_dt - now() < interval '2 hours' THEN
    ok := false; error_code := 'too_late';
    error_message := 'Annulation impossible moins de 2h avant la reservation.';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason_code = NULL,
      cancellation_reason_details = NULL,
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true; error_code := NULL; error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_customer(uuid) TO service_role;

-- ---------- 2. Restaurant-initiated cancellation (requires reason) ----------
CREATE OR REPLACE FUNCTION public.cancel_reservation_by_restaurant(
  p_reservation_id uuid,
  p_reason_code text,
  p_reason_details text DEFAULT NULL
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
  v_res public.reservations%ROWTYPE;
  v_allowed text[] := ARRAY['closure','overbooking','kitchen_issue',
                            'customer_unreachable','private_event','duplicate_error','other'];
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    ok := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_res.restaurant_id) THEN
    ok := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_res.status IN ('cancelled','no_show') THEN
    ok := false; error_code := 'invalid_state'; error_message := 'Reservation deja terminee.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code IS NULL OR NOT (p_reason_code = ANY (v_allowed)) THEN
    ok := false; error_code := 'invalid_reason';
    error_message := 'Raison d''annulation invalide.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_reason_code = 'other'
     AND (p_reason_details IS NULL OR length(trim(p_reason_details)) < 3) THEN
    ok := false; error_code := 'missing_details';
    error_message := 'Les details sont requis pour la raison "Autre".';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'restaurant',
      cancellation_reason_code = p_reason_code,
      cancellation_reason_details = NULLIF(trim(COALESCE(p_reason_details,'')), ''),
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true; error_code := NULL; error_message := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_by_restaurant(uuid, text, text) TO service_role;

-- ---------- 3. Status RPC: block direct cancellation + stamp confirmed_at ----------
CREATE OR REPLACE FUNCTION public.update_restaurant_reservation_status_safe(
  p_reservation_id uuid,
  p_status text
)
RETURNS TABLE (
  updated boolean,
  error_code text,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_status text := lower(COALESCE(trim(p_status), ''));
BEGIN
  IF v_status = 'cancelled' THEN
    updated := false; error_code := 'use_cancel_rpc';
    error_message := 'Utilisez cancel_reservation_by_restaurant avec une raison.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_status NOT IN ('pending', 'confirmed', 'arrived', 'no_show') THEN
    updated := false; error_code := 'invalid_status';
    error_message := 'Statut de reservation invalide.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    updated := false; error_code := 'not_found'; error_message := 'Reservation introuvable.';
    RETURN NEXT; RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_reservation.restaurant_id) THEN
    updated := false; error_code := 'forbidden'; error_message := 'Acces refuse.';
    RETURN NEXT; RETURN;
  END IF;

  BEGIN
    UPDATE public.reservations
    SET status = v_status,
        confirmed_at = CASE
          WHEN v_reservation.confirmed_at IS NULL
            AND v_status IN ('confirmed','arrived','no_show')
          THEN now()
          ELSE v_reservation.confirmed_at
        END,
        updated_at = now()
    WHERE id = p_reservation_id;

    updated := true; error_code := NULL; error_message := NULL;
    RETURN NEXT; RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      updated := false; error_code := 'validation_error'; error_message := SQLERRM;
      RETURN NEXT; RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_restaurant_reservation_status_safe(uuid, text) TO service_role;

-- ---------- 4. Reservation fee helpers ----------
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
    AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'));
$$;

REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_restaurant_reservation_fees(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_reservations_to_invoice(
  p_invoice_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invoice public.restaurant_invoices%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_invoice FROM public.restaurant_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  WITH updated AS (
    UPDATE public.reservations
    SET restaurant_invoice_id = v_invoice.id,
        updated_at = now()
    WHERE restaurant_id = v_invoice.restaurant_id
      AND confirmed_at IS NOT NULL
      AND confirmed_at::date BETWEEN v_invoice.period_start AND v_invoice.period_end
      AND restaurant_invoice_id IS NULL
      AND NOT (status = 'cancelled' AND cancelled_by IN ('customer','admin'))
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_reservations_to_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.attach_reservations_to_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.attach_reservations_to_invoice(uuid) TO service_role;

-- ---------- 5. Admin audit RPCs ----------
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
      AND NOT (r.status = 'cancelled' AND r.cancelled_by IN ('customer','admin'))) AS billable,
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

CREATE OR REPLACE FUNCTION public.admin_get_cancellation_fraud_metrics(
  p_month date
)
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  confirmed_count integer,
  cancelled_by_restaurant_count integer,
  cancellation_rate numeric,
  late_cancellations_count integer,
  top_reason_code text,
  top_reason_count integer
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
  WITH base AS (
    SELECT r.*, rest.name AS rname
    FROM public.reservations r
    JOIN public.restaurants rest ON rest.id = r.restaurant_id
    WHERE r.date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT
      b.restaurant_id,
      MAX(b.rname) AS restaurant_name,
      COUNT(*) FILTER (WHERE b.confirmed_at IS NOT NULL)::integer AS confirmed_count,
      COUNT(*) FILTER (WHERE b.cancelled_by = 'restaurant')::integer AS cancelled_by_restaurant_count,
      COUNT(*) FILTER (
        WHERE b.cancelled_by = 'restaurant'
          AND b.cancelled_at IS NOT NULL
          AND ((b.date::timestamp + b.time::time) AT TIME ZONE 'UTC' - b.cancelled_at) < interval '2 hours'
      )::integer AS late_cancellations_count
    FROM base b
    GROUP BY b.restaurant_id
  ),
  reasons AS (
    SELECT
      b.restaurant_id,
      b.cancellation_reason_code,
      COUNT(*)::integer AS reason_count,
      ROW_NUMBER() OVER (
        PARTITION BY b.restaurant_id
        ORDER BY COUNT(*) DESC
      ) AS rn
    FROM base b
    WHERE b.cancelled_by = 'restaurant'
      AND b.cancellation_reason_code IS NOT NULL
    GROUP BY b.restaurant_id, b.cancellation_reason_code
  )
  SELECT
    a.restaurant_id,
    a.restaurant_name,
    a.confirmed_count,
    a.cancelled_by_restaurant_count,
    CASE WHEN a.confirmed_count > 0
         THEN ROUND((a.cancelled_by_restaurant_count::numeric / a.confirmed_count) * 100, 2)
         ELSE 0
    END AS cancellation_rate,
    a.late_cancellations_count,
    (SELECT r.cancellation_reason_code FROM reasons r WHERE r.restaurant_id = a.restaurant_id AND r.rn = 1) AS top_reason_code,
    (SELECT r.reason_count FROM reasons r WHERE r.restaurant_id = a.restaurant_id AND r.rn = 1) AS top_reason_count
  FROM agg a
  ORDER BY cancellation_rate DESC NULLS LAST, a.cancelled_by_restaurant_count DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_cancellation_fraud_metrics(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_cancellation_fraud_metrics(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_cancellation_fraud_metrics(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_cancellation_fraud_metrics(date) TO service_role;

NOTIFY pgrst, 'reload schema';
