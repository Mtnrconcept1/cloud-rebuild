-- Harden order creation totals and move sponsored campaign metrics to
-- an append-only server-controlled event flow.

CREATE TABLE IF NOT EXISTS public.ad_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'conversion')),
  conversion_type text CHECK (conversion_type IS NULL OR conversion_type IN ('order', 'reservation', 'zero-attente')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL,
  source text,
  page text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, event_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_events_restaurant_type_time
  ON public.ad_campaign_events(restaurant_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_events_campaign_type_time
  ON public.ad_campaign_events(campaign_id, event_type, occurred_at DESC);

ALTER TABLE public.ad_campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_campaign_events_owner_select" ON public.ad_campaign_events;
CREATE POLICY "ad_campaign_events_owner_select"
  ON public.ad_campaign_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaign_events.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

GRANT SELECT ON public.ad_campaign_events TO authenticated;

CREATE OR REPLACE FUNCTION public.record_ad_campaign_event(
  p_campaign_id uuid,
  p_restaurant_id uuid,
  p_event_type text,
  p_dedupe_key text,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_page text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_conversion_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rows integer := 0;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NOT NULL AND p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
  END IF;

  INSERT INTO public.ad_campaign_events (
    campaign_id,
    restaurant_id,
    event_type,
    conversion_type,
    user_id,
    dedupe_key,
    source,
    page,
    payload
  )
  VALUES (
    p_campaign_id,
    p_restaurant_id,
    p_event_type,
    p_conversion_type,
    p_user_id,
    p_dedupe_key,
    p_source,
    p_page,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM service_role;

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
BEGIN
  IF auth.uid() IS NULL THEN
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
    ELSIF COALESCE(v_item_metadata->>'anti_waste_offer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;

      SELECT discounted_price, is_active
      INTO v_real_price, v_is_available
      FROM public.anti_waste_offers
      WHERE id = (v_item_metadata->>'anti_waste_offer_id')::uuid
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Offre anti-gaspi introuvable : %', v_item_metadata->>'anti_waste_offer_id';
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Offre anti-gaspi indisponible : %', v_item_metadata->>'anti_waste_offer_id';
      END IF;
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
    auth.uid(),
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

NOTIFY pgrst, 'reload schema';
