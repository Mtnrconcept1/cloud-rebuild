-- Resolve the production-health incidents at their source and make the
-- dashboard distinguish active incidents, recovered incidents and idle jobs.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM vault.decrypted_secrets
       WHERE name = 'internal_cron_secret'
         AND NULLIF(decrypted_secret, '') IS NOT NULL
     ) THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'internal_cron_secret',
      'TOK internal pg_cron to Edge Function authentication'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_internal_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault
AS $$
DECLARE
  v_matches boolean := false;
BEGIN
  IF NULLIF(p_secret, '') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'internal_cron_secret'
      AND NULLIF(decrypted_secret, '') IS NOT NULL
      AND sha256(convert_to(decrypted_secret, 'UTF8')) = sha256(convert_to(p_secret, 'UTF8'))
  )
  INTO v_matches;

  RETURN COALESCE(v_matches, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_internal_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_cron_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_stripe_webhook_signing_secrets()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_secrets text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('stripe._managed_webhooks') IS NULL THEN
    RETURN v_secrets;
  END IF;

  EXECUTE $sql$
    SELECT COALESCE(array_agg(DISTINCT secret), ARRAY[]::text[])
    FROM stripe._managed_webhooks
    WHERE (enabled IS TRUE OR status = 'enabled')
      AND rtrim(url, '/') LIKE '%/functions/v1/stripe-webhook'
      AND NULLIF(secret, '') IS NOT NULL
      AND secret LIKE 'whsec\_%' ESCAPE '\'
  $sql$
  INTO v_secrets;

  RETURN COALESCE(v_secrets, ARRAY[]::text[]);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_stripe_webhook_signing_secrets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stripe_webhook_signing_secrets() TO service_role;

-- Guest/system orders can legitimately have no user_id. Their status still
-- needs to move forward, but a user notification cannot be enqueued because
-- notifications.user_id is NOT NULL.
DROP TRIGGER IF EXISTS after_order_status_update ON public.orders;
CREATE TRIGGER after_order_status_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.trigger_order_status_notification();

-- Close abandoned online-card orders that never reached Stripe. Cash orders
-- and stock-bearing special offers are deliberately excluded.
UPDATE public.orders
SET
  status = 'payment_failed',
  payment_status = 'failed',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'checkout_session_state', 'expired',
    'checkout_expired_at', now(),
    'checkout_expiry_reason', 'stripe_session_not_created'
  ),
  updated_at = now()
WHERE created_at < now() - interval '48 hours'
  AND COALESCE(total_amount, 0) > 0
  AND lower(COALESCE(metadata->>'payment_method', '')) IN ('card', 'twint', 'postfinance_card', 'postfinance_efinance')
  AND lower(COALESCE(metadata->>'checkout_kind', 'order')) = 'order'
  AND lower(COALESCE(status, '')) IN ('pending', 'pending_payment')
  AND lower(COALESCE(payment_status, '')) IN ('pending', 'pending_payment', 'requires_payment')
  AND NULLIF(metadata->>'stripe_session_id', '') IS NULL
  AND NULLIF(metadata->>'checkout_session_id', '') IS NULL
  AND COALESCE(metadata->>'has_anti_gaspi', 'false') <> 'true'
  AND COALESCE(metadata->>'has_flash_sale', 'false') <> 'true'
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_transactions transaction
    WHERE transaction.order_id = orders.id
      AND transaction.type = 'charge'
      AND transaction.status = 'succeeded'
  );

-- Paid campaigns that reached their end date are not payment incidents.
UPDATE public.ad_campaigns
SET status = 'paused', updated_at = now()
WHERE status = 'active'
  AND ends_at IS NOT NULL
  AND ends_at <= now();

-- Queued pushes cannot be delivered when the recipient has no enabled token.
-- Mark them as skipped rather than retaining a false provider outage backlog.
UPDATE public.notification_deliveries AS delivery
SET status = 'skipped', last_error = 'No active device tokens'
FROM public.notifications AS notification
WHERE delivery.notification_id = notification.id
  AND delivery.channel = 'push'
  AND delivery.status IN ('queued', 'pending')
  AND NOT EXISTS (
    SELECT 1
    FROM public.device_tokens token
    WHERE token.user_id = notification.user_id
      AND token.enabled = true
  );

