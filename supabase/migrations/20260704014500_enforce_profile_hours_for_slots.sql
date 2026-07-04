-- Enforce restaurant-profile hours as the only source of reservation and order slots.
-- No customer-facing flow should fall back to invented lunch/dinner defaults.

CREATE OR REPLACE FUNCTION public.get_profile_reservation_service_settings(
  p_opening_hours jsonb,
  p_service_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_start text;
  v_end text;
  v_last text;
BEGIN
  IF p_opening_hours IS NULL OR jsonb_typeof(p_opening_hours) <> 'object' THEN
    RETURN NULL;
  END IF;

  v_settings := COALESCE(
    p_opening_hours -> 'service_settings' -> p_service_key,
    p_opening_hours -> p_service_key
  );

  IF jsonb_typeof(v_settings) <> 'object' OR v_settings = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  v_start := NULLIF(v_settings ->> 'start_time', '');
  v_end := NULLIF(v_settings ->> 'end_time', '');
  v_last := COALESCE(NULLIF(v_settings ->> 'last_reservation_time', ''), v_end);

  BEGIN
    PERFORM v_start::time;
    PERFORM v_end::time;
    PERFORM v_last::time;
  EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
    RETURN NULL;
  END;

  RETURN v_settings || jsonb_build_object(
    'start_time', v_start,
    'end_time', v_end,
    'last_reservation_time', v_last
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_profile_reservation_service_settings(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_reservation_service_settings(jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_profile_order_window(
  p_opening_hours jsonb,
  p_requested_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_local_date date := (COALESCE(p_requested_at, now()) AT TIME ZONE 'Europe/Zurich')::date;
  v_local_time time := (COALESCE(p_requested_at, now()) AT TIME ZONE 'Europe/Zurich')::time;
  v_service_key text := CASE WHEN EXTRACT(HOUR FROM (COALESCE(p_requested_at, now()) AT TIME ZONE 'Europe/Zurich')::time) < 16 THEN 'lunch' ELSE 'dinner' END;
  v_day_key text;
  v_service_settings jsonb;
  v_day_config jsonb;
  v_window jsonb;
  v_start time;
  v_end time;
  v_match text[];
BEGIN
  IF p_opening_hours IS NULL OR jsonb_typeof(p_opening_hours) <> 'object' THEN
    RETURN jsonb_build_object(
      'is_configured', false,
      'open', false,
      'reason', 'missing_opening_hours',
      'message', 'Les horaires du restaurant ne sont pas configures.'
    );
  END IF;

  v_service_settings := COALESCE(
    p_opening_hours -> 'service_settings' -> v_service_key,
    p_opening_hours -> v_service_key
  );

  IF jsonb_typeof(v_service_settings) = 'object' AND v_service_settings <> '{}'::jsonb THEN
    IF COALESCE((v_service_settings ->> 'orders_closed')::boolean, false)
      OR COALESCE((v_service_settings ->> 'service_closed')::boolean, false)
      OR COALESCE((v_service_settings ->> 'online_ordering_enabled')::boolean, true) = false THEN
      RETURN jsonb_build_object(
        'is_configured', true,
        'open', false,
        'reason', 'service_closed',
        'message', COALESCE(v_service_settings ->> 'service_note', 'Ce service est ferme aux commandes.'),
        'service', v_service_key
      );
    END IF;

    BEGIN
      v_start := COALESCE(
        NULLIF(v_service_settings ->> 'order_start_time', '')::time,
        NULLIF(v_service_settings ->> 'start_time', '')::time
      );
      v_end := COALESCE(
        NULLIF(v_service_settings ->> 'order_end_time', '')::time,
        NULLIF(v_service_settings ->> 'end_time', '')::time
      );
    EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
      RETURN jsonb_build_object(
        'is_configured', false,
        'open', false,
        'reason', 'invalid_service_hours',
        'message', 'Les horaires du service sont invalides.',
        'service', v_service_key
      );
    END;

    IF v_start IS NULL OR v_end IS NULL THEN
      RETURN jsonb_build_object(
        'is_configured', false,
        'open', false,
        'reason', 'missing_service_hours',
        'message', 'Les horaires du service ne sont pas configures.',
        'service', v_service_key
      );
    END IF;

    RETURN jsonb_build_object(
      'is_configured', true,
      'open', v_local_time >= v_start AND v_local_time <= v_end,
      'reason', CASE WHEN v_local_time >= v_start AND v_local_time <= v_end THEN NULL ELSE 'outside_service_hours' END,
      'message', CASE WHEN v_local_time >= v_start AND v_local_time <= v_end THEN NULL ELSE 'Le restaurant est ferme sur ce creneau.' END,
      'service', v_service_key,
      'start_time', to_char(v_start, 'HH24:MI'),
      'end_time', to_char(v_end, 'HH24:MI')
    );
  END IF;

  v_day_key := CASE EXTRACT(ISODOW FROM v_local_date)
    WHEN 1 THEN 'lundi'
    WHEN 2 THEN 'mardi'
    WHEN 3 THEN 'mercredi'
    WHEN 4 THEN 'jeudi'
    WHEN 5 THEN 'vendredi'
    WHEN 6 THEN 'samedi'
    ELSE 'dimanche'
  END;
  v_day_config := p_opening_hours -> v_day_key;

  IF v_day_config IS NULL THEN
    RETURN jsonb_build_object(
      'is_configured', false,
      'open', false,
      'reason', 'missing_day_hours',
      'message', 'Les horaires du restaurant ne sont pas configures pour ce jour.'
    );
  END IF;

  IF jsonb_typeof(v_day_config) = 'boolean' THEN
    RETURN jsonb_build_object(
      'is_configured', true,
      'open', false,
      'reason', 'missing_day_time_range',
      'message', 'Les horaires du jour ne contiennent pas de plage horaire.'
    );
  END IF;

  IF jsonb_typeof(v_day_config) = 'string' THEN
    IF v_day_config #>> '{}' ~* '(ferme|fermee|closed)' THEN
      RETURN jsonb_build_object(
        'is_configured', true,
        'open', false,
        'reason', 'closed_day',
        'message', 'Le restaurant est ferme aujourd''hui.'
      );
    END IF;

    v_match := regexp_match(v_day_config #>> '{}', '([0-2][0-9]:[0-5][0-9]).*([0-2][0-9]:[0-5][0-9])');
    IF v_match IS NULL THEN
      RETURN jsonb_build_object(
        'is_configured', false,
        'open', false,
        'reason', 'invalid_day_hours',
        'message', 'Les horaires du jour sont invalides.'
      );
    END IF;

    v_start := v_match[1]::time;
    v_end := v_match[2]::time;
    RETURN jsonb_build_object(
      'is_configured', true,
      'open', v_local_time >= v_start AND v_local_time <= v_end,
      'reason', CASE WHEN v_local_time >= v_start AND v_local_time <= v_end THEN NULL ELSE 'outside_opening_hours' END,
      'message', CASE WHEN v_local_time >= v_start AND v_local_time <= v_end THEN NULL ELSE 'Le restaurant est ferme sur ce creneau.' END,
      'start_time', to_char(v_start, 'HH24:MI'),
      'end_time', to_char(v_end, 'HH24:MI')
    );
  END IF;

  IF jsonb_typeof(v_day_config) = 'object' THEN
    IF COALESCE((v_day_config ->> 'closed')::boolean, false) THEN
      RETURN jsonb_build_object(
        'is_configured', true,
        'open', false,
        'reason', 'closed_day',
        'message', 'Le restaurant est ferme aujourd''hui.'
      );
    END IF;

    BEGIN
      v_start := COALESCE(
        NULLIF(v_day_config ->> 'open', '')::time,
        NULLIF(v_day_config ->> 'start', '')::time,
        NULLIF(v_day_config ->> 'start_time', '')::time
      );
      v_end := COALESCE(
        NULLIF(v_day_config ->> 'close', '')::time,
        NULLIF(v_day_config ->> 'end', '')::time,
        NULLIF(v_day_config ->> 'end_time', '')::time
      );
    EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
      RETURN jsonb_build_object(
        'is_configured', false,
        'open', false,
        'reason', 'invalid_day_hours',
        'message', 'Les horaires du jour sont invalides.'
      );
    END;

    IF v_start IS NULL OR v_end IS NULL THEN
      RETURN jsonb_build_object(
        'is_configured', false,
        'open', false,
        'reason', 'missing_day_hours',
        'message', 'Les horaires du jour ne contiennent pas de plage horaire.'
      );
    END IF;

    RETURN jsonb_build_object(
      'is_configured', true,
      'open', v_local_time >= v_start AND v_local_time <= v_end,
      'reason', CASE WHEN v_local_time >= v_start AND v_local_time <= v_end THEN NULL ELSE 'outside_opening_hours' END,
      'message', CASE WHEN v_local_time >= v_start AND v_local_time <= v_end THEN NULL ELSE 'Le restaurant est ferme sur ce creneau.' END,
      'start_time', to_char(v_start, 'HH24:MI'),
      'end_time', to_char(v_end, 'HH24:MI')
    );
  END IF;

  IF jsonb_typeof(v_day_config) = 'array' THEN
    FOR v_window IN SELECT value FROM jsonb_array_elements(v_day_config)
    LOOP
      BEGIN
        v_start := COALESCE(
          NULLIF(v_window ->> 'open', '')::time,
          NULLIF(v_window ->> 'start', '')::time,
          NULLIF(v_window ->> 'start_time', '')::time
        );
        v_end := COALESCE(
          NULLIF(v_window ->> 'close', '')::time,
          NULLIF(v_window ->> 'end', '')::time,
          NULLIF(v_window ->> 'end_time', '')::time
        );
      EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
        CONTINUE;
      END;

      IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_local_time >= v_start AND v_local_time <= v_end THEN
        RETURN jsonb_build_object(
          'is_configured', true,
          'open', true,
          'start_time', to_char(v_start, 'HH24:MI'),
          'end_time', to_char(v_end, 'HH24:MI')
        );
      END IF;
    END LOOP;

    RETURN jsonb_build_object(
      'is_configured', true,
      'open', false,
      'reason', 'outside_opening_hours',
      'message', 'Le restaurant est ferme sur ce creneau.'
    );
  END IF;

  RETURN jsonb_build_object(
    'is_configured', false,
    'open', false,
    'reason', 'invalid_opening_hours',
    'message', 'Les horaires du restaurant sont invalides.'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_profile_order_window(jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_order_window(jsonb, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_reservation_slot_availability(
  p_restaurant_id uuid,
  p_date date
)
RETURNS TABLE (
  slot_time time,
  service text,
  capacity integer,
  reserved_tables integer,
  remaining_tables integer,
  available boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_hours jsonb;
  v_supports_reservation boolean;
  v_service_key text;
  v_service_settings jsonb;
  v_start time;
  v_last time;
  v_slot time;
  v_step interval;
  v_service_table_capacity integer;
  v_service_reserved_tables integer;
BEGIN
  SELECT opening_hours, COALESCE(supports_reservation, false)
  INTO v_opening_hours, v_supports_reservation
  FROM public.restaurants
  WHERE id = p_restaurant_id
    AND COALESCE(is_active, true) = true;

  IF NOT FOUND OR NOT v_supports_reservation THEN
    RETURN;
  END IF;

  FOREACH v_service_key IN ARRAY ARRAY['lunch', 'dinner']
  LOOP
    v_service_settings := public.get_profile_reservation_service_settings(v_opening_hours, v_service_key);

    IF v_service_settings IS NULL
      OR NOT COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true)
      OR COALESCE((v_service_settings ->> 'service_closed')::boolean, false) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_start := (v_service_settings ->> 'start_time')::time;
      v_last := (v_service_settings ->> 'last_reservation_time')::time;
      v_step := make_interval(mins => GREATEST(COALESCE((v_service_settings ->> 'slot_interval_minutes')::integer, 30), 5));
    EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
      CONTINUE;
    END;

    IF v_start > v_last THEN
      CONTINUE;
    END IF;

    SELECT count(*)::integer
    INTO v_service_reserved_tables
    FROM public.reservations r
    WHERE r.restaurant_id = p_restaurant_id
      AND r.date = p_date
      AND r.status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
      AND CASE
        WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM r.time) < 15
        ELSE EXTRACT(HOUR FROM r.time) >= 15
      END;

    v_slot := v_start;
    WHILE v_slot <= v_last LOOP
      v_service_table_capacity := public.get_reservation_slot_capacity(v_service_settings, v_slot);

      slot_time := v_slot;
      service := v_service_key;
      capacity := v_service_table_capacity;
      reserved_tables := v_service_reserved_tables;
      remaining_tables := GREATEST(v_service_table_capacity - v_service_reserved_tables, 0);
      available := remaining_tables > 0;
      RETURN NEXT;

      v_slot := (v_slot + v_step)::time;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date) TO anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_reservation_slot_availability(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_hours jsonb;
  v_max_covers integer;
  v_existing integer;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_dup_count integer;
  v_existing_dup_id uuid;
  v_existing_dup_paid boolean;
  v_existing_dup_total numeric;
  v_existing_dup_meta jsonb;
  v_reservation_id uuid;
  v_online_booking_enabled boolean;
  v_service_closed boolean;
  v_min_party_size integer;
  v_max_party_size integer;
  v_start_time time;
  v_last_reservation_time time;
  v_service_table_capacity integer;
  v_service_reserved_tables integer;
  v_is_service_role boolean := auth.role() = 'service_role';
  v_effective_user_id uuid;
  v_metadata_raw jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_metadata jsonb;
  v_checkout_session_id text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'checkout_session_id', '')), '');
  v_payment_method text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'payment_method', '')), '');
  v_total_amount numeric := GREATEST(COALESCE(NULLIF(v_metadata_raw ->> 'total_amount', '')::numeric, 0), 0);
  v_order_reference text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'order_reference', '')), '');
  v_preorder_items jsonb := CASE
    WHEN jsonb_typeof(v_metadata_raw -> 'preorder_items') = 'array' THEN v_metadata_raw -> 'preorder_items'
    WHEN jsonb_typeof(v_metadata_raw -> 'drops') = 'array' THEN v_metadata_raw -> 'drops'
    ELSE '[]'::jsonb
  END;
  v_paid boolean := COALESCE((v_metadata_raw ->> 'paid')::boolean, false);
  v_status text := 'pending';
  v_supports_reservation boolean := false;
  v_supports_dinein boolean := false;
  v_feature_normalized text := lower(COALESCE(p_feature, ''));
  v_ref_prefix text;
