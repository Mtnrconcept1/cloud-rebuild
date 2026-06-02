-- 10k reliability hardening: paid checkout reconciliation, reservation
-- diagnostics and production health coverage. Production execution remains
-- owned by the GitHub Deploy Production workflow.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE INDEX IF NOT EXISTS idx_reservations_active_slot_capacity_10k
  ON public.reservations (restaurant_id, date, time, status)
  WHERE lower(COALESCE(status, '')) IN ('pending', 'confirmed', 'arrived', 'seated');

CREATE INDEX IF NOT EXISTS idx_reservations_active_user_slot_10k
  ON public.reservations (user_id, restaurant_id, date, time)
  WHERE lower(COALESCE(status, '')) IN ('pending', 'confirmed', 'arrived', 'seated');

CREATE INDEX IF NOT EXISTS idx_reservation_slots_table_reservation_10k
  ON public.reservation_slots (table_id, reservation_id);

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS deposit_amount_chf numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS restaurant_confirmation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restaurant_confirmed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reservations_deposit_status_check'
  ) THEN
    ALTER TABLE public.reservations
      ADD CONSTRAINT reservations_deposit_status_check
      CHECK (deposit_status IN ('not_required', 'pending', 'paid', 'refunded', 'forfeited'));
  END IF;
END;
$$;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_cron_secret'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent : tok-reconcile-paid-order-checkouts non planifie.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('tok-reconcile-paid-order-checkouts') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'tok-reconcile-paid-order-checkouts'
  );

  PERFORM cron.schedule('tok-reconcile-paid-order-checkouts', '*/5 * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-internal-cron-secret', %L),
      body := '{"source":"cron","limit":50,"hours":72}'::jsonb
    );
  $cron$, v_base || '/reconcile-paid-order-checkouts', v_secret));
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
  v_checkout_reconciliation jsonb := '{}'::jsonb;
  v_notification_queue jsonb := '{}'::jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_status text := 'ok';
  v_critical_count integer := 0;
  v_watch_count integer := 0;
  v_ok_count integer := 0;
  v_internal_cron_secret_present boolean := NULL;
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
          ('send-email-worker', '* * * * *', 'Emails transactionnels', 'P0', '/admin/notifications', 'Verifier la file email et le secret Vault internal_cron_secret.'),
          ('tok-close-due-match-groups', '* * * * *', 'Cloture Match group', 'P0', '/admin/commandes-reservations', 'Verifier close_due_match_groups et les captures Match group.'),
          ('tok-sync-social-post-promotions', '*/5 * * * *', 'Synchronisation Actualites sponsorisees', 'P1', '/admin/actualites', 'Verifier sync_social_post_promotion_status.'),
          ('tok-reconcile-paid-order-checkouts', '*/5 * * * *', 'Reconciliation commandes payees', 'P0', '/admin/commandes-reservations', 'Verifier les commandes pending_payment avec session Stripe payee.')
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
          start_time,
          return_message
        FROM cron.job_run_details
        WHERE status IS DISTINCT FROM 'succeeded'
        ORDER BY jobid, start_time DESC NULLS LAST
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jobName', e.jobname,
        'label', e.label,
        'priority', e.priority,
        'status', CASE
          WHEN j.jobid IS NULL THEN 'critical'
          WHEN j.active IS FALSE THEN 'critical'
          WHEN lr.status IS DISTINCT FROM 'succeeded' AND lr.status IS NOT NULL THEN 'critical'
          WHEN lr.start_time IS NULL THEN 'watch'
          WHEN e.expected_schedule = '* * * * *' AND lr.start_time < $1 - interval '10 minutes' THEN 'watch'
          WHEN e.expected_schedule = '*/5 * * * *' AND lr.start_time < $1 - interval '30 minutes' THEN 'watch'
          ELSE 'ok'
        END,
        'schedule', COALESCE(j.schedule, e.expected_schedule),
        'expectedSchedule', e.expected_schedule,
        'active', COALESCE(j.active, false),
        'lastRunAt', lr.start_time,
        'lastRunStatus', lr.status,
        'lastDurationMs', CASE
          WHEN lr.start_time IS NULL THEN NULL
          ELSE round(extract(epoch FROM (COALESCE(lr.end_time, $1) - lr.start_time)) * 1000)::integer
        END,
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
        'lastFailureAt', lf.start_time,
        'lastError', COALESCE(lf.return_message, lr.return_message),
        'message', CASE
          WHEN j.jobid IS NULL THEN 'Cron job absent de pg_cron.'
          WHEN j.active IS FALSE THEN 'Cron job present mais inactif.'
          WHEN lr.status IS DISTINCT FROM 'succeeded' AND lr.status IS NOT NULL THEN COALESCE(lr.return_message, 'Dernier run en echec.')
          WHEN lr.start_time IS NULL THEN 'Aucun run connu dans cron.job_run_details.'
          ELSE 'Dernier run reussi.'
        END,
        'actionUrl', e.action_url,
        'remediation', e.remediation
      ) ORDER BY CASE e.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, e.jobname), '[]'::jsonb)
      FROM expected e
      LEFT JOIN cron.job j ON j.jobname = e.jobname
      LEFT JOIN latest_runs lr ON lr.jobid = j.jobid
      LEFT JOIN latest_failures lf ON lf.jobid = j.jobid
    $cron$
    INTO v_cron_jobs
    USING v_now;
  ELSE
    WITH expected(jobname, expected_schedule, label, priority, action_url, remediation) AS (
      VALUES
        ('send-email-worker', '* * * * *', 'Emails transactionnels', 'P0', '/admin/notifications', 'Verifier la file email et le secret Vault internal_cron_secret.'),
        ('tok-close-due-match-groups', '* * * * *', 'Cloture Match group', 'P0', '/admin/commandes-reservations', 'Verifier close_due_match_groups et les captures Match group.'),
        ('tok-sync-social-post-promotions', '*/5 * * * *', 'Synchronisation Actualites sponsorisees', 'P1', '/admin/actualites', 'Verifier sync_social_post_promotion_status.'),
        ('tok-reconcile-paid-order-checkouts', '*/5 * * * *', 'Reconciliation commandes payees', 'P0', '/admin/commandes-reservations', 'Verifier les commandes pending_payment avec session Stripe payee.')
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
      'message', 'Extension pg_cron ou table cron.job_run_details indisponible.',
      'actionUrl', action_url,
      'remediation', remediation
    ) ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, jobname), '[]'::jsonb)
    INTO v_cron_jobs
    FROM expected;
  END IF;

  WITH expected(function_name, label, priority, action_url, remediation) AS (
    VALUES
      ('stripe-webhook', 'Stripe webhook', 'P0', '/admin/audit', 'Verifier STRIPE_WEBHOOK_SECRET et les evenements Stripe en echec.'),
      ('create-checkout', 'Creation checkout', 'P0', '/admin/commandes-reservations', 'Verifier STRIPE_SECRET_KEY, sessions checkout et rate limits.'),
      ('complete-order-checkout', 'Finalisation checkout commande', 'P0', '/admin/commandes-reservations', 'Verifier la finalisation client apres paiement.'),
      ('reconcile-paid-order-checkouts', 'Reconciliation commandes payees', 'P0', '/admin/commandes-reservations', 'Verifier les commandes payees non finalisees et notifications restaurant.'),
      ('dispatch-order', 'Dispatch commande', 'P0', '/admin/commandes-reservations', 'Verifier les livreurs disponibles et les erreurs de dispatch.'),
      ('capture-due-match-groups', 'Capture Match group', 'P0', '/admin/commandes-reservations', 'Verifier les captures Stripe Match groups.'),
      ('reconcile-match-group-authorizations', 'Rapprochement Match group', 'P1', '/admin/commandes-reservations', 'Verifier les autorisations Stripe Match group.'),
      ('campaign-portal', 'Portail campagnes Stripe', 'P1', '/admin/actualites', 'Verifier les campagnes sponsorisees et les liens portail.'),
      ('notification-dispatch', 'Dispatch notifications', 'P1', '/admin/notifications', 'Verifier les envois push/email planifies.'),
      ('send-email', 'Envoi emails', 'P1', '/admin/notifications', 'Verifier la file email et le provider transactionnel.'),
      ('send-push', 'Envoi push', 'P1', '/admin/notifications', 'Verifier les notifications push transactionnelles.'),
      ('validate-order', 'Validation commande', 'P1', '/admin/commandes-reservations', 'Verifier pricing, creation commande et rate limits.')
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
    'ignored24h', 0,
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

  WITH pending_paid AS (
    SELECT
      o.id,
      o.order_number,
      o.restaurant_id,
      o.updated_at,
      o.metadata->>'stripe_session_id' AS stripe_session_id
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) = 'pending_payment'
      AND NULLIF(o.metadata->>'stripe_session_id', '') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.payment_transactions pt
        WHERE pt.type = 'charge'
          AND pt.status = 'succeeded'
          AND (
            pt.order_id = o.id
            OR pt.stripe_checkout_session_id = o.metadata->>'stripe_session_id'
          )
      )
    ORDER BY o.updated_at DESC
    LIMIT 25
  )
  SELECT jsonb_build_object(
    'status', CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END,
    'pendingPaidOrders', COUNT(*)::integer,
    'items', COALESCE(jsonb_agg(jsonb_build_object(
      'orderId', id,
      'orderNumber', order_number,
      'restaurantId', restaurant_id,
      'stripeSessionId', stripe_session_id,
      'updatedAt', updated_at
    )) FILTER (WHERE id IS NOT NULL), '[]'::jsonb),
    'message', CASE
      WHEN COUNT(*) > 0 THEN 'Commandes payees detectees sans finalisation restaurant.'
      ELSE 'Aucune commande payee non finalisee detectee.'
    END,
    'actionUrl', '/admin/commandes-reservations'
  )
  INTO v_checkout_reconciliation
  FROM pending_paid;

  WITH deliveries AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('queued', 'pending'))::integer AS queued,
      COUNT(*) FILTER (WHERE status IN ('failed', 'error'))::integer AS failed
    FROM public.notification_deliveries
    WHERE created_at >= v_now - interval '24 hours'
  ),
  emails AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('queued', 'pending'))::integer AS queued,
      COUNT(*) FILTER (WHERE status IN ('failed', 'error'))::integer AS failed
    FROM public.email_queue
    WHERE created_at >= v_now - interval '24 hours'
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN (deliveries.failed + emails.failed) > 0 THEN 'watch'
      WHEN (deliveries.queued + emails.queued) > 250 THEN 'watch'
      ELSE 'ok'
    END,
    'queuedDeliveries24h', deliveries.queued,
    'failedDeliveries24h', deliveries.failed,
    'queuedEmails24h', emails.queued,
    'failedEmails24h', emails.failed,
    'message', CASE
      WHEN (deliveries.failed + emails.failed) > 0 THEN 'Notifications transactionnelles en echec a surveiller.'
      WHEN (deliveries.queued + emails.queued) > 250 THEN 'Backlog notifications eleve.'
      ELSE 'File notifications transactionnelles sans backlog critique.'
    END,
    'actionUrl', '/admin/notifications'
  )
  INTO v_notification_queue
  FROM deliveries, emails;

  WITH config_signals AS (
    SELECT
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
      ) AS supabase_config_error
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
      CASE WHEN COALESCE(stripe_runtime_config_error, false) THEN 'critical' ELSE 'ok' END,
      CASE
        WHEN COALESCE(stripe_runtime_config_error, false) THEN 'Erreur de configuration Stripe detectee dans les logs Edge.'
        ELSE 'Aucune erreur Stripe runtime detectee dans les logs Edge 24h.'
      END,
      '/admin/audit',
      'logs-edge'
    FROM config_signals
    UNION ALL
    SELECT
      'stripe_webhook_secret',
      'Stripe webhook secret',
      CASE WHEN COALESCE(stripe_webhook_config_error, false) THEN 'critical' ELSE 'ok' END,
      CASE
        WHEN COALESCE(stripe_webhook_config_error, false) THEN 'Erreur de signature ou secret webhook detectee.'
        ELSE 'Aucune erreur webhook Stripe detectee dans les logs Edge 24h.'
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

  IF to_regclass('public.admin_supabase_advisor_snapshots') IS NOT NULL THEN
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
  ELSE
    v_advisors := jsonb_build_object(
      'status', 'watch',
      'capturedAt', NULL,
      'source', NULL,
      'total', 0,
      'critical', 0,
      'warning', 0,
      'security', 0,
      'performance', 0,
      'items', '[]'::jsonb,
      'message', 'Table admin_supabase_advisor_snapshots non observable.',
      'actionUrl', '/admin/audit'
    );
  END IF;

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
    SELECT 'checkout_reconciliation', jsonb_build_object(
      'label', 'Commandes payees non finalisees',
      'priority', 'P0',
      'status', COALESCE(v_checkout_reconciliation->>'status', 'watch'),
      'message', COALESCE(v_checkout_reconciliation->>'message', 'Reconciliation checkout non observable.'),
      'actionUrl', '/admin/commandes-reservations'
    )
    UNION ALL
    SELECT 'notifications', jsonb_build_object(
      'label', 'Notifications transactionnelles',
      'priority', 'P1',
      'status', COALESCE(v_notification_queue->>'status', 'watch'),
      'message', COALESCE(v_notification_queue->>'message', 'File notifications non observable.'),
      'actionUrl', '/admin/notifications'
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
      'paidOrdersNotFinalized', COALESCE((v_checkout_reconciliation->>'pendingPaidOrders')::integer, 0),
      'notificationBacklog', COALESCE((v_notification_queue->>'queuedDeliveries24h')::integer, 0) + COALESCE((v_notification_queue->>'queuedEmails24h')::integer, 0),
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
    'checkoutReconciliation', COALESCE(v_checkout_reconciliation, '{}'::jsonb),
    'notificationQueue', COALESCE(v_notification_queue, '{}'::jsonb),
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

REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_production_health() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
