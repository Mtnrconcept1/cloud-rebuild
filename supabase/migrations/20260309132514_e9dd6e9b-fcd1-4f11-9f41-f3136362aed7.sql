
CREATE OR REPLACE FUNCTION public.create_order_with_items(restaurant_id_param uuid, delivery_address_param text, total_amount_param numeric, delivery_fee_param numeric DEFAULT 0, notes_param text DEFAULT NULL::text, items_param json DEFAULT NULL::json, metadata_param json DEFAULT NULL::json, checkout_id_param uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_order_id uuid;
  item json;
  v_real_price numeric;
  v_is_available boolean;
  v_verified_total numeric := 0;
  v_idempotency text;
  v_menu_item_id uuid;
BEGIN
  v_idempotency := COALESCE(checkout_id_param::text, gen_random_uuid()::text);

  SELECT id INTO new_order_id FROM orders WHERE idempotency_key = v_idempotency;
  IF FOUND THEN
    RETURN new_order_id;
  END IF;

  IF items_param IS NOT NULL THEN
    FOR item IN SELECT * FROM json_array_elements(items_param)
    LOOP
      v_menu_item_id := (item->>'menu_item_id')::uuid;
      
      -- Skip validation for special items (anti-waste, flash sales) with null menu_item_id
      IF v_menu_item_id IS NOT NULL THEN
        SELECT price, is_available INTO v_real_price, v_is_available
        FROM menu_items
        WHERE id = v_menu_item_id AND restaurant_id = restaurant_id_param;

        IF v_real_price IS NULL THEN
          RAISE EXCEPTION 'Article introuvable : %', item->>'menu_item_id';
        END IF;
        IF v_is_available = false THEN
          RAISE EXCEPTION 'Article indisponible : %', item->>'menu_item_id';
        END IF;
        IF abs(v_real_price - (item->>'unit_price')::numeric) > 0.01 THEN
          RAISE EXCEPTION 'Prix incorrect pour l''article %. Prix attendu : %', item->>'menu_item_id', v_real_price;
        END IF;

        v_verified_total := v_verified_total + v_real_price * COALESCE((item->>'quantity')::integer, 1);
      ELSE
        -- For special items, trust the provided price
        v_verified_total := v_verified_total + (item->>'unit_price')::numeric * COALESCE((item->>'quantity')::integer, 1);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO orders (user_id, restaurant_id, delivery_address, total_amount, delivery_fee, notes, metadata, checkout_id, idempotency_key, original_total)
  VALUES (auth.uid(), restaurant_id_param, delivery_address_param, total_amount_param, delivery_fee_param, notes_param, COALESCE(metadata_param::jsonb, '{}'::jsonb), checkout_id_param, v_idempotency, v_verified_total + delivery_fee_param)
  RETURNING id INTO new_order_id;

  IF items_param IS NOT NULL THEN
    FOR item IN SELECT * FROM json_array_elements(items_param)
    LOOP
      INSERT INTO order_items (order_id, menu_item_id, restaurant_id, quantity, unit_price, total_price, metadata)
      VALUES (
        new_order_id,
        (item->>'menu_item_id')::uuid,
        (item->>'restaurant_id')::uuid,
        COALESCE((item->>'quantity')::integer, 1),
        (item->>'unit_price')::numeric,
        (item->>'total_price')::numeric,
        COALESCE((item->>'metadata')::jsonb, '{}'::jsonb)
      );
    END LOOP;
  END IF;

  RETURN new_order_id;
END; $function$;
