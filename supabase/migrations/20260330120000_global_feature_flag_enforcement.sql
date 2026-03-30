CREATE OR REPLACE FUNCTION public.is_feature_flag_active(p_flag_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag_name text := lower(trim(COALESCE(p_flag_name, '')));
  v_is_active boolean;
BEGIN
  IF v_flag_name = '' THEN
    RETURN false;
  END IF;

  SELECT ff.is_active
  INTO v_is_active
  FROM public.feature_flags ff
  WHERE lower(ff.name) = v_flag_name
  LIMIT 1;

  IF v_is_active IS NULL THEN
    RETURN true;
  END IF;

  IF NOT v_is_active THEN
    RETURN false;
  END IF;

  CASE v_flag_name
    WHEN 'commandes' THEN
      RETURN public.is_feature_flag_active('livraison') OR public.is_feature_flag_active('emporter');
    WHEN 'anti-gaspi' THEN
      RETURN public.is_feature_flag_active('emporter');
    WHEN 'creneaux-garantis' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'flex-prix-bas' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'match-groupes' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'multi-stop' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'multi-restaurant' THEN
      RETURN public.is_feature_flag_active('livraison') OR public.is_feature_flag_active('emporter');
    WHEN 'zero-attente' THEN
      RETURN public.is_feature_flag_active('reservation') AND public.is_feature_flag_active('sur-place');
    WHEN 'garantie-qualite' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'abonnement' THEN
      RETURN public.is_feature_flag_active('livraison');
    WHEN 'dashboard-overview' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-advisor' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-restaurant' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-menu' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-photos' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-commandes' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('commandes');
    WHEN 'dashboard-reservations' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('reservation');
    WHEN 'dashboard-recommandations' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-performances' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('performances');
    WHEN 'dashboard-comparaison' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('performances');
    WHEN 'dashboard-avis' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-campagne-overview' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('campagnes-pub');
    WHEN 'dashboard-reseaux-sociaux' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('campagnes-pub');
    WHEN 'dashboard-campagnes' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('campagnes-pub');
    WHEN 'dashboard-factures' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-factures-parametres' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-offres' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('anti-gaspi');
    WHEN 'dashboard-ventes-flash' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur') AND public.is_feature_flag_active('ventes-flash');
    WHEN 'dashboard-formules' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-service' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-support' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'dashboard-promotions' THEN
      RETURN public.is_feature_flag_active('dashboard-restaurateur');
    WHEN 'courier-home' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    WHEN 'courier-jobs' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    WHEN 'courier-earnings' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    WHEN 'courier-profile' THEN
      RETURN public.is_feature_flag_active('espace-livreur');
    ELSE
      RETURN true;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(
  p_flag_name text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  UPDATE public.feature_flags
  SET is_active = p_is_active,
      updated_at = now()
  WHERE name = p_flag_name
  RETURNING id, name, is_active INTO v_flag;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature flag "%" not found.', p_flag_name;
  END IF;

  RETURN jsonb_build_object(
    'id', v_flag.id,
    'name', v_flag.name,
    'is_active', v_flag.is_active
  );
END;
$$;

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
  v_existing integer;
  v_max_covers integer;
  v_opening_hours jsonb;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_dup_count integer;
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
    v_metadata := v_metadata_raw
      - '_internal_user_id'
      - 'paid'
      - 'card_brand'
      - 'card_last4'
      - 'checkout_session_id';
  END IF;

  SELECT opening_hours, COALESCE(supports_reservation, false), COALESCE(supports_dinein, false)
  INTO v_opening_hours, v_supports_reservation, v_supports_dinein
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF v_opening_hours IS NULL THEN
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

  SELECT count(*) INTO v_dup_count
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show');

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN
    v_service_key := 'lunch';
  ELSE
    v_service_key := 'dinner';
  END IF;

  v_service_settings := COALESCE(
    v_opening_hours -> 'service_settings' -> v_service_key,
    v_opening_hours -> v_service_key,
    '{}'::jsonb
  );

  v_online_booking_enabled := COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true);
  v_service_closed := COALESCE((v_service_settings ->> 'service_closed')::boolean, false);
  v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
  v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
  v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
  v_last_reservation_time := COALESCE((v_service_settings ->> 'last_reservation_time')::time, p_time);

  IF NOT v_online_booking_enabled OR v_service_closed THEN
    RAISE EXCEPTION 'Les reservations sont fermees pour ce service.';
  END IF;

  IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN
    RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size;
  END IF;

  IF p_time > v_last_reservation_time THEN
    RAISE EXCEPTION 'La derniere reservation pour ce service est a %.', to_char(v_last_reservation_time, 'HH24:MI');
  END IF;

  SELECT COALESCE(sum(party_size), 0) INTO v_existing
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'no_show')
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

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  restaurant_id_param uuid,
  delivery_address_param text,
  total_amount_param numeric,
  delivery_fee_param numeric DEFAULT 0,
  notes_param text DEFAULT NULL::text,
  items_param json DEFAULT NULL::json,
  metadata_param json DEFAULT NULL::json,
  checkout_id_param uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  new_order_id uuid;
  item jsonb;
  v_real_price numeric;
  v_is_available boolean;
  v_idempotency text;
  v_menu_item_id uuid;
  v_quantity integer;
  v_delivery_fee numeric := GREATEST(COALESCE(delivery_fee_param, 0), 0);
  v_quality_fee numeric := 0;
  v_original_total numeric := 0;
  v_metadata_raw jsonb := COALESCE(metadata_param::jsonb, '{}'::jsonb);
  v_metadata jsonb := COALESCE(metadata_param::jsonb, '{}'::jsonb) - '_internal_user_id';
  v_validated_items jsonb := '[]'::jsonb;
  v_item_metadata jsonb;
  v_original_item_id text;
  v_has_quality_fee boolean := false;
  v_is_service_role boolean := auth.role() = 'service_role';
  v_effective_user_id uuid;
  v_payment_method text := lower(COALESCE(NULLIF(v_metadata_raw ->> 'payment_method', ''), 'cash'));
  v_payment_flag_name text;
  v_is_delivery boolean := length(trim(COALESCE(delivery_address_param, ''))) > 0;
  v_has_anti_waste boolean := false;
  v_has_flash_sale boolean := false;
  v_delivery_available boolean := false;
  v_supports_pickup boolean := false;
  v_disabled_payment_methods text[] := ARRAY[]::text[];
