-- Disposable fixture database only. No provider, Storage or production access.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.check_daily(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Daily Instagram assertion failed: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_daily(statement text, expected_state text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE = expected_state THEN RETURN; END IF; RAISE;
  END;
  RAISE EXCEPTION 'Expected rejection % for %', expected_state, statement;
END;
$$;
CREATE FUNCTION pg_temp.daily_content(run jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'title', 'Un repas, une bonne idée',
    'caption', 'Envie de découvrir une nouvelle table à Genève ? Retrouvez les restaurants sur TOK. #TOK #Geneve #Restaurant',
    'image_url', 'https://daily-fixture.supabase.co/storage/v1/object/public/social-post-media/marketing-ai/tok-instagram/'
      || (run ->> 'local_date') || '-' || (run ->> 'id') || '.jpg',
    'image_quality', jsonb_build_object('status','validated','checks',jsonb_build_object('single_scene',true,'clear_text',true,'brand_identity',true),
      'dimensions',jsonb_build_object('width',1024,'height',1280),'reviewer_model','fixture-reviewer','reason','Tous les critères du test sont valides.'),
    'visual_brand_profile','tok-instagram','profile_version','tok-v2-20261019','subject_id','discovery',
    'visual_family','dish','visual_prompt','Une scène TOK et son texte natif, aucun montage.',
    'reference_ids',jsonb_build_array('instagram-master','chef'),'image_model','fixture-image',
    'variation_id','discovery-dish-1','generation_source','created'
  );
$$;
CREATE FUNCTION pg_temp.reject_calendar_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Simulated calendar storage failure' USING ERRCODE = '55000'; END;
$$;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
  ('71900000-0000-4000-8000-000000000001','daily-admin@example.test'),
  ('71900000-0000-4000-8000-000000000002','daily-user@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('71900000-0000-4000-8000-000000000001','admin');
INSERT INTO public.feature_flags(name,label,is_active) VALUES ('admin-marketing-operations','Daily fixture',true);
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at) VALUES
  (repeat('a',64),repeat('b',64),'71900000-0000-4000-8000-000000000001',now(),now()+interval '1 hour'),
  (repeat('c',64),repeat('d',64),'71900000-0000-4000-8000-000000000002',now(),now()+interval '1 hour');
INSERT INTO public.marketing_automations(automation_key,name,status,is_system,conditions)
VALUES('global_runtime','Global runtime','active',true,'{"global_pause":false}');
INSERT INTO public.marketing_integrations(provider,name,channel,status,capabilities)
VALUES('meta-instagram','Fixture Instagram','instagram','connected','{"adapter_deployed":true}');

SET LOCAL ROLE anon;
SELECT pg_temp.reject_daily('SELECT * FROM public.marketing_daily_series','42501');
SELECT pg_temp.reject_daily('SELECT public.claim_marketing_daily_run()','42501');
SELECT pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(NULL,NULL,'admin_get_marketing_daily_series','{}')$q$,'42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.reject_daily('SELECT * FROM public.marketing_daily_runs','42501');
SELECT pg_temp.reject_daily('SELECT public.complete_marketing_daily_run(NULL,NULL,NULL)','42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.reject_daily('SELECT * FROM public.marketing_daily_series','42501');
SELECT pg_temp.reject_daily('UPDATE public.marketing_daily_series SET status=''active''','42501');
SELECT pg_temp.reject_daily('SELECT public.admin_get_marketing_daily_series()','42501');
SELECT pg_temp.reject_daily('SELECT public.invoke_marketing_daily_generator_cron()','42501');
SELECT pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(repeat('a',64),NULL,'admin_get_marketing_daily_series','{}')$q$,'42501');
SELECT pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(repeat('a',64),repeat('f',64),'admin_get_marketing_daily_series','{}')$q$,'42501');
SELECT pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(repeat('c',64),repeat('d',64),'admin_get_marketing_daily_series','{}')$q$,'42501');
SELECT pg_temp.check_daily(public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_get_marketing_daily_series','{}') #>> '{series,status}'='paused',
  'real service role reaches only the scoped dispatcher with a valid MFA session');
