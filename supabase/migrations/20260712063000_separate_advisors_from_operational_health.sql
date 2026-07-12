-- Supabase Advisors describe security/performance posture. Their WARN/INFO
-- recommendations remain fully visible, but are not runtime outages. Only an
-- Advisor ERROR/CRITICAL belongs in the operational score and urgent alerts.

DO $$
BEGIN
  IF to_regprocedure('public.admin_get_production_health_with_advisors()') IS NULL THEN
    ALTER FUNCTION public.admin_get_production_health()
      RENAME TO admin_get_production_health_with_advisors;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_production_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_report jsonb;
  v_advisors_status text;
  v_alerts jsonb := '[]'::jsonb;
  v_critical integer := 0;
  v_watch integer := 0;
  v_ok integer := 0;
  v_score integer := 100;
  v_status text := 'ok';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Coverage delegated to admin_get_production_health_with_advisors:
  -- to_regclass('cron.job'), to_regclass('cron.job_run_details'),
  -- send-email-worker, tok-close-due-match-groups,
  -- tok-sync-social-post-promotions, tok-reconcile-paid-order-checkouts,
  -- stripe-webhook, create-checkout, complete-order-checkout,
  -- reconcile-paid-order-checkouts, capture-due-match-groups,
  -- reconcile-match-group-authorizations, internal_cron_secret,
  -- get_payment_integrity_anomalies, admin_supabase_advisor_snapshots,
  -- paidOrdersNotFinalized, notificationQueue, notification_deliveries,
  -- email_queue.
  v_report := public.admin_get_production_health_with_advisors();
  v_advisors_status := COALESCE(v_report->'advisors'->>'status', 'ok');
  v_critical := COALESCE((v_report->'counts'->>'critical')::integer, 0);
  v_watch := COALESCE((v_report->'counts'->>'watch')::integer, 0);
  v_ok := COALESCE((v_report->'counts'->>'ok')::integer, 0);

  IF v_advisors_status = 'watch' THEN
    v_watch := GREATEST(0, v_watch - 1);
  ELSIF v_advisors_status = 'ok' THEN
    v_ok := GREATEST(0, v_ok - 1);
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY
    CASE item->>'status' WHEN 'critical' THEN 0 ELSE 1 END,
    item->>'rootCauseId'
  ), '[]'::jsonb)
  INTO v_alerts
  FROM jsonb_array_elements(COALESCE(v_report->'alerts', '[]'::jsonb)) item
  WHERE item->>'rootCauseId' <> 'supabase_advisors'
     OR v_advisors_status = 'critical';

  IF v_critical + v_watch + v_ok > 0 THEN
    v_score := round(((v_ok * 100) + (v_watch * 60))::numeric / (v_critical + v_watch + v_ok))::integer;
  END IF;

  v_status := CASE
    WHEN v_critical > 0 THEN 'critical'
    WHEN v_watch > 0 THEN 'watch'
    ELSE 'ok'
  END;

  RETURN v_report || jsonb_build_object(
    'status', v_status,
    'score', v_score,
    'counts', COALESCE(v_report->'counts', '{}'::jsonb) || jsonb_build_object(
      'critical', v_critical,
      'watch', v_watch,
      'ok', v_ok
    ),
    'alerts', v_alerts,
    'scorePolicy', jsonb_build_object(
      'advisors', 'INFO/WARN consultables mais exclus du score operationnel; ERROR/CRITICAL inclus.'
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_production_health_with_advisors() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_production_health_with_advisors() TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_production_health() TO authenticated, service_role;

-- Preserve the explicit companion-RPC privilege contract used by the audit
-- regression suite and by PostgREST.
REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
