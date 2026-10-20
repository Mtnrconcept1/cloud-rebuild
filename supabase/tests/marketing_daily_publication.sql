-- Empty disposable fixture only. No real provider, Storage or network call.
BEGIN;
CREATE FUNCTION pg_temp.check_publication(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Daily publication assertion failed: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_publication(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE = expected_state THEN RETURN; END IF; RAISE; END;
  RAISE EXCEPTION 'Expected rejection %', expected_state;
END;
$$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES ('71900000-0000-4000-8000-000000000001','publication-admin@example.test');
INSERT INTO public.user_roles VALUES ('71900000-0000-4000-8000-000000000001','admin');
INSERT INTO public.feature_flags(name,label,is_active) VALUES ('admin-marketing-operations','Fixture',true);
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at)
VALUES(repeat('a',64),repeat('b',64),'71900000-0000-4000-8000-000000000001',now(),now()+interval '1 hour');
INSERT INTO public.marketing_automations(automation_key,name,status,is_system,conditions)
VALUES('global_runtime','Global runtime','active',true,'{"global_pause":false}');
INSERT INTO public.marketing_integrations(provider,name,channel,status,public_configuration)
VALUES('instagram','Fixture Instagram','instagram','connected','{"ig_user_id":"17841447348180505"}');

CREATE FUNCTION pg_temp.configure_publication(mode text, acknowledge boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_version integer;
BEGIN
  SELECT version INTO v_version FROM public.marketing_daily_series;
  RETURN public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_upsert_marketing_daily_series',
    jsonb_build_object('p_payload',jsonb_build_object('status','active','local_time','00:00','expected_version',v_version,
      'publication_mode',mode,'publication_local_time','23:59','authorize_auto_publication',acknowledge)));
END;
$$;
CREATE FUNCTION pg_temp.publication_content(run jsonb) RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object('title','Votre carte. À portée de main.',
  'caption','Restaurateurs à Genève, préparez votre carte avec TOK. Découvrez TOK sur thetok.ch. #TOK #Geneve #MenuDigital',
  'image_url','https://daily-fixture.supabase.co/storage/v1/object/public/social-post-media/marketing-ai/tok-instagram/'
    ||(run->>'local_date')||'-'||(run->>'id')||'.jpg',
  'image_quality',jsonb_build_object('status','validated','checks',jsonb_build_object('single_visual',true,'brand_identity',true,
    'logo_intact',true,'title_exact',true,'text_legible',true,'safe_margins',true,'family_match',true,'chef_correct',true,'no_extra_claims',true),
    'dimensions',jsonb_build_object('width',1024,'height',1280),'reviewer_model','fixture','reason','Validé'),
  'visual_brand_profile','tok-v2-instagram-20261019','profile_version','tok-v2-instagram-20261019',
  'subject_id','menu','visual_family','food-photo');
$$;
CREATE FUNCTION pg_temp.claim_publication() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.claim_marketing_daily_run();
  -- Production claim runs in a later transaction than authorization. The
  -- fixture uses one transaction, so model that later job creation explicitly.
  UPDATE public.marketing_daily_runs SET created_at=clock_timestamp() WHERE id=(r->>'id')::uuid;
  RETURN r;
END;
$$;
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.check_publication((SELECT publication_mode='draft' FROM public.marketing_daily_series),'migration never opts in');
  PERFORM pg_temp.reject_publication($q$SELECT pg_temp.configure_publication('automatic')$q$,'42501');
  r := pg_temp.configure_publication('automatic',true);
  PERFORM pg_temp.check_publication(r#>>'{series,publication_mode}'='automatic' AND r#>'{series,publication_authorized}'='true'::jsonb,'MFA admin opts in explicitly');
  PERFORM pg_temp.check_publication((SELECT publication_account_id='17841447348180505' FROM public.marketing_daily_series),'authorization binds exact Instagram identity');
  PERFORM pg_temp.reject_publication($q$SELECT public.service_marketing_daily_operation(repeat('a',64),repeat('f',64),'admin_get_marketing_daily_series','{}')$q$,'42501');
  PERFORM pg_temp.check_publication(extract(epoch FROM ('2026-10-25 16:00'::timestamp AT TIME ZONE 'Europe/Zurich')
    - ('2026-10-24 16:00'::timestamp AT TIME ZONE 'Europe/Zurich'))=90000,'16h follows autumn local time');
END;
$$;
SAVEPOINT authorized_series;
DO $$
DECLARE r jsonb; done jsonb; replay jsonb; slot_available boolean;
BEGIN
  r := pg_temp.claim_publication();
  done := public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,pg_temp.publication_content(r));
  replay := public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,pg_temp.publication_content(r));
  slot_available := (((clock_timestamp() AT TIME ZONE 'Europe/Zurich')::date + time '23:59') AT TIME ZONE 'Europe/Zurich') >= clock_timestamp()+interval '2 minutes';
  PERFORM pg_temp.check_publication(done->>'calendar_item_id'=replay->>'calendar_item_id' AND (SELECT count(*)=1 FROM public.marketing_calendar_items),'completion replay creates one post only');
  PERFORM pg_temp.check_publication((SELECT CASE WHEN slot_available THEN status='scheduled' AND approval_status='approved'
    AND approved_by='71900000-0000-4000-8000-000000000001'::uuid
    AND (scheduled_at AT TIME ZONE 'Europe/Zurich')::time=time '23:59' ELSE status='draft' AND approval_status='pending' END
    FROM public.marketing_calendar_items),'only a future quality-checked job is scheduled on authorized account');
