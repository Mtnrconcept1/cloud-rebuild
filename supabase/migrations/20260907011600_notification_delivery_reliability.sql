-- Harden notification delivery workers and scheduled campaigns with atomic claims,
-- bounded retries and a Supabase cron trigger. This migration is additive.

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

UPDATE public.notification_deliveries
SET next_attempt_at = COALESCE(next_attempt_at, scheduled_at, created_at)
WHERE status IN ('queued', 'retrying')
  AND next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS notification_deliveries_retry_claim_idx
  ON public.notification_deliveries (
    channel,
    COALESCE(next_attempt_at, scheduled_at, created_at),
    created_at,
    id
  )
  WHERE status IN ('queued', 'retrying', 'leased');

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(
  p_channel text,
  p_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT NULL,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  notification_id uuid,
  target text,
  attempts integer,
  max_attempts integer,
  lease_token uuid,
  notification_user_id uuid,
  notification_title text,
  notification_body text,
  notification_data jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel text := lower(trim(COALESCE(p_channel, '')));
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_lease_seconds integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 120), 900));
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_channel NOT IN ('push', 'email') THEN
    RAISE EXCEPTION 'Unsupported notification delivery channel.';
  END IF;

  -- A worker can disappear after taking its final lease. Expired final leases
  -- must become terminal rather than remaining permanently stuck in `leased`.
  UPDATE public.notification_deliveries nd
  SET
    status = 'failed',
    last_error = COALESCE(nd.last_error, 'Delivery lease expired after maximum attempts'),
    lease_token = NULL,
    lease_expires_at = NULL,
    next_attempt_at = NULL
  WHERE nd.channel = v_channel
    AND nd.status = 'leased'
    AND nd.lease_expires_at <= now()
    AND nd.attempts >= nd.max_attempts;

  RETURN QUERY
  WITH candidates AS (
    SELECT nd.id
    FROM public.notification_deliveries nd
    JOIN public.notifications n ON n.id = nd.notification_id
    WHERE nd.channel = v_channel
      AND (
        nd.status IN ('queued', 'retrying')
        OR (nd.status = 'leased' AND nd.lease_expires_at <= now())
      )
      AND nd.attempts < nd.max_attempts
      AND COALESCE(nd.next_attempt_at, nd.scheduled_at, nd.created_at) <= now()
      AND (p_user_id IS NULL OR n.user_id = p_user_id)
    ORDER BY COALESCE(nd.next_attempt_at, nd.scheduled_at, nd.created_at), nd.created_at, nd.id
    FOR UPDATE OF nd SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.notification_deliveries nd
    SET
      status = 'leased',
      attempts = nd.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      last_error = NULL
    FROM candidates c
    WHERE nd.id = c.id
    RETURNING nd.id, nd.notification_id, nd.target, nd.attempts, nd.max_attempts, nd.lease_token
  )
  SELECT
    c.id,
    c.notification_id,
    c.target,
    c.attempts,
    c.max_attempts,
    c.lease_token,
    n.user_id AS notification_user_id,
    n.title AS notification_title,
    n.body AS notification_body,
    n.data AS notification_data
  FROM claimed c
  JOIN public.notifications n ON n.id = c.notification_id
  ORDER BY c.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_notification_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_terminal boolean DEFAULT false,
  p_terminal_status text DEFAULT 'failed',
  p_last_error text DEFAULT NULL,
  p_provider text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_delivery_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'Delivery id and lease token are required.';
  END IF;

  UPDATE public.notification_deliveries nd
  SET
    status = CASE
      WHEN p_success THEN 'sent'
      WHEN p_terminal THEN CASE WHEN p_terminal_status = 'skipped' THEN 'skipped' ELSE 'failed' END
      WHEN nd.attempts >= nd.max_attempts THEN 'failed'
      ELSE 'retrying'
    END,
    provider = COALESCE(NULLIF(trim(p_provider), ''), nd.provider),
    sent_at = CASE WHEN p_success THEN now() ELSE nd.sent_at END,
    last_error = CASE WHEN p_success THEN NULL ELSE LEFT(COALESCE(p_last_error, 'Delivery failed'), 2000) END,
    next_attempt_at = CASE
      WHEN p_success OR p_terminal OR nd.attempts >= nd.max_attempts THEN NULL
      ELSE now() + make_interval(
        secs => LEAST(900, GREATEST(15, (15 * power(2::numeric, GREATEST(nd.attempts - 1, 0)))::integer))
      )
    END,
    lease_token = NULL,
    lease_expires_at = NULL
  WHERE nd.id = p_delivery_id
    AND nd.status = 'leased'
    AND nd.lease_token = p_lease_token
  RETURNING to_jsonb(nd.*) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Notification delivery lease mismatch.';
  END IF;

  RETURN v_result;
