-- Dedicated project only. Never include this directory in the production
-- "supabase db push" migration path.
--
-- Commercial presenters authenticate as shadow users with the same UUID as
-- their production identity. Multiple presenters share one safe demo
-- restaurant, while their sessions/orders remain isolated by commercial_user_id.

ALTER TABLE public.commercial_demo_accounts
  DROP CONSTRAINT IF EXISTS commercial_demo_accounts_demo_restaurant_id_key,
  DROP CONSTRAINT IF EXISTS commercial_demo_accounts_user_id_fkey,
  DROP CONSTRAINT IF EXISTS commercial_demo_accounts_created_by_fkey;

CREATE OR REPLACE FUNCTION public.protect_commercial_demo_account_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
  v_is_admin boolean := COALESCE(public.auth_is_admin(), false);
BEGIN
  IF NOT (v_is_service_role OR v_is_admin) THEN
    RAISE EXCEPTION 'Commercial demo affiliations are server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = NEW.demo_restaurant_id
      AND r.is_demo IS TRUE
      AND COALESCE(r.is_active, false) IS TRUE
      AND r.status = 'demo'
      AND r.stripe_account_id IS NULL
      AND r.stripe_connect_details_submitted IS FALSE
      AND r.stripe_connect_charges_enabled IS FALSE
      AND r.stripe_connect_payouts_enabled IS FALSE
  ) THEN
    RAISE EXCEPTION 'Commercial demo mapping must target the active shared demo restaurant with live Stripe disabled'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.commercial_demo_create_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target_user_id uuid;
  v_restaurant_id uuid;
  v_session public.commercial_demo_order_sessions%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT account.user_id, account.demo_restaurant_id
  INTO v_target_user_id, v_restaurant_id
  FROM public.commercial_demo_accounts account
  JOIN public.restaurants restaurant
    ON restaurant.id = account.demo_restaurant_id
   AND restaurant.is_demo IS TRUE
   AND COALESCE(restaurant.is_active, false) IS TRUE
   AND restaurant.status = 'demo'
   AND restaurant.stripe_account_id IS NULL
   AND restaurant.stripe_connect_charges_enabled IS FALSE
  WHERE account.user_id = v_actor_id
    AND account.is_active;

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
$function$;

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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session public.commercial_demo_order_sessions%ROWTYPE;
  v_order public.commercial_demo_orders%ROWTYPE;
  v_input_item jsonb;
  v_menu_item public.menu_items%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_unit_amount_cents integer;
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
  IF NOT public.is_feature_flag_active('commandes') THEN
    RAISE EXCEPTION 'Order feature is not active' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.commercial_demo_accounts account
    JOIN public.restaurants restaurant
      ON restaurant.id = account.demo_restaurant_id
     AND restaurant.is_demo IS TRUE
     AND COALESCE(restaurant.is_active, false) IS TRUE
     AND restaurant.status = 'demo'
     AND restaurant.stripe_account_id IS NULL
     AND restaurant.stripe_connect_charges_enabled IS FALSE
    WHERE account.user_id = v_session.commercial_user_id
      AND account.demo_restaurant_id = v_session.demo_restaurant_id
      AND account.is_active
  ) THEN
    RAISE EXCEPTION 'Active isolated demo restaurant required' USING ERRCODE = '42501';
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
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Demo order items must contain between 1 and 20 items'
      USING ERRCODE = '22023';
  END IF;

  FOR v_input_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_input_item) IS DISTINCT FROM 'object'
       OR COALESCE(v_input_item->>'menu_item_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(v_input_item->>'quantity', '') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'A valid demo menu_item_id and quantity are required'
        USING ERRCODE = '22023';
    END IF;

    v_menu_item_id := (v_input_item->>'menu_item_id')::uuid;
    v_quantity := (v_input_item->>'quantity')::integer;
    IF v_quantity NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Demo item quantity must be between 1 and 20' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_menu_item
    FROM public.menu_items item
    WHERE item.id = v_menu_item_id
      AND item.restaurant_id = v_session.demo_restaurant_id
      AND item.is_available IS TRUE;
    IF NOT FOUND OR v_menu_item.price IS NULL
       OR v_menu_item.price <= 0 OR v_menu_item.price > 1000 THEN
      RAISE EXCEPTION 'Unknown, unavailable or invalid demo menu item'
        USING ERRCODE = '22023';
    END IF;

    v_unit_amount_cents := round(v_menu_item.price * 100)::integer;
    v_subtotal := v_subtotal + (v_unit_amount_cents * v_quantity);
    IF v_subtotal > 100000 THEN
      RAISE EXCEPTION 'Commercial demo order amount is too large' USING ERRCODE = '22023';
    END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_menu_item.id,
      'name', v_menu_item.name,
      'quantity', v_quantity,
      'unit_amount_cents', v_unit_amount_cents
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
    actor_surface, event_type, label, to_status, metadata
  ) VALUES (
    p_session_id, v_order.id, v_session.commercial_user_id, auth.uid(),
    'client', 'order_created', 'Commande démo créée — paiement Stripe Test requis',
    'awaiting_payment',
    jsonb_build_object('total_amount_cents', v_subtotal, 'stripe_mode', 'test')
  );

  RETURN public._commercial_demo_build_snapshot(p_session_id);
END
$function$;

REVOKE ALL ON FUNCTION public.protect_commercial_demo_account_mapping() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commercial_demo_create_session() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commercial_demo_create_order(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_demo_create_session() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_demo_create_order(uuid, text, text, jsonb, text)
  TO authenticated, service_role;
