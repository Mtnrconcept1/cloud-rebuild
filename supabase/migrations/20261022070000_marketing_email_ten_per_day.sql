-- TOK outbound marketing email pacing: ten primary messages per Zurich day.
-- Reuses the existing advisory-locked claim_marketing_deliveries() and
-- marketing_email_cadence() path; preserves frequency, opt-in, approval,
-- suppression, quiet-hours, domain limits, circuit breaker and idempotency.
-- Copies sent as BCC count as extra Resend recipients, not separate TOK deliveries.
--
-- No campaign, delivery or contact is approved/created by this migration.
BEGIN;
UPDATE public.marketing_automations
SET conditions = jsonb_set(COALESCE(conditions, '{}'::jsonb), '{email_daily_cap}', '10'::jsonb, true)
WHERE automation_key = 'global_runtime';

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
  -- Separate, conservative email cap: does not throttle in-app or other delivery channels.
  -- The current business request is ten distinct primary recipients per Swiss day.
  v_daily_cap := LEAST(v_daily_cap,
    LEAST(GREATEST(COALESCE((v_conditions ->> 'email_daily_cap')::integer, 10), 1), 10000));
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

REVOKE ALL ON FUNCTION public.marketing_email_cadence() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marketing_email_cadence() TO service_role;
COMMENT ON FUNCTION public.marketing_email_cadence() IS
 'TOK marketing email cap defaults to ten primary recipients per Swiss calendar day; release remains paced and fail-closed.';
COMMIT;
