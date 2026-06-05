CREATE OR REPLACE FUNCTION public.admin_reconcile_marketplace_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_checked_at timestamptz := now();
  v_auto_resolved_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  WITH active_alerts AS (
    SELECT alert_key
    FROM public.admin_get_marketplace_alerts(true)
  ),
  candidates AS (
    SELECT
      s.alert_key,
      s.status AS previous_status,
      s.note AS previous_note
    FROM public.marketplace_alert_states s
    WHERE s.status IN ('new', 'in_progress')
      AND s.alert_key LIKE 'edge-function:failure:%'
      AND NOT EXISTS (
        SELECT 1
        FROM active_alerts a
        WHERE a.alert_key = s.alert_key
      )
  ),
  updated AS (
    UPDATE public.marketplace_alert_states s
    SET
      status = 'resolved',
      note = 'Auto-resolue: aucun nouvel echec Edge Function sur la fenetre de surveillance actuelle.',
      handled_by = COALESCE(v_actor_id, s.handled_by),
      handled_at = v_checked_at,
      updated_at = v_checked_at
    FROM candidates c
    WHERE s.alert_key = c.alert_key
    RETURNING
      s.alert_key,
      c.previous_status,
      c.previous_note,
      s.note
  ),
  history_insert AS (
    INSERT INTO public.marketplace_alert_state_history (
      alert_key,
      previous_status,
      next_status,
      note,
      admin_user_id,
      metadata
    )
    SELECT
      u.alert_key,
      u.previous_status,
      'resolved',
      u.note,
      v_actor_id,
      jsonb_build_object(
        'source', 'admin_reconcile_marketplace_alerts',
        'reason', 'error_signal_cleared',
        'rule', 'edge_function_failure_absent_from_current_alerts',
        'previous_note', u.previous_note,
        'checked_at', v_checked_at
      )
    FROM updated u
    RETURNING 1
  )
  SELECT count(*)::integer
  INTO v_auto_resolved_count
  FROM history_insert;

  IF v_auto_resolved_count > 0 THEN
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      v_actor_id,
      'admin_reconcile_marketplace_alerts',
      'marketplace_alert',
      NULL,
      jsonb_build_object('status', 'new_or_in_progress'),
      jsonb_build_object(
        'status', 'resolved',
        'auto_resolved_count', v_auto_resolved_count,
        'rule', 'edge_function_failure_absent_from_current_alerts',
        'checked_at', v_checked_at
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'auto_resolved_alerts', v_auto_resolved_count,
    'checked_at', v_checked_at,
    'rule', 'edge_function_failure_absent_from_current_alerts'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reconcile_marketplace_alerts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reconcile_marketplace_alerts() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_marketplace_alerts() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
