-- Security hardening:
-- - close direct access to sensitive RPCs
-- - make Zero Attente reservations server-authoritative
-- - make order creation server-authoritative and atomic for stock
-- - restrict invoice and ad campaign mutations

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

  IF lower(COALESCE(p_feature, '')) = 'zero-attente' THEN
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

  SELECT opening_hours INTO v_opening_hours
  FROM public.restaurants
  WHERE id = p_restaurant_id;

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

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO service_role;

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

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) TO service_role;

REVOKE EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_monthly_invoices(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_invoices(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_invoices(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices(text) TO service_role;

DROP POLICY IF EXISTS "Restaurant owners can manage invoices" ON public.restaurant_invoices;
DROP POLICY IF EXISTS "restaurant_invoices_owner_all" ON public.restaurant_invoices;
DROP POLICY IF EXISTS "Admins can manage invoices" ON public.restaurant_invoices;
DROP POLICY IF EXISTS "restaurant_invoices_admin_all" ON public.restaurant_invoices;

CREATE POLICY "restaurant_invoices_owner_select"
  ON public.restaurant_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_invoices.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "restaurant_invoices_admin_all"
  ON public.restaurant_invoices
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Restaurant owners can manage ad campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_owner_all" ON public.ad_campaigns;
DROP POLICY IF EXISTS "Admins can manage ad campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_admin_all" ON public.ad_campaigns;

CREATE POLICY "ad_campaigns_owner_select"
  ON public.ad_campaigns
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_owner_insert"
  ON public.ad_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_owner_update"
  ON public.ad_campaigns
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_owner_delete"
  ON public.ad_campaigns
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_admin_all"
  ON public.ad_campaigns
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_ad_campaign_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.payment_status, 'unpaid') = 'paid' THEN
      RAISE EXCEPTION 'Le statut de paiement est gere cote serveur.';
    END IF;

    IF COALESCE(NEW.total_budget, 0) > 0 AND COALESCE(NEW.status, 'draft') = 'active' THEN
      RAISE EXCEPTION 'Une campagne payante ne peut etre activee sans paiement verifie.';
    END IF;

    NEW.spent := 0;
    NEW.impressions := 0;
    NEW.clicks := 0;
    NEW.conversions := 0;
    NEW.paid_amount := 0;
    NEW.stripe_checkout_session_id := NULL;
    NEW.stripe_payment_intent_id := NULL;
    NEW.activated_at := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION 'Le restaurant de la campagne ne peut pas etre modifie.';
  END IF;

  IF NEW.impressions IS DISTINCT FROM OLD.impressions
    OR NEW.clicks IS DISTINCT FROM OLD.clicks
    OR NEW.conversions IS DISTINCT FROM OLD.conversions
    OR NEW.spent IS DISTINCT FROM OLD.spent
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
    OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
    OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'Les indicateurs financiers et paiements sont geres cote serveur.';
  END IF;

  IF COALESCE(NEW.total_budget, 0) > 0
    AND COALESCE(NEW.payment_status, OLD.payment_status, 'unpaid') <> 'paid'
    AND COALESCE(NEW.status, 'draft') = 'active' THEN
    RAISE EXCEPTION 'Une campagne payante ne peut etre activee sans paiement verifie.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ad_campaign_client_write ON public.ad_campaigns;
CREATE TRIGGER guard_ad_campaign_client_write
BEFORE INSERT OR UPDATE ON public.ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.guard_ad_campaign_client_write();

NOTIFY pgrst, 'reload schema';