BEGIN
  IF v_is_service_role THEN
    IF COALESCE(v_metadata_raw ->> '_internal_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Internal user id requis.';
    END IF;
    v_effective_user_id := (v_metadata_raw ->> '_internal_user_id')::uuid;
    v_metadata := v_metadata_raw - '_internal_user_id';
  ELSE
    v_effective_user_id := auth.uid();
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
    v_metadata := v_metadata_raw
      - '_internal_user_id'
      - 'paid'
      - 'card_brand'
      - 'card_last4'
      - 'checkout_session_id';
  END IF;

  IF v_order_reference IS NULL OR trim(v_order_reference) = '' THEN
    v_ref_prefix := CASE v_feature_normalized
      WHEN 'zero-attente' THEN 'ZA'
      WHEN 'chefs_table' THEN 'CT'
      WHEN 'promo-formule' THEN 'PF'
      ELSE 'RES'
    END;
    v_order_reference := public.generate_reference_number(v_ref_prefix);
  END IF;

  SELECT opening_hours, COALESCE(supports_reservation, false), COALESCE(supports_dinein, false)
  INTO v_opening_hours, v_supports_reservation, v_supports_dinein
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  IF v_feature_normalized = 'zero-attente' THEN
    IF NOT public.is_feature_flag_active('zero-attente') THEN
      RAISE EXCEPTION 'Zero Attente est desactive globalement.';
    END IF;
    IF NOT public.is_feature_flag_active('reservation') OR NOT public.is_feature_flag_active('sur-place') THEN
      RAISE EXCEPTION 'Zero Attente requiert Reservation et Sur place.';
    END IF;
    IF NOT v_supports_reservation OR NOT v_supports_dinein THEN
      RAISE EXCEPTION 'Ce restaurant ne propose pas Zero Attente.';
    END IF;
  ELSE
    IF NOT public.is_feature_flag_active('reservation') THEN
      RAISE EXCEPTION 'Les reservations sont desactivees globalement.';
    END IF;
    IF NOT v_supports_reservation THEN
      RAISE EXCEPTION 'Ce restaurant n''accepte pas les reservations.';
    END IF;
  END IF;

  IF v_feature_normalized = 'zero-attente' THEN
    IF NOT v_is_service_role THEN
      RAISE EXCEPTION 'La reservation Zero Attente doit etre finalisee via le paiement securise.';
    END IF;

    IF NOT v_paid OR v_checkout_session_id IS NULL THEN
      RAISE EXCEPTION 'Paiement verifie requis pour Zero Attente.';
    END IF;

    SELECT id
    INTO v_reservation_id
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(feature, '')) = 'zero-attente'
      AND metadata ->> 'checkout_session_id' = v_checkout_session_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_reservation_id;
    END IF;

    v_status := 'confirmed';
  END IF;

  IF v_feature_normalized = 'chefs_table' AND v_is_service_role AND v_paid AND v_checkout_session_id IS NOT NULL THEN
    SELECT id
    INTO v_reservation_id
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(feature, '')) = 'chefs_table'
      AND metadata ->> 'checkout_session_id' = v_checkout_session_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_reservation_id;
    END IF;

    v_status := 'confirmed';
  END IF;

  SELECT id,
         COALESCE((metadata ->> 'paid')::boolean, false),
         COALESCE(total_amount, 0),
         COALESCE(metadata, '{}'::jsonb)
  INTO v_existing_dup_id, v_existing_dup_paid, v_existing_dup_total, v_existing_dup_meta
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_feature_normalized = 'chefs_table' AND (
      v_existing_dup_paid
      OR v_existing_dup_total > 0
      OR (
        v_checkout_session_id IS NOT NULL
        AND NULLIF(trim(COALESCE(v_existing_dup_meta ->> 'checkout_session_id', '')), '') = v_checkout_session_id
      )
    ) THEN
      RETURN v_existing_dup_id;
    END IF;

    SELECT count(*) INTO v_dup_count
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND date = p_date
      AND time = p_time
      AND status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show');

    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
    END IF;
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN
    v_service_key := 'lunch';
  ELSE
    v_service_key := 'dinner';
  END IF;

  v_service_settings := public.get_profile_reservation_service_settings(v_opening_hours, v_service_key);
  IF v_service_settings IS NULL THEN
    RAISE EXCEPTION 'Les horaires du restaurant ne sont pas configures pour ce service.';
  END IF;

  v_online_booking_enabled := COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true);
  v_service_closed := COALESCE((v_service_settings ->> 'service_closed')::boolean, false);
  v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
  v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
  v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
  v_start_time := (v_service_settings ->> 'start_time')::time;
  v_last_reservation_time := (v_service_settings ->> 'last_reservation_time')::time;

  IF NOT v_online_booking_enabled OR v_service_closed THEN
    RAISE EXCEPTION 'Les reservations sont fermees pour ce service.';
  END IF;

  IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN
    RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size;
  END IF;

  IF p_time < v_start_time OR p_time > v_last_reservation_time THEN
    RAISE EXCEPTION 'La plage de reservation pour ce service est % - %.', to_char(v_start_time, 'HH24:MI'), to_char(v_last_reservation_time, 'HH24:MI');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('reservation-service:' || p_restaurant_id::text || ':' || p_date::text || ':' || v_service_key));

  v_service_table_capacity := public.get_reservation_slot_capacity(v_service_settings, p_time);
  SELECT count(*)::integer INTO v_service_reserved_tables
  FROM public.reservations r
  WHERE r.restaurant_id = p_restaurant_id
    AND r.date = p_date
    AND r.status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM r.time) < 15
      ELSE EXTRACT(HOUR FROM r.time) >= 15
    END;

  IF v_service_reserved_tables >= v_service_table_capacity THEN
    RAISE EXCEPTION 'Ce service est complet. Choisissez une autre heure.';
  END IF;

  SELECT COALESCE(sum(party_size), 0) INTO v_existing
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15
      ELSE EXTRACT(HOUR FROM time) >= 15
    END;

  IF v_existing + p_party_size > v_max_covers THEN
    RAISE EXCEPTION 'Capacite depassee pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing, 0);
  END IF;

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
    v_status,
    p_feature,
    v_preorder_items,
    v_metadata,
    p_notes,
    v_total_amount,
    v_payment_method,
    v_order_reference,
    now()
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO service_role;

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
  v_service_table_capacity integer;
  v_service_reserved_tables integer;
  v_max_covers integer;
  v_min_party_size integer;
  v_max_party_size integer;
  v_start_time time;
  v_last_reservation_time time;
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
    AND status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
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
  v_service_settings := public.get_profile_reservation_service_settings(v_opening_hours, v_service_key);

  IF v_service_settings IS NULL THEN
    RAISE EXCEPTION 'Les horaires du restaurant ne sont pas configures pour ce service.';
  END IF;

  IF NOT COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true)
    OR COALESCE((v_service_settings ->> 'service_closed')::boolean, false) THEN
    RAISE EXCEPTION 'Les reservations sont fermees pour ce service.';
  END IF;

  v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
  v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
  v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
  v_start_time := (v_service_settings ->> 'start_time')::time;
  v_last_reservation_time := (v_service_settings ->> 'last_reservation_time')::time;

  IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN
    RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size;
  END IF;

  IF p_time < v_start_time OR p_time > v_last_reservation_time THEN
    RAISE EXCEPTION 'La plage de reservation pour ce service est % - %.', to_char(v_start_time, 'HH24:MI'), to_char(v_last_reservation_time, 'HH24:MI');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('reservation-service:' || p_restaurant_id::text || ':' || p_date::text || ':' || v_service_key));

  SELECT id INTO v_existing_hold_id
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
  END IF;

  v_service_table_capacity := public.get_reservation_slot_capacity(v_service_settings, p_time);
  SELECT count(*)::integer INTO v_service_reserved_tables
  FROM public.reservations r
  WHERE r.restaurant_id = p_restaurant_id
    AND r.date = p_date
    AND r.status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM r.time) < 15
      ELSE EXTRACT(HOUR FROM r.time) >= 15
    END;

  IF v_service_reserved_tables >= v_service_table_capacity THEN
    RAISE EXCEPTION 'Ce service est complet. Choisissez une autre heure.';
  END IF;

  SELECT COALESCE(sum(party_size), 0)::integer INTO v_existing_covers
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
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
  v_exception_config jsonb;
  v_order_window jsonb;
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

  PERFORM pg_advisory_xact_lock(hashtext('order-slot:' || p_restaurant_id::text || ':' || v_slot_start::text));

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

  IF v_can_accept THEN
    v_order_window := public.get_profile_order_window(v_restaurant.opening_hours, v_requested_at);
    IF COALESCE((v_order_window ->> 'is_configured')::boolean, false) = false THEN
      v_can_accept := false;
      v_reason := COALESCE(v_order_window ->> 'reason', 'missing_opening_hours');
      v_message := COALESCE(v_order_window ->> 'message', 'Les horaires du restaurant ne sont pas configures.');
    ELSIF COALESCE((v_order_window ->> 'open')::boolean, false) = false THEN
      v_can_accept := false;
      v_reason := COALESCE(v_order_window ->> 'reason', 'outside_opening_hours');
      v_message := COALESCE(v_order_window ->> 'message', 'Le restaurant est ferme sur ce creneau.');
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

NOTIFY pgrst, 'reload schema';
