CREATE TABLE IF NOT EXISTS public.admin_dashboard_log_reset_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_edge_logs integer NOT NULL DEFAULT 0,
  deleted_data_logs integer NOT NULL DEFAULT 0,
  deleted_ai_usage_logs integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_dashboard_log_reset_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_dashboard_log_reset_history_admin_select"
  ON public.admin_dashboard_log_reset_history;
CREATE POLICY "admin_dashboard_log_reset_history_admin_select"
  ON public.admin_dashboard_log_reset_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.admin_dashboard_log_reset_history TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_dashboard_logs(p_confirmation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  DELETE FROM public.edge_function_audit_logs;
  GET DIAGNOSTICS v_edge_count = ROW_COUNT;

  DELETE FROM public.audit_log;
  GET DIAGNOSTICS v_data_count = ROW_COUNT;

  IF to_regclass('public.ai_usage_logs') IS NOT NULL THEN
    DELETE FROM public.ai_usage_logs;
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
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_dashboard_logs(text) TO authenticated, service_role;

-- One-time reset requested for the admin dashboard logs. The reset history table
-- keeps aggregate deletion counts without repopulating the visible audit log.
DO $reset_dashboard_logs$
DECLARE
  v_edge_count integer := 0;
  v_data_count integer := 0;
  v_ai_count integer := 0;
BEGIN
  DELETE FROM public.edge_function_audit_logs;
  GET DIAGNOSTICS v_edge_count = ROW_COUNT;

  DELETE FROM public.audit_log;
  GET DIAGNOSTICS v_data_count = ROW_COUNT;

  IF to_regclass('public.ai_usage_logs') IS NOT NULL THEN
    DELETE FROM public.ai_usage_logs;
    GET DIAGNOSTICS v_ai_count = ROW_COUNT;
  END IF;

  INSERT INTO public.admin_dashboard_log_reset_history (
    actor_user_id,
    deleted_edge_logs,
    deleted_data_logs,
    deleted_ai_usage_logs
  )
  VALUES (
    NULL,
    v_edge_count,
    v_data_count,
    v_ai_count
  );
END;
$reset_dashboard_logs$;
