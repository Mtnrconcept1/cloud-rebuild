BEGIN;
ALTER TABLE public.flash_sales ADD COLUMN IF NOT EXISTS early_access_minutes integer NOT NULL DEFAULT 0
 CHECK (early_access_minutes BETWEEN 0 AND 120);
CREATE OR REPLACE FUNCTION public.restaurant_upsert_flash_sale(p_sale_id uuid, p_payload jsonb, p_reason text)
 RETURNS flash_sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_early integer := COALESCE((p_payload->>'early_access_minutes')::integer,0);
  v_sale_end time := (p_payload->>'sale_end')::time;
  v_delivery_available boolean := COALESCE((p_payload->>'delivery_available')::boolean, true);
  v_takeaway_available boolean := COALESCE((p_payload->>'takeaway_available')::boolean, true);
  v_is_active boolean := COALESCE((p_payload->>'is_active')::boolean, true);
BEGIN
  IF v_early < 0 OR v_early > 120 THEN RAISE EXCEPTION 'Early access must be between 0 and 120 minutes'; END IF;
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
      early_access_minutes,
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
      v_early,
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
        early_access_minutes = v_early,
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
$function$;

COMMIT;
