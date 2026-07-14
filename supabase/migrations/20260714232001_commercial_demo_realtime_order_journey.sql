-- Isolated real-time order journey for administrator-managed commercial demos.
-- This schema deliberately has no foreign key, trigger, or write path to the
-- production orders, payments, dispatch, accounting, or notification tables.

CREATE TABLE public.commercial_demo_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,80}$'),
  name text NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  unit_amount_cents integer NOT NULL CHECK (unit_amount_cents BETWEEN 1 AND 100000),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.commercial_demo_catalog_items (slug, name, unit_amount_cents, sort_order)
VALUES
  ('menu-signature', 'Menu signature', 2450, 10),
  ('tiramisu-maison', 'Tiramisu maison', 950, 20)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    unit_amount_cents = EXCLUDED.unit_amount_cents,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

CREATE TABLE public.commercial_demo_order_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_user_id uuid NOT NULL REFERENCES public.commercial_demo_accounts(user_id) ON DELETE CASCADE,
  demo_restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK ((status = 'active' AND archived_at IS NULL) OR (status = 'archived' AND archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX commercial_demo_order_sessions_one_active_idx
  ON public.commercial_demo_order_sessions (commercial_user_id)
  WHERE status = 'active';

CREATE INDEX commercial_demo_order_sessions_restaurant_idx
  ON public.commercial_demo_order_sessions (demo_restaurant_id, created_at DESC);

CREATE TABLE public.commercial_demo_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.commercial_demo_order_sessions(id) ON DELETE CASCADE,
  commercial_user_id uuid NOT NULL REFERENCES public.commercial_demo_accounts(user_id) ON DELETE CASCADE,
  demo_restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  order_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'awaiting_payment', 'restaurant_received', 'restaurant_accepted', 'preparing',
    'ready_for_pickup', 'picked_up', 'delivering', 'delivered'
  )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 80),
  delivery_address text NOT NULL CHECK (char_length(btrim(delivery_address)) BETWEEN 5 AND 240),
  items jsonb NOT NULL CHECK (
    jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) BETWEEN 1 AND 20
  ),
  subtotal_amount_cents integer NOT NULL CHECK (subtotal_amount_cents BETWEEN 1 AND 100000),
  delivery_fee_cents integer NOT NULL DEFAULT 0 CHECK (delivery_fee_cents BETWEEN 0 AND 100000),
  total_amount_cents integer NOT NULL CHECK (total_amount_cents BETWEEN 1 AND 100000),
  currency text NOT NULL DEFAULT 'chf' CHECK (currency = 'chf'),
  payment_status text NOT NULL DEFAULT 'requires_payment' CHECK (payment_status IN ('requires_payment', 'test_paid')),
  stripe_mode text NOT NULL DEFAULT 'test' CHECK (stripe_mode = 'test'),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_amount_cents = subtotal_amount_cents + delivery_fee_cents),
  CHECK (
    (payment_status = 'requires_payment' AND paid_at IS NULL)
    OR
    (payment_status = 'test_paid' AND paid_at IS NOT NULL AND stripe_checkout_session_id IS NOT NULL)
  )
);

CREATE INDEX commercial_demo_orders_owner_created_idx
  ON public.commercial_demo_orders (commercial_user_id, created_at DESC);

