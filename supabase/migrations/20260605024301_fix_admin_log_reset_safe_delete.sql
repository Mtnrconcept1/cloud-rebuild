-- Supabase/PostgREST can run with safe delete guards that reject DELETE
-- statements without an explicit WHERE clause. Keep the reset broad, but make
-- the intent explicit so the RPC works from the admin dashboard.

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
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_confirmation_code, '') <> 'Tok2026$$' THEN
    RAISE EXCEPTION 'Code de confirmation invalide.'
      USING ERRCODE = '22023';
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
    deleted_ai_usage_logs
  )
  VALUES (
    v_actor_id,
    v_edge_count,
    v_data_count,
    v_ai_count
  );

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_edge_logs', v_edge_count,
    'deleted_data_logs', v_data_count,
    'deleted_ai_usage_logs', v_ai_count
  );
END;
$admin_reset_dashboard_logs$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) TO authenticated, service_role;
