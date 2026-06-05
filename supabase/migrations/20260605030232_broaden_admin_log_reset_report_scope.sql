ALTER TABLE public.admin_dashboard_log_reset_history
  ADD COLUMN IF NOT EXISTS resolved_ai_admin_events integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_ai_security_events integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_ai_support_tickets integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_support_incidents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_marketplace_alerts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_ai_performance_snapshots integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_reset_dashboard_logs(p_confirmation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_reset_dashboard_logs$
DECLARE
  v_actor_id uuid := auth.uid();
  v_edge_count integer := 0;
  v_data_count integer := 0;
  v_ai_count integer := 0;
  v_ai_admin_events_count integer := 0;
  v_ai_security_events_count integer := 0;
  v_ai_support_tickets_count integer := 0;
  v_support_incidents_count integer := 0;
  v_marketplace_alerts_count integer := 0;
  v_ai_performance_snapshots_count integer := 0;
  v_alert record;
  v_previous_status text;
  v_reset_note text := 'Remise a zero admin du rapport Operations IA.';
  v_support_since timestamptz := now() - interval '14 days';
  v_security_since timestamptz := now() - interval '7 days';
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_confirmation_code, '') <> 'Tok2026$$' THEN
    RAISE EXCEPTION 'Code de confirmation invalide.'
      USING ERRCODE = '22023';
  END IF;

  IF to_regprocedure('public.admin_get_marketplace_alerts(boolean)') IS NOT NULL
    AND to_regclass('public.marketplace_alert_states') IS NOT NULL
    AND to_regclass('public.marketplace_alert_state_history') IS NOT NULL
  THEN
    FOR v_alert IN
      SELECT alert_key, status
      FROM public.admin_get_marketplace_alerts(false)
    LOOP
      SELECT mas.status
      INTO v_previous_status
      FROM public.marketplace_alert_states mas
      WHERE mas.alert_key = v_alert.alert_key
      FOR UPDATE;

      INSERT INTO public.marketplace_alert_states (
        alert_key,
        status,
        note,
        handled_by,
        handled_at,
        updated_at
      )
      VALUES (
        v_alert.alert_key,
        'resolved',
        v_reset_note,
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
        v_alert.alert_key,
        v_previous_status,
        'resolved',
        v_reset_note,
        v_actor_id,
        jsonb_build_object('source', 'admin_reset_dashboard_logs')
      );

      v_marketplace_alerts_count := v_marketplace_alerts_count + 1;
      v_previous_status := NULL;
    END LOOP;
  END IF;

  IF to_regclass('public.ai_admin_events') IS NOT NULL THEN
    UPDATE public.ai_admin_events
    SET status = 'resolved',
        resolved_at = COALESCE(resolved_at, now())
    WHERE status <> 'resolved';
    GET DIAGNOSTICS v_ai_admin_events_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.ai_security_events') IS NOT NULL THEN
    UPDATE public.ai_security_events
    SET status = 'resolved',
        resolved_at = COALESCE(resolved_at, now())
    WHERE status <> 'resolved'
      AND created_at >= v_security_since;
    GET DIAGNOSTICS v_ai_security_events_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.ai_support_tickets') IS NOT NULL THEN
    UPDATE public.ai_support_tickets
    SET status = 'resolved',
        resolved_at = COALESCE(resolved_at, now()),
        updated_at = now()
    WHERE status <> 'resolved'
      AND updated_at >= v_support_since;
    GET DIAGNOSTICS v_ai_support_tickets_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.support_incidents') IS NOT NULL THEN
    UPDATE public.support_incidents
    SET status = 'closed',
        resolution = COALESCE(NULLIF(resolution, ''), v_reset_note),
        resolved_at = COALESCE(resolved_at, now()),
        closed_at = COALESCE(closed_at, now()),
        updated_at = now()
    WHERE status <> 'closed'
      AND updated_at >= v_support_since;
    GET DIAGNOSTICS v_support_incidents_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.ai_performance_snapshots') IS NOT NULL THEN
    DELETE FROM public.ai_performance_snapshots
    WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_ai_performance_snapshots_count = ROW_COUNT;
  END IF;

  DELETE FROM public.edge_function_audit_logs
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_edge_count = ROW_COUNT;

  DELETE FROM public.audit_log
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_data_count = ROW_COUNT;

  IF to_regclass('public.ai_usage_logs') IS NOT NULL THEN
    DELETE FROM public.ai_usage_logs
    WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_ai_count = ROW_COUNT;
  END IF;

  INSERT INTO public.admin_dashboard_log_reset_history (
    actor_user_id,
    deleted_edge_logs,
    deleted_data_logs,
    deleted_ai_usage_logs,
    resolved_ai_admin_events,
    resolved_ai_security_events,
    resolved_ai_support_tickets,
    closed_support_incidents,
    resolved_marketplace_alerts,
    deleted_ai_performance_snapshots
  )
  VALUES (
    v_actor_id,
    v_edge_count,
    v_data_count,
    v_ai_count,
    v_ai_admin_events_count,
    v_ai_security_events_count,
    v_ai_support_tickets_count,
    v_support_incidents_count,
    v_marketplace_alerts_count,
    v_ai_performance_snapshots_count
  );

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_edge_logs', v_edge_count,
    'deleted_data_logs', v_data_count,
    'deleted_ai_usage_logs', v_ai_count,
    'resolved_ai_admin_events', v_ai_admin_events_count,
    'resolved_ai_security_events', v_ai_security_events_count,
    'resolved_ai_support_tickets', v_ai_support_tickets_count,
    'closed_support_incidents', v_support_incidents_count,
    'resolved_marketplace_alerts', v_marketplace_alerts_count,
    'deleted_ai_performance_snapshots', v_ai_performance_snapshots_count
  );
END;
$admin_reset_dashboard_logs$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