RESET ROLE;

DO $$
DECLARE v_get jsonb; v_active jsonb; v_bad jsonb;
BEGIN
  v_get := public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_get_marketing_daily_series','{}');
  PERFORM pg_temp.check_daily(v_get#>>'{series,local_time}'='10:00' AND v_get#>>'{series,timezone}'='Europe/Zurich'
    AND v_get#>'{series,requires_approval}'='true'::jsonb AND v_get#>'{series,owner_authorized}'='false'::jsonb,
    'paused singleton has Swiss defaults, no owner and required approval');
  PERFORM pg_temp.check_daily((SELECT count(*)=1 FROM public.marketing_daily_series),'migration replay does not duplicate or activate series');
  PERFORM pg_temp.check_daily((SELECT count(*)=1 FROM cron.job WHERE jobname='tok-marketing-daily-generator'),'migration replay installs exactly one distinct generator cron');
  PERFORM pg_temp.check_daily((SELECT schedule='* * * * *' AND command='SELECT public.invoke_marketing_orchestrator_cron();'
    FROM cron.job WHERE jobname='tok-marketing-orchestrator'),'existing publication cron preserved');
  PERFORM pg_temp.check_daily(public.invoke_marketing_daily_generator_cron() IS NULL AND (SELECT count(*)=0 FROM net.request_log),'paused series never invokes the provider worker');
  PERFORM pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'arbitrary_operation','{}')$q$,'22023');
  FOREACH v_bad IN ARRAY ARRAY[
    '{"status":"active","local_time":"24:00"}'::jsonb,
    '{"status":"active","local_time":"10:00","ends_at":"2026-12-31"}'::jsonb,
    '{"status":null,"local_time":"10:00"}'::jsonb,
    '{"status":"active","local_time":"10:00","channel":"facebook"}'::jsonb,
    '{"status":"active","local_time":"10:00","expected_version":1.5}'::jsonb
  ] LOOP
    PERFORM pg_temp.reject_daily(format('SELECT public.service_marketing_daily_operation(%L,%L,%L,%L::jsonb)',
      repeat('a',64),repeat('b',64),'admin_upsert_marketing_daily_series',jsonb_build_object('p_payload',v_bad)::text),'22023');
  END LOOP;
  UPDATE public.marketing_automations SET conditions='{"global_pause":true}' WHERE automation_key='global_runtime';
  PERFORM pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_upsert_marketing_daily_series','{"p_payload":{"status":"active","local_time":"00:00"}}')$q$,'55000');
  UPDATE public.marketing_automations SET conditions='{"global_pause":false}' WHERE automation_key='global_runtime';
  UPDATE cron.job SET active=false WHERE jobname='tok-marketing-daily-generator';
  PERFORM pg_temp.reject_daily($q$SELECT public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_upsert_marketing_daily_series','{"p_payload":{"status":"active","local_time":"00:00"}}')$q$,'55000');
  UPDATE cron.job SET active=true WHERE jobname='tok-marketing-daily-generator';
  v_active := public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_upsert_marketing_daily_series',
    jsonb_build_object('p_payload',jsonb_build_object('status','active','local_time','00:00','expected_version',(v_get#>>'{series,version}')::integer)));
  PERFORM pg_temp.check_daily(v_active#>>'{series,status}'='active' AND v_active#>'{series,owner_authorized}'='true'::jsonb
    AND v_active->'runtime_enabled'='true'::jsonb AND v_active->'scheduler_ready'='true'::jsonb,'authorized active series ready without public auto-approval');
  PERFORM pg_temp.reject_daily(format('SELECT public.service_marketing_daily_operation(%L,%L,%L,%L::jsonb)',repeat('a',64),repeat('b',64),
    'admin_upsert_marketing_daily_series',jsonb_build_object('p_payload',jsonb_build_object('status','paused','local_time','00:00','expected_version',(v_get#>>'{series,version}')::integer))::text),'40001');
  PERFORM pg_temp.check_daily(extract(epoch FROM ('2026-10-25 10:00'::timestamp AT TIME ZONE 'Europe/Zurich')
    - ('2026-10-24 10:00'::timestamp AT TIME ZONE 'Europe/Zurich'))=90000,'Swiss autumn transition retains local generation hour across 25 hours');
  PERFORM pg_temp.check_daily(extract(epoch FROM ('2026-03-29 10:00'::timestamp AT TIME ZONE 'Europe/Zurich')
    - ('2026-03-28 10:00'::timestamp AT TIME ZONE 'Europe/Zurich'))=82800,'Swiss spring transition retains local generation hour across 23 hours');
END;
$$;
SELECT 'PASS daily governance: RLS/ACL, MFA/CSRF/admin, strict configuration, runtime gates, revision conflict and Swiss DST';

INSERT INTO public.marketing_daily_runs(series_id,local_date,scheduled_at,actor_user_id,status,attempt_count,content,completed_at)
SELECT s.id,(now() AT TIME ZONE 'Europe/Zurich')::date-n,now()-make_interval(days=>n),s.owner_user_id,'succeeded',1,
  jsonb_build_object('title','Ancien titre '||n,'caption','Ancienne légende '||n),now()-make_interval(days=>n)
FROM public.marketing_daily_series s CROSS JOIN generate_series(1,35) n;
SAVEPOINT before_daily_claim;

DO $$
DECLARE v_run jsonb; v_retry jsonb; v_third jsonb; v_done jsonb; v_replay jsonb; v_content jsonb; v_snapshot jsonb; v_get jsonb;
BEGIN
  v_get := public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_get_marketing_daily_series','{}');
  PERFORM pg_temp.check_daily(jsonb_array_length(v_get->'recent_runs')=30,'UI history reads at most thirty runs');
  PERFORM pg_temp.check_daily(public.invoke_marketing_daily_generator_cron() IS NOT NULL,'due active series invokes its dedicated worker');
  PERFORM pg_temp.check_daily((SELECT body='{"action":"generate_daily"}'::jsonb AND timeout_milliseconds=180000
    FROM net.request_log ORDER BY id DESC LIMIT 1),'cron calls only daily generation within a bounded budget');
  v_run := public.claim_marketing_daily_run();
  v_snapshot := v_run->'recent_posts';
  PERFORM pg_temp.check_daily(v_run->>'attempt_count'='1' AND jsonb_array_length(v_snapshot)=30
    AND v_snapshot#>>'{0,title}'='Ancien titre 1','first claim snapshots bounded editorial history');
  PERFORM pg_temp.check_daily(public.claim_marketing_daily_run() IS NULL AND public.invoke_marketing_daily_generator_cron() IS NULL,'active lease prevents another worker or cron from reserving the same day');
  PERFORM pg_temp.check_daily((SELECT count(*)=1 FROM public.marketing_daily_runs WHERE local_date=(now() AT TIME ZONE 'Europe/Zurich')::date),'unique day is persisted before expensive work');
  PERFORM pg_temp.reject_daily(format('INSERT INTO public.marketing_daily_runs(series_id,local_date,scheduled_at) VALUES(%L,%L,now())',
    v_run->>'series_id',v_run->>'local_date'),'23505');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,gen_random_uuid(),NULL,%L)',v_run->>'id','provider_failed'),'40001');
  v_done := public.complete_marketing_daily_run((v_run->>'id')::uuid,(v_run->>'lease_token')::uuid,NULL,'Provider error contains an unsafe raw token');
  PERFORM pg_temp.check_daily(v_done->>'status'='retrying' AND (SELECT last_error='daily_generation_failed' FROM public.marketing_daily_runs WHERE id=(v_run->>'id')::uuid),'unsafe provider messages become bounded error codes');
  PERFORM pg_temp.check_daily(public.claim_marketing_daily_run() IS NULL,'retry respects its backoff');
  UPDATE public.marketing_daily_runs SET next_attempt_at=now()-interval '1 second' WHERE id=(v_run->>'id')::uuid;
  UPDATE public.marketing_daily_runs SET content='{"title":"Concurrent changed history","caption":"Changed"}'
    WHERE local_date=(now() AT TIME ZONE 'Europe/Zurich')::date-1;
  v_retry := public.claim_marketing_daily_run();
  PERFORM pg_temp.check_daily(v_retry->>'id'=v_run->>'id' AND v_retry->>'attempt_count'='2' AND v_retry->'recent_posts'=v_snapshot,
    'retry reuses date, run, brief snapshot and a new lease');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,NULL,%L)',v_run->>'id',v_run->>'lease_token','provider_failed'),'40001');
  UPDATE public.marketing_daily_runs SET lease_expires_at=now()-interval '1 second' WHERE id=(v_run->>'id')::uuid;
  v_third := public.claim_marketing_daily_run();
  PERFORM pg_temp.check_daily(v_third->>'id'=v_run->>'id' AND v_third->>'attempt_count'='3' AND v_third->'recent_posts'=v_snapshot,
    'expired lease recovers the same reserved day and stable prompt inputs');
  v_content := pg_temp.daily_content(v_third);
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    (v_content||'{"image_url":"https://evil.example/image.jpg"}')::text),'22023');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    jsonb_set(v_content,'{image_quality,status}','"rejected"')::text),'22023');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    jsonb_set(v_content,'{image_quality,checks,single_scene}','false')::text),'22023');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    jsonb_set(v_content,'{image_quality,dimensions,width}','1200')::text),'22023');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    (v_content||'{"approved":true}')::text),'22023');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    jsonb_set(v_content,'{caption}',to_jsonb(repeat('x',2201)))::text),'22023');
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',
    jsonb_set(v_content,'{visual_prompt}',to_jsonb(repeat('x',66000)))::text),'22023');
  PERFORM pg_temp.check_daily((SELECT count(*)=0 FROM public.marketing_calendar_items) AND (SELECT count(*)=0 FROM public.marketing_campaigns),
    'invalid image/copy/approval attempts never persist a partial campaign');
  CREATE TRIGGER fixture_reject_calendar_write BEFORE INSERT ON public.marketing_calendar_items
    FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_calendar_write();
  PERFORM pg_temp.reject_daily(format('SELECT public.complete_marketing_daily_run(%L,%L,%L::jsonb)',v_third->>'id',v_third->>'lease_token',v_content::text),'55000');
  PERFORM pg_temp.check_daily((SELECT count(*)=0 FROM public.marketing_campaigns)
    AND (SELECT status='running' FROM public.marketing_daily_runs WHERE id=(v_third->>'id')::uuid),
    'calendar write failure rolls back parent creation and run completion atomically');
  DROP TRIGGER fixture_reject_calendar_write ON public.marketing_calendar_items;
  PERFORM public.service_marketing_daily_operation(repeat('a',64),repeat('b',64),'admin_upsert_marketing_daily_series','{"p_payload":{"status":"paused","local_time":"00:00"}}');
  v_done := public.complete_marketing_daily_run((v_third->>'id')::uuid,(v_third->>'lease_token')::uuid,v_content);
  PERFORM pg_temp.check_daily(v_done->>'status'='succeeded','a pause during generation preserves a validated draft');
  v_replay := public.complete_marketing_daily_run((v_third->>'id')::uuid,(v_third->>'lease_token')::uuid,v_content);
  PERFORM pg_temp.check_daily(v_done->>'calendar_item_id'=v_replay->>'calendar_item_id' AND v_done->>'campaign_id'=v_replay->>'campaign_id'
    AND v_replay->'recovered'='true'::jsonb,'lost completion response replays existing results without duplicating work');
  PERFORM pg_temp.check_daily((SELECT count(*)=1 FROM public.marketing_calendar_items) AND (SELECT count(*)=1 FROM public.marketing_campaigns),'exactly one campaign and one calendar draft were committed');
  PERFORM pg_temp.check_daily((SELECT status='draft' AND approval_status='pending' AND approved_at IS NULL AND published_at IS NULL
    AND content->>'body'=v_content->>'caption' AND content->>'headline'='' AND content->>'visual_url'=v_content->>'image_url'
    AND content->>'visual_format'='4:5' FROM public.marketing_calendar_items WHERE id=(v_done->>'calendar_item_id')::uuid),
    'calendar contract holds native image and complete caption without duplicated headlines or auto-approval');
  PERFORM pg_temp.check_daily((SELECT status='draft' AND approved_at IS NULL AND requires_approval
    FROM public.marketing_campaigns WHERE id=(v_done->>'campaign_id')::uuid),'parent campaign still requires ordinary review');
  PERFORM pg_temp.check_daily((SELECT generated_count=1 FROM public.marketing_daily_series),'replay increments the successful count once');
  PERFORM pg_temp.check_daily((SELECT content=v_content FROM public.marketing_daily_runs WHERE id=(v_run->>'id')::uuid),'native prompt, references, model, quality and recovery source are preserved for review');
  PERFORM pg_temp.check_daily(NOT EXISTS(SELECT 1 FROM public.audit_log WHERE new_data::text LIKE '%unsafe raw token%'
    OR new_data ? 'lease_token' OR new_data ? 'recent_posts' OR new_data ? 'visual_prompt'),'audit contains decisions and IDs without tokens, raw prompts or history');
  PERFORM pg_temp.check_daily(public.claim_marketing_daily_run() IS NULL,'successful paused day cannot generate a second image');
