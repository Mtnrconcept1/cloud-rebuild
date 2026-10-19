-- One native TOK Instagram draft per Swiss local day, without an end date.
-- This worker never approves or publishes: the existing review flow remains
-- authoritative. No existing campaign, scheduler, integration or secret is changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_daily_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_key text NOT NULL UNIQUE DEFAULT 'tok-instagram' CHECK (series_key = 'tok-instagram'),
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused')),
  channel text NOT NULL DEFAULT 'instagram' CHECK (channel = 'instagram'),
  timezone text NOT NULL DEFAULT 'Europe/Zurich' CHECK (timezone = 'Europe/Zurich'),
  local_time time NOT NULL DEFAULT time '10:00' CHECK (extract(second FROM local_time) = 0),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  last_run_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 160),
  generated_count bigint NOT NULL DEFAULT 0 CHECK (generated_count >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_daily_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.marketing_daily_series(id),
  local_date date NOT NULL,
  scheduled_at timestamptz NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'retrying', 'succeeded', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  recent_posts jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(recent_posts) = 'array' AND jsonb_array_length(recent_posts) <= 30
      AND octet_length(recent_posts::text) <= 300000),
  content jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 65536),
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  calendar_item_id uuid UNIQUE REFERENCES public.marketing_calendar_items(id) ON DELETE SET NULL,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT marketing_daily_runs_one_local_day UNIQUE (series_id, local_date)
);

CREATE INDEX IF NOT EXISTS marketing_daily_runs_recovery_idx
  ON public.marketing_daily_runs(series_id, lease_expires_at)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS marketing_daily_runs_history_idx
  ON public.marketing_daily_runs(series_id, local_date DESC) WHERE status = 'succeeded';

ALTER TABLE public.marketing_daily_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_daily_series FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_daily_runs FORCE ROW LEVEL SECURITY;
-- Only the exact SECURITY DEFINER RPCs below may read/write these tables.
REVOKE ALL ON TABLE public.marketing_daily_series, public.marketing_daily_runs
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS marketing_daily_series_touch ON public.marketing_daily_series;
CREATE TRIGGER marketing_daily_series_touch BEFORE UPDATE ON public.marketing_daily_series
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_version();
DROP TRIGGER IF EXISTS marketing_daily_series_audit ON public.marketing_daily_series;
CREATE TRIGGER marketing_daily_series_audit AFTER INSERT OR UPDATE ON public.marketing_daily_series
FOR EACH ROW EXECUTE FUNCTION public.marketing_write_audit();
DROP TRIGGER IF EXISTS marketing_daily_runs_touch ON public.marketing_daily_runs;
CREATE TRIGGER marketing_daily_runs_touch BEFORE UPDATE ON public.marketing_daily_runs
FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_delivery();

INSERT INTO public.marketing_daily_series(series_key, status)
VALUES ('tok-instagram', 'paused') ON CONFLICT (series_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.marketing_daily_scheduler_ready()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_job boolean; v_secrets boolean;
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL
     OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM cron.job
    WHERE jobname = ''tok-marketing-daily-generator'' AND active
      AND schedule = ''*/5 * * * *''
      AND command = ''SELECT public.invoke_marketing_daily_generator_cron();'')' INTO v_job;
  EXECUTE 'SELECT
    EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = ''internal_cron_secret''
      AND length(btrim(decrypted_secret)) >= 32)
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = ''marketing_edge_url''
      AND btrim(decrypted_secret) ~ ''^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$'')'
    INTO v_secrets;
  RETURN COALESCE(v_job, false) AND COALESCE(v_secrets, false);
EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_function THEN
  RETURN false;
END;
$$;

