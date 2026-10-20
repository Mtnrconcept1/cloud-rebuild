-- Disposable PostgreSQL fixture, with marketing foundation and link migration applied.
-- Every fixture mutation is rolled back. Native marketing session checks run unchanged.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-4111-8111-111111111111','admin@example.test'),
 ('22222222-2222-4222-8222-222222222222','other@example.test') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','admin'),
 ('22222222-2222-4222-8222-222222222222','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.feature_flags(name,is_active) VALUES('admin-marketing-operations',true)
 ON CONFLICT(name) DO UPDATE SET is_active=true;
INSERT INTO public.tok_connect_oauth_grants(user_id,client_id,client_name,scopes) VALUES
 ('11111111-1111-4111-8111-111111111111','marketing-smoke','Smoke client',ARRAY['account:read']);
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at) VALUES
 (repeat('a',64),repeat('b',64),'11111111-1111-4111-8111-111111111111',now(),now()+interval '1 hour'),
 (repeat('c',64),repeat('d',64),'22222222-2222-4222-8222-222222222222',now(),now()+interval '1 hour');

DO $$
DECLARE r text; f text;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='tok_connect_private.marketing_links'::regclass) THEN
   RAISE EXCEPTION 'marketing link RLS disabled';
 END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_schema_privilege(r,'tok_connect_private','USAGE') OR has_table_privilege(r,'tok_connect_private.marketing_links','SELECT') THEN
     RAISE EXCEPTION 'private link accessible by %',r;
   END IF;
   FOREACH f IN ARRAY ARRAY[
    'public.service_create_tok_marketing_link(uuid,text,text)',
    'public.service_describe_tok_marketing_link(text,uuid)',
    'public.service_authorize_tok_marketing_link(text,text,text)',
    'public.service_get_tok_marketing_link(uuid,text)',
    'public.service_revoke_tok_marketing_link(uuid,text)'
   ] LOOP
     IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION '% can execute %',r,f; END IF;
   END LOOP;
 END LOOP;
 -- Even owner execution without the service JWT must fail closed.
 BEGIN
   PERFORM public.service_get_tok_marketing_link('11111111-1111-4111-8111-111111111111','marketing-smoke');
   RAISE EXCEPTION 'missing service JWT accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE u uuid := '11111111-1111-4111-8111-111111111111'; result jsonb; native_expiry timestamptz;
