-- Admin governance for La Table du Chef drops.
ALTER TABLE public.chef_table_drops
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS chef_table_drops_archive_active_idx
  ON public.chef_table_drops (archived_at, is_active, drop_time DESC);

DROP POLICY IF EXISTS "Public drops are viewable by everyone" ON public.chef_table_drops;
DROP POLICY IF EXISTS "Admins can manage drops" ON public.chef_table_drops;
DROP POLICY IF EXISTS "chef_table_drops_public_select" ON public.chef_table_drops;
DROP POLICY IF EXISTS "chef_table_drops_admin_select" ON public.chef_table_drops;

CREATE POLICY "chef_table_drops_public_select"
  ON public.chef_table_drops
  FOR SELECT
  USING (
    (is_active = true AND archived_at IS NULL)
    OR public.has_role(auth.uid(), 'admin')
  );

REVOKE INSERT, UPDATE, DELETE ON public.chef_table_drops FROM authenticated;
GRANT SELECT ON public.chef_table_drops TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_chef_table_drop(
  p_drop_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT NULL
)
RETURNS public.chef_table_drops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_restaurant_id uuid;
  v_chef_name text := trim(COALESCE(p_payload->>'chef_name', ''));
  v_dish_name text := trim(COALESCE(p_payload->>'dish_name', ''));
  v_description text := NULLIF(trim(COALESCE(p_payload->>'description', '')), '');
  v_image_url text := NULLIF(trim(COALESCE(p_payload->>'image_url', '')), '');
  v_price numeric := NULLIF(p_payload->>'price', '')::numeric;
  v_original_price numeric := NULLIF(p_payload->>'original_price', '')::numeric;
  v_total_portions integer := NULLIF(p_payload->>'total_portions', '')::integer;
  v_drop_time timestamptz := NULLIF(p_payload->>'drop_time', '')::timestamptz;
  v_is_active boolean := COALESCE((p_payload->>'is_active')::boolean, true);
  v_old public.chef_table_drops%ROWTYPE;
  v_old_json jsonb := NULL;
  v_row public.chef_table_drops%ROWTYPE;
  v_sold_portions integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage chef table drops';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  v_restaurant_id := NULLIF(p_payload->>'restaurant_id', '')::uuid;
  IF v_restaurant_id IS NULL OR v_chef_name = '' OR v_dish_name = '' THEN
    RAISE EXCEPTION 'Restaurant, chef and dish are required';
  END IF;
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'Price must be positive';
  END IF;
  IF v_original_price IS NOT NULL AND v_original_price <= 0 THEN
    RAISE EXCEPTION 'Original price must be positive';
  END IF;
  IF v_total_portions IS NULL OR v_total_portions <= 0 THEN
    RAISE EXCEPTION 'Total portions must be positive';
  END IF;
  IF v_drop_time IS NULL THEN
    RAISE EXCEPTION 'Drop time is required';
  END IF;

  IF p_drop_id IS NULL THEN
    INSERT INTO public.chef_table_drops (
      restaurant_id,
      chef_name,
      dish_name,
      description,
      image_url,
      price,
      original_price,
      total_portions,
      remaining_portions,
      drop_time,
      is_active
    )
    VALUES (
      v_restaurant_id,
      v_chef_name,
      v_dish_name,
      v_description,
      v_image_url,
      v_price,
      v_original_price,
      v_total_portions,
      v_total_portions,
      v_drop_time,
      v_is_active
    )
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_old
    FROM public.chef_table_drops
    WHERE id = p_drop_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Chef table drop not found';
    END IF;

    v_old_json := to_jsonb(v_old);
    v_sold_portions := GREATEST(0, COALESCE(v_old.total_portions, 0) - COALESCE(v_old.remaining_portions, 0));
    IF v_sold_portions > 0 THEN
      RAISE EXCEPTION 'Chef table drop already sold; archive it instead of editing';
    END IF;

    UPDATE public.chef_table_drops
    SET restaurant_id = v_restaurant_id,
        chef_name = v_chef_name,
        dish_name = v_dish_name,
        description = v_description,
        image_url = v_image_url,
        price = v_price,
        original_price = v_original_price,
        total_portions = v_total_portions,
        remaining_portions = v_total_portions,
        drop_time = v_drop_time,
        is_active = v_is_active,
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL,
        updated_at = now()
    WHERE id = p_drop_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    CASE WHEN p_drop_id IS NULL THEN 'admin_create_chef_table_drop' ELSE 'admin_update_chef_table_drop' END,
    'chef_table_drop',
    v_row.id,
    v_old_json,
    jsonb_build_object('drop', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_archive_chef_table_drop(
  p_drop_id uuid,
  p_reason text
)
RETURNS public.chef_table_drops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.chef_table_drops%ROWTYPE;
  v_row public.chef_table_drops%ROWTYPE;
  v_sold_portions integer := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage chef table drops';
  END IF;
  IF p_drop_id IS NULL THEN
    RAISE EXCEPTION 'Drop id is required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_old
  FROM public.chef_table_drops
  WHERE id = p_drop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chef table drop not found';
  END IF;

  v_sold_portions := GREATEST(0, COALESCE(v_old.total_portions, 0) - COALESCE(v_old.remaining_portions, 0));

  UPDATE public.chef_table_drops
  SET is_active = false,
      archived_at = now(),
      archived_by = v_actor,
      archive_reason = v_reason,
      updated_at = now()
  WHERE id = p_drop_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_archive_chef_table_drop',
    'chef_table_drop',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('drop', to_jsonb(v_row), 'reason', v_reason, 'sold_portions', v_sold_portions)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_chef_table_drop(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_archive_chef_table_drop(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_chef_table_drop(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_chef_table_drop(uuid, text) TO authenticated;
