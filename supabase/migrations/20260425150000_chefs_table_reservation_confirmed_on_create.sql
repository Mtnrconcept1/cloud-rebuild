-- La Table du Chef reservations are paid up-front via Stripe before the row is created,
-- so they should be inserted directly with status = 'confirmed' (same pattern as
-- zero-attente). Previously the RPC inserted them as 'pending' and a follow-up
-- UPDATE in the edge function flipped them to 'confirmed', leaving a tiny
-- window where the reservation appeared as pending in the UI.

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time without time zone,
  p_party_size integer,
  p_feature text DEFAULT 'classique'::text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_opening_hours jsonb;
  v_max_covers integer;
  v_existing integer;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_existing_dup_id uuid;
  v_existing_dup_paid boolean;
  v_existing_dup_total numeric;
  v_existing_dup_meta jsonb;
  v_reservation_id uuid;
  v_online_booking_enabled boolean;
  v_service_closed boolean;
  v_min_party_size integer;
  v_max_party_size integer;
  v_last_reservation_time time;
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
    v_metadata := v_metadata_raw - '_internal_user_id' - 'paid' - 'card_brand' - 'card_last4' - 'checkout_session_id';
  END IF;

  SELECT opening_hours, COALESCE(supports_reservation, false), COALESCE(supports_dinein, false)
  INTO v_opening_hours, v_supports_reservation, v_supports_dinein
  FROM public.restaurants WHERE id = p_restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant introuvable.'; END IF;

  IF v_feature_normalized = 'zero-attente' THEN
    IF NOT public.is_feature_flag_active('zero-attente') THEN RAISE EXCEPTION 'Zero Attente est desactive globalement.'; END IF;
    IF NOT public.is_feature_flag_active('reservation') OR NOT public.is_feature_flag_active('sur-place') THEN RAISE EXCEPTION 'Zero Attente requiert Reservation et Sur place.'; END IF;
    IF NOT v_supports_reservation OR NOT v_supports_dinein THEN RAISE EXCEPTION 'Ce restaurant ne propose pas Zero Attente.'; END IF;
  ELSE
    IF NOT public.is_feature_flag_active('reservation') THEN RAISE EXCEPTION 'Les reservations sont desactivees globalement.'; END IF;
    IF NOT v_supports_reservation THEN RAISE EXCEPTION 'Ce restaurant n''accepte pas les reservations.'; END IF;
  END IF;

  IF v_feature_normalized = 'zero-attente' THEN
    IF NOT v_is_service_role THEN RAISE EXCEPTION 'La reservation Zero Attente doit etre finalisee via le paiement securise.'; END IF;
    IF NOT v_paid OR v_checkout_session_id IS NULL THEN RAISE EXCEPTION 'Paiement verifie requis pour Zero Attente.'; END IF;

    SELECT id INTO v_reservation_id
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(feature, '')) = 'zero-attente'
      AND metadata ->> 'checkout_session_id' = v_checkout_session_id
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN RETURN v_reservation_id; END IF;

    v_status := 'confirmed';
  END IF;

  -- La Table du Chef reservations are pre-paid via Stripe before being created
  -- by the edge function (service role). They should be confirmed immediately.
  IF v_feature_normalized = 'chefs_table' AND v_is_service_role AND v_paid AND v_checkout_session_id IS NOT NULL THEN
    v_status := 'confirmed';
  END IF;

  SELECT id, COALESCE((metadata ->> 'paid')::boolean, false), COALESCE(total_amount, 0), metadata
  INTO v_existing_dup_id, v_existing_dup_paid, v_existing_dup_total, v_existing_dup_meta
  FROM public.reservations
  WHERE user_id = v_effective_user_id AND restaurant_id = p_restaurant_id
    AND date = p_date AND time = p_time
    AND status NOT IN ('cancelled', 'no_show')
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    IF v_existing_dup_paid OR v_existing_dup_total > 0 THEN
      RETURN v_existing_dup_id;
    END IF;
    RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN v_service_key := 'lunch'; ELSE v_service_key := 'dinner'; END IF;

  IF v_opening_hours IS NOT NULL THEN
    v_service_settings := COALESCE(v_opening_hours -> 'service_settings' -> v_service_key, v_opening_hours -> v_service_key, '{}'::jsonb);
    v_online_booking_enabled := COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true);
    v_service_closed := COALESCE((v_service_settings ->> 'service_closed')::boolean, false);
    v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
    v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
    v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
    v_last_reservation_time := COALESCE((v_service_settings ->> 'last_reservation_time')::time, p_time);

    IF v_feature_normalized <> 'zero-attente' THEN
      IF NOT v_online_booking_enabled OR v_service_closed THEN RAISE EXCEPTION 'Les reservations sont fermees pour ce service.'; END IF;
      IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size; END IF;
      IF p_time > v_last_reservation_time THEN RAISE EXCEPTION 'La derniere reservation pour ce service est a %.', to_char(v_last_reservation_time, 'HH24:MI'); END IF;
    END IF;

    SELECT COALESCE(sum(party_size), 0) INTO v_existing
    FROM public.reservations
    WHERE restaurant_id = p_restaurant_id AND date = p_date
      AND status NOT IN ('cancelled', 'no_show')
      AND CASE WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15 ELSE EXTRACT(HOUR FROM time) >= 15 END;
    IF v_existing + p_party_size > v_max_covers THEN RAISE EXCEPTION 'Capacite depassee pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing, 0); END IF;
  ELSIF v_feature_normalized <> 'zero-attente' THEN
    RAISE EXCEPTION 'Les horaires du restaurant ne sont pas configures.';
  END IF;

  INSERT INTO public.reservations (
    user_id, restaurant_id, date, time, party_size, status, feature,
    preorder_items, metadata, notes, total_amount, payment_method, order_reference, updated_at
  ) VALUES (
    v_effective_user_id, p_restaurant_id, p_date, p_time, p_party_size,
    v_status, p_feature, v_preorder_items, v_metadata, p_notes,
    v_total_amount, v_payment_method, v_order_reference, now()
  ) RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$function$;