DO $$
DECLARE
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'pg_cron or Vault is unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'internal_cron_secret was not provisioned';
  END IF;

  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'send-email-worker',
    'send-push-worker',
    'tok-reconcile-paid-order-checkouts',
    'tok-reconcile-match-group-authorizations',
    'tok-capture-due-match-groups'
  );

  PERFORM cron.schedule('send-email-worker', '* * * * *', format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
          ORDER BY updated_at DESC LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$, v_base || '/send-email'));

  PERFORM cron.schedule('send-push-worker', '*/5 * * * *', format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
          ORDER BY updated_at DESC LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$, v_base || '/send-push'));

  PERFORM cron.schedule('tok-reconcile-paid-order-checkouts', '*/5 * * * *', format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
          ORDER BY updated_at DESC LIMIT 1
        )
      ),
      body := '{"source":"cron","limit":50,"hours":72}'::jsonb
    );
  $job$, v_base || '/reconcile-paid-order-checkouts'));

  PERFORM cron.schedule('tok-reconcile-match-group-authorizations', '*/5 * * * *', format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
          ORDER BY updated_at DESC LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$, v_base || '/reconcile-match-group-authorizations'));

  PERFORM cron.schedule('tok-capture-due-match-groups', '*/5 * * * *', format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-cron-secret', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
          ORDER BY updated_at DESC LIMIT 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$, v_base || '/capture-due-match-groups'));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_integrity_anomalies(p_hours integer DEFAULT 48)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hours integer := GREATEST(1, LEAST(COALESCE(p_hours, 48), 720));
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(COALESCE(p_hours, 48), 720)));
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH stale_pending_orders AS (
    SELECT jsonb_build_object(
      'kind', 'stale_pending_order',
      'severity', 'high',
      'order_id', o.id,
      'order_number', o.order_number,
      'restaurant_id', o.restaurant_id,
      'user_id', o.user_id,
      'status', o.status,
      'payment_status', o.payment_status,
      'stripe_session_id', o.metadata->>'stripe_session_id',
      'created_at', o.created_at
    ) AS item
    FROM public.orders o
    WHERE o.created_at < v_since
      AND o.created_at >= now() - interval '30 days'
      AND lower(COALESCE(o.metadata->>'payment_method', '')) IN ('card', 'twint', 'postfinance_card', 'postfinance_efinance')
      AND lower(COALESCE(o.status, '')) IN ('pending', 'pending_payment')
      AND lower(COALESCE(o.payment_status, '')) IN ('pending', 'pending_payment', 'requires_payment')
      AND COALESCE(o.metadata->>'checkout_session_state', '') NOT IN ('completed', 'expired', 'cancelled', 'failed')
    ORDER BY o.created_at ASC
    LIMIT 100
  ),
  captured_orders_without_charge AS (
    SELECT jsonb_build_object(
      'kind', 'captured_order_without_charge',
      'severity', 'critical',
      'order_id', o.id,
      'order_number', o.order_number,
      'restaurant_id', o.restaurant_id,
      'user_id', o.user_id,
      'status', o.status,
      'payment_status', o.payment_status,
      'stripe_session_id', o.metadata->>'stripe_session_id',
      'created_at', o.created_at,
      'updated_at', o.updated_at
    ) AS item
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) = 'confirmed'
      AND lower(COALESCE(o.payment_status, '')) = 'captured'
      AND COALESCE(o.total_amount, 0) > 0
      AND lower(COALESCE(o.metadata->>'payment_method', 'card')) NOT IN ('cash', 'cash_on_delivery', 'restaurant', 'pay_at_restaurant')
      AND lower(COALESCE(o.metadata->>'checkout_kind', 'order')) = 'order'
      AND o.created_at >= now() - interval '90 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.order_id = o.id AND pt.type = 'charge' AND pt.status = 'succeeded'
      )
    ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
    LIMIT 100
  ),
  succeeded_order_charges_without_order AS (
    SELECT jsonb_build_object(
      'kind', 'succeeded_order_charge_without_order',
      'severity', 'critical',
      'payment_transaction_id', pt.id,
      'stripe_session_id', pt.stripe_checkout_session_id,
      'stripe_payment_intent_id', pt.stripe_payment_intent_id,
      'user_id', pt.user_id,
      'amount', pt.amount,
      'currency', pt.currency,
      'checkout_kind', pt.metadata->>'checkout_kind',
      'metadata', pt.metadata,
      'created_at', pt.created_at
    ) AS item
    FROM public.payment_transactions pt
    WHERE pt.type = 'charge'
      AND pt.status = 'succeeded'
      AND pt.order_id IS NULL
      AND COALESCE(pt.amount, 0) > 0
      AND lower(COALESCE(pt.metadata->>'checkout_kind', 'order')) = 'order'
      AND NULLIF(pt.metadata->>'reservation_id', '') IS NULL
      AND lower(COALESCE(pt.metadata->>'feature', '')) NOT IN (
        'zero-attente', 'reservation_zero_attente', 'chefs-table', 'chefs_table'
      )
      AND pt.created_at >= now() - interval '90 days'
    ORDER BY pt.created_at DESC
    LIMIT 100
  ),
  paid_campaigns_not_active AS (
    SELECT jsonb_build_object(
      'kind', 'paid_campaign_not_active',
      'severity', 'high',
      'campaign_id', ac.id,
      'restaurant_id', ac.restaurant_id,
      'title', ac.title,
      'status', ac.status,
      'payment_status', ac.payment_status,
      'starts_at', ac.starts_at,
      'ends_at', ac.ends_at,
      'paid_at', ac.paid_at
    ) AS item
    FROM public.ad_campaigns ac
    WHERE ac.payment_status = 'paid'
      AND ac.status IS DISTINCT FROM 'active'
      AND ac.starts_at <= now()
      AND (ac.ends_at IS NULL OR ac.ends_at > now())
    ORDER BY ac.updated_at DESC NULLS LAST
    LIMIT 100
  ),
  paid_campaigns_without_transaction AS (
    SELECT jsonb_build_object(
      'kind', 'paid_campaign_without_transaction',
      'severity', 'high',
      'campaign_id', ac.id,
      'restaurant_id', ac.restaurant_id,
      'title', ac.title,
      'status', ac.status,
      'payment_status', ac.payment_status,
      'stripe_session_id', ac.stripe_checkout_session_id,
      'paid_amount', ac.paid_amount,
      'paid_at', ac.paid_at
    ) AS item
    FROM public.ad_campaigns ac
    WHERE ac.payment_status = 'paid'
      AND ac.stripe_checkout_session_id LIKE 'cs_live\_%' ESCAPE '\'
      AND ac.starts_at <= now()
      AND (ac.ends_at IS NULL OR ac.ends_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.status = 'succeeded'
          AND pt.type = 'charge'
          AND (
            pt.stripe_checkout_session_id = ac.stripe_checkout_session_id
            OR pt.metadata->>'campaign_id' = ac.id::text
          )
      )
    ORDER BY ac.paid_at DESC NULLS LAST
    LIMIT 100
  ),
  zero_attente_transactions_without_reservation AS (
    SELECT jsonb_build_object(
      'kind', 'zero_attente_transaction_without_reservation',
      'severity', 'critical',
      'payment_transaction_id', pt.id,
      'reservation_id', pt.metadata->>'reservation_id',
      'stripe_session_id', pt.stripe_checkout_session_id,
      'stripe_payment_intent_id', pt.stripe_payment_intent_id,
      'user_id', pt.user_id,
      'amount', pt.amount,
      'currency', pt.currency,
      'metadata', pt.metadata,
      'created_at', pt.created_at
    ) AS item
    FROM public.payment_transactions pt
    WHERE pt.type = 'charge'
      AND pt.status = 'succeeded'
      AND lower(COALESCE(pt.metadata->>'feature', '')) = 'zero-attente'
      AND NULLIF(pt.metadata->>'reservation_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.reservations r
        WHERE r.id::text = pt.metadata->>'reservation_id'
      )
    ORDER BY pt.created_at DESC
    LIMIT 100
  ),
  all_items AS (
    SELECT item FROM stale_pending_orders
    UNION ALL SELECT item FROM captured_orders_without_charge
    UNION ALL SELECT item FROM succeeded_order_charges_without_order
    UNION ALL SELECT item FROM paid_campaigns_not_active
    UNION ALL SELECT item FROM paid_campaigns_without_transaction
    UNION ALL SELECT item FROM zero_attente_transactions_without_reservation
  )
  SELECT jsonb_build_object(
    'checkedAt', now(),
    'windowHours', v_hours,
    'total', count(*)::integer,
    'critical', count(*) FILTER (WHERE item->>'severity' = 'critical')::integer,
    'high', count(*) FILTER (WHERE item->>'severity' = 'high')::integer,
    'status', CASE
      WHEN count(*) FILTER (WHERE item->>'severity' = 'critical') > 0 THEN 'critical'
      WHEN count(*) > 0 THEN 'watch'
      ELSE 'ok'
    END,
    'message', CASE
      WHEN count(*) FILTER (WHERE item->>'severity' = 'critical') > 0 THEN 'Anomalies paiement critiques detectees.'
      WHEN count(*) > 0 THEN 'Anomalies paiement a verifier.'
      ELSE 'Aucune anomalie paiement detectee.'
    END,
    'items', COALESCE(jsonb_agg(item ORDER BY item->>'severity', item->>'kind') FILTER (WHERE item IS NOT NULL), '[]'::jsonb),
    'actionUrl', '/admin/audit'
  )
  INTO v_result
  FROM all_items;

  RETURN COALESCE(v_result, jsonb_build_object(
    'checkedAt', now(), 'windowHours', v_hours, 'total', 0,
    'critical', 0, 'high', 0, 'status', 'ok',
    'message', 'Aucune anomalie paiement detectee.',
    'items', '[]'::jsonb, 'actionUrl', '/admin/audit'
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_payment_integrity_anomalies(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_integrity_anomalies(integer) TO authenticated, service_role;

-- Preserve the detailed legacy collector and put a normalization layer in
-- front of it. This keeps every diagnostic field while fixing incident state,
-- idle functions, pg_net probes and duplicate root causes.
DO $$
BEGIN
  IF to_regprocedure('public.admin_get_production_health_raw()') IS NULL THEN
    ALTER FUNCTION public.admin_get_production_health() RENAME TO admin_get_production_health_raw;
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
  v_now timestamptz := now();
  v_report jsonb;
  v_cron_jobs jsonb := '[]'::jsonb;
  v_extra_crons jsonb := '[]'::jsonb;
  v_edge_functions jsonb := '[]'::jsonb;
  v_stripe jsonb := '{}'::jsonb;
  v_payment jsonb := '{}'::jsonb;
  v_configuration_checks jsonb := '[]'::jsonb;
  v_configuration_status text := 'ok';
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

  -- Detailed coverage inherited from admin_get_production_health_raw:
  -- internal_cron_secret, public.admin_supabase_advisor_snapshots,
  -- checkoutReconciliation.paidOrdersNotFinalized and notificationQueue
  -- backed by public.notification_deliveries and public.email_queue.
  v_report := public.admin_get_production_health_raw();

  WITH stripe_logs AS (
    SELECT *
    FROM public.edge_function_audit_logs
    WHERE function_name = 'stripe-webhook'
      AND created_at >= v_now - interval '24 hours'
  ),
  classified AS (
    SELECT *,
      (
        action = 'verify_signature'
        AND is_service_role = true
        AND COALESCE(request_metadata->>'user_agent', '') LIKE 'pg_net/%'
        AND COALESCE(request_metadata->>'method', '') = 'POST'
        AND COALESCE(request_metadata->>'path', '') = '/stripe-webhook'
        AND COALESCE(error_message, '') = 'Missing stripe-signature header'
      ) AS ignored
    FROM stripe_logs
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE NOT ignored)::integer AS total_24h,
      count(*) FILTER (WHERE NOT ignored AND status = 'success')::integer AS success_24h,
      count(*) FILTER (WHERE NOT ignored AND status = 'failure')::integer AS failures_24h,
      count(*) FILTER (WHERE ignored)::integer AS ignored_24h,
      max(created_at) FILTER (WHERE NOT ignored AND status = 'success') AS last_success_at,
      max(created_at) FILTER (WHERE NOT ignored AND status = 'failure') AS last_failure_at,
      COALESCE(array_length(public.get_stripe_webhook_signing_secrets(), 1), 0) > 0 AS secret_available
    FROM classified
  ),
  latest_failure AS (
    SELECT error_message
    FROM classified
    WHERE NOT ignored AND status = 'failure'
    ORDER BY created_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN NOT secret_available THEN 'critical'
      WHEN last_failure_at IS NOT NULL
       AND last_failure_at > COALESCE(last_success_at, '-infinity'::timestamptz) THEN 'critical'
      ELSE 'ok'
    END,
    'total24h', total_24h,
    'success24h', success_24h,
    'failures24h', failures_24h,
    'ignored24h', ignored_24h,
    'failureRate', CASE WHEN total_24h = 0 THEN NULL ELSE round(failures_24h::numeric / total_24h * 100, 2) END,
    'lastSuccessAt', last_success_at,
    'lastFailureAt', last_failure_at,
    'lastError', CASE
      WHEN last_failure_at IS NOT NULL
       AND last_failure_at > COALESCE(last_success_at, '-infinity'::timestamptz)
      THEN latest_failure.error_message
      ELSE NULL
    END,
    'message', CASE
      WHEN NOT secret_available THEN 'Aucun secret de signature associe au webhook Stripe actif.'
      WHEN last_failure_at IS NOT NULL
       AND last_failure_at > COALESCE(last_success_at, '-infinity'::timestamptz)
        THEN COALESCE(latest_failure.error_message, 'Webhook Stripe actuellement en echec.')
      WHEN success_24h > 0 THEN 'Webhooks Stripe recus avec succes.'
      ELSE 'Aucun evenement Stripe attendu dans la fenetre observee.'
    END,
    'actionUrl', '/admin/audit',
    'rootCauseId', 'stripe_webhook_signature'
  )
  INTO v_stripe
  FROM totals
  LEFT JOIN latest_failure ON true;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN item->>'functionName' = 'stripe-webhook' THEN
        item || v_stripe || jsonb_build_object('label', 'Stripe webhook')
      WHEN COALESCE((item->>'total24h')::integer, 0) = 0
       AND item->>'functionName' IN (
         'create-checkout', 'complete-order-checkout', 'dispatch-order',
         'campaign-portal', 'notification-dispatch', 'validate-order'
       ) THEN
        item || jsonb_build_object(
          'status', 'ok',
          'activityState', 'idle',
          'message', 'Fonction deployee, aucun travail attendu dans la fenetre observee.'
        )
      WHEN COALESCE((item->>'total24h')::integer, 0) = 0 THEN
        item || jsonb_build_object(
          'status', 'watch',
          'activityState', 'awaiting_first_run',
          'message', 'Worker planifie, premiere execution auditee en attente.'
        )
      WHEN COALESCE((item->>'failures24h')::integer, 0) > 0
       AND NULLIF(item->>'lastSuccessAt', '')::timestamptz > NULLIF(item->>'lastFailureAt', '')::timestamptz THEN
        item || jsonb_build_object(
          'status', 'ok',
          'activityState', 'recovered',
          'message', 'Incident resolu par une execution reussie plus recente.'
        )
      ELSE item
    END
    ORDER BY item->>'priority', item->>'functionName'
  ), '[]'::jsonb)
  INTO v_edge_functions
  FROM jsonb_array_elements(COALESCE(v_report->'edgeFunctions'->'functions', '[]'::jsonb)) item;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN item->>'lastFailureAt' IS NULL THEN item || jsonb_build_object('lastError', NULL)
      ELSE item
    END
    ORDER BY item->>'priority', item->>'jobName'
  ), '[]'::jsonb)
  INTO v_cron_jobs
  FROM jsonb_array_elements(COALESCE(v_report->'cron'->'jobs', '[]'::jsonb)) item;

  IF to_regclass('cron.job') IS NOT NULL AND to_regclass('cron.job_run_details') IS NOT NULL THEN
    WITH expected(jobname, label, priority, schedule, action_url) AS (
      VALUES
        ('send-email-worker', 'Emails transactionnels', 'P0', '* * * * *', '/admin/notifications'),
        ('tok-close-due-match-groups', 'Cloture Match group', 'P0', '* * * * *', '/admin/commandes-reservations'),
        ('tok-reconcile-paid-order-checkouts', 'Reconciliation commandes payees', 'P0', '*/5 * * * *', '/admin/commandes-reservations'),
        ('tok-sync-social-post-promotions', 'Synchronisation Actualites sponsorisees', 'P1', '*/5 * * * *', '/admin/actualites'),
        ('tok-capture-due-match-groups', 'Capture Match group', 'P0', '*/5 * * * *', '/admin/commandes-reservations'),
        ('tok-reconcile-match-group-authorizations', 'Rapprochement Match group', 'P1', '*/5 * * * *', '/admin/commandes-reservations'),
        ('send-push-worker', 'Notifications push', 'P1', '*/5 * * * *', '/admin/notifications')
    ),
    latest AS (
      SELECT DISTINCT ON (jobid) jobid, status, start_time, end_time, return_message
      FROM cron.job_run_details
      ORDER BY jobid, start_time DESC NULLS LAST
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'jobName', e.jobname,
      'label', e.label,
      'priority', e.priority,
      'schedule', COALESCE(j.schedule, e.schedule),
      'expectedSchedule', e.schedule,
      'active', COALESCE(j.active, false),
      'status', CASE
        WHEN j.jobid IS NULL OR j.active IS FALSE THEN 'critical'
        WHEN latest.status IS NOT NULL AND latest.status <> 'succeeded' THEN 'critical'
        WHEN latest.start_time IS NULL THEN 'watch'
        ELSE 'ok'
      END,
      'lastRunAt', latest.start_time,
      'lastRunStatus', latest.status,
      'lastDurationMs', CASE WHEN latest.start_time IS NULL THEN NULL ELSE round(extract(epoch FROM (COALESCE(latest.end_time, v_now) - latest.start_time)) * 1000)::integer END,
      'lastError', CASE WHEN latest.status IS NOT NULL AND latest.status <> 'succeeded' THEN latest.return_message ELSE NULL END,
      'message', CASE
        WHEN j.jobid IS NULL THEN 'Cron job absent de pg_cron.'
        WHEN j.active IS FALSE THEN 'Cron job present mais inactif.'
        WHEN latest.status IS NOT NULL AND latest.status <> 'succeeded' THEN COALESCE(latest.return_message, 'Dernier run en echec.')
        WHEN latest.start_time IS NULL THEN 'Cron programme, premier run en attente.'
        ELSE 'Dernier run reussi.'
      END,
      'actionUrl', e.action_url
    ) ORDER BY e.priority, e.jobname), '[]'::jsonb)
    INTO v_extra_crons
    FROM expected e
    LEFT JOIN cron.job j ON j.jobname = e.jobname
    LEFT JOIN latest ON latest.jobid = j.jobid;
  END IF;

  -- Keep the remediation/next-run metadata from the legacy collector while
  -- letting the complete expected-job inventory above own live state.
  SELECT COALESCE(jsonb_agg(
    COALESCE(previous.item, '{}'::jsonb) || fresh.item
    ORDER BY fresh.item->>'priority', fresh.item->>'jobName'
  ), '[]'::jsonb)
  INTO v_cron_jobs
  FROM jsonb_array_elements(COALESCE(v_extra_crons, '[]'::jsonb)) AS fresh(item)
  LEFT JOIN LATERAL (
    SELECT existing.item
    FROM jsonb_array_elements(COALESCE(v_cron_jobs, '[]'::jsonb)) AS existing(item)
    WHERE existing.item->>'jobName' = fresh.item->>'jobName'
    LIMIT 1
  ) AS previous ON true;

  v_payment := public.get_payment_integrity_anomalies(48);

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN item->>'key' = 'stripe_webhook_secret' THEN
        item || jsonb_build_object(
          'status', v_stripe->>'status',
          'message', v_stripe->>'message',
          'rootCauseId', 'stripe_webhook_signature'
        )
      ELSE item
    END
    ORDER BY item->>'key'
  ), '[]'::jsonb)
  INTO v_configuration_checks
  FROM jsonb_array_elements(COALESCE(v_report->'configuration'->'checks', '[]'::jsonb)) item;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_configuration_checks) x WHERE x->>'status' = 'critical') THEN 'critical'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_configuration_checks) x WHERE x->>'status' = 'watch') THEN 'watch'
    ELSE 'ok'
  END
  INTO v_configuration_status;

  WITH canonical AS (
    SELECT 'cron:' || COALESCE(item->>'jobName', 'unknown') AS root_id, item
    FROM jsonb_array_elements(v_cron_jobs) item
    UNION ALL
    SELECT 'edge:' || COALESCE(item->>'functionName', 'unknown'), item
    FROM jsonb_array_elements(v_edge_functions) item
    WHERE item->>'functionName' <> 'stripe-webhook'
    UNION ALL SELECT 'stripe_webhook_signature', v_stripe
    UNION ALL SELECT 'payment_integrity', v_payment
    UNION ALL
    SELECT 'config:' || COALESCE(item->>'key', 'unknown'), item
    FROM jsonb_array_elements(v_configuration_checks) item
    WHERE item->>'key' <> 'stripe_webhook_secret'
    UNION ALL SELECT 'checkout_reconciliation', COALESCE(v_report->'checkoutReconciliation', '{}'::jsonb)
    UNION ALL SELECT 'notification_queue', COALESCE(v_report->'notificationQueue', '{}'::jsonb)
    UNION ALL SELECT 'supabase_advisors', COALESCE(v_report->'advisors', '{}'::jsonb)
  ), ranked AS (
    SELECT DISTINCT ON (root_id) root_id, item
    FROM canonical
    ORDER BY root_id,
      CASE item->>'status' WHEN 'critical' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END
  ), counted AS (
    SELECT
      count(*) FILTER (WHERE item->>'status' = 'critical')::integer AS critical,
      count(*) FILTER (WHERE item->>'status' = 'watch')::integer AS watch,
      count(*) FILTER (WHERE item->>'status' = 'ok')::integer AS ok
    FROM ranked
  )
  SELECT
    counted.critical,
    counted.watch,
    counted.ok,
    CASE
      WHEN counted.critical + counted.watch + counted.ok = 0 THEN 100
      ELSE round(((counted.ok * 100) + (counted.watch * 60))::numeric / (counted.critical + counted.watch + counted.ok))::integer
    END,
    COALESCE((
      SELECT jsonb_agg(item || jsonb_build_object('rootCauseId', root_id)
        ORDER BY CASE item->>'status' WHEN 'critical' THEN 0 ELSE 1 END, root_id)
      FROM ranked
      WHERE item->>'status' IN ('critical', 'watch')
    ), '[]'::jsonb)
  INTO v_critical, v_watch, v_ok, v_score, v_alerts
  FROM counted;

  v_status := CASE WHEN v_critical > 0 THEN 'critical' WHEN v_watch > 0 THEN 'watch' ELSE 'ok' END;

  RETURN v_report || jsonb_build_object(
    'checkedAt', v_now,
    'status', v_status,
    'score', v_score,
    'counts', COALESCE(v_report->'counts', '{}'::jsonb) || jsonb_build_object(
      'critical', v_critical,
      'watch', v_watch,
      'ok', v_ok,
      'cronJobs', jsonb_array_length(v_cron_jobs),
      'edgeFunctions', jsonb_array_length(v_edge_functions),
      'paymentAnomalies', COALESCE((v_payment->>'total')::integer, 0)
    ),
    'alerts', v_alerts,
    'cron', jsonb_build_object(
      'status', CASE
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_cron_jobs) x WHERE x->>'status' = 'critical') THEN 'critical'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_cron_jobs) x WHERE x->>'status' = 'watch') THEN 'watch'
        ELSE 'ok'
      END,
      'jobs', v_cron_jobs
    ),
    'edgeFunctions', jsonb_build_object(
      'status', CASE
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_edge_functions) x WHERE x->>'status' = 'critical') THEN 'critical'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_edge_functions) x WHERE x->>'status' = 'watch') THEN 'watch'
        ELSE 'ok'
      END,
      'functions', v_edge_functions
    ),
    'stripe', v_stripe,
    'paymentIntegrity', v_payment,
    'configuration', jsonb_build_object('status', v_configuration_status, 'checks', v_configuration_checks)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_production_health_raw() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_production_health_raw() TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_production_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_production_health() TO authenticated, service_role;

