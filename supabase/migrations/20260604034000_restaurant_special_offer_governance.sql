-- Govern restaurant Anti-Gaspi and Flash Sale writes through audited RPCs.
ALTER TABLE public.anti_waste_offers
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.flash_sales
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS anti_waste_offers_archive_restaurant_idx
  ON public.anti_waste_offers (restaurant_id, archived_at, created_at DESC);

CREATE INDEX IF NOT EXISTS flash_sales_archive_restaurant_idx
  ON public.flash_sales (restaurant_id, archived_at, created_at DESC);

CREATE OR REPLACE FUNCTION public.restaurant_upsert_anti_waste_offer(
  p_offer_id uuid,
  p_payload jsonb,
  p_reason text
)
RETURNS public.anti_waste_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.anti_waste_offers%ROWTYPE;
  v_row public.anti_waste_offers%ROWTYPE;
  v_restaurant_id uuid;
  v_title text := trim(COALESCE(p_payload->>'title', ''));
  v_description text := NULLIF(trim(COALESCE(p_payload->>'description', '')), '');
  v_offer_type text := lower(trim(COALESCE(p_payload->>'offer_type', 'regular')));
  v_original_price numeric := COALESCE((p_payload->>'original_price')::numeric, 0);
  v_discounted_price numeric := COALESCE((p_payload->>'discounted_price')::numeric, 0);
  v_quantity integer := COALESCE((p_payload->>'quantity_available')::integer, 0);
  v_available_date date := (p_payload->>'available_date')::date;
  v_pickup_start time := (p_payload->>'pickup_start')::time;
  v_pickup_end time := (p_payload->>'pickup_end')::time;
  v_is_active boolean := COALESCE((p_payload->>'is_active')::boolean, true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  IF p_offer_id IS NOT NULL THEN
    SELECT * INTO v_old
    FROM public.anti_waste_offers
    WHERE id = p_offer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Anti-waste offer not found';
    END IF;
    IF v_old.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived anti-waste offers cannot be edited';
    END IF;
    v_restaurant_id := v_old.restaurant_id;
  ELSE
    v_restaurant_id := (p_payload->>'restaurant_id')::uuid;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant id is required';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(v_restaurant_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant offer';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION 'Offer title is required';
  END IF;
  IF v_offer_type NOT IN ('regular', 'surprise_bag', 'solidarity') THEN
    RAISE EXCEPTION 'Invalid anti-waste offer type';
  END IF;
  IF v_original_price <= 0 OR v_discounted_price <= 0 OR v_discounted_price > v_original_price THEN
    RAISE EXCEPTION 'Invalid anti-waste offer prices';
  END IF;
  IF v_quantity < 0 OR (v_is_active AND v_quantity = 0) THEN
    RAISE EXCEPTION 'Invalid anti-waste offer stock';
  END IF;
  IF v_available_date IS NULL OR v_pickup_start IS NULL OR v_pickup_end IS NULL OR v_pickup_end <= v_pickup_start THEN
    RAISE EXCEPTION 'Invalid anti-waste pickup window';
  END IF;

  IF p_offer_id IS NULL THEN
    INSERT INTO public.anti_waste_offers (
      restaurant_id,
      title,
      description,
      offer_type,
      original_price,
      discounted_price,
      quantity_available,
      available_date,
      pickup_start,
      pickup_end,
      is_active,
      archived_at,
      archived_by,
      archive_reason,
      updated_at
    )
    VALUES (
      v_restaurant_id,
      v_title,
      v_description,
      v_offer_type,
      v_original_price,
      v_discounted_price,
      v_quantity,
      v_available_date,
      v_pickup_start,
      v_pickup_end,
      v_is_active,
      NULL,
      NULL,
      NULL,
      now()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.anti_waste_offers
    SET title = v_title,
        description = v_description,
        offer_type = v_offer_type,
        original_price = v_original_price,
        discounted_price = v_discounted_price,
        quantity_available = v_quantity,
        available_date = v_available_date,
        pickup_start = v_pickup_start,
        pickup_end = v_pickup_end,
        is_active = v_is_active,
        updated_at = now()
    WHERE id = p_offer_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    CASE WHEN p_offer_id IS NULL THEN 'restaurant_create_anti_waste_offer' ELSE 'restaurant_update_anti_waste_offer' END,
    'anti_waste_offer',
    v_row.id,
    CASE WHEN p_offer_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
    jsonb_build_object('offer', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_update_anti_waste_offer_status(
  p_offer_id uuid,
  p_is_active boolean,
  p_reason text
)
RETURNS public.anti_waste_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.anti_waste_offers%ROWTYPE;
  v_row public.anti_waste_offers%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_old
  FROM public.anti_waste_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anti-waste offer not found';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(v_old.restaurant_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant offer';
  END IF;
  IF v_old.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived anti-waste offers cannot be reactivated';
  END IF;
  IF p_is_active AND COALESCE(v_old.quantity_available, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot activate an anti-waste offer without stock';
  END IF;
  IF p_is_active AND (
    v_old.available_date < current_date
    OR (v_old.available_date = current_date AND v_old.pickup_end <= current_time)
  ) THEN
    RAISE EXCEPTION 'Cannot activate an expired anti-waste offer';
  END IF;

  UPDATE public.anti_waste_offers
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_offer_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_update_anti_waste_offer_status',
    'anti_waste_offer',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('is_active', v_row.is_active, 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_archive_anti_waste_offer(
  p_offer_id uuid,
  p_reason text
)
RETURNS public.anti_waste_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.anti_waste_offers%ROWTYPE;
  v_row public.anti_waste_offers%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_old
  FROM public.anti_waste_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anti-waste offer not found';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(v_old.restaurant_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant offer';
  END IF;

  UPDATE public.anti_waste_offers
  SET is_active = false,
      archived_at = COALESCE(archived_at, now()),
      archived_by = v_actor,
      archive_reason = v_reason,
      updated_at = now()
  WHERE id = p_offer_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_archive_anti_waste_offer',
    'anti_waste_offer',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('offer', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_upsert_flash_sale(
  p_sale_id uuid,
  p_payload jsonb,
  p_reason text
)
RETURNS public.flash_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.flash_sales%ROWTYPE;
  v_row public.flash_sales%ROWTYPE;
  v_restaurant_id uuid;
  v_title text := trim(COALESCE(p_payload->>'title', ''));
  v_description text := NULLIF(trim(COALESCE(p_payload->>'description', '')), '');
  v_original_price numeric := COALESCE((p_payload->>'original_price')::numeric, 0);
  v_discounted_price numeric := COALESCE((p_payload->>'discounted_price')::numeric, 0);
  v_quantity integer := COALESCE((p_payload->>'quantity_available')::integer, 0);
  v_sale_date date := (p_payload->>'sale_date')::date;
  v_sale_start time := (p_payload->>'sale_start')::time;
  v_sale_end time := (p_payload->>'sale_end')::time;
  v_delivery_available boolean := COALESCE((p_payload->>'delivery_available')::boolean, true);
  v_takeaway_available boolean := COALESCE((p_payload->>'takeaway_available')::boolean, true);
  v_is_active boolean := COALESCE((p_payload->>'is_active')::boolean, true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  IF p_sale_id IS NOT NULL THEN
    SELECT * INTO v_old
    FROM public.flash_sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Flash sale not found';
    END IF;
    IF v_old.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Archived flash sales cannot be edited';
    END IF;
    v_restaurant_id := v_old.restaurant_id;
  ELSE
    v_restaurant_id := (p_payload->>'restaurant_id')::uuid;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant id is required';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(v_restaurant_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant flash sale';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION 'Flash sale title is required';
  END IF;
  IF v_original_price <= 0 OR v_discounted_price <= 0 OR v_discounted_price > v_original_price THEN
    RAISE EXCEPTION 'Invalid flash sale prices';
  END IF;
  IF v_quantity < 0 OR (v_is_active AND v_quantity = 0) THEN
    RAISE EXCEPTION 'Invalid flash sale stock';
  END IF;
  IF v_sale_date IS NULL OR v_sale_start IS NULL OR v_sale_end IS NULL OR v_sale_end <= v_sale_start THEN
    RAISE EXCEPTION 'Invalid flash sale window';
  END IF;
  IF NOT (v_delivery_available OR v_takeaway_available) THEN
    RAISE EXCEPTION 'Flash sale must allow delivery or takeaway';
  END IF;

  IF p_sale_id IS NULL THEN
    INSERT INTO public.flash_sales (
      restaurant_id,
      title,
      description,
      original_price,
      discounted_price,
      quantity_available,
      sale_date,
      sale_start,
      sale_end,
      is_active,
      delivery_available,
      takeaway_available,
      archived_at,
      archived_by,
      archive_reason,
      updated_at
    )
    VALUES (
      v_restaurant_id,
      v_title,
      v_description,
      v_original_price,
      v_discounted_price,
      v_quantity,
      v_sale_date,
      v_sale_start,
      v_sale_end,
      v_is_active,
      v_delivery_available,
      v_takeaway_available,
      NULL,
      NULL,
      NULL,
      now()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.flash_sales
    SET title = v_title,
        description = v_description,
        original_price = v_original_price,
        discounted_price = v_discounted_price,
        quantity_available = v_quantity,
        sale_date = v_sale_date,
        sale_start = v_sale_start,
        sale_end = v_sale_end,
        is_active = v_is_active,
        delivery_available = v_delivery_available,
        takeaway_available = v_takeaway_available,
        updated_at = now()
    WHERE id = p_sale_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    CASE WHEN p_sale_id IS NULL THEN 'restaurant_create_flash_sale' ELSE 'restaurant_update_flash_sale' END,
    'flash_sale',
    v_row.id,
    CASE WHEN p_sale_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
    jsonb_build_object('sale', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_update_flash_sale_status(
  p_sale_id uuid,
  p_is_active boolean,
  p_reason text
)
RETURNS public.flash_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.flash_sales%ROWTYPE;
  v_row public.flash_sales%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_old
  FROM public.flash_sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flash sale not found';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(v_old.restaurant_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant flash sale';
  END IF;
  IF v_old.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived flash sales cannot be reactivated';
  END IF;
  IF p_is_active AND COALESCE(v_old.quantity_available, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot activate a flash sale without stock';
  END IF;
  IF p_is_active AND NOT (v_old.delivery_available OR v_old.takeaway_available) THEN
    RAISE EXCEPTION 'Flash sale must allow delivery or takeaway';
  END IF;
  IF p_is_active AND (
    v_old.sale_date < current_date
    OR (v_old.sale_date = current_date AND v_old.sale_end <= current_time)
  ) THEN
    RAISE EXCEPTION 'Cannot activate an expired flash sale';
  END IF;

  UPDATE public.flash_sales
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_sale_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_update_flash_sale_status',
    'flash_sale',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('is_active', v_row.is_active, 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurant_archive_flash_sale(
  p_sale_id uuid,
  p_reason text
)
RETURNS public.flash_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.flash_sales%ROWTYPE;
  v_row public.flash_sales%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_old
  FROM public.flash_sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Flash sale not found';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_owns_restaurant(v_old.restaurant_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant flash sale';
  END IF;

  UPDATE public.flash_sales
  SET is_active = false,
      archived_at = COALESCE(archived_at, now()),
      archived_by = v_actor,
      archive_reason = v_reason,
      updated_at = now()
  WHERE id = p_sale_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'restaurant_archive_flash_sale',
    'flash_sale',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('sale', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.anti_waste_offers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.flash_sales FROM authenticated;

REVOKE ALL ON FUNCTION public.restaurant_upsert_anti_waste_offer(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_update_anti_waste_offer_status(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_archive_anti_waste_offer(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_upsert_flash_sale(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_update_flash_sale_status(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restaurant_archive_flash_sale(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.restaurant_upsert_anti_waste_offer(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_update_anti_waste_offer_status(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_archive_anti_waste_offer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_upsert_flash_sale(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_update_flash_sale_status(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_archive_flash_sale(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
