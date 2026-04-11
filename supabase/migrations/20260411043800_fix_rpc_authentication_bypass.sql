-- Fix create_order_with_items to handle auth fallback when called via service_role (Edge Functions)
-- This allows the adminClient to specify the user_id in metadata.

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
SET search_path TO 'public'
AS $function$
DECLARE
  new_order_id uuid;
  item jsonb;
  v_real_price numeric;
  v_is_available boolean;
  v_verified_total numeric := 0;
  v_idempotency text;
  v_menu_item_id uuid;
  v_quantity integer;
  v_delivery_fee numeric := GREATEST(COALESCE(delivery_fee_param, 0), 0);
  v_quality_fee numeric := 0;
  v_original_total numeric := 0;
  v_metadata jsonb := COALESCE(metadata_param::jsonb, '{}'::jsonb);
  v_validated_items jsonb := '[]'::jsonb;
  v_item_metadata jsonb;
  v_original_item_id text;
  v_has_quality_fee boolean := false;
  v_offer_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Handle fallback user_id from metadata if auth.uid() is null (typical for service_role calls from Edge Functions)
  IF v_user_id IS NULL AND (v_metadata->>'_internal_user_id') IS NOT NULL THEN
    v_user_id := (v_metadata->>'_internal_user_id')::uuid;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_idempotency := COALESCE(checkout_id_param::text, gen_random_uuid()::text);

  SELECT id INTO new_order_id FROM orders WHERE idempotency_key = v_idempotency;
  IF FOUND THEN
    RETURN new_order_id;
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(items_param::jsonb, '[]'::jsonb))
  LOOP
    v_quantity := GREATEST(COALESCE((item->>'quantity')::integer, 1), 1);
    v_item_metadata := COALESCE(item->'metadata', '{}'::jsonb);
    v_original_item_id := COALESCE(item->>'menu_item_id', '');

    -- 1. Regular Menu Item (UUID)
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

    -- 2. Anti-gaspi Offer (anti_waste_offer_id or offer_id fallback)
    ELSIF (COALESCE(v_item_metadata->>'anti_waste_offer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR 
           COALESCE(v_item_metadata->>'offer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      v_menu_item_id := NULL;
      v_offer_id := COALESCE(v_item_metadata->>'anti_waste_offer_id', v_item_metadata->>'offer_id')::uuid;

      SELECT discounted_price, is_active
      INTO v_real_price, v_is_available
      FROM public.anti_waste_offers
      WHERE id = v_offer_id
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Offre anti-gaspi introuvable : %', v_offer_id;
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Offre anti-gaspi indisponible : %', v_offer_id;
      END IF;

    -- 3. Flash Sale
    ELSIF COALESCE(v_item_metadata->>'flash_sale_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;

      SELECT discounted_price, is_active
      INTO v_real_price, v_is_available
      FROM public.flash_sales
      WHERE id = (v_item_metadata->>'flash_sale_id')::uuid
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Vente flash introuvable : %', v_item_metadata->>'flash_sale_id';
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Vente flash indisponible : %', v_item_metadata->>'flash_sale_id';
      END IF;

    -- 4. Quality Guarantee Fee
    ELSIF v_original_item_id = 'garantie-qualite-fee' THEN
      v_has_quality_fee := true;
      CONTINUE;

    ELSE
      RAISE EXCEPTION 'Article invalide detecte : %', v_original_item_id;
    END IF;

    v_real_price := ROUND(COALESCE(v_real_price, 0)::numeric, 2);
    v_verified_total := v_verified_total + (v_real_price * v_quantity);
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

  IF v_has_quality_fee OR lower(COALESCE(v_metadata->>'quality_guarantee', 'false')) IN ('true', '1', 'yes') THEN
    v_quality_fee := 1.50;
  END IF;

  v_original_total := ROUND((v_verified_total + v_delivery_fee + v_quality_fee)::numeric, 2);

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
    v_user_id,
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
      NULLIF(item->>'menu_item_id', '')::uuid,
      (item->>'restaurant_id')::uuid,
      COALESCE((item->>'quantity')::integer, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'total_price')::numeric, 0),
      COALESCE(item->'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN new_order_id;
END;
$function$;