END;
$$;

-- Preserve the existing channel/request semantics, but transactional messages
-- cannot be disabled at the category gate. Users can still disable push/email
-- channels independently; marketing remains opt-out by category.
CREATE OR REPLACE FUNCTION public.queue_notification_deliveries(
  p_notification_id uuid,
  p_user_id uuid,
  p_category text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channels jsonb := '{"push": true, "email": true, "in_app": true}'::jsonb;
  v_categories jsonb := '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb;
  v_requested jsonb := '{"in_app": true, "push": true, "email": false}'::jsonb;
  v_email text;
  v_count integer := 0;
BEGIN
  SELECT np.channels, np.categories
  INTO v_channels, v_categories
  FROM public.notification_preferences np
  WHERE np.user_id = p_user_id;

  v_channels := COALESCE(v_channels, '{"push": true, "email": true, "in_app": true}'::jsonb);
  v_categories := COALESCE(v_categories, '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb);

  IF p_category <> 'transactional'
    AND COALESCE((v_categories ->> p_category)::boolean, true) IS DISTINCT FROM true THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(COALESCE(p_data, '{}'::jsonb) -> 'requested_channels') = 'object' THEN
    v_requested := COALESCE(p_data, '{}'::jsonb) -> 'requested_channels';
  END IF;

  IF COALESCE((v_requested ->> 'in_app')::boolean, true)
    AND COALESCE((v_channels ->> 'in_app')::boolean, true)
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_deliveries nd
      WHERE nd.notification_id = p_notification_id AND nd.channel = 'in_app'
    ) THEN
    INSERT INTO public.notification_deliveries (
      notification_id, channel, status, scheduled_at, sent_at, next_attempt_at
    ) VALUES (
      p_notification_id, 'in_app', 'sent', now(), now(), NULL
    );
    v_count := v_count + 1;
  END IF;

  IF COALESCE((v_requested ->> 'push')::boolean, true)
    AND COALESCE((v_channels ->> 'push')::boolean, true)
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_deliveries nd
      WHERE nd.notification_id = p_notification_id AND nd.channel = 'push'
    ) THEN
    INSERT INTO public.notification_deliveries (
      notification_id, channel, status, scheduled_at, next_attempt_at
    ) VALUES (
      p_notification_id, 'push', 'queued', now(), now()
    );
    v_count := v_count + 1;
  END IF;

  IF COALESCE((v_requested ->> 'email')::boolean, false)
    AND COALESCE((v_channels ->> 'email')::boolean, true)
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_deliveries nd
      WHERE nd.notification_id = p_notification_id AND nd.channel = 'email'
    ) THEN
    SELECT au.email::text INTO v_email FROM auth.users au WHERE au.id = p_user_id;

    IF v_email IS NOT NULL THEN
      INSERT INTO public.notification_deliveries (
        notification_id, channel, status, target, scheduled_at, next_attempt_at
      ) VALUES (
        p_notification_id, 'email', 'queued', v_email, now(), now()
      );
      v_count := v_count + 1;
    END IF;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dispatch_notification_campaign(p_campaign_id uuid)