CREATE TABLE public.commercial_demo_delivery_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.commercial_demo_order_sessions(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.commercial_demo_orders(id) ON DELETE CASCADE,
  commercial_user_id uuid NOT NULL REFERENCES public.commercial_demo_accounts(user_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'mission_available' CHECK (status IN (
    'mission_available', 'accepted', 'at_restaurant', 'picked_up', 'delivering', 'delivered'
  )),
  courier_name text NOT NULL DEFAULT 'Alex — Livreur démo' CHECK (char_length(btrim(courier_name)) BETWEEN 2 AND 80),
  accepted_at timestamptz,
  arrived_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commercial_demo_delivery_missions_owner_idx
  ON public.commercial_demo_delivery_missions (commercial_user_id, updated_at DESC);

CREATE TABLE public.commercial_demo_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.commercial_demo_order_sessions(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.commercial_demo_orders(id) ON DELETE CASCADE,
  commercial_user_id uuid NOT NULL REFERENCES public.commercial_demo_accounts(user_id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_surface text NOT NULL CHECK (actor_surface IN ('client', 'restaurant', 'courier', 'system')),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z0-9_]{2,80}$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 240),
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commercial_demo_order_events_session_created_idx
  ON public.commercial_demo_order_events (session_id, created_at, id);

ALTER TABLE public.commercial_demo_order_sessions
  ADD CONSTRAINT commercial_demo_sessions_identity_unique
  UNIQUE (id, commercial_user_id, demo_restaurant_id);

ALTER TABLE public.commercial_demo_orders
  ADD CONSTRAINT commercial_demo_orders_session_identity_fk
  FOREIGN KEY (session_id, commercial_user_id, demo_restaurant_id)
  REFERENCES public.commercial_demo_order_sessions (id, commercial_user_id, demo_restaurant_id)
  ON DELETE CASCADE;

ALTER TABLE public.commercial_demo_orders
  ADD CONSTRAINT commercial_demo_orders_mission_identity_unique
  UNIQUE (id, session_id, commercial_user_id);

ALTER TABLE public.commercial_demo_delivery_missions
  ADD CONSTRAINT commercial_demo_missions_order_identity_fk
  FOREIGN KEY (order_id, session_id, commercial_user_id)
  REFERENCES public.commercial_demo_orders (id, session_id, commercial_user_id)
  ON DELETE CASCADE;

ALTER TABLE public.commercial_demo_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_order_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_delivery_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_demo_order_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.commercial_demo_can_access_user(p_commercial_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR public.auth_is_admin()
    OR (
      (SELECT auth.uid()) = p_commercial_user_id
      AND EXISTS (
        SELECT 1
        FROM public.commercial_demo_accounts account
        JOIN public.user_roles role
          ON role.user_id = account.user_id
         AND role.role = 'commercial'::public.app_role
        WHERE account.user_id = p_commercial_user_id
          AND account.is_active
      )
    ),
    false
  )
$$;

CREATE POLICY commercial_demo_catalog_select
  ON public.commercial_demo_catalog_items FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.commercial_demo_accounts account
      WHERE account.user_id = (SELECT auth.uid()) AND account.is_active
    )
  );

CREATE POLICY commercial_demo_sessions_select
  ON public.commercial_demo_order_sessions FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

CREATE POLICY commercial_demo_orders_select
  ON public.commercial_demo_orders FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

CREATE POLICY commercial_demo_missions_select
  ON public.commercial_demo_delivery_missions FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

CREATE POLICY commercial_demo_events_select
  ON public.commercial_demo_order_events FOR SELECT TO authenticated
  USING (public.commercial_demo_can_access_user(commercial_user_id));

REVOKE ALL ON TABLE public.commercial_demo_catalog_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_demo_order_sessions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_demo_orders FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_demo_delivery_missions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_demo_order_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_catalog_items TO authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_order_sessions TO authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_orders TO authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_delivery_missions TO authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_demo_order_events TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_commercial_demo_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Commercial demo events are append-only' USING ERRCODE = '42501';
END
$$;

CREATE TRIGGER commercial_demo_events_append_only
  BEFORE UPDATE ON public.commercial_demo_order_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_commercial_demo_event_mutation();