END;
$$;
SELECT 'PASS daily execution: fixed history, leases, backoff, verified native image, atomic draft, idempotent response and paused completion';
ROLLBACK TO SAVEPOINT before_daily_claim;

DO $$
DECLARE v_run jsonb; v_done jsonb; v_next jsonb; n integer;
BEGIN
  FOR n IN 1..3 LOOP
    v_run := public.claim_marketing_daily_run();
    PERFORM pg_temp.check_daily((v_run->>'attempt_count')::integer=n,'daily attempts are bounded and increment exactly once');
    v_done := public.complete_marketing_daily_run((v_run->>'id')::uuid,(v_run->>'lease_token')::uuid,NULL,'daily_quality_rejected');
    IF n<3 THEN UPDATE public.marketing_daily_runs SET next_attempt_at=now()-interval '1 second' WHERE id=(v_run->>'id')::uuid; END IF;
  END LOOP;
  PERFORM pg_temp.check_daily(v_done->>'status'='failed' AND public.claim_marketing_daily_run() IS NULL,'three rejected results exhaust only this day');
  PERFORM pg_temp.check_daily((SELECT count(*)=0 FROM public.marketing_calendar_items),'exhausted generation never creates a publishable placeholder');
  -- Advance the fixture's failed ledger date, not the server clock. The worker
  -- must reserve only today's date and never build a missed-day backlog.
  UPDATE public.marketing_daily_runs SET local_date=local_date-90 WHERE id=(v_run->>'id')::uuid;
  v_next := public.claim_marketing_daily_run();
  PERFORM pg_temp.check_daily(v_next->>'id'<>v_run->>'id' AND v_next->>'attempt_count'='1'
    AND (v_next->>'local_date')::date=(now() AT TIME ZONE 'Europe/Zurich')::date,'failure on an earlier date does not stop the endless series');
  PERFORM pg_temp.check_daily((SELECT count(*)=2 FROM public.marketing_daily_runs WHERE status<>'succeeded'),'no missing-date burst is materialized');
