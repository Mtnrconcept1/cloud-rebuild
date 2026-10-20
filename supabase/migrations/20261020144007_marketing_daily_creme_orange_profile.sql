-- Accept the approved cream/orange profile while preserving v2 rollback compatibility.
-- Authorization, quality, destination and scheduling guards remain unchanged.
BEGIN;
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
       OR (NEW.content ->> 'profile_version' IS DISTINCT FROM 'tok-v2-instagram-20261019'
           AND NEW.content ->> 'profile_version' IS DISTINCT FROM 'tok-v3-creme-orange-20261020')
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
COMMIT;
