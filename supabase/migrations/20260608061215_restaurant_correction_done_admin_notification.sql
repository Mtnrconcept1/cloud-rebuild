-- Notify the requesting admin when a restaurant owner confirms a correction is done.

CREATE OR REPLACE FUNCTION public.restaurant_mark_admin_correction_done(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_request public.restaurant_admin_correction_requests%ROWTYPE;
  v_owner_id uuid;
  v_restaurant_name text;
BEGIN
  SELECT acr.*
  INTO v_request
  FROM public.restaurant_admin_correction_requests acr
  WHERE acr.id = p_request_id
  FOR UPDATE OF acr;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction request not found.' USING ERRCODE = '22023';
  END IF;

  SELECT r.owner_id, r.name
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = v_request.restaurant_id;

  IF auth.role() <> 'service_role' AND (v_actor_id IS NULL OR v_owner_id IS DISTINCT FROM v_actor_id) THEN
    RAISE EXCEPTION 'Restaurant owner access required.' USING ERRCODE = '42501';
  END IF;

  IF v_request.status <> 'open' THEN
    RETURN jsonb_build_object(
      'correction_request_id', p_request_id,
      'restaurant_id', v_request.restaurant_id,
      'status', v_request.status,
      'updated', false
    );
  END IF;

  UPDATE public.restaurant_admin_correction_requests
  SET
    status = 'completed',
    completed_at = now(),
    completed_by = v_actor_id
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = v_request.owner_notification_id
    AND user_id = v_owner_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'restaurant_mark_admin_correction_done',
    'restaurants',
    v_request.restaurant_id,
    jsonb_build_object(
      'correction_request_id', p_request_id,
      'status', 'open'
    ),
    jsonb_build_object(
      'correction_request_id', p_request_id,
      'status', v_request.status,
      'completed_at', v_request.completed_at,
      'restaurant_name', v_restaurant_name
    )
  );

  IF v_request.requested_by IS NOT NULL AND v_request.requested_by IS DISTINCT FROM v_actor_id THEN
    PERFORM public.enqueue_notification(
      v_request.requested_by,
      'Correction restaurant effectuée',
      COALESCE(v_restaurant_name, 'Le restaurant') || ' a indiqué que la correction demandée a été effectuée.',
      'in_app',
      'admin_restaurant',
      json_build_object(
        'restaurant_id', v_request.restaurant_id,
        'restaurant_name', v_restaurant_name,
        'correction_request_id', p_request_id,
        'restaurant_action', 'correction_completed'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'correction_request_id', p_request_id,
    'restaurant_id', v_request.restaurant_id,
    'status', v_request.status,
    'completed_at', v_request.completed_at,
    'updated', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurant_mark_admin_correction_done(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurant_mark_admin_correction_done(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restaurant_mark_admin_correction_done(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
