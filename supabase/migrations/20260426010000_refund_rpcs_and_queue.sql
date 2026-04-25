ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS cancellation_reason_details text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_cancelled_by_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'restaurant', 'admin', 'system'));
  END IF;
END;
$$;

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
  v_refundable_amount numeric := 0;
BEGIN
  SELECT *
  INTO v_order
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

  IF lower(COALESCE(v_order.payment_status, '')) IN ('paid', 'captured') THEN
    v_refundable_amount := GREATEST(
      COALESCE(v_order.total_amount, 0)::numeric - COALESCE(v_order.refunded_amount_chf, 0)::numeric,
      0
    );
  END IF;

  BEGIN
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_by = 'customer',
        cancellation_reason = 'customer_cancelled',
        cancellation_reason_code = 'customer_cancelled',
        cancellation_reason_details = NULL,
        refund_status = CASE
          WHEN v_refundable_amount > 0 THEN 'pending'
          ELSE refund_status
        END,
        refund_reason = CASE
          WHEN v_refundable_amount > 0 THEN COALESCE(NULLIF(trim(COALESCE(refund_reason, '')), ''), 'customer_cancelled')
          ELSE refund_reason
        END,
        refund_initiated_by = CASE
          WHEN v_refundable_amount > 0 THEN 'customer'
          ELSE refund_initiated_by
        END,
        updated_at = now()
    WHERE id = p_order_id;

    ok := true;
    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      ok := false;
      error_code := 'validation_error';
      error_message := SQLERRM;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_order_by_restaurant(
  p_order_id uuid,
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
  v_order public.orders%ROWTYPE;
  v_allowed text[] := ARRAY[
    'closure',
    'overbooking',
    'kitchen_issue',
    'customer_unreachable',
    'private_event',
    'duplicate_error',
    'other'
  ];
  v_refundable_amount numeric := 0;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    ok := false;
    error_code := 'not_found';
    error_message := 'Commande introuvable.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_order.restaurant_id) THEN
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

  IF lower(COALESCE(v_order.status, '')) = 'delivered' THEN
    ok := false;
    error_code := 'invalid_state';
    error_message := 'Cette commande est deja terminee.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_reason_code IS NULL OR NOT (p_reason_code = ANY (v_allowed)) THEN
    ok := false;
    error_code := 'invalid_reason';
    error_message := 'Raison d''annulation invalide.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_reason_code = 'other'
     AND (p_reason_details IS NULL OR length(trim(p_reason_details)) < 3) THEN
    ok := false;
    error_code := 'missing_details';
    error_message := 'Les details sont requis pour la raison "Autre".';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(COALESCE(v_order.payment_status, '')) IN ('paid', 'captured') THEN
    v_refundable_amount := GREATEST(
      COALESCE(v_order.total_amount, 0)::numeric - COALESCE(v_order.refunded_amount_chf, 0)::numeric,
      0
    );
  END IF;

  BEGIN
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_by = CASE
          WHEN auth.role() = 'service_role' OR public.auth_is_admin() THEN 'admin'
          ELSE 'restaurant'
        END,
        cancellation_reason = p_reason_code,
        cancellation_reason_code = p_reason_code,
        cancellation_reason_details = NULLIF(trim(COALESCE(p_reason_details, '')), ''),
        refund_status = CASE
          WHEN v_refundable_amount > 0 THEN 'pending'
          ELSE refund_status
        END,
        refund_reason = CASE
          WHEN v_refundable_amount > 0 THEN COALESCE(NULLIF(trim(COALESCE(refund_reason, '')), ''), p_reason_code)
          ELSE refund_reason
        END,
        refund_initiated_by = CASE
          WHEN v_refundable_amount > 0 THEN CASE
            WHEN auth.role() = 'service_role' OR public.auth_is_admin() THEN 'admin'
            ELSE 'restaurant'
          END
          ELSE refund_initiated_by
        END,
        updated_at = now()
    WHERE id = p_order_id;

    ok := true;
    error_code := NULL;
    error_message := NULL;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      ok := false;
      error_code := 'validation_error';
      error_message := SQLERRM;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_by_restaurant(uuid, text, text) TO service_role;

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
  v_refundable_amount numeric := 0;
BEGIN
  SELECT *
  INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    ok := false;
    error_code := 'not_found';
    error_message := 'Reservation introuvable.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_res.user_id THEN
    ok := false;
    error_code := 'forbidden';
    error_message := 'Acces refuse.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(COALESCE(v_res.status, '')) = 'cancelled' THEN
    ok := false;
    error_code := 'cancelled_locked';
    error_message := 'Cette reservation a deja ete annulee et son statut est verrouille.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(COALESCE(v_res.status, '')) = 'no_show' THEN
    ok := false;
    error_code := 'invalid_state';
    error_message := 'Reservation deja terminee.';
    RETURN NEXT;
    RETURN;
  END IF;

  v_effective_dt := (v_res.date::timestamp + v_res.time::time) AT TIME ZONE 'UTC';
  IF v_effective_dt - now() < interval '2 hours' THEN
    ok := false;
    error_code := 'too_late';
    error_message := 'Annulation impossible moins de 2h avant la reservation.';
    RETURN NEXT;
    RETURN;
  END IF;

  v_refundable_amount := GREATEST(
    COALESCE(v_res.total_amount, 0)::numeric - COALESCE(v_res.refunded_amount_chf, 0)::numeric,
    0
  );

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason_code = NULL,
      cancellation_reason_details = NULL,
      refund_status = CASE
        WHEN v_refundable_amount > 0 THEN 'pending'
        ELSE refund_status
      END,
      refund_reason = CASE
        WHEN v_refundable_amount > 0 THEN COALESCE(NULLIF(trim(COALESCE(refund_reason, '')), ''), 'customer_cancelled')
        ELSE refund_reason
      END,
      refund_initiated_by = CASE
        WHEN v_refundable_amount > 0 THEN 'customer'
        ELSE refund_initiated_by
      END,
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true;
  error_code := NULL;
  error_message := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

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
  v_allowed text[] := ARRAY[
    'closure',
    'overbooking',
    'kitchen_issue',
    'customer_unreachable',
    'private_event',
    'duplicate_error',
    'other'
  ];
  v_refundable_amount numeric := 0;
  v_actor text := 'restaurant';
BEGIN
  SELECT *
  INTO v_res
  FROM public.reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    ok := false;
    error_code := 'not_found';
    error_message := 'Reservation introuvable.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(v_res.restaurant_id) THEN
    ok := false;
    error_code := 'forbidden';
    error_message := 'Acces refuse.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF auth.role() = 'service_role' OR public.auth_is_admin() THEN
    v_actor := 'admin';
  END IF;

  IF lower(COALESCE(v_res.status, '')) = 'cancelled' THEN
    ok := false;
    error_code := 'cancelled_locked';
    error_message := 'Cette reservation a deja ete annulee et son statut est verrouille.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF lower(COALESCE(v_res.status, '')) = 'no_show' THEN
    ok := false;
    error_code := 'invalid_state';
    error_message := 'Reservation deja terminee.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_reason_code IS NULL OR NOT (p_reason_code = ANY (v_allowed)) THEN
    ok := false;
    error_code := 'invalid_reason';
    error_message := 'Raison d''annulation invalide.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_reason_code = 'other'
     AND (p_reason_details IS NULL OR length(trim(p_reason_details)) < 3) THEN
    ok := false;
    error_code := 'missing_details';
    error_message := 'Les details sont requis pour la raison "Autre".';
    RETURN NEXT;
    RETURN;
  END IF;

  v_refundable_amount := GREATEST(
    COALESCE(v_res.total_amount, 0)::numeric - COALESCE(v_res.refunded_amount_chf, 0)::numeric,
    0
  );

  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason_code = p_reason_code,
      cancellation_reason_details = NULLIF(trim(COALESCE(p_reason_details, '')), ''),
      refund_status = CASE
        WHEN v_refundable_amount > 0 THEN 'pending'
        ELSE refund_status
      END,
      refund_reason = CASE
        WHEN v_refundable_amount > 0 THEN COALESCE(NULLIF(trim(COALESCE(refund_reason, '')), ''), p_reason_code)
        ELSE refund_reason
      END,
      refund_initiated_by = CASE
        WHEN v_refundable_amount > 0 THEN v_actor
        ELSE refund_initiated_by
      END,
      updated_at = now()
  WHERE id = p_reservation_id;

  ok := true;
  error_code := NULL;
  error_message := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_refund_applied(
  p_target_type text,
  p_target_id uuid,
  p_actor text DEFAULT 'admin',
  p_reason text DEFAULT NULL,
  p_amount_chf numeric DEFAULT NULL,
  p_stripe_refund_id text DEFAULT NULL
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
  v_target_type text := lower(COALESCE(trim(p_target_type), ''));
  v_total_amount numeric := 0;
  v_existing_refunded numeric := 0;
  v_refund_amount numeric := 0;
  v_next_refunded numeric := 0;
  v_next_status text := 'refunded';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.auth_is_admin() THEN
    ok := false;
    error_code := 'forbidden';
    error_message := 'Acces refuse.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_target_type NOT IN ('order', 'reservation') THEN
    ok := false;
    error_code := 'invalid_target';
    error_message := 'Type de remboursement invalide.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_target_type = 'order' THEN
    SELECT COALESCE(total_amount, 0)::numeric, COALESCE(refunded_amount_chf, 0)::numeric
    INTO v_total_amount, v_existing_refunded
    FROM public.orders
    WHERE id = p_target_id;

    IF NOT FOUND THEN
      ok := false;
      error_code := 'not_found';
      error_message := 'Commande introuvable.';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSE
    SELECT COALESCE(total_amount, 0)::numeric, COALESCE(refunded_amount_chf, 0)::numeric
    INTO v_total_amount, v_existing_refunded
    FROM public.reservations
    WHERE id = p_target_id;

    IF NOT FOUND THEN
      ok := false;
      error_code := 'not_found';
      error_message := 'Reservation introuvable.';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  v_refund_amount := COALESCE(
    p_amount_chf,
    GREATEST(v_total_amount - v_existing_refunded, 0)
  );

  IF v_refund_amount <= 0 THEN
    ok := false;
    error_code := 'nothing_to_refund';
    error_message := 'Aucun montant restant a rembourser.';
    RETURN NEXT;
    RETURN;
  END IF;

  v_next_refunded := LEAST(v_total_amount, v_existing_refunded + v_refund_amount);
  v_next_status := CASE
    WHEN v_next_refunded >= v_total_amount THEN 'refunded'
    ELSE 'partial'
  END;

  IF v_target_type = 'order' THEN
    UPDATE public.orders
    SET refund_status = v_next_status,
        refunded_amount_chf = v_next_refunded,
        refunded_at = now(),
        refund_reason = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), refund_reason),
        refund_initiated_by = COALESCE(NULLIF(trim(COALESCE(p_actor, '')), ''), refund_initiated_by, 'admin'),
        stripe_refund_id = COALESCE(NULLIF(trim(COALESCE(p_stripe_refund_id, '')), ''), stripe_refund_id),
        updated_at = now()
    WHERE id = p_target_id;
  ELSE
    UPDATE public.reservations
    SET refund_status = v_next_status,
        refunded_amount_chf = v_next_refunded,
        refunded_at = now(),
        refund_reason = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), refund_reason),
        refund_initiated_by = COALESCE(NULLIF(trim(COALESCE(p_actor, '')), ''), refund_initiated_by, 'admin'),
        stripe_refund_id = COALESCE(NULLIF(trim(COALESCE(p_stripe_refund_id, '')), ''), stripe_refund_id),
        updated_at = now()
    WHERE id = p_target_id;
  END IF;

  ok := true;
  error_code := NULL;
  error_message := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, text, text, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refund_applied(text, uuid, text, text, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_refund_queue()
RETURNS TABLE (
  target_type text,
  target_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  customer_user_id uuid,
  customer_name text,
  customer_phone text,
  reference text,
  item_label text,
  feature text,
  created_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  refund_status text,
  refund_initiated_by text,
  refund_reason text,
  total_amount_chf numeric,
  refunded_amount_chf numeric,
  remaining_amount_chf numeric,
  payment_status text,
  payment_method text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  RETURN QUERY
  SELECT
    'order'::text AS target_type,
    o.id AS target_id,
    o.restaurant_id,
    rest.name AS restaurant_name,
    o.user_id AS customer_user_id,
    prof.full_name AS customer_name,
    prof.phone AS customer_phone,
    COALESCE(o.order_number, '#' || substr(o.id::text, 1, 8)) AS reference,
    COALESCE(rest.name, 'Commande') AS item_label,
    COALESCE(NULLIF(trim(COALESCE(o.metadata ->> 'feature', '')), ''), 'order') AS feature,
    o.created_at,
    o.cancelled_at,
    o.cancelled_by,
    COALESCE(o.refund_status, 'pending') AS refund_status,
    o.refund_initiated_by,
    COALESCE(NULLIF(trim(COALESCE(o.refund_reason, '')), ''), o.cancellation_reason) AS refund_reason,
    COALESCE(o.total_amount, 0)::numeric AS total_amount_chf,
    COALESCE(o.refunded_amount_chf, 0)::numeric AS refunded_amount_chf,
    GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0) AS remaining_amount_chf,
    o.payment_status,
    COALESCE(NULLIF(trim(COALESCE(o.metadata ->> 'payment_method', '')), ''), 'card') AS payment_method
  FROM public.orders o
  LEFT JOIN public.restaurants rest ON rest.id = o.restaurant_id
  LEFT JOIN public.profiles prof ON prof.user_id = o.user_id
  WHERE lower(COALESCE(o.status, '')) = 'cancelled'
    AND lower(COALESCE(o.payment_status, '')) IN ('paid', 'captured')
    AND COALESCE(o.refund_status, 'pending') IN ('pending', 'failed', 'partial')
    AND GREATEST(COALESCE(o.total_amount, 0)::numeric - COALESCE(o.refunded_amount_chf, 0)::numeric, 0) > 0

  UNION ALL

  SELECT
    'reservation'::text AS target_type,
    r.id AS target_id,
    r.restaurant_id,
    rest.name AS restaurant_name,
    r.user_id AS customer_user_id,
    prof.full_name AS customer_name,
    prof.phone AS customer_phone,
    COALESCE(r.order_reference, 'RES-' || substr(r.id::text, 1, 8)) AS reference,
    COALESCE(rest.name, 'Reservation') AS item_label,
    COALESCE(NULLIF(trim(COALESCE(r.feature, '')), ''), COALESCE(r.metadata ->> 'feature', 'reservation')) AS feature,
    r.created_at,
    r.cancelled_at,
    r.cancelled_by,
    COALESCE(r.refund_status, 'pending') AS refund_status,
    r.refund_initiated_by,
    r.refund_reason,
    COALESCE(r.total_amount, 0)::numeric AS total_amount_chf,
    COALESCE(r.refunded_amount_chf, 0)::numeric AS refunded_amount_chf,
    GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0) AS remaining_amount_chf,
    CASE
      WHEN COALESCE(r.total_amount, 0)::numeric > 0 THEN 'paid'
      ELSE NULL
    END AS payment_status,
    COALESCE(
      NULLIF(trim(COALESCE(r.payment_method, '')), ''),
      NULLIF(trim(COALESCE(r.metadata ->> 'payment_method', '')), ''),
      'card'
    ) AS payment_method
  FROM public.reservations r
  LEFT JOIN public.restaurants rest ON rest.id = r.restaurant_id
  LEFT JOIN public.profiles prof ON prof.user_id = r.user_id
  WHERE lower(COALESCE(r.status, '')) = 'cancelled'
    AND COALESCE(r.total_amount, 0)::numeric > 0
    AND COALESCE(r.refund_status, 'pending') IN ('pending', 'failed', 'partial')
    AND GREATEST(COALESCE(r.total_amount, 0)::numeric - COALESCE(r.refunded_amount_chf, 0)::numeric, 0) > 0

  ORDER BY cancelled_at DESC NULLS LAST, created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_refund_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_refund_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_refund_queue() TO service_role;