CREATE OR REPLACE FUNCTION public._commercial_demo_build_snapshot(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_order public.commercial_demo_orders%ROWTYPE;
  v_mission public.commercial_demo_delivery_missions%ROWTYPE;
  v_events jsonb := '[]'::jsonb;
  v_allowed_actions jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commercial demo session not found' USING ERRCODE = 'P0002';
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
        'id', event.id,
        'actor_surface', event.actor_surface,
        'event_type', event.event_type,
        'label', event.label,
        'created_at', event.created_at
      ) ORDER BY event.created_at, event.id
    ),
    '[]'::jsonb
  )
  INTO v_events
  FROM public.commercial_demo_order_events event
  WHERE event.session_id = p_session_id;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'demo_restaurant_id', v_session.demo_restaurant_id,
      'status', v_session.status,
      'created_at', v_session.created_at
    ),
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
    'events', v_events,
    'allowed_actions', v_allowed_actions
  );
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_create_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target_user_id uuid;
  v_restaurant_id uuid;
  v_session public.commercial_demo_order_sessions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_admin() THEN
    SELECT account.user_id, account.demo_restaurant_id
    INTO v_target_user_id, v_restaurant_id
    FROM public.commercial_demo_accounts account
    JOIN public.restaurants restaurant
      ON restaurant.id = account.demo_restaurant_id
     AND restaurant.owner_id = account.user_id
     AND restaurant.is_demo
    JOIN public.user_roles role
      ON role.user_id = account.user_id
     AND role.role = 'commercial'::public.app_role
    WHERE account.is_active
    ORDER BY account.created_at, account.user_id
    LIMIT 1;
  ELSE
    SELECT account.user_id, account.demo_restaurant_id
    INTO v_target_user_id, v_restaurant_id
    FROM public.commercial_demo_accounts account
    JOIN public.restaurants restaurant
      ON restaurant.id = account.demo_restaurant_id
     AND restaurant.owner_id = account.user_id
     AND restaurant.is_demo
    JOIN public.user_roles role
      ON role.user_id = account.user_id
     AND role.role = 'commercial'::public.app_role
    WHERE account.user_id = v_actor_id
      AND account.is_active;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'An active administrator-managed commercial demo account is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_target_user_id::text, 73001));

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.commercial_user_id = v_target_user_id
    AND session.status = 'active';

  IF v_session.id IS NULL THEN
    INSERT INTO public.commercial_demo_order_sessions (
      commercial_user_id, demo_restaurant_id
    ) VALUES (
      v_target_user_id, v_restaurant_id
    ) RETURNING * INTO v_session;

    INSERT INTO public.commercial_demo_order_events (
      session_id, commercial_user_id, actor_user_id,
      actor_surface, event_type, label
    ) VALUES (
      v_session.id, v_target_user_id, v_actor_id,
      'system', 'session_created', 'Démonstration en temps réel initialisée'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'demo_restaurant_id', v_session.demo_restaurant_id,
    'created_at', v_session.created_at
  );
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_get_snapshot(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT session.commercial_user_id INTO v_owner_id
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo session not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.commercial_demo_can_access_user(v_owner_id) THEN
    RAISE EXCEPTION 'Commercial demo access denied' USING ERRCODE = '42501';
  END IF;

  RETURN public._commercial_demo_build_snapshot(p_session_id);
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_create_order(
  p_session_id uuid,
  p_customer_name text,
  p_delivery_address text,
  p_items jsonb,
  p_payment_method text DEFAULT 'stripe_test'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_order public.commercial_demo_orders%ROWTYPE;
  v_input_item jsonb;
  v_catalog_item public.commercial_demo_catalog_items%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_quantity integer;
  v_subtotal integer := 0;
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

  SELECT * INTO v_order
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.session_id = p_session_id;

  IF v_order.id IS NOT NULL THEN
    RETURN public._commercial_demo_build_snapshot(p_session_id);
  END IF;

  IF p_payment_method IS DISTINCT FROM 'stripe_test' THEN
    RAISE EXCEPTION 'Only Stripe Test is allowed in commercial demonstrations'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_customer_name, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid demo customer name' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_delivery_address, ''))) NOT BETWEEN 5 AND 240 THEN
    RAISE EXCEPTION 'Invalid demo delivery address' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Demo order items must be a JSON array'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Demo order items must be a non-empty array of at most 20 items'
      USING ERRCODE = '22023';
  END IF;

  FOR v_input_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_input_item) IS DISTINCT FROM 'object'
       OR COALESCE(v_input_item->>'quantity', '') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'Invalid demo order item' USING ERRCODE = '22023';
    END IF;

    v_quantity := (v_input_item->>'quantity')::integer;
    IF v_quantity NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Demo item quantity must be between 1 and 20' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_catalog_item
    FROM public.commercial_demo_catalog_items catalog
    WHERE lower(catalog.name) = lower(btrim(v_input_item->>'name'))
      AND catalog.is_active;

    IF v_catalog_item.id IS NULL THEN
      RAISE EXCEPTION 'Unknown commercial demo catalog item' USING ERRCODE = '22023';
    END IF;

    v_subtotal := v_subtotal + (v_catalog_item.unit_amount_cents * v_quantity);
    IF v_subtotal > 100000 THEN
      RAISE EXCEPTION 'Commercial demo order amount is too large' USING ERRCODE = '22023';
    END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'name', v_catalog_item.name,
      'quantity', v_quantity,
      'unit_amount_cents', v_catalog_item.unit_amount_cents
    ));
  END LOOP;

  INSERT INTO public.commercial_demo_orders (
    session_id, commercial_user_id, demo_restaurant_id, order_number,
    customer_name, delivery_address, items,
    subtotal_amount_cents, total_amount_cents
  ) VALUES (
    p_session_id, v_session.commercial_user_id, v_session.demo_restaurant_id,
    'DEMO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    btrim(p_customer_name), btrim(p_delivery_address), v_items,
    v_subtotal, v_subtotal
  ) RETURNING * INTO v_order;

  INSERT INTO public.commercial_demo_order_events (
    session_id, order_id, commercial_user_id, actor_user_id,
    actor_surface, event_type, label, to_status,
    metadata
  ) VALUES (
    p_session_id, v_order.id, v_session.commercial_user_id, auth.uid(),
    'client', 'order_created', 'Commande démo créée — paiement Stripe Test requis',
    'awaiting_payment',
    jsonb_build_object('total_amount_cents', v_subtotal, 'stripe_mode', 'test')
  );

  RETURN public._commercial_demo_build_snapshot(p_session_id);
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_get_checkout_order(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.commercial_demo_orders%ROWTYPE;
  v_session_status text;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required for commercial demo checkout lookup'
      USING ERRCODE = '42501';
  END IF;

  SELECT demo_order.*
  INTO v_order
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.session_id = p_session_id;

  IF v_order.id IS NOT NULL THEN
    SELECT session.status
    INTO v_session_status
    FROM public.commercial_demo_order_sessions session
    WHERE session.id = v_order.session_id;
  END IF;

  IF v_order.id IS NULL OR v_session_status <> 'active' THEN
    RAISE EXCEPTION 'Active commercial demo checkout order not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'session_id', v_order.session_id,
    'commercial_user_id', v_order.commercial_user_id,
    'order_number', v_order.order_number,
    'total_amount_cents', v_order.total_amount_cents,
    'currency', v_order.currency,
    'stripe_mode', v_order.stripe_mode,
    'payment_status', v_order.payment_status
  );
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_confirm_test_payment(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.commercial_demo_orders%ROWTYPE;
  v_session public.commercial_demo_order_sessions%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required to confirm Stripe Test payment'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_checkout_session_id, '') !~ '^cs_test_[A-Za-z0-9_]{8,240}$' THEN
    RAISE EXCEPTION 'A Stripe Test checkout session is required' USING ERRCODE = '22023';
  END IF;
  IF p_payment_intent_id IS NOT NULL
     AND p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{8,240}$' THEN
    RAISE EXCEPTION 'Invalid Stripe payment intent reference' USING ERRCODE = '22023';
  END IF;

  SELECT demo_order.* INTO v_order
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_order.session_id;

  IF v_session.status <> 'active'
     OR v_session.commercial_user_id <> v_order.commercial_user_id
     OR v_session.demo_restaurant_id <> v_order.demo_restaurant_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.commercial_demo_accounts account
       WHERE account.user_id = v_order.commercial_user_id
         AND account.demo_restaurant_id = v_order.demo_restaurant_id
         AND account.is_active
     ) THEN
    RAISE EXCEPTION 'Commercial demo isolation check failed' USING ERRCODE = '42501';
  END IF;

  IF v_order.payment_status = 'test_paid' THEN
    IF v_order.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id THEN
      RAISE EXCEPTION 'Commercial demo payment was confirmed by another checkout session'
        USING ERRCODE = '23505';
    END IF;
    IF v_order.stripe_payment_intent_id IS NOT NULL
       AND v_order.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
      RAISE EXCEPTION 'Commercial demo payment intent does not match'
        USING ERRCODE = '23505';
    END IF;
    IF v_order.stripe_payment_intent_id IS NULL AND p_payment_intent_id IS NOT NULL THEN
      UPDATE public.commercial_demo_orders
      SET stripe_payment_intent_id = p_payment_intent_id,
          updated_at = now()
      WHERE id = v_order.id;
    END IF;
    RETURN public._commercial_demo_build_snapshot(v_order.session_id);
  END IF;

  IF v_order.status <> 'awaiting_payment'
     OR v_order.payment_status <> 'requires_payment'
     OR v_order.stripe_mode <> 'test' THEN
    RAISE EXCEPTION 'Commercial demo order is not awaiting Stripe Test payment'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.commercial_demo_orders
  SET payment_status = 'test_paid',
      status = 'restaurant_received',
      stripe_checkout_session_id = p_checkout_session_id,
      stripe_payment_intent_id = p_payment_intent_id,
      paid_at = now(),
      version = version + 1,
      updated_at = now()
  WHERE id = v_order.id;

  INSERT INTO public.commercial_demo_order_events (
    session_id, order_id, commercial_user_id,
    actor_surface, event_type, label, from_status, to_status,
    metadata
  ) VALUES (
    v_order.session_id, v_order.id, v_order.commercial_user_id,
    'system', 'test_payment_confirmed',
    'Paiement Stripe Test confirmé — commande transmise au restaurant',
    'awaiting_payment', 'restaurant_received',
    jsonb_build_object(
      'stripe_mode', 'test',
      'stripe_checkout_session_id', p_checkout_session_id,
      'total_amount_cents', v_order.total_amount_cents
    )
  );

  RETURN public._commercial_demo_build_snapshot(v_order.session_id);
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_transition(
  p_order_id uuid,
  p_action text,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.commercial_demo_orders%ROWTYPE;
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_mission public.commercial_demo_delivery_missions%ROWTYPE;
  v_actor_surface text;
  v_event_type text;
  v_label text;
  v_from_status text;
  v_to_status text;
BEGIN
  IF p_action NOT IN (
    'restaurant_accept', 'restaurant_start_preparing', 'restaurant_mark_ready',
    'courier_accept', 'courier_arrived_pickup', 'courier_confirm_pickup',
    'courier_start_delivery', 'courier_confirm_delivery'
  ) THEN
    RAISE EXCEPTION 'Unsupported commercial demo transition' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM public.commercial_demo_orders demo_order
  WHERE demo_order.id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = v_order.session_id;

  IF v_session.status <> 'active'
     OR v_session.commercial_user_id <> v_order.commercial_user_id
     OR v_session.demo_restaurant_id <> v_order.demo_restaurant_id
     OR NOT public.commercial_demo_can_access_user(v_order.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo access or isolation check failed' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS DISTINCT FROM v_order.version THEN
    RAISE EXCEPTION 'Commercial demo order changed; refresh the realtime snapshot'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_mission
  FROM public.commercial_demo_delivery_missions mission
  WHERE mission.order_id = v_order.id
  FOR UPDATE;

  v_from_status := v_order.status;

  CASE p_action
    WHEN 'restaurant_accept' THEN
      IF v_order.status <> 'restaurant_received' OR v_order.payment_status <> 'test_paid' THEN
        RAISE EXCEPTION 'Restaurant can only accept a paid, newly received demo order' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'restaurant';
      v_event_type := 'restaurant_accepted';
      v_label := 'Le restaurant accepte la commande';
      v_to_status := 'restaurant_accepted';
      UPDATE public.commercial_demo_orders SET status = v_to_status, version = version + 1, updated_at = now() WHERE id = v_order.id;

    WHEN 'restaurant_start_preparing' THEN
      IF v_order.status <> 'restaurant_accepted' OR v_mission.id IS NOT NULL THEN
        RAISE EXCEPTION 'Preparation can only start once after restaurant acceptance' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'restaurant';
      v_event_type := 'preparation_started';
      v_label := 'Le restaurant prépare la commande — mission proposée au livreur';
      v_to_status := 'preparing';
      UPDATE public.commercial_demo_orders SET status = v_to_status, version = version + 1, updated_at = now() WHERE id = v_order.id;
      INSERT INTO public.commercial_demo_delivery_missions (
        session_id, order_id, commercial_user_id
      ) VALUES (
        v_order.session_id, v_order.id, v_order.commercial_user_id
      );

    WHEN 'restaurant_mark_ready' THEN
      IF v_order.status <> 'preparing' OR v_mission.id IS NULL THEN
        RAISE EXCEPTION 'Only a preparing demo order with a delivery mission can be marked ready' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'restaurant';
      v_event_type := 'order_ready';
      v_label := 'La commande est prête à être récupérée';
      v_to_status := 'ready_for_pickup';
      UPDATE public.commercial_demo_orders SET status = v_to_status, version = version + 1, updated_at = now() WHERE id = v_order.id;

    WHEN 'courier_accept' THEN
      IF v_order.status NOT IN ('preparing', 'ready_for_pickup') OR v_mission.status <> 'mission_available' THEN
        RAISE EXCEPTION 'This demo delivery mission is not available' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'courier';
      v_event_type := 'courier_accepted';
      v_label := 'Le livreur accepte la mission';
      v_to_status := v_order.status;
      UPDATE public.commercial_demo_delivery_missions SET status = 'accepted', accepted_at = now(), updated_at = now() WHERE id = v_mission.id;
      UPDATE public.commercial_demo_orders SET version = version + 1, updated_at = now() WHERE id = v_order.id;

    WHEN 'courier_arrived_pickup' THEN
      IF v_order.status NOT IN ('preparing', 'ready_for_pickup') OR v_mission.status <> 'accepted' THEN
        RAISE EXCEPTION 'Courier must accept the mission before arriving' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'courier';
      v_event_type := 'courier_at_restaurant';
      v_label := 'Le livreur est arrivé au restaurant';
      v_to_status := v_order.status;
      UPDATE public.commercial_demo_delivery_missions SET status = 'at_restaurant', arrived_at = now(), updated_at = now() WHERE id = v_mission.id;
      UPDATE public.commercial_demo_orders SET version = version + 1, updated_at = now() WHERE id = v_order.id;

    WHEN 'courier_confirm_pickup' THEN
      IF v_order.status <> 'ready_for_pickup' OR v_mission.status <> 'at_restaurant' THEN
        RAISE EXCEPTION 'Courier can only collect a ready order after arriving' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'courier';
      v_event_type := 'order_picked_up';
      v_label := 'Le livreur confirme la récupération de la commande';
      v_to_status := 'picked_up';
      UPDATE public.commercial_demo_delivery_missions SET status = 'picked_up', picked_up_at = now(), updated_at = now() WHERE id = v_mission.id;
      UPDATE public.commercial_demo_orders SET status = v_to_status, version = version + 1, updated_at = now() WHERE id = v_order.id;

    WHEN 'courier_start_delivery' THEN
      IF v_order.status <> 'picked_up' OR v_mission.status <> 'picked_up' THEN
        RAISE EXCEPTION 'Courier must collect the order before starting delivery' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'courier';
      v_event_type := 'delivery_started';
      v_label := 'Le livreur est en route vers le client';
      v_to_status := 'delivering';
      UPDATE public.commercial_demo_delivery_missions SET status = 'delivering', updated_at = now() WHERE id = v_mission.id;
      UPDATE public.commercial_demo_orders SET status = v_to_status, version = version + 1, updated_at = now() WHERE id = v_order.id;

    WHEN 'courier_confirm_delivery' THEN
      IF v_order.status <> 'delivering' OR v_mission.status <> 'delivering' THEN
        RAISE EXCEPTION 'Only an in-progress demo delivery can be completed' USING ERRCODE = '22023';
      END IF;
      v_actor_surface := 'courier';
      v_event_type := 'order_delivered';
      v_label := 'La commande a été livrée au client';
      v_to_status := 'delivered';
      UPDATE public.commercial_demo_delivery_missions SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE id = v_mission.id;
      UPDATE public.commercial_demo_orders SET status = v_to_status, version = version + 1, updated_at = now() WHERE id = v_order.id;
  END CASE;

  INSERT INTO public.commercial_demo_order_events (
    session_id, order_id, commercial_user_id, actor_user_id,
    actor_surface, event_type, label, from_status, to_status,
    metadata
  ) VALUES (
    v_order.session_id, v_order.id, v_order.commercial_user_id, auth.uid(),
    v_actor_surface, v_event_type, v_label, v_from_status, v_to_status,
    jsonb_build_object('action', p_action, 'expected_version', p_expected_version)
  );

  RETURN public._commercial_demo_build_snapshot(v_order.session_id);
END
$$;

CREATE OR REPLACE FUNCTION public.commercial_demo_reset_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_session public.commercial_demo_order_sessions%ROWTYPE;
  v_new_session public.commercial_demo_order_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_old_session
  FROM public.commercial_demo_order_sessions session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF v_old_session.id IS NULL THEN
    RAISE EXCEPTION 'Commercial demo session not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.commercial_demo_can_access_user(v_old_session.commercial_user_id) THEN
    RAISE EXCEPTION 'Commercial demo access denied' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_old_session.commercial_user_id::text, 73001));

  IF v_old_session.status = 'archived' THEN
    SELECT * INTO v_new_session
    FROM public.commercial_demo_order_sessions session
    WHERE session.commercial_user_id = v_old_session.commercial_user_id
      AND session.status = 'active';

    IF v_new_session.id IS NOT NULL THEN
      RETURN public._commercial_demo_build_snapshot(v_new_session.id);
    END IF;
  ELSE
    UPDATE public.commercial_demo_order_sessions
    SET status = 'archived', archived_at = now()
    WHERE id = v_old_session.id;
  END IF;

  INSERT INTO public.commercial_demo_order_sessions (
    commercial_user_id, demo_restaurant_id
  ) VALUES (
    v_old_session.commercial_user_id, v_old_session.demo_restaurant_id
  ) RETURNING * INTO v_new_session;

  INSERT INTO public.commercial_demo_order_events (
    session_id, commercial_user_id, actor_user_id,
    actor_surface, event_type, label,
    metadata
  ) VALUES (
    v_new_session.id, v_new_session.commercial_user_id, auth.uid(),
    'system', 'session_reset', 'Démonstration réinitialisée dans un nouvel espace isolé',
    jsonb_build_object('previous_session_id', v_old_session.id)
  );

  RETURN public._commercial_demo_build_snapshot(v_new_session.id);