-- Keep the privilege contract explicit for the companion advisor snapshot RPC.
-- Existing regression tests intentionally require separate PUBLIC and anon
-- revocations so a later broad GRANT cannot accidentally make it anonymous.
REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_supabase_advisor_snapshot(jsonb, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.admin_get_security_abuse_summary_raw(integer)') IS NULL THEN
    ALTER FUNCTION public.admin_get_security_abuse_summary(integer) RENAME TO admin_get_security_abuse_summary_raw;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_security_abuse_summary(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_hours integer := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(COALESCE(p_hours, 24), 720)));
  v_report jsonb;
  v_sensitive jsonb := '{}'::jsonb;
  v_card jsonb := '{}'::jsonb;
  v_critical integer := 0;
  v_watch integer := 0;
  v_status text := 'ok';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_report := public.admin_get_security_abuse_summary_raw(v_hours);

  WITH filtered AS (
    SELECT *
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_since
      AND status = 'failure'
      AND function_name IN (
        'validate-order', 'create-checkout', 'complete-order-checkout',
        'stripe-webhook', 'send-push', 'send-email', 'notification-dispatch'
      )
      AND COALESCE(request_metadata->>'user_agent', '') NOT LIKE 'pg_net/%'
      AND COALESCE(request_metadata->>'auth_mode', '') NOT IN ('scheduler_secret', 'service_role')
  ), by_ip AS (
    SELECT COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown') AS ip,
      count(*)::integer AS failures,
      count(DISTINCT actor_user_id)::integer AS users,
      array_remove(array_agg(DISTINCT function_name), NULL) AS functions
    FROM filtered
    GROUP BY COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown')
    ORDER BY failures DESC
    LIMIT 25
  ), totals AS (
    SELECT COALESCE(sum(failures), 0)::integer AS total_failures,
      COALESCE(max(failures), 0)::integer AS max_ip_failures
    FROM by_ip
  )
  SELECT jsonb_build_object(
    'status', CASE WHEN max_ip_failures >= 75 THEN 'critical' WHEN max_ip_failures >= 25 THEN 'watch' ELSE 'ok' END,
    'totalFailures', total_failures,
    'topIps', COALESCE((SELECT jsonb_agg(to_jsonb(by_ip)) FROM by_ip), '[]'::jsonb),
    'topUsers', '[]'::jsonb,
    'message', CASE
      WHEN max_ip_failures >= 75 THEN 'Concentration critique d echecs externes sur endpoint sensible.'
      WHEN max_ip_failures >= 25 THEN 'Concentration d echecs externes a surveiller.'
      ELSE 'Echecs externes sans concentration anormale.'
    END
  )
  INTO v_sensitive
  FROM totals;

  WITH stripe_failures AS (
    SELECT COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown') AS ip, count(*)::integer AS failures
    FROM public.edge_function_audit_logs
    WHERE created_at >= v_since
      AND status = 'failure'
      AND function_name IN (
        'create-checkout', 'complete-order-checkout', 'stripe-webhook',
        'authorize-match-group-order', 'confirm-match-group-authorization'
      )
      AND COALESCE(request_metadata->>'user_agent', '') NOT LIKE 'pg_net/%'
      AND COALESCE(request_metadata->>'auth_mode', '') NOT IN ('scheduler_secret', 'service_role')
      AND COALESCE(error_message, '') NOT ILIKE '%signature%'
      AND COALESCE(error_message, '') NOT ILIKE '%webhook secret%'
      AND COALESCE(error_message, '') NOT ILIKE '%stripe-signature%'
      AND (
        error_message ILIKE '%card%' OR error_message ILIKE '%declin%'
        OR error_message ILIKE '%payment_intent%' OR request_metadata::text ILIKE '%card%'
      )
    GROUP BY COALESCE(NULLIF(request_metadata->>'ip', ''), 'unknown')
    ORDER BY failures DESC
    LIMIT 25
  ), failed_users AS (
    SELECT user_id, count(*)::integer AS failed_transactions,
      count(DISTINCT COALESCE(stripe_payment_intent_id, stripe_checkout_session_id))::integer AS stripe_attempts
    FROM public.payment_transactions
    WHERE created_at >= v_since
      AND lower(COALESCE(status, '')) IN ('failed', 'payment_failed', 'requires_payment_method', 'declined')
      AND COALESCE(provider, 'stripe') = 'stripe'
      AND user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY failed_transactions DESC
    LIMIT 25
  ), totals AS (
    SELECT
      COALESCE((SELECT sum(failures) FROM stripe_failures), 0)::integer AS edge_failures,
      COALESCE((SELECT sum(failed_transactions) FROM failed_users), 0)::integer AS failed_transactions,
      COALESCE((SELECT max(failures) FROM stripe_failures), 0)::integer AS max_ip_failures,
      COALESCE((SELECT max(failed_transactions) FROM failed_users), 0)::integer AS max_user_failures
  )
  SELECT jsonb_build_object(
    'status', CASE
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 30 THEN 'critical'
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 10 THEN 'watch'
      ELSE 'ok'
    END,
    'stripeEdgeFailures', edge_failures,
    'failedPaymentTransactions', failed_transactions,
    'topIps', COALESCE((SELECT jsonb_agg(to_jsonb(stripe_failures)) FROM stripe_failures), '[]'::jsonb),
    'topUsers', COALESCE((SELECT jsonb_agg(to_jsonb(failed_users)) FROM failed_users), '[]'::jsonb),
    'message', CASE
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 30 THEN 'Signal critique compatible avec tests de cartes.'
      WHEN GREATEST(max_ip_failures, max_user_failures) >= 10 THEN 'Signal externe a surveiller compatible avec tests de cartes.'
      ELSE 'Aucun signal concentre de tests de cartes.'
    END
  )
  INTO v_card
  FROM totals;

  v_report := v_report || jsonb_build_object(
    'sensitiveEndpointFailures', v_sensitive,
    'cardTesting', v_card
  );

  v_critical :=
    CASE WHEN v_report->'massAccountCreation'->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_sensitive->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_card->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_report->'massUploads'->>'status' = 'critical' THEN 1 ELSE 0 END +
    CASE WHEN v_report->'sensitiveActions'->>'status' = 'critical' THEN 1 ELSE 0 END;

  v_watch :=
    CASE WHEN v_report->'massAccountCreation'->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_sensitive->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_card->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_report->'massUploads'->>'status' = 'watch' THEN 1 ELSE 0 END +
    CASE WHEN v_report->'sensitiveActions'->>'status' = 'watch' THEN 1 ELSE 0 END;

  v_status := CASE WHEN v_critical > 0 THEN 'critical' WHEN v_watch > 0 THEN 'watch' ELSE 'ok' END;

  RETURN v_report || jsonb_build_object(
    'checkedAt', now(),
    'windowHours', v_hours,
    'status', v_status,
    'counts', jsonb_build_object('critical', v_critical, 'watch', v_watch)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_security_abuse_summary_raw(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_security_abuse_summary_raw(integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