END;
$$;
SELECT 'PASS daily continuity: three retries maximum and automatic next-day continuation without backfill bursts';
ROLLBACK TO SAVEPOINT before_daily_claim;

DO $$
DECLARE v_run jsonb; v_done jsonb;
BEGIN
  DELETE FROM public.user_roles WHERE user_id='71900000-0000-4000-8000-000000000001';
  PERFORM pg_temp.check_daily(public.claim_marketing_daily_run() IS NULL AND public.invoke_marketing_daily_generator_cron() IS NULL,'owner role is revalidated before spending');
  INSERT INTO public.user_roles VALUES('71900000-0000-4000-8000-000000000001','admin');
  v_run:=public.claim_marketing_daily_run();
  DELETE FROM public.user_roles WHERE user_id='71900000-0000-4000-8000-000000000001';
  v_done:=public.complete_marketing_daily_run((v_run->>'id')::uuid,(v_run->>'lease_token')::uuid,pg_temp.daily_content(v_run));
  PERFORM pg_temp.check_daily(v_done->>'status'='failed' AND (SELECT count(*)=0 FROM public.marketing_calendar_items),'lost owner authorization rejects generated content before persistence');
  PERFORM pg_temp.check_daily((SELECT last_error='daily_owner_not_authorized' FROM public.marketing_daily_runs WHERE id=(v_run->>'id')::uuid),'role loss is visible as a durable bounded failure');
