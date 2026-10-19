-- Disposable migrated database only. No Storage upload or email provider call.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.check_mailing_image(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mailing image assertion failed: %', label; END IF;
END;
$$;
CREATE FUNCTION pg_temp.reject_mailing_image(statement text, expected_state text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected mailing image rejection: %', statement;
END;
$$;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES ('71800000-0000-4000-8000-000000000001','mailing-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('71800000-0000-4000-8000-000000000001','admin');
INSERT INTO public.feature_flags(name,label,is_active) VALUES ('admin-marketing-operations','Mailing image test',true)
ON CONFLICT (name) DO UPDATE SET is_active=true;
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at)
VALUES (repeat('a',64),repeat('b',64),'71800000-0000-4000-8000-000000000001',now(),now()+interval '1 hour');
INSERT INTO public.marketing_campaigns(id,name,status) VALUES ('71820000-0000-4000-8000-000000000001','Campagne images','draft');
INSERT INTO public.marketing_calendar_items(id,campaign_id,title,channel,scheduled_at,status,approval_status,content,targeting,updated_at)
SELECT ('71830000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '71820000-0000-4000-8000-000000000001','E-mail '||n,'email',now()+interval '1 day','draft','pending',
  jsonb_build_object('mailing_version','tok-mailing-v1','subject','Objet '||n,'headline','Titre '||n,
    'body','Texte conservé '||n,'call_to_action','Découvrir TOK','visual_status','ready','image_mode','generated',
    'visual_url','https://assets.example.test/previous-'||n||'.jpg','visual_prompt','Prompt précédent',
    'visual_brand_profile','TOK','visual_reference_ids',jsonb_build_array('brand-reference'),'format','16:9'),
  '{"audience_kind":"mixed","recipient_emails":["chosen@example.test"]}',now()-interval '1 hour'
FROM generate_series(1,2) n;

SET LOCAL ROLE anon;
SELECT pg_temp.reject_mailing_image($q$SELECT public.admin_attach_marketing_mailing_image(NULL,NULL,NULL,NULL,NULL)$q$,'42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.reject_mailing_image($q$SELECT public.admin_attach_marketing_mailing_image(NULL,NULL,NULL,NULL,NULL)$q$,'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.reject_mailing_image($q$SELECT public.admin_attach_marketing_mailing_image(NULL,NULL,NULL,NULL,NULL)$q$,'42501');
SELECT pg_temp.reject_mailing_image($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('c',64),'admin_attach_marketing_mailing_image','{}')$q$,'42501');
SELECT pg_temp.reject_mailing_image($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),NULL,'admin_attach_marketing_mailing_image','{}')$q$,'42501');
RESET ROLE;

DO $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_other jsonb;
  v_result jsonb;
  v_args jsonb;
  v_url text := 'https://assets.example.test/storage/v1/object/public/social-post-media/marketing-mailing/71800000-0000-4000-8000-000000000001/71830000-0000-4000-8000-000000000001/71840000-0000-4000-8000-000000000001.png';
BEGIN
  SELECT to_jsonb(i) INTO v_before FROM public.marketing_calendar_items i WHERE id='71830000-0000-4000-8000-000000000001';
  SELECT to_jsonb(i) INTO v_other FROM public.marketing_calendar_items i WHERE id='71830000-0000-4000-8000-000000000002';
  v_args := jsonb_build_object('p_item_id',v_before->>'id','p_expected_updated_at',v_before->>'updated_at',
    'p_visual_url',v_url,'p_width',1200,'p_height',1600);
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_attach_marketing_mailing_image',v_args);
  PERFORM pg_temp.check_mailing_image(v_result->>'id'=v_before->>'id' AND v_result#>>'{content,visual_url}'=v_url,'saved item and URL returned');
  SELECT to_jsonb(i) INTO v_after FROM public.marketing_calendar_items i WHERE id='71830000-0000-4000-8000-000000000001';
  PERFORM pg_temp.check_mailing_image(v_before-'content'-'updated_at'-'version'=v_after-'content'-'updated_at'-'version','targeting, copy metadata, dates and approval state unchanged');
  PERFORM pg_temp.check_mailing_image(v_after#>>'{content,body}'='Texte conservé 1' AND v_after#>>'{content,subject}'='Objet 1','editorial copy preserved');
  PERFORM pg_temp.check_mailing_image(v_after#>>'{content,image_mode}'='manual' AND v_after#>>'{content,visual_source}'='upload'
    AND v_after#>>'{content,visual_status}'='ready' AND v_after#>>'{content,visual_width}'='1200'
    AND v_after#>>'{content,visual_height}'='1600','manual image and actual portrait dimensions stored');
  PERFORM pg_temp.check_mailing_image(v_after#>'{content,format}'='null'::jsonb AND v_after#>'{content,visual_format}'='null'::jsonb
    AND NOT (v_after->'content' ? 'visual_prompt') AND NOT (v_after->'content' ? 'visual_reference_ids'),'stale generated-image metadata removed');
  PERFORM pg_temp.check_mailing_image(v_after->>'updated_at' IS DISTINCT FROM v_before->>'updated_at','persisted revision advances');
  PERFORM pg_temp.check_mailing_image((SELECT to_jsonb(i)=v_other FROM public.marketing_calendar_items i WHERE id='71830000-0000-4000-8000-000000000002'),'second mail untouched');
  PERFORM pg_temp.reject_mailing_image(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_mailing_image',v_args::text),'40001');
  v_args := jsonb_set(v_args,'{p_expected_updated_at}',v_after->'updated_at');
  PERFORM pg_temp.reject_mailing_image(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_mailing_image',(v_args||'{"content":{"body":"forged"}}')::text),'22023');
  PERFORM pg_temp.reject_mailing_image(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_mailing_image',(v_args||'{"p_width":8193}')::text),'22023');
  PERFORM pg_temp.reject_mailing_image(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_mailing_image',(v_args||'{"p_visual_url":"https://other.example.test/image.png"}')::text),'22023');

  -- Campaign approval does not touch the item's timestamp. The parent lock and
  -- guard must still reject this upload with a current item revision.
  UPDATE public.marketing_campaigns SET approved_at=now() WHERE id='71820000-0000-4000-8000-000000000001';
  PERFORM pg_temp.reject_mailing_image(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
    repeat('a',64),repeat('b',64),'admin_attach_marketing_mailing_image',v_args::text),'40001');
  PERFORM pg_temp.check_mailing_image((SELECT to_jsonb(i)=v_after FROM public.marketing_calendar_items i WHERE id='71830000-0000-4000-8000-000000000001'),'failed uploads preserve existing image');
END;
$$;

SELECT 'PASS mailing image attachment: per-email update, current revisions, campaign approval, metadata, copy preservation and ACL';
ROLLBACK;