END;
$$;
ROLLBACK TO authorized_series;
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.claim_publication();
  UPDATE public.marketing_integrations SET public_configuration='{"ig_user_id":"99999999999"}' WHERE provider='instagram';
  PERFORM public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,pg_temp.publication_content(r));
  PERFORM pg_temp.check_publication((SELECT status='draft' AND approval_status='pending' FROM public.marketing_calendar_items),'changed account blocks approval');
  PERFORM pg_temp.check_publication((SELECT last_error='daily_publication_blocked' FROM public.marketing_daily_runs),'failure is visible without exposing provider data');
END;
$$;
ROLLBACK TO authorized_series;
DO $$
DECLARE r jsonb; content jsonb;
BEGIN
  r := pg_temp.claim_publication();
  content := pg_temp.publication_content(r);
  content := jsonb_set(content,'{image_quality,checks}', '{"single_visual":true}'::jsonb);
  PERFORM public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,content);
  PERFORM pg_temp.check_publication((SELECT status='draft' AND approved_at IS NULL FROM public.marketing_calendar_items),'missing quality criteria never auto approve');
END;
$$;
ROLLBACK TO authorized_series;
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.claim_publication();
  PERFORM public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,
    jsonb_set(pg_temp.publication_content(r),'{caption}',to_jsonb('Test @unverified #TOK #Geneve #MenuDigital'::text)));
  PERFORM pg_temp.check_publication((SELECT status='draft' FROM public.marketing_calendar_items),'unverified mention stays in review');
END;
$$;
ROLLBACK TO authorized_series;
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.claim_publication();
  UPDATE public.marketing_daily_series SET status='paused';
  PERFORM public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,pg_temp.publication_content(r));
  PERFORM pg_temp.check_publication((SELECT status='draft' AND approved_at IS NULL FROM public.marketing_calendar_items),'pause wins over in-flight generation');
END;
$$;
ROLLBACK TO authorized_series;
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.claim_publication();
  UPDATE public.marketing_daily_runs SET created_at=now()-interval '1 hour' WHERE id=(r->>'id')::uuid;
  PERFORM public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,pg_temp.publication_content(r));
  PERFORM pg_temp.check_publication((SELECT status='draft' FROM public.marketing_calendar_items),'jobs from before authorization remain drafts');
END;
$$;
ROLLBACK TO authorized_series;
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.claim_publication();
  UPDATE public.marketing_automations SET conditions='{"global_pause":true}' WHERE automation_key='global_runtime';
  PERFORM public.complete_marketing_daily_run((r->>'id')::uuid,(r->>'lease_token')::uuid,pg_temp.publication_content(r));
  PERFORM pg_temp.check_publication((SELECT status='draft' FROM public.marketing_calendar_items),'global pause blocks scheduling');
END;
$$;
ROLLBACK;
SELECT 'PASS daily publication: opt-in, account binding, quality, mentions, pause, historical drafts, DST and replay';