CREATE OR REPLACE FUNCTION public.get_customer_orders_dashboard()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  payment_status text,
  cancelled_by text,
  cancelled_at timestamptz,
  refund_status text,
  refunded_amount_chf numeric,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  restaurant jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.payment_status,
    o.cancelled_by,
    o.cancelled_at,
    o.refund_status,
    COALESCE(o.refunded_amount_chf, 0)::numeric,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'address', r.address,
      'city', r.city
    ) AS restaurant,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'pickup_lat', dj.pickup_lat,
        'pickup_lng', dj.pickup_lng,
        'dropoff_lat', dj.dropoff_lat,
        'dropoff_lng', dj.dropoff_lng,
        'route_geometry', dj.route_geometry,
        'distance_meters', dj.distance_meters,
        'estimated_duration_minutes', dj.estimated_duration_minutes,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_orders_dashboard(p_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  payment_status text,
  cancelled_by text,
  cancelled_at timestamptz,
  refund_status text,
  refunded_amount_chf numeric,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  customer jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Acces refuse au restaurant %', p_restaurant_id;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.payment_status,
    o.cancelled_by,
    o.cancelled_at,
    o.refund_status,
    COALESCE(o.refunded_amount_chf, 0)::numeric,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'full_name', p.full_name,
      'phone', p.phone
    ) AS customer,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'pickup_lat', dj.pickup_lat,
        'pickup_lng', dj.pickup_lng,
        'dropoff_lat', dj.dropoff_lat,
        'dropoff_lng', dj.dropoff_lng,
        'route_geometry', dj.route_geometry,
        'distance_meters', dj.distance_meters,
        'estimated_duration_minutes', dj.estimated_duration_minutes,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE o.restaurant_id = p_restaurant_id
  ORDER BY o.created_at DESC;
END;
$$;

NOTIFY pgrst, 'reload schema';
