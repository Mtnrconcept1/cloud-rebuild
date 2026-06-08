-- Give the "Prendre" action its own audited, concurrency-safe server contract.
DROP FUNCTION IF EXISTS public.admin_take_marketplace_alert(text);

CREATE OR REPLACE FUNCTION public.admin_take_marketplace_alert(p_alert_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_alert_key text := NULLIF(trim(COALESCE(p_alert_key, '')), '');
  v_previous_status text;
  v_previous_handler uuid;
  v_claimed_by uuid;
  v_claimed_status text;
  v_taken_at timestamptz := now();
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF v_alert_key IS NULL THEN
    RAISE EXCEPTION 'Alert key is required.' USING ERRCODE = '22023';
  END IF;

  SELECT mas.status, mas.handled_by
  INTO v_previous_status, v_previous_handler
  FROM public.marketplace_alert_states mas
  WHERE mas.alert_key = v_alert_key
  FOR UPDATE;

  IF v_previous_status IN ('resolved', 'ignored') THEN
    RAISE EXCEPTION 'Closed marketplace alerts cannot be taken.' USING ERRCODE = '22023';
  END IF;

  IF v_previous_status = 'in_progress'
    AND v_previous_handler IS NOT NULL
    AND v_previous_handler <> v_actor_id
  THEN
    RAISE EXCEPTION 'Marketplace alert is already taken by another admin.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.marketplace_alert_states (
    alert_key,
    status,
    handled_by,
    handled_at,
    updated_at
  )
  VALUES (
    v_alert_key,
    'in_progress',
    v_actor_id,
    v_taken_at,
    v_taken_at
  )
  ON CONFLICT (alert_key) DO UPDATE
  SET status = EXCLUDED.status,
      handled_by = EXCLUDED.handled_by,
      handled_at = EXCLUDED.handled_at,
      updated_at = EXCLUDED.updated_at
  WHERE public.marketplace_alert_states.status NOT IN ('resolved', 'ignored')
    AND (
      public.marketplace_alert_states.status <> 'in_progress'
      OR public.marketplace_alert_states.handled_by IS NULL
      OR public.marketplace_alert_states.handled_by = EXCLUDED.handled_by
    )
  RETURNING handled_by, status
  INTO v_claimed_by, v_claimed_status;

  IF v_claimed_by IS NULL OR v_claimed_by <> v_actor_id OR v_claimed_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Marketplace alert is already taken by another admin.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.marketplace_alert_state_history (
    alert_key,
    previous_status,
    next_status,
    note,
    admin_user_id,
    metadata
  )
  VALUES (
    v_alert_key,
    v_previous_status,
    'in_progress',
    'Prise en charge admin.',
    v_actor_id,
    jsonb_build_object(
      'source', 'admin_take_marketplace_alert',
      'previous_handled_by', v_previous_handler,
      'taken_at', v_taken_at
    )
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_take_marketplace_alert',
    'marketplace_alert',
    NULL,
    jsonb_build_object(
      'alert_key', v_alert_key,
      'status', v_previous_status,
      'handled_by', v_previous_handler
    ),
    jsonb_build_object(
      'alert_key', v_alert_key,
      'status', 'in_progress',
      'handled_by', v_actor_id,
      'handled_at', v_taken_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'alert_key', v_alert_key,
    'status', 'in_progress',
    'handled_by', v_actor_id,
    'handled_at', v_taken_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_marketplace_alert(
  p_alert_key text,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_alert_key text := NULLIF(trim(COALESCE(p_alert_key, '')), '');
  v_status text := lower(trim(COALESCE(p_status, '')));
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_previous_status text;
  v_previous_handler uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF v_alert_key IS NULL THEN
    RAISE EXCEPTION 'Alert key is required.' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('new', 'in_progress', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'Unsupported alert status: %', p_status USING ERRCODE = '22023';
  END IF;

  IF v_status IN ('resolved', 'ignored') AND v_note IS NULL THEN
    RAISE EXCEPTION 'Admin note is required to resolve or ignore an alert.' USING ERRCODE = '22023';
  END IF;

  SELECT mas.status, mas.handled_by
  INTO v_previous_status, v_previous_handler
  FROM public.marketplace_alert_states mas
  WHERE mas.alert_key = v_alert_key
  FOR UPDATE;

  IF v_status IN ('in_progress', 'resolved', 'ignored')
    AND v_previous_status = 'in_progress'
    AND v_previous_handler IS NOT NULL
    AND v_actor_id IS NOT NULL
    AND v_previous_handler <> v_actor_id
  THEN
    RAISE EXCEPTION 'Marketplace alert is already taken by another admin.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.marketplace_alert_states (
    alert_key,
    status,
    note,
    handled_by,
    handled_at,
    updated_at
  )
  VALUES (
    v_alert_key,
    v_status,
    v_note,
    v_actor_id,
    now(),
    now()
  )
  ON CONFLICT (alert_key) DO UPDATE
  SET status = EXCLUDED.status,
      note = EXCLUDED.note,
      handled_by = EXCLUDED.handled_by,
      handled_at = EXCLUDED.handled_at,
      updated_at = now();

  INSERT INTO public.marketplace_alert_state_history (
    alert_key,
    previous_status,
    next_status,
    note,
    admin_user_id,
    metadata
  )
  VALUES (
    v_alert_key,
    v_previous_status,
    v_status,
    v_note,
    v_actor_id,
    jsonb_build_object(
      'auth_role', auth.role(),
      'previous_handled_by', v_previous_handler
    )
  );

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_update_marketplace_alert',
    'marketplace_alert',
    NULL,
    jsonb_build_object(
      'alert_key', v_alert_key,
      'status', v_previous_status,
      'handled_by', v_previous_handler
    ),
    jsonb_build_object(
      'alert_key', v_alert_key,
      'status', v_status,
      'note', v_note,
      'handled_by', v_actor_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_take_marketplace_alert(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_take_marketplace_alert(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_take_marketplace_alert(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_update_marketplace_alert(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_marketplace_alert(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_marketplace_alert(text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