END;
$$;
SELECT 'PASS daily authorization: revoked owner is refused both before generation and at completion';
ROLLBACK TO SAVEPOINT before_daily_claim;

DO $$
DECLARE v_run jsonb;
BEGIN
  INSERT INTO public.marketing_daily_runs(series_id,local_date,scheduled_at,actor_user_id,status,attempt_count,next_attempt_at)
  SELECT id,(now() AT TIME ZONE 'Europe/Zurich')::date-90,now()-interval '90 days',owner_user_id,'retrying',1,now()-interval '89 days'
  FROM public.marketing_daily_series;
  v_run:=public.claim_marketing_daily_run();
  PERFORM pg_temp.check_daily(v_run IS NOT NULL AND (v_run->>'local_date')::date=(now() AT TIME ZONE 'Europe/Zurich')::date,'resume reserves today instead of old retry dates');
  PERFORM pg_temp.check_daily((SELECT status='failed' AND last_error='daily_slot_expired' FROM public.marketing_daily_runs
    WHERE local_date=(now() AT TIME ZONE 'Europe/Zurich')::date-90),'stale queued days are recorded as expired');
  UPDATE public.marketing_daily_runs SET attempt_count=3,lease_expires_at=now()-interval '1 second' WHERE id=(v_run->>'id')::uuid;
  PERFORM pg_temp.check_daily(public.claim_marketing_daily_run() IS NULL,'third crashed attempt is not charged a fourth time');
  PERFORM pg_temp.check_daily((SELECT status='failed' AND last_error='daily_retry_exhausted' FROM public.marketing_daily_runs
    WHERE id=(v_run->>'id')::uuid),'exhausted abandoned lease becomes a terminal daily failure');
