-- Complete the isolated commercial demonstration with reservations and the
-- real seeded restaurant catalogue. No row is written to production orders,
-- reservations, payments, accounting or dispatch tables.

INSERT INTO public.commercial_demo_catalog_items (slug, name, unit_amount_cents, sort_order)
VALUES
  ('filets-perche-leman', 'Filets de perche du Léman', 3200, 30),
  ('fondue-moitie-moitie', 'Fondue moitié-moitié', 2800, 40),
  ('salade-du-marche', 'Salade du marché', 1800, 50),
  ('tarte-aux-noix', 'Tarte aux noix', 1000, 60)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    unit_amount_cents = EXCLUDED.unit_amount_cents,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

CREATE TABLE public.commercial_demo_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.commercial_demo_order_sessions(id) ON DELETE CASCADE,
  commercial_user_id uuid NOT NULL REFERENCES public.commercial_demo_accounts(user_id) ON DELETE CASCADE,
  demo_restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE CHECK (reference ~ '^RESA-DEMO-[A-Z0-9]{10}$'),
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 80),
  customer_phone text CHECK (customer_phone IS NULL OR char_length(btrim(customer_phone)) BETWEEN 6 AND 40),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'arrived', 'no_show', 'cancelled'
  )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_demo_reservations_session_identity_fk
    FOREIGN KEY (session_id, commercial_user_id, demo_restaurant_id)
    REFERENCES public.commercial_demo_order_sessions (id, commercial_user_id, demo_restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT commercial_demo_reservations_identity_unique
    UNIQUE (id, session_id, commercial_user_id)
);

CREATE INDEX commercial_demo_reservations_session_date_idx
  ON public.commercial_demo_reservations (session_id, reservation_date, reservation_time);
CREATE INDEX commercial_demo_reservations_owner_created_idx
  ON public.commercial_demo_reservations (commercial_user_id, created_at DESC);

ALTER TABLE public.commercial_demo_order_events
  ADD COLUMN reservation_id uuid;
ALTER TABLE public.commercial_demo_order_events
  ADD CONSTRAINT commercial_demo_events_reservation_identity_fk
  FOREIGN KEY (reservation_id, session_id, commercial_user_id)
  REFERENCES public.commercial_demo_reservations (id, session_id, commercial_user_id)
  ON DELETE CASCADE;
ALTER TABLE public.commercial_demo_order_events
  ADD CONSTRAINT commercial_demo_events_one_entity_check
  CHECK (num_nonnulls(order_id, reservation_id) <= 1);
CREATE INDEX commercial_demo_events_reservation_idx
  ON public.commercial_demo_order_events (reservation_id, created_at)
  WHERE reservation_id IS NOT NULL;

ALTER TABLE public.commercial_demo_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY commercial_demo_reservations_select
  ON public.commercial_demo_reservations FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

