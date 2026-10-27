-- Run only against a disposable, migrated database. No Storage or provider call.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.assert_social(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Social image test failed: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.reject_social(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE = expected_state THEN RETURN; END IF; RAISE; END;
  RAISE EXCEPTION 'Expected rejection: %', statement;
END;
$$;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES ('71900000-0000-4000-8000-000000000001','social-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('71900000-0000-4000-8000-000000000001','admin');
INSERT INTO public.feature_flags(name,label,is_active) VALUES ('admin-marketing-operations','Social image test',true)
ON CONFLICT (name) DO UPDATE SET is_active=true;
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at)
VALUES (repeat('a',64),repeat('b',64),'71900000-0000-4000-8000-000000000001',now(),now()+interval '1 hour');
INSERT INTO public.marketing_campaigns(id,name,status) VALUES ('71920000-0000-4000-8000-000000000001','Série sociale','draft');
INSERT INTO public.marketing_calendar_items(id,campaign_id,title,channel,scheduled_at,status,approval_status,content,targeting,updated_at)
VALUES ('71930000-0000-4000-8000-000000000001','71920000-0000-4000-8000-000000000001',
  'Publication 1','instagram',now()+interval '1 day','draft','pending',
  '{"body":"Texte à conserver","visual_status":"pending_upload","visual_prompt":"Ancien prompt"}',
  '{"audience_kind":"mixed"}',now()-interval '1 hour'),
 ('71930000-0000-4000-8000-000000000002','71920000-0000-4000-8000-000000000001',
  'Publication 2','instagram',now()+interval '2 days','draft','pending',
  '{"body":"Autre texte"}','{"audience_kind":"mixed"}',now()-interval '1 hour');

SET LOCAL ROLE anon;
SELECT pg_temp.reject_social($q$SELECT public.admin_attach_marketing_social_image(NULL,NULL,NULL,NULL,NULL)$q$,'42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.reject_social($q$SELECT public.admin_attach_marketing_social_image(NULL,NULL,NULL,NULL,NULL)$q$,'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.reject_social($q$SELECT public.admin_attach_marketing_social_image(NULL,NULL,NULL,NULL,NULL)$q$,'42501');
SELECT pg_temp.reject_social($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),NULL,'admin_attach_marketing_social_image','{}')$q$,'42501');
RESET ROLE;

DO $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_other jsonb;
  v_args jsonb;
  v_result jsonb;
  v_url text := 'https://assets.example.test/storage/v1/object/public/social-post-media/marketing-social/71900000-0000-4000-8000-000000000001/71930000-0000-4000-8000-000000000001/71940000-0000-4000-8000-000000000001.png';
BEGIN
  SELECT to_jsonb(i) INTO v_before FROM public.marketing_calendar_items i WHERE id='71930000-0000-4000-8000-000000000001';
  SELECT to_jsonb(i) INTO v_other FROM public.marketing_calendar_items i WHERE id='71930000-0000-4000-8000-000000000002';
  v_args := jsonb_build_object('p_item_id',v_before->>'id','p_expected_updated_at',v_before->>'updated_at',
    'p_visual_url',v_url,'p_width',1254,'p_height',1254);
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_attach_marketing_social_image',v_args);
  SELECT to_jsonb(i) INTO v_after FROM public.marketing_calendar_items i WHERE id='71930000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_social(v_result->>'id'=v_before->>'id' AND v_result#>>'{content,visual_url}'=v_url,'response');
  PERFORM pg_temp.assert_social(v_before-'content'-'updated_at'-'version'=v_after-'content'-'updated_at'-'version','only content and revision changed');
  PERFORM pg_temp.assert_social(v_after#>>'{content,body}'='Texte à conserver' AND v_after#>>'{content,visual_format}'='1:1'
    AND v_after#>>'{content,visual_source}'='upload' AND v_after#>>'{content,visual_status}'='ready'
    AND NOT (v_after->'content' ? 'visual_prompt'),'copy and square format preserved');
  PERFORM pg_temp.assert_social((SELECT to_jsonb(i)=v_other FROM public.marketing_calendar_items i
    WHERE id='71930000-0000-4000-8000-000000000002'),'other item untouched');
  PERFORM pg_temp.reject_social(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_social_image',v_args::text),'40001');
  v_args := jsonb_set(v_args,'{p_expected_updated_at}',v_after->'updated_at');
  PERFORM pg_temp.reject_social(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_social_image',(v_args||'{"content":{"body":"forged"}}')::text),'22023');
  PERFORM pg_temp.reject_social(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_social_image',(v_args||'{"p_visual_url":"https://evil.example/other.png"}')::text),'22023');
  UPDATE public.marketing_campaigns SET approved_at=now() WHERE id='71920000-0000-4000-8000-000000000001';
  PERFORM pg_temp.reject_social(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_social_image',v_args::text),'40001');
END;
$$;
ROLLBACK;
