-- Admin governance for paid launch packs, service fulfillments and dashboard feature locks.
CREATE OR REPLACE FUNCTION public.admin_update_launch_pack_status(
  p_pack_id uuid,
  p_status text,
  p_reason text
)
RETURNS public.restaurant_launch_packs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old public.restaurant_launch_packs%ROWTYPE;
  v_row public.restaurant_launch_packs%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can update launch packs';
  END IF;
  IF v_status NOT IN ('paid', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid launch pack status';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT * INTO v_old
  FROM public.restaurant_launch_packs
  WHERE id = p_pack_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Launch pack not found';
  END IF;
  IF v_old.status = 'pending_payment' THEN
    RAISE EXCEPTION 'Pending payment launch packs must be updated by payment webhooks';
  END IF;

  UPDATE public.restaurant_launch_packs
  SET status = v_status,
      completed_at = CASE WHEN v_status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
      updated_at = now()
  WHERE id = p_pack_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_update_launch_pack_status',
    'restaurant_launch_pack',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('pack', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_launch_pack_fulfillment(
  p_fulfillment_id uuid,
  p_patch jsonb,
  p_reason text
)
RETURNS public.launch_pack_service_fulfillments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_status text := NULLIF(lower(trim(COALESCE(p_patch->>'status', ''))), '');
  v_old public.launch_pack_service_fulfillments%ROWTYPE;
  v_row public.launch_pack_service_fulfillments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can update launch pack fulfillments';
  END IF;
  IF p_fulfillment_id IS NULL THEN
    RAISE EXCEPTION 'Fulfillment id is required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid fulfillment status';
  END IF;

  SELECT * INTO v_old
  FROM public.launch_pack_service_fulfillments
  WHERE id = p_fulfillment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fulfillment not found';
  END IF;

  UPDATE public.launch_pack_service_fulfillments
  SET status = COALESCE(v_status, status),
      assigned_to = CASE WHEN p_patch ? 'assigned_to' THEN NULLIF(p_patch->>'assigned_to', '')::uuid ELSE assigned_to END,
      scheduled_at = CASE WHEN p_patch ? 'scheduled_at' THEN NULLIF(p_patch->>'scheduled_at', '')::timestamptz ELSE scheduled_at END,
      completed_at = CASE
        WHEN v_status = 'completed' AND NOT (p_patch ? 'completed_at') THEN COALESCE(completed_at, now())
        WHEN v_status IS NOT NULL AND v_status <> 'completed' AND NOT (p_patch ? 'completed_at') THEN NULL
        WHEN p_patch ? 'completed_at' THEN NULLIF(p_patch->>'completed_at', '')::timestamptz
        ELSE completed_at
      END,
      notes = CASE WHEN p_patch ? 'notes' THEN NULLIF(p_patch->>'notes', '') ELSE notes END,
      updated_at = now()
  WHERE id = p_fulfillment_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_update_launch_pack_fulfillment',
    'launch_pack_service_fulfillment',
    v_row.id,
    to_jsonb(v_old),
    jsonb_build_object('fulfillment', to_jsonb(v_row), 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_restaurant_disabled_features(
  p_restaurant_id uuid,
  p_features text[] DEFAULT '{}'::text[],
  p_reason text DEFAULT NULL
)
RETURNS public.restaurants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(COALESCE(p_reason, ''));
  v_features text[];
  v_old public.restaurants%ROWTYPE;
  v_row public.restaurants%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Only admins can update restaurant feature locks';
  END IF;
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant id is required';
  END IF;
  IF length(v_reason) < 6 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT trim(feature)), '{}'::text[])
  INTO v_features
  FROM unnest(COALESCE(p_features, '{}'::text[])) AS feature
  WHERE trim(feature) <> '';

  IF COALESCE(array_length(v_features, 1), 0) > 64 THEN
    RAISE EXCEPTION 'Too many disabled features';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_features) AS feature
    WHERE feature !~ '^[a-z0-9][a-z0-9_-]{1,80}$'
  ) THEN
    RAISE EXCEPTION 'Invalid feature key';
  END IF;

  SELECT * INTO v_old
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  UPDATE public.restaurants
  SET disabled_dashboard_features = v_features,
      updated_at = now()
  WHERE id = p_restaurant_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor,
    'admin_update_restaurant_disabled_features',
    'restaurant',
    v_row.id,
    jsonb_build_object('disabled_dashboard_features', v_old.disabled_dashboard_features),
    jsonb_build_object('disabled_dashboard_features', v_row.disabled_dashboard_features, 'reason', v_reason)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_launch_pack_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_launch_pack_fulfillment(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_restaurant_disabled_features(uuid, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_launch_pack_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_launch_pack_fulfillment(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_restaurant_disabled_features(uuid, text[], text) TO authenticated;