BEGIN
 result := public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('e',64));
 IF result->>'status' IS DISTINCT FROM 'pending' OR (result->>'expires_at')::timestamptz > clock_timestamp()+interval '10 minutes' THEN
   RAISE EXCEPTION 'invalid pending challenge';
 END IF;
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL
   OR public.service_authorize_tok_marketing_link(repeat('0',64),repeat('a',64),repeat('b',64)) IS NOT NULL THEN
   RAISE EXCEPTION 'unapproved or unknown challenge accepted';
 END IF;
 IF public.service_describe_tok_marketing_link(repeat('e',64),'22222222-2222-4222-8222-222222222222') IS NOT NULL THEN
   RAISE EXCEPTION 'challenge shown to another user';
 END IF;
 IF public.service_describe_tok_marketing_link(repeat('e',64),u)->>'client_name' IS DISTINCT FROM 'Smoke client' THEN
   RAISE EXCEPTION 'consent client name missing';
 END IF;
 IF public.service_authorize_tok_marketing_link(repeat('e',64),repeat('c',64),repeat('d',64)) IS NOT NULL THEN
   RAISE EXCEPTION 'another marketing user authorized';
 END IF;
 IF public.service_authorize_tok_marketing_link(repeat('e',64),repeat('a',64),NULL) IS NOT NULL
    OR public.service_authorize_tok_marketing_link(repeat('e',64),repeat('a',64),repeat('f',64)) IS NOT NULL THEN
   RAISE EXCEPTION 'invalid CSRF accepted';
 END IF;
 IF public.service_authorize_tok_marketing_link(repeat('e',64),repeat('a',64),repeat('b',64)) IS DISTINCT FROM '{"ok":true}'::jsonb THEN
   RAISE EXCEPTION 'native marketing session link rejected';
 END IF;
 IF public.service_authorize_tok_marketing_link(repeat('e',64),repeat('a',64),repeat('b',64)) IS NOT NULL
   OR public.service_describe_tok_marketing_link(repeat('e',64),u) IS NOT NULL THEN RAISE EXCEPTION 'consumed challenge replay accepted'; END IF;
 result := public.service_get_tok_marketing_link(u,'marketing-smoke');
 SELECT expires_at INTO native_expiry FROM public.marketing_admin_web_sessions WHERE sid_hash=repeat('a',64);
 IF result->>'session_hash' IS DISTINCT FROM repeat('a',64) OR (result->>'expires_at')::timestamptz IS DISTINCT FROM native_expiry THEN
   RAISE EXCEPTION 'native session expiry changed';
 END IF;
 UPDATE public.tok_connect_oauth_grants SET revision=revision+1 WHERE user_id=u AND client_id='marketing-smoke';
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL THEN RAISE EXCEPTION 'stale grant revision accepted'; END IF;
 PERFORM public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('e',64));
 UPDATE public.tok_connect_oauth_grants SET revision=revision+1 WHERE user_id=u AND client_id='marketing-smoke';
 IF public.service_authorize_tok_marketing_link(repeat('e',64),repeat('a',64),repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'pending stale grant accepted'; END IF;
 PERFORM public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('e',64));
 PERFORM public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('f',64));
 IF (SELECT count(*) FROM tok_connect_private.marketing_links WHERE user_id=u AND client_id='marketing-smoke')<>1
   OR public.service_describe_tok_marketing_link(repeat('e',64),u) IS NOT NULL THEN RAISE EXCEPTION 'challenge replacement unbounded'; END IF;
 UPDATE tok_connect_private.marketing_links SET challenge_expires_at=now()-interval '1 second' WHERE user_id=u;
 IF public.service_authorize_tok_marketing_link(repeat('f',64),repeat('a',64),repeat('b',64)) IS NOT NULL THEN RAISE EXCEPTION 'expired challenge accepted'; END IF;
 PERFORM public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('e',64));
 PERFORM public.service_authorize_tok_marketing_link(repeat('e',64),repeat('a',64),repeat('b',64));
 UPDATE public.marketing_admin_web_sessions SET revoked_at=now(),revoke_reason='logout' WHERE sid_hash=repeat('a',64);
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL THEN RAISE EXCEPTION 'native logout ignored'; END IF;
 UPDATE public.marketing_admin_web_sessions SET revoked_at=NULL,revoke_reason=NULL WHERE sid_hash=repeat('a',64);
 UPDATE public.marketing_admin_web_sessions SET created_at=now()-interval '2 hours',
   mfa_verified_at=now()-interval '2 hours',expires_at=now()-interval '1 second' WHERE sid_hash=repeat('a',64);
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL THEN RAISE EXCEPTION 'native expiry ignored'; END IF;
 UPDATE public.marketing_admin_web_sessions SET created_at=now(),mfa_verified_at=now(),expires_at=native_expiry,
   revoked_at=NULL,revoke_reason=NULL WHERE sid_hash=repeat('a',64);
 UPDATE public.tok_connect_oauth_grants SET revoked_at=now() WHERE user_id=u AND client_id='marketing-smoke';
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL
   OR public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('e',64)) IS NOT NULL THEN RAISE EXCEPTION 'grant revocation ignored'; END IF;
 UPDATE public.tok_connect_oauth_grants SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE user_id=u AND client_id='marketing-smoke';
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL THEN RAISE EXCEPTION 'grant expiry ignored'; END IF;
 UPDATE public.tok_connect_oauth_grants SET expires_at=now()+interval '1 day' WHERE user_id=u AND client_id='marketing-smoke';
 UPDATE public.feature_flags SET is_active=false WHERE name='admin-marketing-operations';
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL THEN RAISE EXCEPTION 'feature disable ignored'; END IF;
 UPDATE public.feature_flags SET is_active=true WHERE name='admin-marketing-operations';
 UPDATE public.marketing_admin_web_sessions SET revoked_at=NULL,revoke_reason=NULL WHERE sid_hash=repeat('a',64);
 DELETE FROM public.user_roles WHERE user_id=u AND role::text='admin';
 IF public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL
   OR public.service_create_tok_marketing_link(u,'marketing-smoke',repeat('e',64)) IS NOT NULL THEN RAISE EXCEPTION 'admin removal ignored'; END IF;
 IF public.service_revoke_tok_marketing_link(u,'marketing-smoke') IS DISTINCT FROM true
   OR public.service_get_tok_marketing_link(u,'marketing-smoke') IS NOT NULL THEN RAISE EXCEPTION 'link revoke failed'; END IF;
END $$;
ROLLBACK;