REVOKE ALL ON TABLE public.commercial_demo_reservations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_reservations
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._commercial_demo_build_snapshot(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_order public.commercial_demo_orders%ROWTYPE;
  v_mission public.commercial_demo_delivery_missions%ROWTYPE;
  v_reservations jsonb := '[]'::jsonb;
  v_active_features jsonb := '[]'::jsonb;
  v_catalog_items jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_allowed_actions jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commercial demo session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants restaurant
  WHERE restaurant.id = v_session.demo_restaurant_id
    AND restaurant.is_demo;
  IF v_restaurant.id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo restaurant not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.session_id = p_session_id;

  IF v_order.id IS NOT NULL THEN
    SELECT * INTO v_mission
    FROM public.commercial_demo_delivery_missions mission
    WHERE mission.order_id = v_order.id;

    v_allowed_actions := CASE v_order.status
      WHEN 'restaurant_received' THEN jsonb_build_array('restaurant_accept')
      WHEN 'restaurant_accepted' THEN jsonb_build_array('restaurant_start_preparing')
      WHEN 'preparing' THEN
        CASE COALESCE(v_mission.status, '')
          WHEN 'mission_available' THEN jsonb_build_array('restaurant_mark_ready', 'courier_accept')
          WHEN 'accepted' THEN jsonb_build_array('restaurant_mark_ready', 'courier_arrived_pickup')
          ELSE jsonb_build_array('restaurant_mark_ready')
        END
      WHEN 'ready_for_pickup' THEN
        CASE COALESCE(v_mission.status, '')
          WHEN 'mission_available' THEN jsonb_build_array('courier_accept')
          WHEN 'accepted' THEN jsonb_build_array('courier_arrived_pickup')
          WHEN 'at_restaurant' THEN jsonb_build_array('courier_confirm_pickup')
          ELSE '[]'::jsonb
        END
      WHEN 'picked_up' THEN jsonb_build_array('courier_start_delivery')
      WHEN 'delivering' THEN jsonb_build_array('courier_confirm_delivery')
      ELSE '[]'::jsonb
    END;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', reservation.id,
        'reference', reservation.reference,
        'reservation_date', reservation.reservation_date,
        'reservation_time', reservation.reservation_time,
        'party_size', reservation.party_size,
        'customer_name', reservation.customer_name,
        'customer_phone', reservation.customer_phone,
        'notes', reservation.notes,
        'status', reservation.status,
        'version', reservation.version,
        'created_at', reservation.created_at,
        'updated_at', reservation.updated_at
      ) ORDER BY reservation.reservation_date DESC, reservation.reservation_time DESC, reservation.id
    ),
    '[]'::jsonb
  ) INTO v_reservations
  FROM public.commercial_demo_reservations reservation
  WHERE reservation.session_id = p_session_id;

  SELECT COALESCE(jsonb_agg(flag.name ORDER BY flag.name), '[]'::jsonb)
  INTO v_active_features
  FROM public.feature_flags flag
  WHERE flag.is_active
    AND public.is_feature_flag_active(flag.name);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'description', item.description,
        'price', item.price,
        'category', item.category,
        'image_url', item.image_url,
        'is_available', item.is_available
      ) ORDER BY item.category, item.name, item.id
    ),
    '[]'::jsonb
  ) INTO v_catalog_items
  FROM public.menu_items item
  WHERE item.restaurant_id = v_restaurant.id
    AND item.is_available;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'actor_surface', event.actor_surface,
        'event_type', event.event_type,
        'label', event.label,
        'created_at', event.created_at
      ) ORDER BY event.created_at, event.id
    ),
    '[]'::jsonb
  ) INTO v_events
  FROM public.commercial_demo_order_events event
  WHERE event.session_id = p_session_id;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'demo_restaurant_id', v_session.demo_restaurant_id,
      'status', v_session.status,
      'created_at', v_session.created_at
    ),
    'demo_restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'description', v_restaurant.description,
      'cuisine_type', v_restaurant.cuisine_type,
      'address', v_restaurant.address,
      'city', v_restaurant.city,
      'phone', v_restaurant.phone,
      'image_url', v_restaurant.image_url,
      'rating', v_restaurant.rating,
      'review_count', v_restaurant.review_count,
      'price_range', v_restaurant.price_range,
      'delivery_available', v_restaurant.delivery_available,
      'delivery_fee', v_restaurant.delivery_fee,
      'min_order_amount', v_restaurant.min_order_amount,
      'supports_pickup', v_restaurant.supports_pickup,
      'supports_dinein', v_restaurant.supports_dinein,
      'supports_reservation', v_restaurant.supports_reservation,
      'is_demo', true
    ),
    'catalog_items', v_catalog_items,
    'order', CASE WHEN v_order.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'status', v_order.status,
      'version', v_order.version,
      'customer_name', v_order.customer_name,
      'delivery_address', v_order.delivery_address,
      'items', v_order.items,
      'total_amount_cents', v_order.total_amount_cents,
      'payment_status', v_order.payment_status,
      'stripe_session_id', v_order.stripe_checkout_session_id,
      'created_at', v_order.created_at,
      'updated_at', v_order.updated_at
    ) END,
    'mission', CASE WHEN v_mission.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_mission.id,
      'status', v_mission.status,
      'courier_name', v_mission.courier_name,
      'updated_at', v_mission.updated_at
    ) END,
    'reservations', v_reservations,
    'active_features', v_active_features,
    'events', v_events,
    'allowed_actions', v_allowed_actions
  );
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_create_reservation(
  p_session_id uuid,
  p_reservation_date date,
  p_reservation_time time,
  p_party_size integer,
  p_customer_name text,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_reservation public.commercial_demo_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL OR v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Active commercial demo session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.commercial_demo_can_access_user(v_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_flag_active('reservation') THEN
    RAISE EXCEPTION 'Reservation feature is not active' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.commercial_demo_accounts account
    JOIN public.restaurants restaurant
      ON restaurant.id = account.demo_restaurant_id
     AND restaurant.is_demo
     AND restaurant.supports_reservation
    WHERE account.user_id = v_session.commercial_user_id
      AND account.demo_restaurant_id = v_session.demo_restaurant_id
      AND account.is_active
  ) THEN
    RAISE EXCEPTION 'Active reservation-ready demo restaurant required' USING ERRCODE = '42501';
  END IF;
  IF p_reservation_date IS NULL
     OR p_reservation_date < current_date
     OR p_reservation_date > current_date + 366 THEN
    RAISE EXCEPTION 'Invalid commercial demo reservation date' USING ERRCODE = '22023';
  END IF;
  IF p_reservation_time IS NULL THEN
    RAISE EXCEPTION 'Invalid commercial demo reservation time' USING ERRCODE = '22023';
  END IF;
  IF p_party_size NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Invalid commercial demo party size' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_customer_name, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid commercial demo customer name' USING ERRCODE = '22023';
  END IF;
  IF p_customer_phone IS NOT NULL
     AND char_length(btrim(p_customer_phone)) NOT BETWEEN 6 AND 40 THEN
    RAISE EXCEPTION 'Invalid commercial demo customer phone' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
    RAISE EXCEPTION 'Commercial demo reservation notes are too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.commercial_demo_reservations (
    session_id, commercial_user_id, demo_restaurant_id, reference,
    reservation_date, reservation_time, party_size,
    customer_name, customer_phone, notes
  ) VALUES (
    v_session.id, v_session.commercial_user_id, v_session.demo_restaurant_id,
    'RESA-DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_reservation_date, p_reservation_time, p_party_size,
    btrim(p_customer_name), NULLIF(btrim(p_customer_phone), ''), NULLIF(btrim(p_notes), '')
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.commercial_demo_order_events (
    session_id, reservation_id, commercial_user_id, actor_user_id,
    actor_surface, event_type, label, to_status, metadata
  ) VALUES (
    v_session.id, v_reservation.id, v_session.commercial_user_id, auth.uid(),
    'client', 'reservation_created',
    'Nouvelle réservation démo ' || v_reservation.reference || ' pour ' || p_party_size || ' personne(s)',
    'pending', jsonb_build_object('reservation_id', v_reservation.id)
  );

  RETURN public._commercial_demo_build_snapshot(v_session.id);
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_transition_reservation(
  p_reservation_id uuid,
  p_action text,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.commercial_demo_reservations%ROWTYPE;
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_actor_surface text;
  v_event_type text;
  v_label text;
  v_from_status text;
  v_to_status text;
BEGIN
  IF p_action NOT IN (
    'restaurant_confirm', 'restaurant_mark_arrived',
    'restaurant_mark_no_show', 'client_cancel'
  ) THEN
    RAISE EXCEPTION 'Unsupported commercial demo reservation transition' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commercial_demo_reservations reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo reservation not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_reservation.session_id;

  IF v_session.status <> 'active'
     OR v_session.commercial_user_id <> v_reservation.commercial_user_id
     OR v_session.demo_restaurant_id <> v_reservation.demo_restaurant_id
     OR NOT public.commercial_demo_can_access_user(v_reservation.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo access or isolation check failed' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_reservation.version THEN
    RAISE EXCEPTION 'Commercial demo reservation changed; refresh the realtime snapshot'
      USING ERRCODE = '40001';
  END IF;

  v_from_status := v_reservation.status;
  CASE p_action
    WHEN 'restaurant_confirm' THEN
      IF v_reservation.status <> 'pending' THEN
        RAISE EXCEPTION 'Only a pending demo reservation can be confirmed' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'restaurant';
      v_event_type := 'reservation_confirmed';
      v_label := 'Le restaurant confirme la réservation ' || v_reservation.reference;
      v_to_status := 'confirmed';
    WHEN 'restaurant_mark_arrived' THEN
      IF v_reservation.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Only a confirmed demo reservation can be marked arrived' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'restaurant';
      v_event_type := 'reservation_arrived';
      v_label := 'Le client est arrivé pour la réservation ' || v_reservation.reference;
      v_to_status := 'arrived';
    WHEN 'restaurant_mark_no_show' THEN
      IF v_reservation.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Only a confirmed demo reservation can be marked no-show' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'restaurant';
      v_event_type := 'reservation_no_show';
      v_label := 'La réservation ' || v_reservation.reference || ' est marquée absent';
      v_to_status := 'no_show';
    WHEN 'client_cancel' THEN
      IF v_reservation.status NOT IN ('pending', 'confirmed') THEN
        RAISE EXCEPTION 'This demo reservation can no longer be cancelled' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'client';
      v_event_type := 'reservation_cancelled';
      v_label := 'Le client annule la réservation ' || v_reservation.reference;
      v_to_status := 'cancelled';
  END CASE;

  UPDATE public.commercial_demo_reservations
  SET status = v_to_status,
      version = version + 1,
      updated_at = now()
  WHERE id = v_reservation.id;

  INSERT INTO public.commercial_demo_order_events (
    session_id, reservation_id, commercial_user_id, actor_user_id,
    actor_surface, event_type, label, from_status, to_status, metadata
  ) VALUES (
    v_reservation.session_id, v_reservation.id, v_reservation.commercial_user_id, auth.uid(),
    v_actor_surface, v_event_type, v_label, v_from_status, v_to_status,
    jsonb_build_object(
      'reservation_id', v_reservation.id,
      'action', p_action,
      'expected_version', p_expected_version
    )
  );

  RETURN public._commercial_demo_build_snapshot(v_reservation.session_id);
END
$$;

COMMENT ON TABLE public.commercial_demo_reservations IS
  'Reservations simulated inside an isolated commercial demo session; never used for billing or production capacity.';

ALTER TABLE public.commercial_demo_reservations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'commercial_demo_reservations'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_reservations;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_create_reservation(uuid, date, time, integer, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_transition_reservation(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commercial_demo_create_reservation(uuid, date, time, integer, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_transition_reservation(uuid, text, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
