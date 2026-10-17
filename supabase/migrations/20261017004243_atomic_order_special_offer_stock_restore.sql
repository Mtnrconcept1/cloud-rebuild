-- Only native creator stock debits establish provenance. No historical backfill from client metadata.
CREATE TABLE IF NOT EXISTS public.order_special_offer_stock_reservations (
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('anti_waste','flash')), offer_id uuid NOT NULL,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id), quantity integer NOT NULL CHECK(quantity>0),
 restored_at timestamptz, PRIMARY KEY(order_id,kind,offer_id)
);
ALTER TABLE public.order_special_offer_stock_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_special_offer_stock_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_special_offer_stock_reservations TO service_role;
CREATE OR REPLACE FUNCTION public.create_order_with_items(restaurant_id_param uuid, delivery_address_param text, total_amount_param numeric, delivery_fee_param numeric DEFAULT 0, notes_param text DEFAULT NULL::text, items_param json DEFAULT NULL::json, metadata_param json DEFAULT NULL::json, checkout_id_param uuid DEFAULT NULL::uuid)
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
  IF public.commercial_demo_current_user_is_restricted() THEN
    RAISE EXCEPTION 'COMMERCIAL_DEMO_PRODUCTION_RPC_BLOCKED: use commercial_demo_* RPCs'
      USING ERRCODE = '42501';
  END IF;
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

    v_item_metadata := v_item_metadata - '_reserved_special_offer_kind';
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
      v_item_metadata := (v_item_metadata - 'flash_sale_id') || jsonb_build_object('_reserved_special_offer_kind','anti_waste');

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
      v_item_metadata := (v_item_metadata - 'anti_waste_offer_id' - 'offer_id') || jsonb_build_object('_reserved_special_offer_kind','flash');

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

  -- Provenance is written only after the actual stock debit in this transaction.
  INSERT INTO public.order_special_offer_stock_reservations(order_id,kind,offer_id,restaurant_id,quantity)
  SELECT new_order_id, value->'metadata'->>'_reserved_special_offer_kind',
    CASE WHEN value->'metadata'->>'_reserved_special_offer_kind'='anti_waste'
      THEN (value->'metadata'->>'anti_waste_offer_id')::uuid
      ELSE (value->'metadata'->>'flash_sale_id')::uuid END,
    restaurant_id_param, sum((value->>'quantity')::integer)::integer
  FROM jsonb_array_elements(v_validated_items)
  WHERE value->>'menu_item_id' IS NULL AND value->'metadata'->>'_reserved_special_offer_kind' IN ('anti_waste','flash')
  GROUP BY 2,3;
  RETURN new_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_order_special_offer_stock(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order public.orders%ROWTYPE; v_row record;
BEGIN
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF v_order.payment_status IN ('captured','paid','refunded') OR v_order.status NOT IN ('pending_payment','payment_failed','cancelled') THEN
   RAISE EXCEPTION 'ORDER_STOCK_RESTORE_STATE_CONFLICT';
 END IF;
 -- Legacy rows cannot prove a debit. Never reconstruct provenance from arbitrary metadata.
 IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=p_order_id AND menu_item_id IS NULL
     AND (metadata ? 'anti_waste_offer_id' OR metadata ? 'flash_sale_id'))
    AND NOT EXISTS(SELECT 1 FROM public.order_special_offer_stock_reservations WHERE order_id=p_order_id) THEN
   RAISE EXCEPTION 'ORDER_STOCK_RESTORE_LEGACY_UNVERIFIED';
 END IF;
 FOR v_row IN SELECT * FROM public.order_special_offer_stock_reservations WHERE order_id=p_order_id AND restored_at IS NULL ORDER BY kind,offer_id FOR UPDATE LOOP
   IF v_row.restaurant_id<>v_order.restaurant_id THEN RAISE EXCEPTION 'ORDER_STOCK_RESTORE_RESTAURANT_MISMATCH'; END IF;
   IF v_row.kind='anti_waste' THEN
     UPDATE public.anti_waste_offers SET quantity_available=quantity_available+v_row.quantity
       WHERE id=v_row.offer_id AND restaurant_id=v_row.restaurant_id;
   ELSE
     UPDATE public.flash_sales SET quantity_available=quantity_available+v_row.quantity
       WHERE id=v_row.offer_id AND restaurant_id=v_row.restaurant_id;
   END IF;
   IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_STOCK_RESTORE_OFFER_MISSING'; END IF;
   UPDATE public.order_special_offer_stock_reservations SET restored_at=now() WHERE order_id=p_order_id AND kind=v_row.kind AND offer_id=v_row.offer_id;
 END LOOP;
 -- State and ledger commit together, including after a lost HTTP response.
 UPDATE public.orders SET metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('special_offer_stock_restored_at',now(),'special_offer_stock_restored',EXISTS(SELECT 1 FROM public.order_special_offer_stock_reservations WHERE order_id=p_order_id))
   WHERE id=p_order_id RETURNING * INTO v_order;
 RETURN v_order.metadata;
END; $$;
REVOKE ALL ON FUNCTION public.restore_order_special_offer_stock(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_special_offer_stock(uuid) TO service_role;

-- A payment webhook racing a completed restoration must reserve the stock again under
-- the same order lock. If unavailable, reject atomically for webhook retry/reconciliation.
CREATE OR REPLACE FUNCTION public.guard_special_offer_stock_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row record;
BEGIN
 IF NEW.payment_status='captured' AND OLD.payment_status IS DISTINCT FROM 'captured' THEN
   FOR v_row IN SELECT * FROM public.order_special_offer_stock_reservations WHERE order_id=NEW.id AND restored_at IS NOT NULL ORDER BY kind,offer_id FOR UPDATE LOOP
     IF v_row.kind='anti_waste' THEN
       UPDATE public.anti_waste_offers SET quantity_available=quantity_available-v_row.quantity WHERE id=v_row.offer_id AND restaurant_id=v_row.restaurant_id AND quantity_available>=v_row.quantity;
     ELSE
       UPDATE public.flash_sales SET quantity_available=quantity_available-v_row.quantity WHERE id=v_row.offer_id AND restaurant_id=v_row.restaurant_id AND quantity_available>=v_row.quantity;
     END IF;
     IF NOT FOUND THEN RAISE EXCEPTION 'PAID_ORDER_SPECIAL_OFFER_STOCK_RECONCILIATION_REQUIRED'; END IF;
     UPDATE public.order_special_offer_stock_reservations SET restored_at=NULL WHERE order_id=NEW.id AND kind=v_row.kind AND offer_id=v_row.offer_id;
   END LOOP;
   NEW.metadata:=COALESCE(NEW.metadata,'{}'::jsonb)-'special_offer_stock_restored_at'-'special_offer_stock_restored';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_special_offer_stock_capture() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_special_offer_stock_capture ON public.orders;
CREATE TRIGGER guard_special_offer_stock_capture BEFORE UPDATE OF payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_special_offer_stock_capture();
NOTIFY pgrst,'reload schema';