-- A day that failed its three attempts never blocks the following day. Past
-- dates are never added to a backlog; a resumed series considers today only.
CREATE OR REPLACE FUNCTION public.marketing_daily_is_due()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.marketing_runtime_enabled() AND EXISTS (
    SELECT 1 FROM public.marketing_daily_series s
    WHERE s.series_key = 'tok-instagram' AND s.status = 'active'
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = s.owner_user_id AND ur.role::text = 'admin')
      AND (now() AT TIME ZONE s.timezone)::time >= s.local_time
      AND NOT EXISTS (SELECT 1 FROM public.marketing_daily_runs busy
        WHERE busy.series_id = s.id AND busy.status = 'running' AND busy.lease_expires_at > now())
      AND NOT EXISTS (SELECT 1 FROM public.marketing_daily_runs r
        WHERE r.series_id = s.id AND r.local_date = (now() AT TIME ZONE s.timezone)::date
          AND (r.status IN ('succeeded', 'failed')
            OR (r.status = 'retrying' AND r.next_attempt_at > now())))
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_get_marketing_daily_series()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_series public.marketing_daily_series%ROWTYPE;
  v_today_run public.marketing_daily_runs%ROWTYPE;
  v_today date;
  v_next timestamptz;
  v_history jsonb;
  v_owner_authorized boolean;
BEGIN
  PERFORM public.marketing_require_admin();
  SELECT * INTO STRICT v_series FROM public.marketing_daily_series WHERE series_key = 'tok-instagram';
  v_today := (now() AT TIME ZONE v_series.timezone)::date;
  SELECT * INTO v_today_run FROM public.marketing_daily_runs WHERE series_id = v_series.id AND local_date = v_today;
  v_owner_authorized := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_series.owner_user_id AND role::text = 'admin');
  IF v_series.status = 'active' AND v_owner_authorized THEN
    v_next := CASE
      WHEN v_today_run.status IN ('succeeded', 'failed') THEN (v_today + 1 + v_series.local_time) AT TIME ZONE v_series.timezone
      WHEN v_today_run.status = 'retrying' THEN v_today_run.next_attempt_at
      WHEN v_today_run.status = 'running' THEN v_today_run.lease_expires_at
      ELSE (v_today + v_series.local_time) AT TIME ZONE v_series.timezone END;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'local_date', r.local_date, 'status', r.status,
    'attempt_count', r.attempt_count, 'scheduled_at', r.scheduled_at,
    'next_attempt_at', r.next_attempt_at, 'completed_at', r.completed_at,
    'last_error', r.last_error, 'calendar_item_id', r.calendar_item_id,
    'campaign_id', r.campaign_id, 'title', r.content ->> 'title', 'image_url', r.content ->> 'image_url'
  ) ORDER BY r.local_date DESC), '[]'::jsonb) INTO v_history
  FROM (SELECT * FROM public.marketing_daily_runs WHERE series_id = v_series.id ORDER BY local_date DESC LIMIT 30) r;
  RETURN jsonb_build_object('series', jsonb_build_object(
    'id', v_series.id, 'key', v_series.series_key, 'status', v_series.status,
    'channel', v_series.channel, 'timezone', v_series.timezone,
    'local_time', to_char(v_series.local_time, 'HH24:MI'), 'format', '4:5',
    'version', v_series.version, 'owner_authorized', v_owner_authorized,
    'activated_at', v_series.activated_at, 'created_at', v_series.created_at,
    'updated_at', v_series.updated_at, 'next_run_at', v_next,
    'last_run_at', v_series.last_run_at, 'last_error', v_series.last_error,
    'generated_count', v_series.generated_count, 'requires_approval', true
  ), 'recent_runs', v_history, 'runtime_enabled', public.marketing_runtime_enabled(),
    'scheduler_ready', public.marketing_daily_scheduler_ready());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_daily_series(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_series public.marketing_daily_series%ROWTYPE; v_status text; v_local_time text;
BEGIN
  PERFORM public.marketing_require_admin();
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 2000
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('status', 'local_time', 'expected_version'))
     OR jsonb_typeof(p_payload -> 'status') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload -> 'local_time') IS DISTINCT FROM 'string'
     OR p_payload ->> 'status' NOT IN ('active', 'paused')
     OR (p_payload ->> 'local_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR (p_payload ? 'expected_version' AND (jsonb_typeof(p_payload -> 'expected_version') IS DISTINCT FROM 'number'
       OR (p_payload ->> 'expected_version') !~ '^[0-9]{1,9}$')) THEN
    RAISE EXCEPTION 'Invalid daily series configuration' USING ERRCODE = '22023';
  END IF;
  v_status := p_payload ->> 'status'; v_local_time := p_payload ->> 'local_time';
  SELECT * INTO STRICT v_series FROM public.marketing_daily_series WHERE series_key = 'tok-instagram' FOR UPDATE;
  IF p_payload ? 'expected_version' AND (p_payload ->> 'expected_version')::integer <> v_series.version THEN
    RAISE EXCEPTION 'Daily series was modified by another administrator' USING ERRCODE = '40001';
  END IF;
  IF v_status = 'active' THEN
    IF public.marketing_runtime_enabled() IS NOT TRUE THEN
      RAISE EXCEPTION 'Daily generation runtime is disabled' USING ERRCODE = '55000';
    END IF;
    IF public.marketing_daily_scheduler_ready() IS NOT TRUE THEN
      RAISE EXCEPTION 'Daily generation scheduler is unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;
  UPDATE public.marketing_daily_series SET status = v_status, local_time = v_local_time::time,
    owner_user_id = CASE WHEN v_status = 'active' THEN public.marketing_actor_user_id() ELSE owner_user_id END,
    activated_at = CASE WHEN v_status = 'active' THEN COALESCE(activated_at, now()) ELSE activated_at END
  WHERE id = v_series.id;
  RETURN public.admin_get_marketing_daily_series();
