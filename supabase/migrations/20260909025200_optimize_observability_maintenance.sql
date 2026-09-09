-- Reduce observability/maintenance I/O without changing business behavior.
-- Forward-only migration: indexes first, then bounded retention jobs, then
-- removal of exact duplicate indexes confirmed by the Supabase advisor and
-- production pg_stat_user_indexes.

-- pg_cron owns cron.job_run_details on managed Supabase projects. PostgreSQL
-- only allows the table owner (or a member of that role) to create an index on
-- it, so keep the optimization where ownership permits it and otherwise skip
-- only this extension-owned index instead of blocking the whole deployment.
DO $cron_index$
DECLARE
  v_cron_owner oid;
BEGIN
  SELECT c.relowner
  INTO v_cron_owner
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'cron'
    AND c.relname = 'job_run_details'
    AND c.relkind = 'r';

  IF v_cron_owner IS NULL THEN
    RAISE NOTICE 'Skipping cron.job_run_details index: managed pg_cron table is unavailable';
  ELSIF pg_has_role(current_user, v_cron_owner, 'MEMBER') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cron_job_run_details_start_time ON cron.job_run_details (start_time)';
    EXECUTE 'COMMENT ON INDEX cron.idx_cron_job_run_details_start_time IS ''Retention lookup for bounded deletion of old pg_cron run details.''';
  ELSE
    RAISE NOTICE 'Skipping cron.job_run_details index: current role % is not a member of table owner %',
      current_user,
      pg_get_userbyid(v_cron_owner);
  END IF;
END;
$cron_index$;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_id_desc
  ON public.audit_log (created_at DESC, id DESC);

-- sync_net_http_response_cache filters and orders net._http_response by id.
-- Production only had the extension's created-at index, forcing avoidable
-- scans/sorts for each synchronization pass.
CREATE INDEX IF NOT EXISTS idx_net_http_response_id
  ON net._http_response (id);

COMMENT ON INDEX public.idx_audit_log_created_at_id_desc IS
  'Cursor pagination for admin audit history ordered by created_at/id.';

COMMENT ON INDEX net.idx_net_http_response_id IS
  'Supports incremental net._http_response mirroring by id.';

-- Keep sync batches bounded even if a caller supplies an unexpectedly large
-- limit. The source id index above is the important I/O optimization.
CREATE OR REPLACE FUNCTION public.sync_net_http_response_cache(p_limit integer DEFAULT 2000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max_id bigint := 0;
  v_inserted integer := 0;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 2000), 1), 10000);
BEGIN
  SELECT c.id
  INTO v_max_id
  FROM public.net_http_response_cache AS c
  ORDER BY c.id DESC
  LIMIT 1;

  v_max_id := COALESCE(v_max_id, 0);

  INSERT INTO public.net_http_response_cache (
    id,
    status_code,
    content_type,
    headers,
    content,
    timed_out,
    error_msg,
    created_at
  )
  SELECT
    r.id,
    r.status_code,
    r.content_type,
    r.headers,
    r.content,
    r.timed_out,
    r.error_msg,
    r.created
  FROM net._http_response AS r
  WHERE r.id > v_max_id
  ORDER BY r.id
  LIMIT v_limit
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_net_http_response_cache(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_net_http_response_cache(integer)
  TO service_role;

-- Replace large retention deletes with bounded batches. The schedules remain
-- hourly so retention keeps up without creating long delete/vacuum bursts.
DO $cron_retention$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-cron-job-run-details-14d') THEN
    PERFORM cron.unschedule('retention-cron-job-run-details-14d');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-edge-function-audit-logs-30d') THEN
    PERFORM cron.unschedule('retention-edge-function-audit-logs-30d');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-net-http-response-7d') THEN
    PERFORM cron.unschedule('retention-net-http-response-7d');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tok-net-http-response-cache-retention') THEN
    PERFORM cron.unschedule('tok-net-http-response-cache-retention');
  END IF;
END;
$cron_retention$;

SELECT cron.schedule(
  'retention-cron-job-run-details-14d',
  '23 * * * *',
  $cron$
    WITH expired AS (
      SELECT runid
      FROM cron.job_run_details
      WHERE start_time < now() - interval '14 days'
      ORDER BY start_time, runid
      LIMIT 5000
    )
    DELETE FROM cron.job_run_details AS target
    USING expired
    WHERE target.runid = expired.runid;
  $cron$
);

SELECT cron.schedule(
  'retention-edge-function-audit-logs-30d',
  '17 * * * *',
  $cron$
    WITH expired AS (
      SELECT id
      FROM public.edge_function_audit_logs
      WHERE created_at < now() - interval '30 days'
      ORDER BY created_at, id
      LIMIT 5000
    )
    DELETE FROM public.edge_function_audit_logs AS target
    USING expired
    WHERE target.id = expired.id;
  $cron$
);

SELECT cron.schedule(
  'retention-net-http-response-7d',
  '11 * * * *',
  $cron$
    WITH expired AS (
      SELECT id
      FROM net._http_response
      WHERE created < now() - interval '7 days'
      ORDER BY created, id
      LIMIT 5000
    )
    DELETE FROM net._http_response AS target
    USING expired
    WHERE target.id = expired.id;
  $cron$
);

-- Cache retention previously ran every five minutes even though the retention
-- window is seven days and production only contains tens of thousands of rows.
-- Run hourly, still in bounded batches, to cut scheduler/write churn.
SELECT cron.schedule(
  'tok-net-http-response-cache-retention',
  '37 * * * *',
  $cron$
    WITH expired AS (
      SELECT id
      FROM public.net_http_response_cache
      WHERE created_at < now() - interval '7 days'
      ORDER BY created_at, id
      LIMIT 5000
    )
    DELETE FROM public.net_http_response_cache AS target
    USING expired
    WHERE target.id = expired.id;
  $cron$
);

-- Exact duplicates verified in production. Keep the index that is used or has
-- an explicit readiness contract, and remove only its redundant twin.
DROP INDEX IF EXISTS public.group_member_orders_group_status_idx;
DROP INDEX IF EXISTS public.order_items_order_id_idx;
DROP INDEX IF EXISTS public.idx_orders_pending_payment_created_at;
DROP INDEX IF EXISTS public.social_post_promotions_campaign_idx;

NOTIFY pgrst, 'reload schema';