RETURNS TABLE (
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign public.notification_campaigns%ROWTYPE;
  v_notification record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT * INTO v_campaign
  FROM public.notification_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.';
  END IF;

  IF v_campaign.status = 'sent' THEN
    RETURN QUERY
    SELECT
      stats.recipients, stats.notifications_count, stats.deliveries_total,
      stats.deliveries_queued, stats.deliveries_sent, stats.deliveries_failed,
      stats.in_app_total, stats.email_total, stats.push_total
    FROM public.get_campaign_stats(ARRAY[p_campaign_id]) AS stats;
    RETURN;
  END IF;

  IF v_campaign.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign is not dispatchable from status %.', v_campaign.status;
  END IF;

  FOR v_notification IN
    INSERT INTO public.notifications (user_id, title, body, type, category, data)
    SELECT
      tu.user_id,
      v_campaign.title,
      v_campaign.body,
      'campaign',
      v_campaign.category,
      jsonb_build_object(
        'campaign_id', v_campaign.id,
        'campaign_title', v_campaign.title,
        'url', '/notifications',
        'requested_channels', jsonb_build_object(
          'in_app', COALESCE((v_campaign.channels ->> 'in_app')::boolean, true),
          'email', COALESCE((v_campaign.channels ->> 'email')::boolean, true),
          'push', COALESCE((v_campaign.channels ->> 'push')::boolean, true)
        )
      )
    FROM (
      SELECT
        au.id AS user_id,
        COALESCE(p.city, '') AS city,
        COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
      LEFT JOIN LATERAL (
        SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
        FROM public.user_roles ur
        WHERE ur.user_id = au.id
      ) AS roles_map ON true
      WHERE (
        COALESCE(array_length(v_campaign.target_roles, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(roles_map.roles, ARRAY['client']::text[])) AS role_name
          WHERE role_name = ANY(v_campaign.target_roles)
        )
      )
      AND (
        COALESCE(array_length(v_campaign.target_cities, 1), 0) = 0
        OR COALESCE(p.city, '') = ANY(v_campaign.target_cities)
      )
    ) AS tu
    RETURNING id, user_id, category, data
  LOOP
    PERFORM public.queue_notification_deliveries(
      v_notification.id,
      v_notification.user_id,
      v_notification.category,
      v_notification.data
    );
  END LOOP;

  UPDATE public.notification_campaigns
  SET status = 'sent', sent_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY
  SELECT
    stats.recipients, stats.notifications_count, stats.deliveries_total,
    stats.deliveries_queued, stats.deliveries_sent, stats.deliveries_failed,
    stats.in_app_total, stats.email_total, stats.push_total
  FROM public.get_campaign_stats(ARRAY[p_campaign_id]) AS stats;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_due_notification_campaigns(p_limit integer DEFAULT 25)
RETURNS TABLE (
  campaign_id uuid,
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  due_campaign record;
  dispatch_result record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  FOR due_campaign IN
    SELECT nc.id
    FROM public.notification_campaigns nc
    WHERE nc.status = 'scheduled'
      AND nc.scheduled_at <= now()
    ORDER BY nc.scheduled_at ASC, nc.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  LOOP
    SELECT * INTO dispatch_result
    FROM public.admin_dispatch_notification_campaign(due_campaign.id);

    campaign_id := due_campaign.id;
    recipients := dispatch_result.recipients;
    notifications_count := dispatch_result.notifications_count;
    deliveries_total := dispatch_result.deliveries_total;
    deliveries_queued := dispatch_result.deliveries_queued;
    deliveries_sent := dispatch_result.deliveries_sent;
    deliveries_failed := dispatch_result.deliveries_failed;
    in_app_total := dispatch_result.in_app_total;
    email_total := dispatch_result.email_total;
    push_total := dispatch_result.push_total;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_deliveries(text, integer, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_notification_delivery(uuid, uuid, boolean, boolean, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_dispatch_notification_campaign(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispatch_due_notification_campaigns(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(text, integer, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_notification_delivery(uuid, uuid, boolean, boolean, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_due_notification_campaigns(integer) TO authenticated, service_role;

DO $$
DECLARE
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE NOTICE 'Skipping TOK notification campaign cron: pg_cron or Vault unavailable.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'internal_cron_secret' AND NULLIF(decrypted_secret, '') IS NOT NULL
  ) THEN
    RAISE NOTICE 'Skipping TOK notification campaign cron: internal_cron_secret unavailable.';
  ELSE
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname = 'tok-dispatch-due-notification-campaigns';

    PERFORM cron.schedule('tok-dispatch-due-notification-campaigns', '* * * * *', format($job$
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
        body := '{"process_due":true}'::jsonb
      );
    $job$, v_base || '/notification-dispatch'));
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';