END
$$;

COMMENT ON TABLE public.commercial_demo_order_sessions IS
  'Isolated commercial demo journeys. Archived sessions preserve audit history and never touch production orders.';
COMMENT ON TABLE public.commercial_demo_orders IS
  'Stripe Test-only orders used by the multi-space commercial demonstration; never billable or accountancy eligible.';
COMMENT ON TABLE public.commercial_demo_delivery_missions IS
  'Simulated courier missions scoped to a commercial demo session.';
COMMENT ON TABLE public.commercial_demo_order_events IS
  'Append-only audit timeline for client, restaurant, courier and system actions in a commercial demo.';

ALTER TABLE public.commercial_demo_orders REPLICA IDENTITY FULL;
ALTER TABLE public.commercial_demo_delivery_missions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'commercial_demo_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_orders;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'commercial_demo_delivery_missions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_delivery_missions;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'commercial_demo_order_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.commercial_demo_order_events;
    END IF;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.commercial_demo_can_access_user(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_commercial_demo_event_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._commercial_demo_build_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_create_session()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_get_snapshot(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_create_order(uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_get_checkout_order(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_confirm_test_payment(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_transition(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_demo_reset_session(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commercial_demo_can_access_user(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_create_session()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_get_snapshot(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_create_order(uuid, text, text, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_get_checkout_order(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_confirm_test_payment(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_transition(uuid, text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_demo_reset_session(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
