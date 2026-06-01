CREATE TABLE IF NOT EXISTS public.admin_supabase_advisor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'supabase-cli',
  captured_at timestamptz NOT NULL DEFAULT now(),
  total_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  security_count integer NOT NULL DEFAULT 0,
  performance_count integer NOT NULL DEFAULT 0,
  advisors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_supabase_advisor_snapshots_captured_at
  ON public.admin_supabase_advisor_snapshots(captured_at DESC);

ALTER TABLE public.admin_supabase_advisor_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_supabase_advisor_snapshots_admin_select" ON public.admin_supabase_advisor_snapshots;
CREATE POLICY "admin_supabase_advisor_snapshots_admin_select"
  ON public.admin_supabase_advisor_snapshots
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_supabase_advisor_snapshots_admin_insert" ON public.admin_supabase_advisor_snapshots;
CREATE POLICY "admin_supabase_advisor_snapshots_admin_insert"
  ON public.admin_supabase_advisor_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_record_supabase_advisor_snapshot(
  p_advisors jsonb,
  p_source text DEFAULT 'supabase-cli'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advisors jsonb := CASE
    WHEN jsonb_typeof(COALESCE(p_advisors, '[]'::jsonb)) = 'array' THEN COALESCE(p_advisors, '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH parsed AS (
    SELECT item
    FROM jsonb_array_elements(v_advisors) AS item
  ),
  summarized AS (
    SELECT
      COUNT(*)::integer AS total_count,
      COUNT(*) FILTER (WHERE upper(COALESCE(item->>'level', 'WARN')) IN ('ERROR', 'CRITICAL'))::integer AS error_count,
      COUNT(*) FILTER (WHERE upper(COALESCE(item->>'level', 'WARN')) = 'WARN')::integer AS warning_count,
      COUNT(*) FILTER (WHERE COALESCE(item->'categories', '[]'::jsonb) ? 'SECURITY')::integer AS security_count,
      COUNT(*) FILTER (WHERE COALESCE(item->'categories', '[]'::jsonb) ? 'PERFORMANCE')::integer AS performance_count
    FROM parsed
  ),
  limited AS (
    SELECT item
    FROM parsed
    ORDER BY
      CASE
        WHEN upper(COALESCE(item->>'level', 'WARN')) IN ('ERROR', 'CRITICAL') THEN 0
        WHEN upper(COALESCE(item->>'level', 'WARN')) = 'WARN' THEN 1
        ELSE 2
      END,
      item->>'name'
    LIMIT 60
  ),
  compact_items AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', item->>'name',
      'title', item->>'title',
      'level', COALESCE(item->>'level', 'WARN'),
      'categories', COALESCE(item->'categories', '[]'::jsonb),
      'detail', left(COALESCE(item->>'detail', item->>'description', ''), 420),
      'remediation', item->>'remediation',
      'metadata', COALESCE(item->'metadata', '{}'::jsonb)
    )), '[]'::jsonb) AS advisors
    FROM limited
  ),
  inserted AS (
    INSERT INTO public.admin_supabase_advisor_snapshots (
      source,
      total_count,
      error_count,
      warning_count,
      security_count,
      performance_count,
      advisors
    )
    SELECT
      COALESCE(NULLIF(trim(p_source), ''), 'supabase-cli'),
      summarized.total_count,
      summarized.error_count,
      summarized.warning_count,
      summarized.security_count,
      summarized.performance_count,
      compact_items.advisors
    FROM summarized
    CROSS JOIN compact_items
    RETURNING *
  )
  SELECT jsonb_build_object(
    'id', id,
    'source', source,
    'capturedAt', captured_at,
    'total', total_count,
    'critical', error_count,
    'warning', warning_count,
    'security', security_count,
    'performance', performance_count,
    'items', advisors
  )
  INTO v_result
  FROM inserted;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_production_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_cron_jobs jsonb := '[]'::jsonb;
  v_edge_functions jsonb := '[]'::jsonb;
  v_stripe jsonb := '{}'::jsonb;
  v_payment_integrity jsonb := '{}'::jsonb;
  v_configuration jsonb := '[]'::jsonb;
  v_advisors jsonb := '{}'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_status text := 'ok';
  v_critical_count integer := 0;
  v_watch_count integer := 0;
  v_ok_count integer := 0;
  v_internal_cron_secret_present boolean;
  v_internal_cron_secret_observable boolean := false;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    BEGIN
      EXECUTE
        'SELECT EXISTS (
           SELECT 1
           FROM vault.decrypted_secrets
           WHERE name = $1
             AND NULLIF(decrypted_secret, '''') IS NOT NULL
         )'
      INTO v_internal_cron_secret_present
      USING 'internal_cron_secret';
      v_internal_cron_secret_observable := true;
    EXCEPTION WHEN OTHERS THEN
      v_internal_cron_secret_present := NULL;
      v_internal_cron_secret_observable := false;
    END;
  END IF;

  IF to_regclass('cron.job') IS NOT NULL AND to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $cron$
      WITH expected(jobname, expected_schedule, label, priority, action_url, remediation) AS (
        VALUES
          ('send-email-worker', '* * * * *', 'Emails transactionnels', 'P0', '/admin/notifications', 'Verifier le secret Vault internal_cron_secret et la planification pg_net vers send-email.'),
          ('tok-close-due-match-groups', '* * * * *', 'Cloture Match group', 'P0', '/admin/commandes-reservations', 'Verifier close_due_match_groups et les captures Match group.'),
          ('tok-sync-social-post-promotions', '*/5 * * * *', 'Synchronisation Actualites sponsorisees', 'P1', '/admin/actualites', 'Verifier sync_social_post_promotion_status et les campagnes sponsorisees.')
      ),
      jobs AS (
        SELECT jobid, jobname, schedule, active, command
        FROM cron.job
      ),
      latest_runs AS (
        SELECT DISTINCT ON (jobid)
          jobid,
          status,
          start_time,
          end_time,
          return_message
        FROM cron.job_run_details
        ORDER BY jobid, start_time DESC NULLS LAST
      ),
      latest_failures AS (
        SELECT DISTINCT ON (jobid)
          jobid,
          status,
          start_time,
          end_time,
          return_message
        FROM cron.job_run_details
        WHERE status IS DISTINCT FROM 'succeeded'
        ORDER BY jobid, start_time DESC NULLS LAST
      ),
      enriched AS (
        SELECT
          e.*,
          j.jobid,
          j.schedule,
          j.active,
          j.command,
          lr.status AS last_run_status,
          lr.start_time AS last_run_at,
          lr.end_time AS last_run_end_at,
          lr.return_message AS last_run_message,
          lf.status AS last_failure_status,
          lf.start_time AS last_failure_at,
          lf.return_message AS last_failure_message,
          CASE e.expected_schedule
            WHEN '* * * * *' THEN date_trunc('minute', $1) + interval '1 minute'
            WHEN '*/5 * * * *' THEN date_trunc('minute', $1) + (
              CASE
                WHEN mod(extract(minute FROM $1)::integer, 5) = 0 THEN 5
                ELSE 5 - mod(extract(minute FROM $1)::integer, 5)
              END || ' minutes'
            )::interval
            ELSE NULL::timestamptz
          END AS next_run_at
        FROM expected e
        LEFT JOIN jobs j ON j.jobname = e.jobname
        LEFT JOIN latest_runs lr ON lr.jobid = j.jobid
        LEFT JOIN latest_failures lf ON lf.jobid = j.jobid
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jobName', jobname,
        'label', label,
        'priority', priority,
        'status', CASE
          WHEN jobid IS NULL THEN 'critical'
          WHEN active IS FALSE THEN 'critical'
          WHEN last_run_status IS DISTINCT FROM 'succeeded' AND last_run_status IS NOT NULL THEN 'critical'
          WHEN last_run_at IS NULL THEN 'watch'
          WHEN expected_schedule = '* * * * *' AND last_run_at < $1 - interval '10 minutes' THEN 'watch'
          WHEN expected_schedule = '*/5 * * * *' AND last_run_at < $1 - interval '30 minutes' THEN 'watch'
          ELSE 'ok'
        END,
        'schedule', COALESCE(schedule, expected_schedule),
        'expectedSchedule', expected_schedule,
        'active', COALESCE(active, false),
        'lastRunAt', last_run_at,
        'lastRunStatus', last_run_status,
        'lastDurationMs', CASE
          WHEN last_run_at IS NULL THEN NULL
          ELSE round(extract(epoch FROM (COALESCE(last_run_end_at, $1) - last_run_at)) * 1000)::integer
        END,
        'nextRunAt', next_run_at,
        'lastFailureAt', last_failure_at,
        'lastError', COALESCE(last_failure_message, last_run_message),
        'message', CASE
          WHEN jobid IS NULL THEN 'Cron job absent de pg_cron.'
          WHEN active IS FALSE THEN 'Cron job present mais inactif.'
          WHEN last_run_status IS DISTINCT FROM 'succeeded' AND last_run_status IS NOT NULL THEN COALESCE(last_run_message, 'Dernier run en echec.')
          WHEN last_run_at IS NULL THEN 'Aucun run connu dans cron.job_run_details.'
          WHEN expected_schedule = '* * * * *' AND last_run_at < $1 - interval '10 minutes' THEN 'Job silencieux depuis plus de 10 minutes.'
          WHEN expected_schedule = '*/5 * * * *' AND last_run_at < $1 - interval '30 minutes' THEN 'Job silencieux depuis plus de 30 minutes.'
          ELSE 'Dernier run reussi.'
        END,
        'actionUrl', action_url,
        'remediation', remediation
      ) ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, jobname), '[]'::jsonb)
      FROM enriched
    $cron$
    INTO v_cron_jobs
    USING v_now;
  ELSIF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $cron$
      WITH expected(jobname, expected_schedule, label, priority, action_url, remediation) AS (
        VALUES
          ('send-email-worker', '* * * * *', 'Emails transactionnels', 'P0', '/admin/notifications', 'Verifier le secret Vault internal_cron_secret et la planification pg_net vers send-email.'),
          ('tok-close-due-match-groups', '* * * * *', 'Cloture Match group', 'P0', '/admin/commandes-reservations', 'Verifier close_due_match_groups et les captures Match group.'),
          ('tok-sync-social-post-promotions', '*/5 * * * *', 'Synchronisation Actualites sponsorisees', 'P1', '/admin/actualites', 'Verifier sync_social_post_promotion_status et les campagnes sponsorisees.')
      ),
      jobs AS (
        SELECT jobid, jobname, schedule, active, command
        FROM cron.job
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jobName', e.jobname,
        'label', e.label,
        'priority', e.priority,
        'status', CASE
          WHEN j.jobid IS NULL THEN 'critical'
          WHEN j.active IS FALSE THEN 'critical'
          ELSE 'watch'
        END,
        'schedule', COALESCE(j.schedule, e.expected_schedule),
        'expectedSchedule', e.expected_schedule,
        'active', COALESCE(j.active, false),
        'lastRunAt', NULL,
        'lastRunStatus', NULL,
        'lastDurationMs', NULL,
        'nextRunAt', CASE e.expected_schedule
          WHEN '* * * * *' THEN date_trunc('minute', $1) + interval '1 minute'
          WHEN '*/5 * * * *' THEN date_trunc('minute', $1) + (
            CASE
              WHEN mod(extract(minute FROM $1)::integer, 5) = 0 THEN 5
              ELSE 5 - mod(extract(minute FROM $1)::integer, 5)
            END || ' minutes'
          )::interval
          ELSE NULL::timestamptz
        END,
        'lastFailureAt', NULL,
        'lastError', NULL,
        'message', CASE
          WHEN j.jobid IS NULL THEN 'Cron job absent de pg_cron.'
          WHEN j.active IS FALSE THEN 'Cron job present mais inactif.'
          ELSE 'cron.job_run_details indisponible, dernier run non observable.'
        END,
        'actionUrl', e.action_url,
        'remediation', e.remediation
      ) ORDER BY CASE e.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, e.jobname), '[]'::jsonb)
      FROM expected e
      LEFT JOIN jobs j ON j.jobname = e.jobname
    $cron$
    INTO v_cron_jobs
    USING v_now;
  ELSE
    WITH expected(jobname, expected_schedule, label, priority, action_url, remediation) AS (
      VALUES
        ('send-email-worker', '* * * * *', 'Emails transactionnels', 'P0', '/admin/notifications', 'Verifier le secret Vault internal_cron_secret et la planification pg_net vers send-email.'),
        ('tok-close-due-match-groups', '* * * * *', 'Cloture Match group', 'P0', '/admin/commandes-reservations', 'Verifier close_due_match_groups et les captures Match group.'),
        ('tok-sync-social-post-promotions', '*/5 * * * *', 'Synchronisation Actualites sponsorisees', 'P1', '/admin/actualites', 'Verifier sync_social_post_promotion_status et les campagnes sponsorisees.')
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'jobName', jobname,
      'label', label,
      'priority', priority,
      'status', 'critical',
      'schedule', expected_schedule,
      'expectedSchedule', expected_schedule,
      'active', false,
      'lastRunAt', NULL,
      'lastRunStatus', NULL,
      'lastDurationMs', NULL,
      'nextRunAt', NULL,
      'lastFailureAt', NULL,
      'lastError', NULL,
      'message', 'Extension pg_cron ou table cron.job indisponible.',
      'actionUrl', action_url,
      'remediation', remediation
    ) ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, jobname), '[]'::jsonb)
    INTO v_cron_jobs
    FROM expected;
  END IF;

  WITH expected(function_name, label, priority, action_url, remediation) AS (
    VALUES
      ('stripe-webhook', 'Stripe webhook', 'P0', '/admin/audit', 'Verifier STRIPE_WEBHOOK_SECRET et les evenements Stripe en echec.'),
      ('create-checkout', 'Creation checkout', 'P0', '/admin/commandes-reservations', 'Verifier STRIPE_SECRET_KEY, les sessions checkout et les paiements refuses.'),
      ('complete-order-checkout', 'Finalisation checkout commande', 'P0', '/admin/commandes-reservations', 'Verifier la reconciliation des commandes apres paiement.'),
      ('dispatch-order', 'Dispatch commande', 'P0', '/admin/commandes-reservations', 'Verifier les livreurs disponibles et les erreurs de dispatch.'),
      ('capture-due-match-groups', 'Capture Match group', 'P0', '/admin/commandes-reservations', 'Verifier les captures Stripe des Match groups.'),
      ('reconcile-match-group-authorizations', 'Rapprochement Match group', 'P1', '/admin/commandes-reservations', 'Verifier les autorisations Stripe Match group.'),
      ('campaign-portal', 'Portail campagnes Stripe', 'P1', '/admin/actualites', 'Verifier les campagnes sponsorisees et les liens portail.'),
      ('notification-dispatch', 'Dispatch notifications', 'P1', '/admin/notifications', 'Verifier les envois push/email planifies.'),
      ('send-email', 'Envoi emails', 'P1', '/admin/notifications', 'Verifier la file email et le provider transactionnel.'),
      ('validate-order', 'Validation commande', 'P1', '/admin/commandes-reservations', 'Verifier les transitions de statut commande.')
  ),
  logs AS (
    SELECT
      function_name,
      COUNT(*)::integer AS total_24h,
      COUNT(*) FILTER (WHERE status = 'success')::integer AS success_24h,
      COUNT(*) FILTER (WHERE status = 'failure')::integer AS failures_24h,
      MAX(created_at) FILTER (WHERE status = 'success') AS last_success_at,
      MAX(created_at) FILTER (WHERE status = 'failure') AS last_failure_at
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_now - interval '24 hours'
    GROUP BY function_name
  ),
  latest_failures AS (
    SELECT DISTINCT ON (function_name)
      function_name,
      error_message,
      created_at
    FROM public.edge_function_audit_logs
    WHERE status = 'failure'
      AND created_at >= v_now - interval '24 hours'
    ORDER BY function_name, created_at DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'functionName', e.function_name,
    'label', e.label,
    'priority', e.priority,
    'status', CASE
      WHEN COALESCE(l.failures_24h, 0) > 0 AND e.priority = 'P0' THEN 'critical'
      WHEN COALESCE(l.failures_24h, 0) > 0 THEN 'watch'
      WHEN COALESCE(l.total_24h, 0) = 0 THEN 'watch'
      ELSE 'ok'
    END,
    'total24h', COALESCE(l.total_24h, 0),
    'success24h', COALESCE(l.success_24h, 0),
    'failures24h', COALESCE(l.failures_24h, 0),
    'failureRate', CASE
      WHEN COALESCE(l.total_24h, 0) = 0 THEN NULL
      ELSE round((COALESCE(l.failures_24h, 0)::numeric / GREATEST(l.total_24h, 1)::numeric) * 100, 2)
    END,
    'lastSuccessAt', l.last_success_at,
    'lastFailureAt', l.last_failure_at,
    'lastError', lf.error_message,
    'message', CASE
      WHEN COALESCE(l.failures_24h, 0) > 0 THEN COALESCE(lf.error_message, 'Echecs recents a investiguer.')
      WHEN COALESCE(l.total_24h, 0) = 0 THEN 'Aucune execution auditee sur les 24 dernieres heures.'
      ELSE 'Executions recentes sans echec.'
    END,
    'actionUrl', e.action_url,
    'remediation', e.remediation
  ) ORDER BY CASE e.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, e.function_name), '[]'::jsonb)
  INTO v_edge_functions
  FROM expected e
  LEFT JOIN logs l ON l.function_name = e.function_name
  LEFT JOIN latest_failures lf ON lf.function_name = e.function_name;

  WITH stripe_logs AS (
    SELECT
      COUNT(*)::integer AS total_24h,
      COUNT(*) FILTER (WHERE status = 'success')::integer AS success_24h,
      COUNT(*) FILTER (WHERE status = 'failure')::integer AS failures_24h,
      COUNT(*) FILTER (
        WHERE action ILIKE '%ignored%'
           OR request_metadata->>'ignored' = 'true'
           OR request_metadata->>'reason' ILIKE '%ignored%'
      )::integer AS ignored_24h,
      MAX(created_at) FILTER (WHERE status = 'success') AS last_success_at,
      MAX(created_at) FILTER (WHERE status = 'failure') AS last_failure_at
    FROM public.edge_function_audit_logs
    WHERE function_name = 'stripe-webhook'
      AND created_at >= v_now - interval '24 hours'
  ),
  latest_failure AS (
    SELECT error_message
    FROM public.edge_function_audit_logs
    WHERE function_name = 'stripe-webhook'
      AND status = 'failure'
      AND created_at >= v_now - interval '24 hours'
    ORDER BY created_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN stripe_logs.failures_24h > 0 THEN 'critical'
      WHEN stripe_logs.success_24h = 0 THEN 'watch'
      ELSE 'ok'
    END,
    'total24h', stripe_logs.total_24h,
    'success24h', stripe_logs.success_24h,
    'failures24h', stripe_logs.failures_24h,
    'ignored24h', stripe_logs.ignored_24h,
    'failureRate', CASE
      WHEN stripe_logs.total_24h = 0 THEN NULL
      ELSE round((stripe_logs.failures_24h::numeric / GREATEST(stripe_logs.total_24h, 1)::numeric) * 100, 2)
    END,
    'lastSuccessAt', stripe_logs.last_success_at,
    'lastFailureAt', stripe_logs.last_failure_at,
    'lastError', latest_failure.error_message,
    'message', CASE
      WHEN stripe_logs.failures_24h > 0 THEN COALESCE(latest_failure.error_message, 'Webhooks Stripe en echec sur les 24 dernieres heures.')
      WHEN stripe_logs.success_24h = 0 THEN 'Aucun webhook Stripe reussi sur les 24 dernieres heures.'
      ELSE 'Webhooks Stripe recus sans echec recent.'
    END,
    'actionUrl', '/admin/audit'
  )
  INTO v_stripe
  FROM stripe_logs
  LEFT JOIN latest_failure ON true;

  v_payment_integrity := public.get_payment_integrity_anomalies(48);
  v_payment_integrity := COALESCE(v_payment_integrity, '{}'::jsonb) || jsonb_build_object(
    'status', CASE
      WHEN COALESCE((v_payment_integrity->>'critical')::integer, 0) > 0 THEN 'critical'
      WHEN COALESCE((v_payment_integrity->>'total')::integer, 0) > 0 THEN 'watch'
      ELSE 'ok'
    END,
    'message', CASE
      WHEN COALESCE((v_payment_integrity->>'critical')::integer, 0) > 0 THEN 'Anomalies paiement critiques detectees.'
      WHEN COALESCE((v_payment_integrity->>'total')::integer, 0) > 0 THEN 'Anomalies paiement a verifier.'
      ELSE 'Aucune anomalie paiement detectee.'
    END,
    'actionUrl', '/admin/audit'
  );

  WITH config_signals AS (
    SELECT
      MAX(created_at) FILTER (WHERE function_name = 'stripe-webhook' AND status = 'success') AS stripe_webhook_success_at,
      MAX(created_at) FILTER (WHERE function_name IN ('stripe-webhook', 'create-checkout', 'complete-order-checkout') AND status = 'success') AS stripe_runtime_success_at,
      BOOL_OR(
        status = 'failure'
        AND (
          error_message ILIKE '%STRIPE_WEBHOOK_SECRET%'
          OR error_message ILIKE '%webhook secret%'
          OR error_message ILIKE '%signature%'
        )
      ) AS stripe_webhook_config_error,
      BOOL_OR(
        status = 'failure'
        AND (
          error_message ILIKE '%STRIPE_SECRET_KEY%'
          OR error_message ILIKE '%stripe secret%'
          OR error_message ILIKE '%not configured%'
        )
      ) AS stripe_runtime_config_error,
      BOOL_OR(
        status = 'failure'
        AND (
          error_message ILIKE '%SUPABASE_URL%'
          OR error_message ILIKE '%SUPABASE_SERVICE_ROLE_KEY%'
          OR error_message ILIKE '%supabase%'
        )
      ) AS supabase_config_error,
      BOOL_OR(
        status = 'failure'
        AND (
          error_message ILIKE '%VERCEL%'
          OR error_message ILIKE '%APP_URL%'
          OR error_message ILIKE '%SITE_URL%'
        )
      ) AS vercel_config_error
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_now - interval '24 hours'
  ),
  checks AS (
    SELECT
      'supabase_url'::text AS key,
      'Supabase URL / service role'::text AS label,
      CASE WHEN COALESCE(supabase_config_error, false) THEN 'critical' ELSE 'ok' END AS status,
      CASE
        WHEN COALESCE(supabase_config_error, false) THEN 'Erreur de configuration Supabase detectee dans les logs Edge.'
        ELSE 'Aucune erreur Supabase critique detectee dans les logs Edge 24h.'
      END AS message,
      '/admin/audit'::text AS action_url,
      'logs-edge'::text AS source
    FROM config_signals
    UNION ALL
    SELECT
      'stripe_secret_key',
      'Stripe Secret Key',
      CASE
        WHEN COALESCE(stripe_runtime_config_error, false) THEN 'critical'
        WHEN stripe_runtime_success_at IS NULL THEN 'watch'
        ELSE 'ok'
      END,
      CASE
        WHEN COALESCE(stripe_runtime_config_error, false) THEN 'Erreur de configuration Stripe detectee dans les logs Edge.'
        WHEN stripe_runtime_success_at IS NULL THEN 'Aucune execution Stripe reussie observee sur les 24 dernieres heures.'
        ELSE 'Executions Stripe recentes observees.'
      END,
      '/admin/audit',
      'logs-edge'
    FROM config_signals
    UNION ALL
    SELECT
      'stripe_webhook_secret',
      'Stripe webhook secret',
      CASE
        WHEN COALESCE(stripe_webhook_config_error, false) THEN 'critical'
        WHEN stripe_webhook_success_at IS NULL THEN 'watch'
        ELSE 'ok'
      END,
      CASE
        WHEN COALESCE(stripe_webhook_config_error, false) THEN 'Erreur de signature ou secret webhook detectee.'
        WHEN stripe_webhook_success_at IS NULL THEN 'Aucun webhook Stripe reussi observe sur les 24 dernieres heures.'
        ELSE 'Webhooks Stripe signes et traites recemment.'
      END,
      '/admin/audit',
      'logs-edge'
    FROM config_signals
    UNION ALL
    SELECT
      'internal_cron_secret',
      'Internal cron secret',
      CASE
        WHEN v_internal_cron_secret_observable AND COALESCE(v_internal_cron_secret_present, false) THEN 'ok'
        WHEN v_internal_cron_secret_observable THEN 'critical'
        ELSE 'watch'
      END,
      CASE
        WHEN v_internal_cron_secret_observable AND COALESCE(v_internal_cron_secret_present, false) THEN 'Secret Vault internal_cron_secret present.'
        WHEN v_internal_cron_secret_observable THEN 'Secret Vault internal_cron_secret absent ou vide.'
        ELSE 'Vault non observable par ce RPC, verification manuelle requise.'
      END,
      '/admin/notifications',
      CASE WHEN v_internal_cron_secret_observable THEN 'vault' ELSE 'manual' END
    UNION ALL
    SELECT
      'vercel_environment',
      'Variables Vercel production',
      CASE WHEN COALESCE(vercel_config_error, false) THEN 'critical' ELSE 'ok' END,
      CASE
        WHEN COALESCE(vercel_config_error, false) THEN 'Erreur Vercel/App URL detectee dans les logs Edge.'
        ELSE 'Aucune erreur Vercel/App URL detectee dans les logs Edge 24h.'
      END,
      '/admin/audit',
      'logs-edge'
    FROM config_signals
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', key,
    'label', label,
    'status', status,
    'message', message,
    'actionUrl', action_url,
    'source', source
  ) ORDER BY CASE status WHEN 'critical' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END, key), '[]'::jsonb)
  INTO v_configuration
  FROM checks;

  SELECT jsonb_build_object(
    'status', CASE
      WHEN snapshot.id IS NULL THEN 'watch'
      WHEN snapshot.error_count > 0 THEN 'critical'
      WHEN snapshot.captured_at < v_now - interval '24 hours' THEN 'watch'
      WHEN snapshot.warning_count > 0 THEN 'watch'
      ELSE 'ok'
    END,
    'capturedAt', snapshot.captured_at,
    'source', snapshot.source,
    'total', COALESCE(snapshot.total_count, 0),
    'critical', COALESCE(snapshot.error_count, 0),
    'warning', COALESCE(snapshot.warning_count, 0),
    'security', COALESCE(snapshot.security_count, 0),
    'performance', COALESCE(snapshot.performance_count, 0),
    'items', COALESCE(snapshot.advisors, '[]'::jsonb),
    'message', CASE
      WHEN snapshot.id IS NULL THEN 'Aucun snapshot Supabase advisors synchronise.'
      WHEN snapshot.error_count > 0 THEN 'Advisors Supabase critiques synchronises.'
      WHEN snapshot.captured_at < v_now - interval '24 hours' THEN 'Snapshot Supabase advisors plus ancien que 24h.'
      WHEN snapshot.warning_count > 0 THEN 'Warnings Supabase advisors synchronises.'
      ELSE 'Aucun advisor Supabase ouvert dans le dernier snapshot.'
    END,
    'actionUrl', '/admin/audit'
  )
  INTO v_advisors
  FROM (
    SELECT *
    FROM public.admin_supabase_advisor_snapshots
    ORDER BY captured_at DESC
    LIMIT 1
  ) snapshot
  RIGHT JOIN (SELECT 1 AS keep_row) keep_row ON true;

  WITH health_items AS (
    SELECT 'cron'::text AS source, item
    FROM jsonb_array_elements(COALESCE(v_cron_jobs, '[]'::jsonb)) AS item
    UNION ALL
    SELECT 'edge', item
    FROM jsonb_array_elements(COALESCE(v_edge_functions, '[]'::jsonb)) AS item
    UNION ALL
    SELECT 'configuration', item
    FROM jsonb_array_elements(COALESCE(v_configuration, '[]'::jsonb)) AS item
    UNION ALL
    SELECT 'stripe', jsonb_build_object(
      'label', 'Stripe webhook',
      'priority', 'P0',
      'status', COALESCE(v_stripe->>'status', 'watch'),
      'message', COALESCE(v_stripe->>'message', 'Stripe webhook non observable.'),
      'actionUrl', '/admin/audit'
    )
    UNION ALL
    SELECT 'payments', jsonb_build_object(
      'label', 'Integrite paiements',
      'priority', 'P0',
      'status', COALESCE(v_payment_integrity->>'status', 'watch'),
      'message', COALESCE(v_payment_integrity->>'message', 'Anomalies paiement non observables.'),
      'actionUrl', '/admin/audit'
    )
    UNION ALL
    SELECT 'advisors', jsonb_build_object(
      'label', 'Supabase advisors',
      'priority', 'P1',
      'status', COALESCE(v_advisors->>'status', 'watch'),
      'message', COALESCE(v_advisors->>'message', 'Advisors Supabase non synchronises.'),
      'actionUrl', '/admin/audit'
    )
  ),
  counted AS (
    SELECT
      COUNT(*) FILTER (WHERE item->>'status' = 'critical')::integer AS critical_count,
      COUNT(*) FILTER (WHERE item->>'status' = 'watch')::integer AS watch_count,
      COUNT(*) FILTER (WHERE item->>'status' = 'ok')::integer AS ok_count
    FROM health_items
  ),
  ranked_alerts AS (
    SELECT source, item
    FROM health_items
    WHERE item->>'status' IN ('critical', 'watch')
    ORDER BY
      CASE item->>'status' WHEN 'critical' THEN 0 ELSE 1 END,
      CASE item->>'priority' WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
      item->>'label'
    LIMIT 10
  )
  SELECT
    counted.critical_count,
    counted.watch_count,
    counted.ok_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'source', ranked_alerts.source,
      'label', COALESCE(ranked_alerts.item->>'label', ranked_alerts.item->>'jobName', ranked_alerts.item->>'functionName', ranked_alerts.item->>'key'),
      'status', ranked_alerts.item->>'status',
      'priority', COALESCE(ranked_alerts.item->>'priority', 'P2'),
      'message', ranked_alerts.item->>'message',
      'actionUrl', ranked_alerts.item->>'actionUrl'
    ) ORDER BY
      CASE ranked_alerts.item->>'status' WHEN 'critical' THEN 0 ELSE 1 END,
      CASE ranked_alerts.item->>'priority' WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END
    ) FILTER (WHERE ranked_alerts.item IS NOT NULL), '[]'::jsonb)
  INTO v_critical_count, v_watch_count, v_ok_count, v_alerts
  FROM counted
  LEFT JOIN ranked_alerts ON true
  GROUP BY counted.critical_count, counted.watch_count, counted.ok_count;

  v_status := CASE
    WHEN COALESCE(v_critical_count, 0) > 0 THEN 'critical'
    WHEN COALESCE(v_watch_count, 0) > 0 THEN 'watch'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'checkedAt', v_now,
    'status', v_status,
    'score', CASE
      WHEN v_status = 'critical' THEN 0
      WHEN v_status = 'watch' THEN 65
      ELSE 100
    END,
    'counts', jsonb_build_object(
      'critical', COALESCE(v_critical_count, 0),
      'watch', COALESCE(v_watch_count, 0),
      'ok', COALESCE(v_ok_count, 0),
      'cronJobs', COALESCE(jsonb_array_length(v_cron_jobs), 0),
      'edgeFunctions', COALESCE(jsonb_array_length(v_edge_functions), 0),
      'paymentAnomalies', COALESCE((v_payment_integrity->>'total')::integer, 0),
      'advisorWarnings', COALESCE((v_advisors->>'warning')::integer, 0)
    ),
    'alerts', COALESCE(v_alerts, '[]'::jsonb),
    'cron', jsonb_build_object(
      'status', CASE
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_cron_jobs) item WHERE item->>'status' = 'critical') THEN 'critical'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_cron_jobs) item WHERE item->>'status' = 'watch') THEN 'watch'
        ELSE 'ok'
      END,
      'jobs', COALESCE(v_cron_jobs, '[]'::jsonb)
    ),
    'edgeFunctions', jsonb_build_object(
      'status', CASE
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_edge_functions) item WHERE item->>'status' = 'critical') THEN 'critical'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_edge_functions) item WHERE item->>'status' = 'watch') THEN 'watch'
        ELSE 'ok'
      END,
      'functions', COALESCE(v_edge_functions, '[]'::jsonb)
    ),
    'stripe', COALESCE(v_stripe, '{}'::jsonb),
    'paymentIntegrity', COALESCE(v_payment_integrity, '{}'::jsonb),
    'configuration', jsonb_build_object(
      'status', CASE
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_configuration) item WHERE item->>'status' = 'critical') THEN 'critical'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_configuration) item WHERE item->>'status' = 'watch') THEN 'watch'
        ELSE 'ok'
      END,
      'checks', COALESCE(v_configuration, '[]'::jsonb)
    ),
    'advisors', COALESCE(v_advisors, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_production_health() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
