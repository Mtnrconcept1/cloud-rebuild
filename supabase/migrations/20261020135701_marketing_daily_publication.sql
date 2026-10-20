-- Standing approval is opt-in and applies ONLY to future, quality-checked TOK
-- daily Instagram jobs, on the exact integration/account authorized by an admin.
-- Existing drafts/campaigns and the global approval policy are left intact.
BEGIN;
ALTER TABLE public.marketing_daily_series
  ADD COLUMN IF NOT EXISTS publication_mode text NOT NULL DEFAULT 'draft' CHECK (publication_mode IN ('draft','automatic')),
  ADD COLUMN IF NOT EXISTS publication_local_time time NOT NULL DEFAULT time '16:00' CHECK (extract(second FROM publication_local_time) = 0),
  ADD COLUMN IF NOT EXISTS publication_integration_id uuid REFERENCES public.marketing_integrations(id),
  ADD COLUMN IF NOT EXISTS publication_account_id text,
  ADD COLUMN IF NOT EXISTS auto_authorized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_authorized_at timestamptz;

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
    'publication_status', (SELECT i.status FROM public.marketing_calendar_items i WHERE i.id = r.calendar_item_id),
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
    'generated_count', v_series.generated_count, 'requires_approval', true,
    'publication_mode', v_series.publication_mode,
    'publication_local_time', to_char(v_series.publication_local_time, 'HH24:MI'),
    'publication_authorized', v_series.auto_authorized_by = v_series.owner_user_id AND v_owner_authorized
      AND v_series.auto_authorized_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.marketing_integrations i WHERE i.id = v_series.publication_integration_id
        AND i.channel = 'instagram' AND i.provider = 'instagram' AND i.status = 'connected'
        AND i.public_configuration ->> 'ig_user_id' = v_series.publication_account_id)
  ), 'recent_runs', v_history, 'runtime_enabled', public.marketing_runtime_enabled(),
    'scheduler_ready', public.marketing_daily_scheduler_ready(), 'publisher_ready', public.marketing_scheduler_ready());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_marketing_daily_series(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_series public.marketing_daily_series%ROWTYPE;
  v_status text; v_time time; v_mode text; v_publication_time time;
  v_ack boolean; v_integration public.marketing_integrations%ROWTYPE;
  v_actor uuid;
BEGIN
  PERFORM public.marketing_require_admin();
  v_actor := public.marketing_actor_user_id();
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 2000
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN
       ('status','local_time','expected_version','publication_mode','publication_local_time','authorize_auto_publication'))
     OR jsonb_typeof(p_payload -> 'status') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload -> 'local_time') IS DISTINCT FROM 'string'
     OR p_payload ->> 'status' NOT IN ('active','paused')
     OR (p_payload ->> 'local_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR (p_payload ? 'expected_version' AND (jsonb_typeof(p_payload -> 'expected_version') IS DISTINCT FROM 'number'
       OR (p_payload ->> 'expected_version') !~ '^[0-9]{1,9}$'))
     OR (p_payload ? 'publication_mode' AND (jsonb_typeof(p_payload -> 'publication_mode') IS DISTINCT FROM 'string'
       OR p_payload ->> 'publication_mode' NOT IN ('draft','automatic')))
     OR (p_payload ? 'publication_local_time' AND (jsonb_typeof(p_payload -> 'publication_local_time') IS DISTINCT FROM 'string'
       OR (p_payload ->> 'publication_local_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
     OR (p_payload ? 'authorize_auto_publication' AND jsonb_typeof(p_payload -> 'authorize_auto_publication') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'Invalid daily series configuration' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_series FROM public.marketing_daily_series WHERE series_key = 'tok-instagram' FOR UPDATE;
  IF p_payload ? 'expected_version' AND (p_payload ->> 'expected_version')::integer <> v_series.version THEN
    RAISE EXCEPTION 'Daily series was modified by another administrator' USING ERRCODE = '40001';
  END IF;
  v_status := p_payload ->> 'status'; v_time := (p_payload ->> 'local_time')::time;
  v_mode := COALESCE(p_payload ->> 'publication_mode', v_series.publication_mode);
  v_publication_time := COALESCE((p_payload ->> 'publication_local_time')::time, v_series.publication_local_time);
  v_ack := COALESCE((p_payload ->> 'authorize_auto_publication')::boolean, false);
  IF v_status = 'active' THEN
    IF public.marketing_runtime_enabled() IS NOT TRUE THEN
      RAISE EXCEPTION 'Daily generation runtime is disabled' USING ERRCODE = '55000';
    END IF;
    IF public.marketing_daily_scheduler_ready() IS NOT TRUE THEN
      RAISE EXCEPTION 'Daily generation scheduler is unavailable' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF v_mode = 'automatic' AND (v_status = 'active' OR p_payload ? 'publication_mode' OR p_payload ? 'publication_local_time' OR v_ack) THEN
    IF NOT (p_payload ? 'expected_version') OR v_publication_time - v_time < interval '30 minutes' THEN
      RAISE EXCEPTION 'Daily publication needs a version and thirty minutes preparation' USING ERRCODE = '22023';
    END IF;
    IF public.marketing_scheduler_ready() IS NOT TRUE THEN
      RAISE EXCEPTION 'Daily publication scheduler is unavailable' USING ERRCODE = '55000';
    END IF;
    IF v_ack THEN
      IF (SELECT count(*) FROM public.marketing_integrations WHERE channel = 'instagram' AND provider = 'instagram' AND status = 'connected') <> 1 THEN
        RAISE EXCEPTION 'Exactly one connected Instagram account is required' USING ERRCODE = '55000';
      END IF;
      SELECT * INTO STRICT v_integration FROM public.marketing_integrations
      WHERE channel = 'instagram' AND provider = 'instagram' AND status = 'connected' FOR SHARE;
      IF COALESCE(v_integration.public_configuration ->> 'ig_user_id','') !~ '^[0-9]{5,30}$' THEN
        RAISE EXCEPTION 'Instagram account identity is unavailable' USING ERRCODE = '55000';
      END IF;
    ELSIF v_series.publication_mode <> 'automatic' OR v_series.auto_authorized_at IS NULL
       OR v_series.auto_authorized_by IS DISTINCT FROM v_actor OR v_series.owner_user_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Explicit daily publication authorization required' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE public.marketing_daily_series SET status = v_status, local_time = v_time,
    publication_mode = v_mode, publication_local_time = v_publication_time,
    publication_integration_id = CASE WHEN v_ack AND v_mode = 'automatic' THEN v_integration.id ELSE publication_integration_id END,
    publication_account_id = CASE WHEN v_ack AND v_mode = 'automatic' THEN v_integration.public_configuration ->> 'ig_user_id' ELSE publication_account_id END,
    auto_authorized_by = CASE WHEN v_ack AND v_mode = 'automatic' THEN v_actor ELSE auto_authorized_by END,
    auto_authorized_at = CASE WHEN v_ack AND v_mode = 'automatic' THEN clock_timestamp() ELSE auto_authorized_at END,
    owner_user_id = CASE WHEN v_status = 'active' OR (v_ack AND v_mode = 'automatic') THEN v_actor ELSE owner_user_id END,
    activated_at = CASE WHEN v_status = 'active' THEN COALESCE(activated_at, now()) ELSE activated_at END
  WHERE id = v_series.id;
  RETURN public.admin_get_marketing_daily_series();
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_schedule_authorized_daily_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_series public.marketing_daily_series%ROWTYPE;
  v_item public.marketing_calendar_items%ROWTYPE;
  v_integration public.marketing_integrations%ROWTYPE;
  v_publish_at timestamptz;
  v_quality jsonb;
  v_caption text;
BEGIN
  PERFORM public.marketing_require_service_role();
  SELECT * INTO STRICT v_series FROM public.marketing_daily_series WHERE id = NEW.series_id FOR UPDATE;
  IF v_series.publication_mode <> 'automatic' OR v_series.status <> 'active'
     OR v_series.auto_authorized_at IS NULL OR NEW.created_at < v_series.auto_authorized_at THEN RETURN NEW; END IF;
  BEGIN
    IF public.marketing_runtime_enabled() IS NOT TRUE OR public.marketing_scheduler_ready() IS NOT TRUE
       OR NEW.actor_user_id IS DISTINCT FROM v_series.auto_authorized_by
       OR v_series.owner_user_id IS DISTINCT FROM v_series.auto_authorized_by
       OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_series.auto_authorized_by AND role::text = 'admin')
       OR NEW.local_date <> (clock_timestamp() AT TIME ZONE v_series.timezone)::date THEN
      RAISE EXCEPTION 'Daily authorization is unavailable';
    END IF;
    v_publish_at := (NEW.local_date + v_series.publication_local_time) AT TIME ZONE v_series.timezone;
    IF v_publish_at < clock_timestamp() + interval '2 minutes' THEN RAISE EXCEPTION 'Daily publication slot elapsed'; END IF;
    v_quality := NEW.content -> 'image_quality';
    v_caption := NEW.content ->> 'caption';
    IF v_quality ->> 'status' IS DISTINCT FROM 'validated'
       OR EXISTS (SELECT 1 FROM unnest(ARRAY['single_visual','brand_identity','logo_intact','title_exact','text_legible',
          'safe_margins','family_match','chef_correct','no_extra_claims']) k WHERE v_quality #> ARRAY['checks',k] IS DISTINCT FROM 'true'::jsonb)
       OR v_quality #> '{dimensions,width}' IS DISTINCT FROM '1024'::jsonb
       OR v_quality #> '{dimensions,height}' IS DISTINCT FROM '1280'::jsonb
       OR NEW.content ->> 'profile_version' IS DISTINCT FROM 'tok-v2-instagram-20261019'
       OR v_caption IS NULL OR char_length(v_caption) NOT BETWEEN 1 AND 2200
       OR position('@' in v_caption) > 0
       OR (SELECT count(*) FROM regexp_matches(v_caption, '#[[:alnum:]_]+', 'g')) NOT BETWEEN 3 AND 5
       OR v_caption !~ '(^|[[:space:]])#TOK([[:space:]]|$)' OR v_caption !~ '(^|[[:space:]])#Geneve([[:space:]]|$)' THEN
      RAISE EXCEPTION 'Daily content requires review';
    END IF;
    SELECT * INTO STRICT v_item FROM public.marketing_calendar_items WHERE id = NEW.calendar_item_id FOR UPDATE;
    SELECT * INTO STRICT v_integration FROM public.marketing_integrations WHERE id = v_series.publication_integration_id FOR SHARE;
    IF v_item.status <> 'draft' OR v_item.approval_status <> 'pending' OR v_item.channel <> 'instagram'
       OR v_item.integration_id IS DISTINCT FROM v_integration.id
       OR v_item.campaign_id IS DISTINCT FROM NEW.campaign_id
       OR v_item.content ->> 'daily_run_id' IS DISTINCT FROM NEW.id::text
       OR v_item.content ->> 'daily_series_id' IS DISTINCT FROM v_series.id::text
       OR v_integration.channel <> 'instagram' OR v_integration.provider <> 'instagram' OR v_integration.status <> 'connected'
       OR v_integration.public_configuration ->> 'ig_user_id' IS DISTINCT FROM v_series.publication_account_id THEN
      RAISE EXCEPTION 'Daily Instagram destination changed';
    END IF;
    UPDATE public.marketing_campaigns SET approved_by = v_series.auto_authorized_by, approved_at = now(),
      starts_at = v_publish_at, ends_at = v_publish_at,
      metadata = metadata || jsonb_build_object('approval_source','daily-series-standing-authorization',
        'approval_reason','Autorisation quotidienne Instagram après contrôles qualité', 'authorized_at',v_series.auto_authorized_at)
    WHERE id = NEW.campaign_id AND channels = ARRAY['instagram'] AND status = 'draft'
      AND metadata ->> 'daily_run_id' = NEW.id::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'Daily campaign changed'; END IF;
    UPDATE public.marketing_calendar_items SET status = 'scheduled', approval_status = 'approved',
      approved_by = v_series.auto_authorized_by, approved_at = now(), scheduled_at = v_publish_at,
      content = content || jsonb_build_object('daily_publication_authorization', jsonb_build_object(
        'authorized_at',v_series.auto_authorized_at,'series_version',v_series.version,'account_id',v_series.publication_account_id))
    WHERE id = v_item.id;
    INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,new_data)
    VALUES (v_series.auto_authorized_by,'marketing_daily_post_scheduled','marketing_calendar_items',v_item.id,
      jsonb_build_object('daily_run_id',NEW.id,'scheduled_at',v_publish_at,'authorization_at',v_series.auto_authorized_at,
        'approval_source','daily-series-standing-authorization','external_effect',false));
  EXCEPTION WHEN OTHERS THEN
    -- A failure rolls the approval updates back, preserves the reviewed draft,
    -- and never asks the image generator to buy a replacement image.
    UPDATE public.marketing_daily_runs SET last_error = 'daily_publication_blocked' WHERE id = NEW.id;
    INSERT INTO public.audit_log(user_id,action,entity_type,entity_id,new_data)
    VALUES (NEW.actor_user_id,'marketing_daily_publication_blocked','marketing_daily_runs',NEW.id,
      jsonb_build_object('local_date',NEW.local_date,'error_code','daily_publication_blocked','external_effect',false));
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_schedule_authorized_daily_post() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS marketing_daily_publication ON public.marketing_daily_runs;
CREATE TRIGGER marketing_daily_publication AFTER UPDATE OF status ON public.marketing_daily_runs
FOR EACH ROW WHEN (NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM 'succeeded')
EXECUTE FUNCTION public.marketing_schedule_authorized_daily_post();
COMMIT;