END;
$$;

CREATE OR REPLACE FUNCTION public.service_marketing_daily_operation(
  p_sid_hash text, p_csrf_hash text, p_operation text, p_args jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_session jsonb; v_actor uuid; v_result jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  IF COALESCE(p_csrf_hash ~ '^[0-9a-f]{64}$', false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Active marketing BFF session and CSRF proof required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_args) IS DISTINCT FROM 'object' OR octet_length(p_args::text) > 4000 THEN
    RAISE EXCEPTION 'Invalid daily series arguments' USING ERRCODE = '22023';
  END IF;
  v_session := public.service_get_marketing_web_session(p_sid_hash, p_csrf_hash, true);
  v_actor := NULLIF(v_session ->> 'user_id', '')::uuid;
  IF v_actor IS NULL OR v_session ->> 'mfa_verified_at' IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_actor AND role::text = 'admin') THEN
    RAISE EXCEPTION 'Active marketing BFF session and CSRF proof required' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.marketing_actor_user_id', v_actor::text, true);
  PERFORM set_config('app.marketing_web_session_sid_hash', p_sid_hash, true);
  PERFORM set_config('app.marketing_operation', COALESCE(p_operation, ''), true);
  CASE p_operation
    WHEN 'admin_get_marketing_daily_series' THEN
      IF p_args <> '{}'::jsonb THEN RAISE EXCEPTION 'Invalid daily series arguments' USING ERRCODE = '22023'; END IF;
      v_result := public.admin_get_marketing_daily_series();
    WHEN 'admin_upsert_marketing_daily_series' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_args) k WHERE k <> 'p_payload') THEN
        RAISE EXCEPTION 'Invalid daily series arguments' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_upsert_marketing_daily_series(p_args -> 'p_payload');
    ELSE RAISE EXCEPTION 'Daily series operation is not allowlisted' USING ERRCODE = '22023';
  END CASE;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketing_daily_run(p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_series public.marketing_daily_series%ROWTYPE;
  v_run public.marketing_daily_runs%ROWTYPE;
  v_today date;
  v_recent jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT * INTO v_series FROM public.marketing_daily_series WHERE series_key = 'tok-instagram' FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR public.marketing_daily_is_due() IS NOT TRUE THEN RETURN NULL; END IF;
  v_today := (now() AT TIME ZONE v_series.timezone)::date;
  PERFORM set_config('app.marketing_actor_user_id', v_series.owner_user_id::text, true);
  -- Abandon expired historical work, never regenerate historical dates in a burst.
  UPDATE public.marketing_daily_runs SET status = 'failed', last_error = 'daily_slot_expired',
    completed_at = now(), next_attempt_at = NULL, lease_token = NULL, lease_expires_at = NULL
  WHERE series_id = v_series.id AND local_date < v_today AND status IN ('running', 'retrying');

  SELECT * INTO v_run FROM public.marketing_daily_runs WHERE series_id = v_series.id AND local_date = v_today FOR UPDATE;
  IF FOUND AND v_run.attempt_count >= 3 THEN
    UPDATE public.marketing_daily_runs SET status = 'failed', last_error = 'daily_retry_exhausted',
      completed_at = now(), next_attempt_at = NULL, lease_expires_at = NULL
    WHERE id = v_run.id;
    UPDATE public.marketing_daily_series SET last_error = 'daily_retry_exhausted' WHERE id = v_series.id;
    RETURN NULL;
  END IF;
  IF v_run.id IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('title', h.content ->> 'title',
      'caption', h.content ->> 'caption', 'local_date', h.local_date) ORDER BY h.local_date DESC), '[]'::jsonb)
    INTO v_recent FROM (SELECT content, local_date FROM public.marketing_daily_runs
      WHERE series_id = v_series.id AND status = 'succeeded' AND local_date < v_today
      ORDER BY local_date DESC LIMIT 30) h;
    INSERT INTO public.marketing_daily_runs(series_id, local_date, scheduled_at, actor_user_id, recent_posts)
    VALUES (v_series.id, v_today, (v_today + v_series.local_time) AT TIME ZONE v_series.timezone,
      v_series.owner_user_id, v_recent) RETURNING * INTO v_run;
  END IF;
  -- A retry retains the original actor and anti-repetition snapshot. A newly
  -- delegated administrator can resume the series but cannot impersonate it.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_run.actor_user_id AND role::text = 'admin') THEN
    UPDATE public.marketing_daily_runs SET status = 'failed', last_error = 'daily_owner_not_authorized',
      completed_at = now(), next_attempt_at = NULL, lease_token = NULL, lease_expires_at = NULL WHERE id = v_run.id;
    UPDATE public.marketing_daily_series SET last_error = 'daily_owner_not_authorized' WHERE id = v_series.id;
    RETURN NULL;
  END IF;
  UPDATE public.marketing_daily_runs SET status = 'running', attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 300), 180), 900)),
    next_attempt_at = NULL, last_error = NULL
  WHERE id = v_run.id RETURNING * INTO v_run;
  UPDATE public.marketing_daily_series SET last_run_at = now(), last_error = NULL WHERE id = v_series.id;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, new_data)
  VALUES (v_run.actor_user_id, 'marketing_daily_claim', 'marketing_daily_runs', v_run.id,
    jsonb_build_object('local_date', v_run.local_date, 'attempt_count', v_run.attempt_count, 'external_effect', false));
  RETURN jsonb_build_object('id', v_run.id, 'series_id', v_run.series_id, 'local_date', v_run.local_date,
    'scheduled_at', v_run.scheduled_at, 'attempt_count', v_run.attempt_count, 'lease_token', v_run.lease_token,
    'actor_user_id', v_run.actor_user_id, 'recent_posts', v_run.recent_posts);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_marketing_daily_run(
  p_run_id uuid, p_lease_token uuid, p_content jsonb, p_error text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_series public.marketing_daily_series%ROWTYPE;
  v_run public.marketing_daily_runs%ROWTYPE;
  v_series_id uuid;
  v_origin text;
  v_image_url text;
  v_campaign_id uuid;
  v_item_id uuid;
  v_integration_id uuid;
  v_error text;
  v_item_content jsonb;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT series_id INTO v_series_id FROM public.marketing_daily_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Daily generation run not found' USING ERRCODE = 'P0002'; END IF;
  -- Same lock order as claim/upsert: series before run, including pause races.
  SELECT * INTO STRICT v_series FROM public.marketing_daily_series WHERE id = v_series_id FOR UPDATE;
  SELECT * INTO STRICT v_run FROM public.marketing_daily_runs WHERE id = p_run_id FOR UPDATE;
  IF p_lease_token IS NULL OR v_run.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Daily generation lease mismatch' USING ERRCODE = '40001';
  END IF;
  IF v_run.status = 'succeeded' THEN
    RETURN jsonb_build_object('id', v_run.id, 'status', v_run.status, 'calendar_item_id', v_run.calendar_item_id,
      'campaign_id', v_run.campaign_id, 'next_attempt_at', NULL, 'recovered', true);
  END IF;
  IF v_run.status <> 'running' OR v_run.lease_expires_at IS NULL OR v_run.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Daily generation lease expired or run is not active' USING ERRCODE = '40001';
  END IF;
  PERFORM set_config('app.marketing_actor_user_id', v_run.actor_user_id::text, true);
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_run.actor_user_id AND role::text = 'admin')
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_series.owner_user_id AND role::text = 'admin') THEN
    p_error := 'daily_owner_not_authorized';
  END IF;
  IF p_error IS NOT NULL THEN
    v_error := CASE WHEN p_error ~ '^[a-z][a-z0-9_.:-]{0,159}$' THEN p_error ELSE 'daily_generation_failed' END;
    UPDATE public.marketing_daily_runs SET
      status = CASE WHEN attempt_count < 3 AND v_error <> 'daily_owner_not_authorized' THEN 'retrying' ELSE 'failed' END,
      next_attempt_at = CASE WHEN attempt_count < 3 AND v_error <> 'daily_owner_not_authorized'
        THEN now() + make_interval(mins => (5 * power(2, attempt_count - 1))::integer) END,
      lease_expires_at = NULL, last_error = v_error,
      completed_at = CASE WHEN attempt_count >= 3 OR v_error = 'daily_owner_not_authorized' THEN now() END
    WHERE id = v_run.id RETURNING * INTO v_run;
    UPDATE public.marketing_daily_series SET last_error = v_error WHERE id = v_series.id;
  ELSE
    IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR octet_length(p_content::text) > 65536
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_content) k WHERE k NOT IN (
         'title', 'caption', 'image_url', 'image_quality', 'visual_brand_profile', 'profile_version',
         'subject_id', 'visual_family', 'visual_prompt', 'reference_ids', 'image_model', 'variation_id', 'generation_source'))
       OR jsonb_typeof(p_content -> 'title') IS DISTINCT FROM 'string'
       OR char_length(btrim(p_content ->> 'title')) NOT BETWEEN 1 AND 200
       OR jsonb_typeof(p_content -> 'caption') IS DISTINCT FROM 'string'
       OR char_length(btrim(p_content ->> 'caption')) NOT BETWEEN 1 AND 2200
       OR jsonb_typeof(p_content -> 'image_url') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_content -> 'image_quality') IS DISTINCT FROM 'object'
       OR p_content #>> '{image_quality,status}' IS DISTINCT FROM 'validated'
       OR octet_length((p_content -> 'image_quality')::text) > 16384
       OR jsonb_typeof(p_content #> '{image_quality,checks}') IS DISTINCT FROM 'object'
       OR p_content #> '{image_quality,checks}' = '{}'::jsonb
       OR EXISTS (SELECT 1 FROM jsonb_each(p_content #> '{image_quality,checks}') c WHERE c.value IS DISTINCT FROM 'true'::jsonb)
       OR jsonb_typeof(p_content #> '{image_quality,dimensions}') IS DISTINCT FROM 'object'
       OR p_content #> '{image_quality,dimensions,width}' IS DISTINCT FROM '1024'::jsonb
       OR p_content #> '{image_quality,dimensions,height}' IS DISTINCT FROM '1280'::jsonb
       OR jsonb_typeof(p_content #> '{image_quality,reviewer_model}') IS DISTINCT FROM 'string'
       OR char_length(btrim(p_content #>> '{image_quality,reviewer_model}')) NOT BETWEEN 1 AND 120
       OR jsonb_typeof(p_content #> '{image_quality,reason}') IS DISTINCT FROM 'string'
       OR char_length(p_content #>> '{image_quality,reason}') > 1000
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['visual_brand_profile', 'profile_version', 'subject_id', 'visual_family']) k
         WHERE jsonb_typeof(p_content -> k) IS DISTINCT FROM 'string'
           OR (p_content ->> k) !~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$') THEN
      RAISE EXCEPTION 'Invalid validated daily content' USING ERRCODE = '22023';
    END IF;
    IF (p_content ? 'visual_prompt' AND (jsonb_typeof(p_content -> 'visual_prompt') IS DISTINCT FROM 'string'
         OR char_length(p_content ->> 'visual_prompt') > 16000))
       OR (p_content ? 'reference_ids' AND (jsonb_typeof(p_content -> 'reference_ids') IS DISTINCT FROM 'array'
         OR jsonb_array_length(p_content -> 'reference_ids') NOT BETWEEN 1 AND 10))
       OR (p_content ? 'reference_ids' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_content -> 'reference_ids') r
         WHERE jsonb_typeof(r) IS DISTINCT FROM 'string' OR char_length(r #>> '{}') NOT BETWEEN 1 AND 100))
       OR (p_content ? 'image_model' AND (jsonb_typeof(p_content -> 'image_model') IS DISTINCT FROM 'string'
         OR char_length(p_content ->> 'image_model') > 120))
       OR (p_content ? 'variation_id' AND (jsonb_typeof(p_content -> 'variation_id') IS DISTINCT FROM 'string'
         OR char_length(p_content ->> 'variation_id') > 160))
       OR (p_content ? 'generation_source' AND (jsonb_typeof(p_content -> 'generation_source') IS DISTINCT FROM 'string'
         OR (p_content ->> 'generation_source') NOT IN ('created', 'recovered'))) THEN
      RAISE EXCEPTION 'Invalid daily generation trace' USING ERRCODE = '22023';
    END IF;
    IF to_regclass('vault.decrypted_secrets') IS NULL THEN
      RAISE EXCEPTION 'Daily generation storage origin is unavailable' USING ERRCODE = '55000';
    END IF;
    EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''marketing_edge_url'' LIMIT 1' INTO v_origin;
    IF COALESCE(v_origin ~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/marketing-orchestrator$', false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Daily generation storage origin is unavailable' USING ERRCODE = '55000';
    END IF;
    v_origin := regexp_replace(v_origin, '/functions/v1/marketing-orchestrator$', '');
    v_image_url := v_origin || '/storage/v1/object/public/social-post-media/marketing-ai/tok-instagram/'
      || v_run.local_date::text || '-' || v_run.id::text || '.jpg';
    IF p_content ->> 'image_url' IS DISTINCT FROM v_image_url THEN
      RAISE EXCEPTION 'Invalid daily image storage path' USING ERRCODE = '22023';
    END IF;
    p_content := p_content || jsonb_build_object('title', btrim(p_content ->> 'title'), 'caption', btrim(p_content ->> 'caption'));
    SELECT id INTO v_integration_id FROM public.marketing_integrations WHERE channel = 'instagram'
      ORDER BY (status = 'connected') DESC, updated_at DESC, id LIMIT 1;
    v_item_content := jsonb_build_object(
      'subject', NULL, 'headline', '', 'body', btrim(p_content ->> 'caption'), 'call_to_action', '', 'hashtags', '[]'::jsonb,
      'visual_url', v_image_url, 'format', '4:5', 'visual_format', '4:5', 'visual_required', true, 'visual_status', 'ready',
      'visual_brand_profile', p_content ->> 'visual_brand_profile', 'profile_version', p_content ->> 'profile_version',
      'visual_reference_ids', COALESCE(p_content -> 'reference_ids', '[]'::jsonb),
      'visual_prompt', p_content ->> 'visual_prompt', 'image_quality', p_content -> 'image_quality',
      'subject_id', p_content ->> 'subject_id', 'visual_family', p_content ->> 'visual_family',
      'daily_series_id', v_series.id, 'daily_run_id', v_run.id, 'generated_by', 'marketing-daily-generator');
    INSERT INTO public.marketing_campaigns(name, objective, content, status, channels, timezone,
      starts_at, ends_at, audience_name, audience_definition, created_by, metadata)
    VALUES ('TOK Instagram · ' || v_run.local_date::text,
      'Un message TOK clair, un visuel individuel fidèle à la référence Instagram.',
      jsonb_build_object('message', p_content ->> 'caption', 'summary', p_content ->> 'title'),
      'draft', ARRAY['instagram'], 'Europe/Zurich', v_run.scheduled_at, v_run.scheduled_at,
      'Communauté TOK · Genève', '{"audience_kind":"mixed","canton":"GE"}'::jsonb, v_run.actor_user_id,
      jsonb_build_object('generated_by', 'marketing-daily-generator', 'daily_series_id', v_series.id, 'daily_run_id', v_run.id))
    RETURNING id INTO v_campaign_id;
    INSERT INTO public.marketing_calendar_items(campaign_id, integration_id, title, channel, item_type,
      status, approval_status, scheduled_at, timezone, audience_name, targeting, content, idempotency_key, created_by)
    VALUES (v_campaign_id, v_integration_id, btrim(p_content ->> 'title'), 'instagram', 'publication',
      'draft', 'pending', v_run.scheduled_at, 'Europe/Zurich', 'Communauté TOK · Genève',
      '{"audience_kind":"mixed","canton":"GE"}'::jsonb, v_item_content,
      'tok-instagram-daily:' || v_series.id::text || ':' || v_run.local_date::text, v_run.actor_user_id)
    RETURNING id INTO v_item_id;
    -- Keep the successful token solely for idempotent completion replay; it is
    -- never returned to the browser or written to the audit log.
    UPDATE public.marketing_daily_runs SET status = 'succeeded', content = p_content,
      campaign_id = v_campaign_id, calendar_item_id = v_item_id, completed_at = now(),
      lease_expires_at = NULL, next_attempt_at = NULL, last_error = NULL
    WHERE id = v_run.id RETURNING * INTO v_run;
    UPDATE public.marketing_daily_series SET generated_count = generated_count + 1, last_error = NULL
    WHERE id = v_series.id;
  END IF;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, new_data)
  VALUES (v_run.actor_user_id, 'marketing_daily_complete', 'marketing_daily_runs', v_run.id,
    jsonb_build_object('local_date', v_run.local_date, 'status', v_run.status, 'attempt_count', v_run.attempt_count,
      'calendar_item_id', v_run.calendar_item_id, 'last_error', v_run.last_error, 'external_effect', false));
  RETURN jsonb_build_object('id', v_run.id, 'status', v_run.status, 'calendar_item_id', v_run.calendar_item_id,
    'campaign_id', v_run.campaign_id, 'next_attempt_at', v_run.next_attempt_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_marketing_daily_generator_cron()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_edge_url text; v_secret text; v_request_id bigint;
BEGIN
  IF public.marketing_daily_is_due() IS NOT TRUE OR public.marketing_daily_scheduler_ready() IS NOT TRUE THEN RETURN NULL; END IF;
  EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''marketing_edge_url'' LIMIT 1' INTO v_edge_url;
  EXECUTE 'SELECT btrim(decrypted_secret) FROM vault.decrypted_secrets WHERE name = ''internal_cron_secret'' LIMIT 1' INTO v_secret;
  SELECT net.http_post(url := v_edge_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-cron-secret', v_secret),
    body := '{"action":"generate_daily"}'::jsonb, timeout_milliseconds := 180000) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.marketing_daily_scheduler_ready(), public.marketing_daily_is_due(),
  public.admin_get_marketing_daily_series(), public.admin_upsert_marketing_daily_series(jsonb),
  public.service_marketing_daily_operation(text, text, text, jsonb),
  public.claim_marketing_daily_run(integer), public.complete_marketing_daily_run(uuid, uuid, jsonb, text),
  public.invoke_marketing_daily_generator_cron()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_marketing_daily_operation(text, text, text, jsonb),
  public.claim_marketing_daily_run(integer), public.complete_marketing_daily_run(uuid, uuid, jsonb, text)
  TO service_role;

-- This distinct schedule never touches the existing publication cron. It is
-- harmless while the series is paused and resolves only existing Vault entries.
DO $daily_scheduler$
DECLARE v_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL OR to_regprocedure('cron.schedule(text,text,text)') IS NULL
     OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE NOTICE 'Daily generator scheduler not installed: pg_cron or pg_net unavailable';
    RETURN;
  END IF;
  EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = ''tok-marketing-daily-generator'' LIMIT 1' INTO v_job;
  IF v_job IS NULL THEN
    PERFORM cron.schedule('tok-marketing-daily-generator', '*/5 * * * *', 'SELECT public.invoke_marketing_daily_generator_cron();');
  END IF;
END;
$daily_scheduler$;

COMMIT;
