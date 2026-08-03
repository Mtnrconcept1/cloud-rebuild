-- Sending cadence for marketing email.
--
-- The daily cap was the only pacing this system had: an orchestrator run could
-- claim the whole day's allowance in one burst, at 08:00, all of it towards the
-- same recipient domain. From a domain with no sending history that is the
-- textbook way to be classified as spam — not for one campaign, but durably.
--
-- Three mechanisms are added here, all inside claim_marketing_deliveries so no
-- caller can route around them:
--
--   1. Warm-up. A cold domain earns volume over roughly a week instead of
--      asking for it on day one.
--   2. Hourly pacing. The day's allowance is released across the sending
--      window rather than at its start.
--   3. Per-domain fan-out limit. No single recipient provider receives the
--      whole batch at once.
--
-- Plus a circuit breaker: sustained bounces or complaints stop sending on their
-- own, because the alternative is discovering the problem after the reputation
-- damage is done.
--
-- Only the email channel is affected. In-app and manual channels keep the
-- behaviour they had.

CREATE OR REPLACE FUNCTION public.marketing_email_cadence()
RETURNS TABLE (allowance integer, reason text, daily_target integer, domain_cap integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conditions jsonb := '{}'::jsonb;
  v_daily_cap integer := 500;
  v_domain_cap integer := 60;
  v_bounce_threshold numeric := 0.05;
  v_complaint_threshold numeric := 0.001;
  v_warmup_start date;
  v_first_send date;
  v_day integer;
  v_daily_target integer;
  v_sent_today bigint := 0;
  v_reserved bigint := 0;
  v_window_start time := time '08:00';
  v_window_end time := time '19:55';
  v_local_time time := (now() AT TIME ZONE 'Europe/Zurich')::time;
  v_elapsed numeric;
  v_released integer;
  v_recent_sent bigint := 0;
  v_recent_bounced bigint := 0;
  v_recent_complained bigint := 0;
BEGIN
  SELECT a.conditions INTO v_conditions
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';
  v_conditions := COALESCE(v_conditions, '{}'::jsonb);

  v_daily_cap := LEAST(GREATEST(COALESCE((v_conditions ->> 'daily_cap')::integer, 500), 1), 10000);
  v_domain_cap := LEAST(GREATEST(COALESCE((v_conditions ->> 'email_domain_hourly_cap')::integer, 60), 1), 2000);
  v_bounce_threshold := LEAST(GREATEST(COALESCE((v_conditions ->> 'email_bounce_rate_threshold')::numeric, 0.05), 0.001), 1);
  v_complaint_threshold := LEAST(GREATEST(COALESCE((v_conditions ->> 'email_complaint_rate_threshold')::numeric, 0.001), 0.0001), 1);

  IF v_local_time < v_window_start OR v_local_time >= v_window_end THEN
    RETURN QUERY SELECT 0, 'quiet_hours', 0, v_domain_cap;
    RETURN;
  END IF;

  -- A reputation is built from the first message, so the ramp is anchored on
  -- the first email actually sent rather than on when the feature shipped.
  SELECT min(d.sent_at)::date INTO v_first_send
  FROM public.marketing_deliveries d WHERE d.channel = 'email' AND d.sent_at IS NOT NULL;
  v_warmup_start := COALESCE(
    NULLIF(v_conditions ->> 'email_warmup_started_on', '')::date,
    v_first_send,
    (now() AT TIME ZONE 'Europe/Zurich')::date
  );
  v_day := GREATEST((now() AT TIME ZONE 'Europe/Zurich')::date - v_warmup_start + 1, 1);

  -- 50, 100, 200, 400, 800, 1600 … until the configured cap takes over.
  v_daily_target := LEAST(v_daily_cap, (50 * power(2, LEAST(v_day, 12) - 1))::integer);

  -- Circuit breaker over the trailing week. Below 50 sends the rates are noise.
  SELECT
    count(*) FILTER (WHERE d.sent_at IS NOT NULL),
    count(*) FILTER (WHERE d.status = 'bounced'),
    count(*) FILTER (WHERE d.status = 'complained')
  INTO v_recent_sent, v_recent_bounced, v_recent_complained
  FROM public.marketing_deliveries d
  WHERE d.channel = 'email' AND d.created_at >= now() - interval '7 days';

  IF v_recent_sent >= 50 THEN
    IF v_recent_bounced::numeric / v_recent_sent > v_bounce_threshold THEN
      RETURN QUERY SELECT 0, 'bounce_rate_exceeded', v_daily_target, v_domain_cap;
      RETURN;
    END IF;
    IF v_recent_complained::numeric / v_recent_sent > v_complaint_threshold THEN
      RETURN QUERY SELECT 0, 'complaint_rate_exceeded', v_daily_target, v_domain_cap;
      RETURN;
    END IF;
  END IF;

  SELECT
    count(*) FILTER (WHERE d.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich')),
    count(*) FILTER (WHERE d.status IN ('leased','processing') AND d.lease_expires_at > now())
  INTO v_sent_today, v_reserved
  FROM public.marketing_deliveries d WHERE d.channel = 'email';

  -- Release the day's target progressively across the window instead of at its
  -- opening, so a provider sees a steady trickle rather than a spike.
  v_elapsed := LEAST(GREATEST(
    EXTRACT(epoch FROM (v_local_time - v_window_start)) /
    NULLIF(EXTRACT(epoch FROM (v_window_end - v_window_start)), 0), 0), 1);
  v_released := GREATEST(ceil(v_daily_target * GREATEST(v_elapsed, 0.05))::integer, 1);

  RETURN QUERY SELECT
    GREATEST(LEAST(v_released, v_daily_target) - (v_sent_today + v_reserved), 0)::integer,
    CASE WHEN v_day <= 6 THEN 'warmup_day_' || v_day ELSE 'steady' END,
    v_daily_target,
    v_domain_cap;
END;
$$;

COMMENT ON FUNCTION public.marketing_email_cadence() IS
  'How many marketing emails may be claimed right now, and why. Read by claim_marketing_deliveries and surfaced to operators.';

-- ---------------------------------------------------------------------------
-- Claim function, now cadence-aware for email
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_marketing_deliveries(
  p_limit integer DEFAULT 100,
  p_worker_id text DEFAULT 'marketing-orchestrator',
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  contact_id uuid,
  user_id uuid,
  channel text,
  provider text,
  raw_target text,
  content jsonb,
  attempt_count integer,
  max_attempts integer,
  lease_token uuid,
  idempotency_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_daily_cap integer := 500;
  v_reserved_today bigint := 0;
  v_frequency_cap_hours integer := 72;
  v_claim_limit integer;
  v_email_allowance integer := 0;
  v_email_domain_cap integer := 60;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF public.marketing_runtime_enabled() IS NOT TRUE THEN RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(73104721920260801::bigint);
  SELECT
    LEAST(GREATEST(COALESCE((a.conditions ->> 'daily_cap')::integer, 500), 1), 10000),
    LEAST(GREATEST(COALESCE((a.conditions ->> 'frequency_cap_hours')::integer, 72), 1), 720)
  INTO v_daily_cap, v_frequency_cap_hours
  FROM public.marketing_automations a WHERE a.automation_key = 'global_runtime';
  SELECT count(*) INTO v_reserved_today FROM public.marketing_deliveries d
  WHERE d.sent_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Zurich') AT TIME ZONE 'Europe/Zurich')
     OR (d.status IN ('leased','processing') AND d.lease_expires_at > now());
  v_claim_limit := LEAST(
    LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500),
    GREATEST(v_daily_cap - v_reserved_today, 0)
  );
  IF v_claim_limit <= 0 THEN RETURN; END IF;

  SELECT c.allowance, c.domain_cap INTO v_email_allowance, v_email_domain_cap
  FROM public.marketing_email_cadence() c;
  v_email_allowance := COALESCE(v_email_allowance, 0);
  v_email_domain_cap := COALESCE(v_email_domain_cap, 60);

  RETURN QUERY
  WITH ranked AS (
    SELECT d.id, d.channel,
      COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at) AS due_at,
      row_number() OVER (
        PARTITION BY d.contact_id
        ORDER BY COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at), d.id
      ) AS contact_rank,
      -- Spread the batch across recipient providers: a burst aimed at a single
      -- mailbox provider is what throttling and blocklisting react to.
      CASE WHEN d.channel = 'email' THEN row_number() OVER (
        PARTITION BY split_part(COALESCE(c.email_normalized, ''), '@', 2)
        ORDER BY COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at), d.id
      ) END AS domain_rank,
      CASE WHEN d.channel = 'email' THEN row_number() OVER (
        PARTITION BY d.channel
        ORDER BY COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at), d.id
      ) END AS email_rank
    FROM public.marketing_deliveries d
    JOIN public.marketing_contacts c ON c.id = d.contact_id
    JOIN public.marketing_integrations g ON g.channel = d.channel AND g.provider = d.provider
    JOIN public.marketing_calendar_items i ON i.id = d.item_id
    LEFT JOIN public.marketing_campaigns campaign ON campaign.id = i.campaign_id
    WHERE (
      (d.status IN ('queued','retrying') AND COALESCE(d.next_attempt_at, d.scheduled_at, d.created_at) <= now())
      OR (d.status IN ('leased','processing') AND d.lease_expires_at < now())
    )
      AND d.attempt_count < d.max_attempts
      AND c.opted_out_at IS NULL
      AND c.lawful_basis <> 'none'
      AND public.marketing_contact_is_eligible(c.id, d.channel)
      AND g.status = 'connected'
      AND (d.channel = 'in_app' OR COALESCE((g.capabilities ->> 'adapter_deployed')::boolean, false))
      AND i.approval_status = 'approved' AND i.approved_at = d.item_approved_at
      AND i.status IN ('scheduled','queued','leased','processing','running')
      AND (now() AT TIME ZONE 'Europe/Zurich')::time >= time '08:00'
      AND (now() AT TIME ZONE 'Europe/Zurich')::time < time '19:55'
      AND (c.last_contact_at IS NULL OR c.last_contact_at <= now() - make_interval(hours => v_frequency_cap_hours))
      AND (i.campaign_id IS NULL OR (
        campaign.approved_at IS NOT NULL AND campaign.status NOT IN ('paused','completed','cancelled','failed')
      ))
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_deliveries active
        WHERE active.contact_id = d.contact_id AND active.id <> d.id
          AND active.status IN ('leased','processing') AND active.lease_expires_at > now()
      )
  ), selected AS (
    SELECT r.id, r.due_at
    FROM ranked r
    WHERE r.contact_rank = 1
      AND (
        r.channel <> 'email'
        OR (r.domain_rank <= v_email_domain_cap AND r.email_rank <= v_email_allowance)
      )
    ORDER BY r.due_at, r.id
    LIMIT v_claim_limit
  ), candidates AS (
    SELECT d.id
    FROM public.marketing_deliveries d
    JOIN selected s ON s.id = d.id
    ORDER BY s.due_at, s.id
    FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.marketing_deliveries d SET
      status = 'leased', attempt_count = d.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 900)),
      metadata = jsonb_set(d.metadata, '{worker_id}', to_jsonb(left(COALESCE(p_worker_id, 'worker'), 120)), true)
    FROM candidates c WHERE d.id = c.id RETURNING d.*
  )
  SELECT d.id, d.item_id, d.contact_id, d.user_id, d.channel, d.provider,
    CASE WHEN d.channel = 'email' THEN c.email_normalized
         WHEN d.channel IN ('manual_call','manual_visit') THEN c.phone_normalized
         ELSE c.user_id::text END AS raw_target,
    i.content, d.attempt_count, d.max_attempts, d.lease_token, d.idempotency_key
  FROM claimed d
  JOIN public.marketing_contacts c ON c.id = d.contact_id
  JOIN public.marketing_calendar_items i ON i.id = d.item_id;
END;
$$;

-- Defaults the operator can tune from the automations screen without a
-- migration. Existing values are preserved.
UPDATE public.marketing_automations
SET conditions = jsonb_build_object(
      'email_domain_hourly_cap', 60,
      'email_bounce_rate_threshold', 0.05,
      'email_complaint_rate_threshold', 0.001
    ) || conditions
WHERE automation_key = 'global_runtime';

REVOKE ALL ON FUNCTION public.marketing_email_cadence() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marketing_email_cadence() TO service_role;
