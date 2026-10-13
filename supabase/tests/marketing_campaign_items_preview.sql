-- Run with psql -X -v ON_ERROR_STOP=1 in a disposable migrated database only.
-- All fixtures are synthetic and rolled back. Never run against production.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.check_campaign_preview(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Campaign preview assertion failed: %', label; END IF;
END;
$$;
CREATE FUNCTION pg_temp.reject_campaign_preview(statement text, expected_state text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Campaign preview expected rejection: %', statement;
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('71300000-0000-4000-8000-000000000001','authenticated','authenticated',
  'campaign-preview@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.user_roles(user_id, role)
VALUES ('71300000-0000-4000-8000-000000000001','admin');
INSERT INTO public.feature_flags(name,label,is_active)
VALUES ('admin-marketing-operations','Campaign preview test',true)
ON CONFLICT (name) DO UPDATE SET is_active=true;
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at)
VALUES (repeat('a',64),repeat('b',64),'71300000-0000-4000-8000-000000000001',now(),now()+interval '1 hour');
INSERT INTO public.marketing_campaigns(id,name) VALUES
  ('71310000-0000-4000-8000-000000000001','Preview selected campaign'),
  ('71310000-0000-4000-8000-000000000002','Other campaign');
INSERT INTO public.marketing_calendar_items(id,campaign_id,title,channel,scheduled_at,content,status)
SELECT ('71320000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  '71310000-0000-4000-8000-000000000001','Preview post ' || n,'instagram',
  CASE WHEN n<=2 THEN '2020-01-01T10:00:00Z'::timestamptz ELSE '2035-01-01T10:00:00Z'::timestamptz END,
  jsonb_build_object('media_urls',jsonb_build_array('https://example.test/visual-' || n || '.jpg')),
  CASE WHEN n=1 THEN 'queued' WHEN n=2 THEN 'published' ELSE 'draft' END
FROM generate_series(1,304) n;
INSERT INTO public.marketing_calendar_items(id,campaign_id,title,channel,scheduled_at,content)
VALUES ('71320000-0000-4000-8000-999999999999','71310000-0000-4000-8000-000000000002',
  'Foreign post','facebook','2010-01-01T10:00:00Z','{"media_urls":["https://example.test/foreign.jpg"]}');

-- No direct read path, including a forged admin JWT or the service role.
SET LOCAL ROLE anon;
SELECT pg_temp.reject_campaign_preview($q$SELECT public.admin_list_marketing_campaign_items('71310000-0000-4000-8000-000000000001')$q$,'42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71300000-0000-4000-8000-000000000001","aal":"aal2"}',true);
SELECT pg_temp.reject_campaign_preview($q$SELECT public.admin_list_marketing_campaign_items('71310000-0000-4000-8000-000000000001')$q$,'42501');
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items','{}')$q$,'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.reject_campaign_preview($q$SELECT public.admin_list_marketing_campaign_items('71310000-0000-4000-8000-000000000001')$q$,'42501');
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('c',64),repeat('b',64),'admin_list_marketing_campaign_items','{}')$q$,'42501');
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('c',64),'admin_list_marketing_campaign_items','{}')$q$,'42501');
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items','{}')$q$,'22023');
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items','{"p_campaign_id":"71310000-0000-4000-8000-000000000001","p_cursor_id":"71320000-0000-4000-8000-000000000001"}')$q$,'22023');
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items','{"p_campaign_id":"71310000-0000-4000-8000-000000000001","p_owner_id":"forged"}')$q$,'22023');

DO $$
DECLARE
  v_args jsonb := '{"p_campaign_id":"71310000-0000-4000-8000-000000000001","p_limit":1}';
  v_first jsonb;
  v_second jsonb;
  v_last jsonb;
BEGIN
  v_first := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(jsonb_array_length(v_first->'items')=1,'page size');
  PERFORM pg_temp.check_campaign_preview(v_first#>>'{items,0,id}'='71320000-0000-4000-8000-000000000001','past post is visible outside current month');
  PERFORM pg_temp.check_campaign_preview(v_first#>>'{items,0,status}'='running','status mapping matches calendar');
  PERFORM pg_temp.check_campaign_preview(v_first#>>'{items,0,content,media_urls,0}'='https://example.test/visual-1.jpg','visual URL retained');
  PERFORM pg_temp.check_campaign_preview(v_first#>>'{items,0,campaign_name}'='Preview selected campaign','campaign name retained');
  v_args := v_args || jsonb_build_object('p_cursor_scheduled_at',v_first#>>'{next_cursor,scheduled_at}','p_cursor_id',v_first#>>'{next_cursor,id}');
  v_second := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(v_second#>>'{items,0,id}'='71320000-0000-4000-8000-000000000002','same-time cursor does not skip or duplicate posts');
  PERFORM pg_temp.check_campaign_preview(v_second#>>'{items,0,status}'='completed','published status mapping');
  v_args := v_args || jsonb_build_object('p_limit',300,'p_cursor_scheduled_at',v_second#>>'{next_cursor,scheduled_at}','p_cursor_id',v_second#>>'{next_cursor,id}');
  v_last := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(jsonb_array_length(v_last->'items')=300,'future posts visible with bounded page');
  PERFORM pg_temp.check_campaign_preview(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_last->'items') item WHERE item->>'campaign_id'<>'71310000-0000-4000-8000-000000000001'),'other campaigns never leak');
  v_args := v_args || jsonb_build_object('p_cursor_scheduled_at',v_last#>>'{next_cursor,scheduled_at}','p_cursor_id',v_last#>>'{next_cursor,id}');
  v_last := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(jsonb_array_length(v_last->'items')=2 AND v_last->'next_cursor'='null'::jsonb,'last page has no next cursor');
  v_args := '{"p_campaign_id":"71310000-0000-4000-8000-000000000001","p_limit":999999}';
  v_last := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(jsonb_array_length(v_last->'items')=300,'large limit capped');
  v_args := v_args || '{"p_limit":0}'::jsonb;
  v_last := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(jsonb_array_length(v_last->'items')=1,'zero limit bounded');
  v_args := '{"p_campaign_id":"71310000-0000-4000-8000-000000000099"}';
  v_last := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items',v_args);
  PERFORM pg_temp.check_campaign_preview(v_last='{"items":[],"next_cursor":null}'::jsonb,'missing campaign returns empty page');
END;
$$;

RESET ROLE;
DELETE FROM public.user_roles WHERE user_id='71300000-0000-4000-8000-000000000001' AND role='admin';
SET LOCAL ROLE service_role;
SELECT pg_temp.reject_campaign_preview($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_list_marketing_campaign_items','{"p_campaign_id":"71310000-0000-4000-8000-000000000001"}')$q$,'42501');
RESET ROLE;
SELECT 'PASS campaign preview: access control, CSRF, campaign boundary, old/future posts, pagination, media and limits';
ROLLBACK;
