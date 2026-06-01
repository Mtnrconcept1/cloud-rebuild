-- Send real owner notifications from the admin restaurant action RPC.

CREATE OR REPLACE FUNCTION public.admin_record_restaurant_admin_action(
  p_restaurant_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_owner_id uuid;
  v_restaurant_name text;
  v_notification_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF v_action NOT IN ('request_correction', 'reindex_catalog', 'send_notification') THEN
    RAISE EXCEPTION 'Unsupported restaurant admin action: %', p_action USING ERRCODE = '22023';
  END IF;

  IF v_action IN ('request_correction', 'send_notification') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Admin action reason is required.' USING ERRCODE = '22023';
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = '22023';
  END IF;

  IF v_action = 'send_notification' THEN
    v_notification_id := public.enqueue_notification(
      v_owner_id,
      'Action admin TOK',
      COALESCE(v_reason, 'Une action administrative concerne votre restaurant.'),
      'in_app',
      'admin_restaurant',
      json_build_object(
        'restaurant_id', p_restaurant_id,
        'restaurant_name', v_restaurant_name,
        'admin_action', v_action
      )
    );
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_record_restaurant_admin_action',
    'restaurants',
    p_restaurant_id,
    NULL,
    jsonb_build_object(
      'restaurant_action', v_action,
      'reason', v_reason,
      'notification_id', v_notification_id
    )
  );

  RETURN jsonb_build_object(
    'restaurant_id', p_restaurant_id,
    'action', v_action,
    'notification_id', v_notification_id,
    'recorded', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_record_restaurant_admin_action(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_restaurant_admin_action(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_restaurant_admin_action(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