BEGIN
  IF v_is_service_role THEN
    IF COALESCE(v_metadata_raw ->> '_internal_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Internal user id requis.';
    END IF;
    v_effective_user_id := (v_metadata_raw ->> '_internal_user_id')::uuid;
  ELSE
    v_effective_user_id := auth.uid();
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
  END IF;

  SELECT COALESCE(delivery_available, false), COALESCE(supports_pickup, false), COALESCE(disabled_payment_methods, ARRAY[]::text[])
  INTO v_delivery_available, v_supports_pickup, v_disabled_payment_methods
  FROM public.restaurants
  WHERE id = restaurant_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  v_payment_flag_name := CASE v_payment_method
    WHEN 'card' THEN 'payment-card'
    WHEN 'twint' THEN 'payment-twint'
    WHEN 'postfinance_card' THEN 'payment-postfinance-card'
    WHEN 'postfinance_efinance' THEN 'payment-postfinance-efinance'
    WHEN 'cash' THEN 'payment-cash'
    ELSE NULL
  END;

  IF v_payment_flag_name IS NOT NULL AND NOT public.is_feature_flag_active(v_payment_flag_name) THEN
    RAISE EXCEPTION 'Ce moyen de paiement est desactive globalement.';
  END IF;

  IF v_payment_method = ANY(v_disabled_payment_methods) THEN
    RAISE EXCEPTION 'Ce moyen de paiement est desactive pour ce restaurant.';
  END IF;

  IF v_is_delivery THEN
    IF NOT public.is_feature_flag_active('livraison') THEN
      RAISE EXCEPTION 'La livraison est desactivee globalement.';
    END IF;
    IF NOT v_delivery_available THEN
      RAISE EXCEPTION 'La livraison est indisponible pour ce restaurant.';
    END IF;
  ELSE
    IF NOT public.is_feature_flag_active('emporter') THEN
      RAISE EXCEPTION 'L''emporter est desactive globalement.';
    END IF;
    IF NOT v_supports_pickup THEN
      RAISE EXCEPTION 'L''emporter est indisponible pour ce restaurant.';
    END IF;
  END IF;

  v_idempotency := COALESCE(checkout_id_param::text, gen_random_uuid()::text);

  SELECT id INTO new_order_id
  FROM public.orders
  WHERE idempotency_key = v_idempotency;

  IF FOUND THEN
    RETURN new_order_id;
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(items_param::jsonb, '[]'::jsonb))
  LOOP
    v_quantity := GREATEST(COALESCE((item ->> 'quantity')::integer, 1), 1);
    v_item_metadata := COALESCE(item -> 'metadata', '{}'::jsonb);
    v_original_item_id := COALESCE(item ->> 'menu_item_id', '');

    IF v_original_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := v_original_item_id::uuid;

      SELECT price, is_available
      INTO v_real_price, v_is_available
      FROM public.menu_items
      WHERE id = v_menu_item_id
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Article introuvable : %', v_original_item_id;
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Article indisponible : %', v_original_item_id;
      END IF;
    ELSIF COALESCE(v_item_metadata ->> 'anti_waste_offer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;
      v_has_anti_waste := true;

      UPDATE public.anti_waste_offers
      SET quantity_available = quantity_available - v_quantity
      WHERE id = (v_item_metadata ->> 'anti_waste_offer_id')::uuid
        AND restaurant_id = restaurant_id_param
        AND is_active = true
        AND quantity_available >= v_quantity
      RETURNING discounted_price INTO v_real_price;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Stock anti-gaspi insuffisant ou offre indisponible.';
      END IF;
    ELSIF COALESCE(v_item_metadata ->> 'flash_sale_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;
      v_has_flash_sale := true;

      UPDATE public.flash_sales
      SET quantity_available = quantity_available - v_quantity
      WHERE id = (v_item_metadata ->> 'flash_sale_id')::uuid
        AND restaurant_id = restaurant_id_param
        AND is_active = true
        AND quantity_available >= v_quantity
      RETURNING discounted_price INTO v_real_price;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Stock vente flash insuffisant ou offre indisponible.';
      END IF;
    ELSIF v_original_item_id = 'garantie-qualite-fee' THEN
      v_has_quality_fee := true;
      CONTINUE;
    ELSE
      RAISE EXCEPTION 'Article invalide detecte : %', v_original_item_id;
    END IF;

    v_real_price := ROUND(COALESCE(v_real_price, 0)::numeric, 2);
    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_menu_item_id,
        'restaurant_id', restaurant_id_param,
        'quantity', v_quantity,
        'unit_price', v_real_price,
        'total_price', ROUND((v_real_price * v_quantity)::numeric, 2),
        'metadata', v_item_metadata || jsonb_build_object('original_item_id', v_original_item_id)
      )
    );
  END LOOP;

  IF v_has_anti_waste THEN
    IF NOT public.is_feature_flag_active('anti-gaspi') THEN
      RAISE EXCEPTION 'L''anti-gaspi est desactive globalement.';
    END IF;
    IF v_is_delivery THEN
      RAISE EXCEPTION 'Les offres anti-gaspi sont uniquement disponibles a l''emporter.';
    END IF;
  END IF;

  IF v_has_flash_sale AND NOT public.is_feature_flag_active('ventes-flash') THEN
    RAISE EXCEPTION 'Les ventes flash sont desactivees globalement.';
  END IF;

  IF v_has_quality_fee OR lower(COALESCE(v_metadata ->> 'quality_guarantee', 'false')) IN ('true', '1', 'yes') THEN
    v_quality_fee := 1.50;
  END IF;

  v_original_total := ROUND((
    COALESCE((
      SELECT SUM(COALESCE((validated_item ->> 'total_price')::numeric, 0))
      FROM jsonb_array_elements(v_validated_items) AS validated_item
    ), 0) + v_delivery_fee + v_quality_fee
  )::numeric, 2);

  INSERT INTO public.orders (
    user_id,
    restaurant_id,
    delivery_address,
    total_amount,
    delivery_fee,
    notes,
    metadata,
    checkout_id,
    idempotency_key,
    original_total,
    discount_amount
  )
  VALUES (
    v_effective_user_id,
    restaurant_id_param,
    delivery_address_param,
    v_original_total,
    v_delivery_fee,
    notes_param,
    v_metadata,
    checkout_id_param,
    v_idempotency,
    v_original_total,
    0
  )
  RETURNING id INTO new_order_id;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      restaurant_id,
      quantity,
      unit_price,
      total_price,
      metadata
    )
    VALUES (
      new_order_id,
      NULLIF(item ->> 'menu_item_id', '')::uuid,
      (item ->> 'restaurant_id')::uuid,
      COALESCE((item ->> 'quantity')::integer, 1),
      COALESCE((item ->> 'unit_price')::numeric, 0),
      COALESCE((item ->> 'total_price')::numeric, 0),
      COALESCE(item -> 'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN new_order_id;
END;
$function$;

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('payment-card', 'Paiement carte', 'Active les paiements carte bancaire.', true),
  ('payment-twint', 'Paiement TWINT', 'Active TWINT.', true),
  ('payment-postfinance-card', 'Paiement PostFinance Card', 'Active PostFinance Card.', true),
  ('payment-postfinance-efinance', 'Paiement PostFinance E-Finance', 'Active PostFinance E-Finance.', true),
  ('payment-cash', 'Paiement especes', 'Active le paiement en especes.', true),
  ('livraison', 'Livraison', 'Active les parcours livraison.', true),
  ('emporter', 'Emporter', 'Active les parcours click and collect.', true),
  ('sur-place', 'Sur place', 'Active les experiences sur place.', true),
  ('reservation', 'Reservation', 'Active les reservations.', true),
  ('commandes', 'Commandes', 'Active les commandes et leur suivi.', true),
  ('anti-gaspi', 'Anti-gaspi', 'Active les offres anti-gaspi.', true),
  ('ventes-flash', 'Ventes flash', 'Active les ventes flash.', true),
  ('zero-attente', 'Zero attente', 'Active Zero Attente.', true),
  ('chefs-table', 'Chefs Table', 'Active Chefs Table.', true),
  ('creneaux-garantis', 'Creneaux garantis', 'Active les creneaux garantis.', true),
  ('flex-prix-bas', 'Flex prix bas', 'Active les offres flexibles.', true),
  ('match-groupes', 'Match groupes', 'Active les commandes groupees.', true),
  ('multi-stop', 'Multi-stop', 'Active les livraisons multi-stop.', true),
  ('multi-restaurant', 'Multi-restaurant', 'Active les paniers multi-restaurant.', true),
  ('garantie-qualite', 'Garantie qualite', 'Active la garantie qualite.', true),
  ('budget-auto', 'Budget auto', 'Active Budget Auto.', true),
  ('abonnement', 'Abonnement', 'Active les abonnements.', true),
  ('campagnes-pub', 'Campagnes pub', 'Active les campagnes sponsorisees.', true),
  ('performances', 'Performances', 'Active les vues de performance.', true),
  ('dashboard-restaurateur', 'Dashboard restaurateur', 'Active le dashboard restaurateur.', true),
  ('dashboard-overview', 'Dashboard overview', 'Active la vue d''ensemble restaurateur.', true),
  ('dashboard-advisor', 'Dashboard advisor', 'Active l''assistant IA restaurateur.', true),
  ('dashboard-restaurant', 'Dashboard restaurant', 'Active la fiche restaurant.', true),
  ('dashboard-menu', 'Dashboard menu', 'Active le menu restaurateur.', true),
  ('dashboard-photos', 'Dashboard photos', 'Active les photos restaurateur.', true),
  ('dashboard-commandes', 'Dashboard commandes', 'Active les commandes restaurateur.', true),
  ('dashboard-reservations', 'Dashboard reservations', 'Active les reservations restaurateur.', true),
  ('dashboard-recommandations', 'Dashboard recommandations', 'Active les recommandations restaurateur.', true),
  ('dashboard-performances', 'Dashboard performances', 'Active les performances restaurateur.', true),
  ('dashboard-comparaison', 'Dashboard comparaison', 'Active la comparaison restaurateur.', true),
  ('dashboard-avis', 'Dashboard avis', 'Active les avis restaurateur.', true),
  ('dashboard-campagne-overview', 'Dashboard campagne overview', 'Active la synthese campagnes.', true),
  ('dashboard-reseaux-sociaux', 'Dashboard reseaux sociaux', 'Active les reseaux sociaux restaurateur.', true),
  ('dashboard-campagnes', 'Dashboard campagnes', 'Active l''edition des campagnes.', true),
  ('dashboard-factures', 'Dashboard factures', 'Active les factures restaurateur.', true),
  ('dashboard-factures-parametres', 'Dashboard factures parametres', 'Active les parametres de facturation.', true),
  ('dashboard-offres', 'Dashboard offres', 'Active la gestion anti-gaspi restaurateur.', true),
  ('dashboard-ventes-flash', 'Dashboard ventes flash', 'Active les ventes flash restaurateur.', true),
  ('dashboard-formules', 'Dashboard formules', 'Active les formules restaurateur.', true),
  ('dashboard-service', 'Dashboard service', 'Active le pilotage de service.', true),
  ('dashboard-support', 'Dashboard support', 'Active le support restaurateur.', true),
  ('dashboard-promotions', 'Dashboard promotions', 'Active les promotions restaurateur.', true),
  ('espace-livreur', 'Dashboard coursier', 'Active le dashboard coursier.', true),
  ('courier-home', 'Coursier home', 'Active la page home coursier.', true),
  ('courier-jobs', 'Coursier jobs', 'Active les missions coursier.', true),
  ('courier-earnings', 'Coursier earnings', 'Active les gains coursier.', true),
  ('courier-profile', 'Coursier profile', 'Active le profil coursier.', true),
  ('admin-restaurants', 'Admin restaurants', 'Active le module admin restaurants.', true),
  ('admin-utilisateurs', 'Admin utilisateurs', 'Active le module admin utilisateurs.', true),
  ('admin-avis', 'Admin avis', 'Active le module admin avis.', true),
  ('admin-catalog', 'Admin catalog', 'Active le module admin catalogue.', true),
  ('admin-loyalty', 'Admin loyalty', 'Active le module admin fidelite.', true),
  ('admin-drops', 'Admin drops', 'Active le module admin drops.', true),
  ('admin-notifications', 'Admin notifications', 'Active le module admin notifications.', true),
  ('admin-audit', 'Admin audit', 'Active le module admin audit.', true)
ON CONFLICT (name) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.is_feature_flag_active(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_feature_flag_active(text) TO service_role;

NOTIFY pgrst, 'reload schema';
