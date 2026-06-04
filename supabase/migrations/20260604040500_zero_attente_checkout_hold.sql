CREATE OR REPLACE FUNCTION public.create_zero_attente_checkout_hold(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_session_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user_id uuid;
  v_opening_hours jsonb;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_slot_capacity integer;
  v_slot_reserved integer;
  v_max_covers integer;
  v_existing_covers integer;
  v_existing_hold_id uuid;
  v_order_reference text := NULLIF(trim(COALESCE(p_metadata ->> 'order_reference', '')), '');
  v_preorder_items jsonb := CASE
    WHEN jsonb_typeof(p_metadata -> 'preorder_items') = 'array' THEN p_metadata -> 'preorder_items'
    ELSE '[]'::jsonb
  END;
  v_metadata jsonb;
  v_reservation_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF COALESCE(p_metadata ->> '_internal_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Internal user id requis.';
  END IF;

  v_effective_user_id := (p_metadata ->> '_internal_user_id')::uuid;
  IF p_session_id IS NULL OR trim(p_session_id) = '' THEN
    RAISE EXCEPTION 'checkout_session_id requis.';
  END IF;
  IF p_party_size IS NULL OR p_party_size < 1 THEN
    RAISE EXCEPTION 'Nombre de convives invalide.';
  END IF;

  SELECT id INTO v_existing_hold_id
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND metadata ->> 'checkout_session_id' = p_session_id
    AND status NOT IN ('cancelled', 'no_show')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing_hold_id;
  END IF;

  SELECT opening_hours
  INTO v_opening_hours
  FROM public.restaurants
  WHERE id = p_restaurant_id
    AND COALESCE(supports_reservation, false)
    AND COALESCE(supports_dinein, false);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce restaurant ne propose pas Zero Attente.';
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  v_service_key := CASE WHEN v_hour < 15 THEN 'lunch' ELSE 'dinner' END;
  v_service_settings := COALESCE(
    v_opening_hours -> 'service_settings' -> v_service_key,
    v_opening_hours -> v_service_key,
    '{}'::jsonb
  );

  PERFORM pg_advisory_xact_lock(hashtext('zero-attente-hold:' || p_restaurant_id::text || ':' || p_date::text || ':' || p_time::text));

  SELECT id INTO v_existing_hold_id
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
  END IF;

  v_slot_capacity := COALESCE(public.get_reservation_slot_capacity(v_service_settings, p_time), 1);
  SELECT count(*)::integer INTO v_slot_reserved
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show');

  IF v_slot_reserved >= v_slot_capacity THEN
    RAISE EXCEPTION 'Ce creneau est complet. Choisissez une autre heure.';
  END IF;

  v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
  SELECT COALESCE(sum(party_size), 0)::integer INTO v_existing_covers
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'no_show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15
      ELSE EXTRACT(HOUR FROM time) >= 15
    END;

  IF v_existing_covers + p_party_size > v_max_covers THEN
    RAISE EXCEPTION 'Capacite depassee pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing_covers, 0);
  END IF;

  IF v_order_reference IS NULL THEN
    v_order_reference := public.generate_reference_number('ZA');
  END IF;

  v_metadata := (COALESCE(p_metadata, '{}'::jsonb) - '_internal_user_id')
    || jsonb_build_object(
      'feature', 'zero-attente',
      'checkout_session_id', p_session_id,
      'checkout_session_state', 'pending_payment',
      'paid', false,
      'hold_created_at', now(),
      'hold_expires_at', now() + interval '35 minutes'
    );

  INSERT INTO public.reservations (
    user_id,
    restaurant_id,
    date,
    time,
    party_size,
    status,
    feature,
    preorder_items,
    metadata,
    notes,
    total_amount,
    payment_method,
    order_reference,
    updated_at
  )
  VALUES (
    v_effective_user_id,
    p_restaurant_id,
    p_date,
    p_time,
    p_party_size,
    'pending',
    'zero-attente',
    v_preorder_items,
    v_metadata,
    p_notes,
    GREATEST(COALESCE(NULLIF(p_metadata ->> 'total_amount', '')::numeric, 0), 0),
    NULLIF(trim(COALESCE(p_metadata ->> 'payment_method', '')), ''),
    v_order_reference,
    now()
  )
  RETURNING id INTO v_reservation_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, new_data)
  VALUES (
    v_effective_user_id,
    'create_zero_attente_checkout_hold',
    'reservation',
    v_reservation_id,
    jsonb_build_object(
      'restaurant_id', p_restaurant_id,
      'checkout_session_id', p_session_id,
      'party_size', p_party_size,
      'date', p_date,
      'time', p_time
    )
  );

  RETURN v_reservation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_zero_attente_checkout_hold(uuid, date, time, integer, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_zero_attente_checkout_hold(uuid, date, time, integer, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_zero_attente_checkout_hold(uuid, date, time, integer, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_zero_attente_checkout_hold(uuid, date, time, integer, text, jsonb, text) TO service_role;

NOTIFY pgrst, 'reload schema';
