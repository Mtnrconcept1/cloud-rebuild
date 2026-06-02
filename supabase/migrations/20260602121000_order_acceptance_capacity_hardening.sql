-- Order acceptance and slot capacity hardening for 10k readiness.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS orders_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS orders_paused_reason text,
  ADD COLUMN IF NOT EXISTS order_slot_capacity_per_15m integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS dynamic_prep_time_minutes integer,
  ADD COLUMN IF NOT EXISTS exceptional_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reservations_full_until timestamptz,
  ADD COLUMN IF NOT EXISTS reservations_full_reason text;

DO $$
BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_order_slot_capacity_per_15m_check
    CHECK (order_slot_capacity_per_15m BETWEEN 1 AND 500);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_dynamic_prep_time_minutes_check
    CHECK (dynamic_prep_time_minutes IS NULL OR dynamic_prep_time_minutes BETWEEN 5 AND 240);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS restaurant_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS restaurant_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS restaurant_response_status text;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_restaurant_response_status_check
    CHECK (
      restaurant_response_status IS NULL
      OR restaurant_response_status IN ('pending', 'viewed', 'accepted', 'timeout', 'rejected')
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurants_order_capacity_controls
  ON public.restaurants (id, orders_paused_until, order_slot_capacity_per_15m);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_acceptance_deadline
  ON public.orders (restaurant_id, acceptance_deadline_at)
  WHERE acceptance_deadline_at IS NOT NULL
    AND restaurant_accepted_at IS NULL
    AND status IN ('confirmed', 'paid', 'accepted', 'preparing');

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_capacity_slot
  ON public.orders (restaurant_id, COALESCE(scheduled_at, created_at))
  WHERE status IN ('pending_payment', 'confirmed', 'paid', 'accepted', 'preparing', 'ready', 'delivering');

CREATE OR REPLACE FUNCTION public.compute_order_acceptance_deadline(
  p_restaurant_id uuid,
  p_created_at timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_opening_hours jsonb;
  v_minutes integer := 10;
  v_raw_minutes text;
BEGIN
  SELECT opening_hours
  INTO v_opening_hours
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  v_raw_minutes := COALESCE(
    v_opening_hours -> 'order_settings' ->> 'acceptance_deadline_minutes',
    v_opening_hours -> 'service_settings' -> 'orders' ->> 'acceptance_deadline_minutes'
  );

  IF v_raw_minutes ~ '^[0-9]+$' THEN
    v_minutes := LEAST(GREATEST(v_raw_minutes::integer, 3), 60);
  END IF;

  RETURN COALESCE(p_created_at, now()) + make_interval(mins => v_minutes);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_order_acceptance_deadline(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_order_acceptance_deadline(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_order_acceptance_deadline(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_order_acceptance_deadline(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_order_capacity_state(
  p_restaurant_id uuid,
  p_requested_at timestamptz DEFAULT now(),
  p_slot_minutes integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant record;
  v_requested_at timestamptz := COALESCE(p_requested_at, now());
  v_slot_minutes integer := LEAST(GREATEST(COALESCE(p_slot_minutes, 15), 5), 120);
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_slot_order_count integer := 0;
  v_slot_capacity integer := 30;
  v_prep_time_minutes integer := 20;
  v_can_accept boolean := true;
  v_reason text := NULL;
  v_message text := NULL;
  v_local_date date := (COALESCE(p_requested_at, now()) AT TIME ZONE 'Europe/Zurich')::date;
  v_local_time time := (COALESCE(p_requested_at, now()) AT TIME ZONE 'Europe/Zurich')::time;
  v_day_key text;
  v_day_config jsonb;
  v_exception_config jsonb;
  v_service_key text;
  v_service_settings jsonb;
  v_start time;
  v_end time;
  v_window jsonb;
  v_found_open_window boolean := false;
BEGIN
  SELECT
    id,
    COALESCE(is_active, true) AS is_active,
    COALESCE(status, 'active') AS status,
    opening_hours,
    orders_paused_until,
    orders_paused_reason,
    order_slot_capacity_per_15m,
    dynamic_prep_time_minutes,
    avg_prep_time_min,
    exceptional_hours
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_accept_orders', false,
      'reason', 'restaurant_not_found',
      'message', 'Restaurant introuvable.',
      'slot_order_count', 0,
      'slot_capacity', 0,
      'prep_time_minutes', 20
    );
  END IF;

  v_slot_capacity := GREATEST(COALESCE(v_restaurant.order_slot_capacity_per_15m, 30), 1);
  v_prep_time_minutes := GREATEST(COALESCE(v_restaurant.dynamic_prep_time_minutes, v_restaurant.avg_prep_time_min, 20), 5);
  v_slot_start := date_trunc('hour', v_requested_at)
    + make_interval(mins => ((EXTRACT(MINUTE FROM v_requested_at)::integer / v_slot_minutes) * v_slot_minutes));
  v_slot_end := v_slot_start + make_interval(mins => v_slot_minutes);

  SELECT count(*)::integer
  INTO v_slot_order_count
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.status IN ('pending_payment', 'confirmed', 'paid', 'accepted', 'preparing', 'ready', 'delivering')
    AND COALESCE(o.scheduled_at, o.created_at) >= v_slot_start
    AND COALESCE(o.scheduled_at, o.created_at) < v_slot_end;

  IF NOT v_restaurant.is_active OR lower(COALESCE(v_restaurant.status, '')) IN ('inactive', 'closed', 'paused', 'suspended') THEN
    v_can_accept := false;
    v_reason := 'restaurant_inactive';
    v_message := 'Ce restaurant ne prend pas de commandes pour le moment.';
  END IF;

  IF v_can_accept AND v_restaurant.orders_paused_until IS NOT NULL AND v_restaurant.orders_paused_until > now() THEN
    v_can_accept := false;
    v_reason := 'orders_paused';
    v_message := COALESCE(NULLIF(v_restaurant.orders_paused_reason, ''), 'Les commandes sont temporairement en pause.');
  END IF;

  v_exception_config := COALESCE(
    v_restaurant.exceptional_hours -> v_local_date::text,
    v_restaurant.opening_hours -> 'exceptional_hours' -> v_local_date::text,
    '{}'::jsonb
  );

  IF v_can_accept
    AND jsonb_typeof(v_exception_config) = 'object'
    AND (
      COALESCE((v_exception_config ->> 'closed')::boolean, false)
      OR COALESCE((v_exception_config ->> 'orders_closed')::boolean, false)
      OR COALESCE((v_exception_config ->> 'orders_paused')::boolean, false)
    ) THEN
    v_can_accept := false;
    v_reason := 'exceptional_hours_closed';
    v_message := COALESCE(v_exception_config ->> 'message', 'Le restaurant est ferme exceptionnellement.');
  END IF;

  IF v_can_accept AND jsonb_typeof(v_restaurant.opening_hours) = 'object' THEN
    v_service_key := CASE WHEN EXTRACT(HOUR FROM v_local_time) < 16 THEN 'lunch' ELSE 'dinner' END;
    v_service_settings := COALESCE(
      v_restaurant.opening_hours -> 'service_settings' -> v_service_key,
      v_restaurant.opening_hours -> v_service_key,
      '{}'::jsonb
    );

    IF jsonb_typeof(v_service_settings) = 'object' AND v_service_settings <> '{}'::jsonb THEN
      IF COALESCE((v_service_settings ->> 'orders_closed')::boolean, false)
        OR COALESCE((v_service_settings ->> 'service_closed')::boolean, false)
        OR COALESCE((v_service_settings ->> 'online_ordering_enabled')::boolean, true) = false THEN
        v_can_accept := false;
        v_reason := 'service_closed';
        v_message := COALESCE(v_service_settings ->> 'service_note', 'Ce service est ferme aux commandes.');
      ELSE
        BEGIN
          v_start := COALESCE(
            NULLIF(v_service_settings ->> 'order_start_time', '')::time,
            NULLIF(v_service_settings ->> 'start_time', '')::time
          );
          v_end := COALESCE(
            NULLIF(v_service_settings ->> 'order_end_time', '')::time,
            NULLIF(v_service_settings ->> 'end_time', '')::time
          );

          IF v_start IS NOT NULL AND v_end IS NOT NULL AND (v_local_time < v_start OR v_local_time > v_end) THEN
            v_can_accept := false;
            v_reason := 'outside_service_hours';
            v_message := 'Le restaurant est ferme sur ce creneau.';
          END IF;
        EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
          NULL;
        END;
      END IF;
    ELSE
      v_day_key := CASE EXTRACT(ISODOW FROM v_local_date)
        WHEN 1 THEN 'lundi'
        WHEN 2 THEN 'mardi'
        WHEN 3 THEN 'mercredi'
        WHEN 4 THEN 'jeudi'
        WHEN 5 THEN 'vendredi'
        WHEN 6 THEN 'samedi'
        ELSE 'dimanche'
      END;
      v_day_config := COALESCE(v_restaurant.opening_hours -> v_day_key, '{}'::jsonb);

      IF jsonb_typeof(v_day_config) = 'boolean' AND v_day_config = 'false'::jsonb THEN
        v_can_accept := false;
        v_reason := 'closed_day';
        v_message := 'Le restaurant est ferme aujourd''hui.';
      ELSIF jsonb_typeof(v_day_config) = 'object' THEN
        IF COALESCE((v_day_config ->> 'closed')::boolean, false) THEN
          v_can_accept := false;
          v_reason := 'closed_day';
          v_message := 'Le restaurant est ferme aujourd''hui.';
        ELSE
          BEGIN
            v_start := NULLIF(v_day_config ->> 'open', '')::time;
            v_end := NULLIF(v_day_config ->> 'close', '')::time;
            IF v_start IS NOT NULL AND v_end IS NOT NULL AND (v_local_time < v_start OR v_local_time > v_end) THEN
              v_can_accept := false;
              v_reason := 'outside_opening_hours';
              v_message := 'Le restaurant est ferme sur ce creneau.';
            END IF;
          EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
            NULL;
          END;
        END IF;
      ELSIF jsonb_typeof(v_day_config) = 'array' THEN
        FOR v_window IN SELECT value FROM jsonb_array_elements(v_day_config)
        LOOP
          BEGIN
            v_start := NULLIF(v_window ->> 'open', '')::time;
            v_end := NULLIF(v_window ->> 'close', '')::time;
            IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_local_time >= v_start AND v_local_time <= v_end THEN
              v_found_open_window := true;
              EXIT;
            END IF;
          EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
            CONTINUE;
          END;
        END LOOP;

        IF NOT v_found_open_window THEN
          v_can_accept := false;
          v_reason := 'outside_opening_hours';
          v_message := 'Le restaurant est ferme sur ce creneau.';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_can_accept AND v_slot_order_count >= v_slot_capacity THEN
    v_can_accept := false;
    v_reason := 'slot_capacity_reached';
    v_message := 'Ce creneau de commande est complet.';
  END IF;

  IF v_slot_order_count >= CEIL(v_slot_capacity * 0.75) THEN
    v_prep_time_minutes := v_prep_time_minutes + 10;
  ELSIF v_slot_order_count >= CEIL(v_slot_capacity * 0.5) THEN
    v_prep_time_minutes := v_prep_time_minutes + 5;
  END IF;

  RETURN jsonb_build_object(
    'can_accept_orders', v_can_accept,
    'reason', v_reason,
    'message', v_message,
    'requested_at', v_requested_at,
    'slot_start', v_slot_start,
    'slot_end', v_slot_end,
    'slot_order_count', v_slot_order_count,
    'slot_capacity', v_slot_capacity,
    'prep_time_minutes', v_prep_time_minutes,
    'acceptance_deadline_at', public.compute_order_acceptance_deadline(p_restaurant_id, now())
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_order_capacity_state(uuid, timestamptz, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_order_capacity_state(uuid, timestamptz, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_order_capacity_state(uuid, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_order_capacity_state(uuid, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_orders_guard_acceptance_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state jsonb;
  v_requested_at timestamptz;
  v_slot_start timestamptz;
  v_capacity_holding_statuses text[] := ARRAY['pending_payment', 'confirmed', 'paid', 'accepted', 'preparing', 'ready', 'delivering'];
BEGIN
  IF COALESCE(NEW.status, '') = ANY(v_capacity_holding_statuses)
    AND (
      TG_OP = 'INSERT'
      OR COALESCE(OLD.status, '') <> ALL(v_capacity_holding_statuses)
      OR OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id
      OR COALESCE(OLD.scheduled_at, OLD.created_at) IS DISTINCT FROM COALESCE(NEW.scheduled_at, NEW.created_at)
    ) THEN
    v_requested_at := COALESCE(NEW.scheduled_at, NEW.created_at, now());
    v_slot_start := date_trunc('hour', v_requested_at)
      + make_interval(mins => ((EXTRACT(MINUTE FROM v_requested_at)::integer / 15) * 15));

    PERFORM pg_advisory_xact_lock(hashtext('order-slot:' || NEW.restaurant_id::text || ':' || v_slot_start::text));

    v_state := public.get_restaurant_order_capacity_state(NEW.restaurant_id, v_requested_at, 15);

    IF COALESCE((v_state ->> 'can_accept_orders')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(v_state ->> 'message', 'Ce restaurant ne peut pas accepter cette commande.');
    END IF;

    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'order_capacity', jsonb_build_object(
        'slot_order_count', COALESCE((v_state ->> 'slot_order_count')::integer, 0),
        'slot_capacity', COALESCE((v_state ->> 'slot_capacity')::integer, 0),
        'slot_start', v_state ->> 'slot_start',
        'slot_end', v_state ->> 'slot_end'
      ),
      'prep_time_minutes', COALESCE((v_state ->> 'prep_time_minutes')::integer, 20)
    );
  END IF;

  IF COALESCE(NEW.status, '') IN ('confirmed', 'paid')
    AND NEW.acceptance_deadline_at IS NULL THEN
    NEW.acceptance_deadline_at := public.compute_order_acceptance_deadline(NEW.restaurant_id, COALESCE(NEW.created_at, now()));
  END IF;

  IF COALESCE(NEW.status, '') IN ('confirmed', 'paid')
    AND NEW.restaurant_response_status IS NULL THEN
    NEW.restaurant_response_status := 'pending';
  END IF;

  IF COALESCE(NEW.status, '') IN ('accepted', 'preparing', 'ready', 'delivering')
    AND NEW.restaurant_accepted_at IS NULL THEN
    NEW.restaurant_accepted_at := now();
    NEW.restaurant_response_status := 'accepted';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_orders_guard_acceptance_capacity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_orders_guard_acceptance_capacity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_orders_guard_acceptance_capacity() FROM authenticated;

DROP TRIGGER IF EXISTS orders_guard_acceptance_capacity ON public.orders;
CREATE TRIGGER orders_guard_acceptance_capacity
  BEFORE INSERT OR UPDATE OF status, scheduled_at, restaurant_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_orders_guard_acceptance_capacity();

CREATE OR REPLACE FUNCTION public.mark_order_seen_by_restaurant(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  SELECT id, restaurant_id, restaurant_viewed_at, restaurant_accepted_at, restaurant_response_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable.';
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT public.auth_is_admin()
    AND NOT public.auth_owns_restaurant(v_order.restaurant_id) THEN
    RAISE EXCEPTION 'Acces refuse a cette commande.';
  END IF;

  UPDATE public.orders
  SET restaurant_viewed_at = COALESCE(restaurant_viewed_at, v_now),
      restaurant_response_status = CASE
        WHEN restaurant_accepted_at IS NOT NULL THEN 'accepted'
        WHEN restaurant_response_status IS NULL OR restaurant_response_status = 'pending' THEN 'viewed'
        ELSE restaurant_response_status
      END,
      updated_at = v_now
  WHERE id = p_order_id;

  INSERT INTO public.edge_function_audit_logs (
    function_name,
    action,
    actor_user_id,
    actor_roles,
    is_service_role,
    status,
    target_entity_type,
    target_entity_id,
    request_metadata
  )
  VALUES (
    'mark_order_seen_by_restaurant',
    'mark_order_seen',
    v_actor_id,
    ARRAY[auth.role()],
    auth.role() = 'service_role',
    'success',
    'orders',
    p_order_id::text,
    jsonb_build_object('restaurant_id', v_order.restaurant_id)
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'restaurant_viewed_at', COALESCE(v_order.restaurant_viewed_at, v_now),
    'restaurant_response_status', 'viewed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_order_seen_by_restaurant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_order_seen_by_restaurant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_order_seen_by_restaurant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_seen_by_restaurant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_overdue_order_acceptance()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  UPDATE public.orders
  SET restaurant_response_status = 'timeout',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('acceptance_timeout_at', now()),
      updated_at = now()
  WHERE restaurant_accepted_at IS NULL
    AND acceptance_deadline_at IS NOT NULL
    AND acceptance_deadline_at < now()
    AND COALESCE(restaurant_response_status, 'pending') IN ('pending', 'viewed')
    AND status IN ('confirmed', 'paid');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_overdue_order_acceptance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_order_acceptance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_order_acceptance() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_order_acceptance() TO service_role;

DROP FUNCTION IF EXISTS public.get_restaurant_orders_dashboard(uuid);

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
  restaurant_viewed_at timestamptz,
  restaurant_accepted_at timestamptz,
  acceptance_deadline_at timestamptz,
  restaurant_response_status text,
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
    o.restaurant_viewed_at,
    o.restaurant_accepted_at,
    o.acceptance_deadline_at,
    o.restaurant_response_status,
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

REVOKE ALL ON FUNCTION public.get_restaurant_orders_dashboard(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_restaurant_orders_dashboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_orders_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_orders_dashboard(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