END;
$$;
SELECT 'PASS daily recovery: old slots expire, third crashed lease terminates, no obsolete daily backlog';
ROLLBACK TO SAVEPOINT before_daily_claim;

DO $$
DECLARE v_run jsonb; v_done jsonb; v_content jsonb;
BEGIN
  UPDATE public.marketing_daily_runs SET content=jsonb_set(content,'{caption}',to_jsonb(repeat('😀',2200)));
  v_run:=public.claim_marketing_daily_run();
  PERFORM pg_temp.check_daily(jsonb_array_length(v_run->'recent_posts')=30
    AND char_length(v_run#>>'{recent_posts,0,caption}')=2200,'thirty valid UTF-8 captions fit the bounded immutable snapshot');
  v_content:=pg_temp.daily_content(v_run)||jsonb_build_object('title','  Titre lisible  ','caption','  Légende lisible  ');
  v_done:=public.complete_marketing_daily_run((v_run->>'id')::uuid,(v_run->>'lease_token')::uuid,v_content);
  PERFORM pg_temp.check_daily(v_done->>'status'='succeeded' AND (SELECT content->>'title'='Titre lisible'
    AND content->>'caption'='Légende lisible' FROM public.marketing_daily_runs WHERE id=(v_run->>'id')::uuid),
    'stored copy is normalized before it becomes a future worker snapshot');
END;
$$;
SELECT 'PASS daily history: full UTF-8 bounds and normalized copy remain valid inputs for later days';
ROLLBACK;
