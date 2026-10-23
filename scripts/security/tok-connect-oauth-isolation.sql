\set ON_ERROR_STOP on
-- Destructive fixture setup is allowed only in a disposable database with this exact name.
SELECT current_database() = 'tok_connect_security_test' AS fixture_database_ok \gset
\if :fixture_database_ok
\else
  \echo 'Refusing to run outside tok_connect_security_test'
  \quit 1
\endif

CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA realtime;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth, storage, realtime, extensions TO anon, authenticated, service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.oauth_authorizations(client_id uuid, user_id uuid, redirect_uri text, code_challenge text, code_challenge_method text, authorization_code text, status text, expires_at timestamptz, response_type text);
CREATE TABLE public.restaurants(id uuid PRIMARY KEY, owner_id uuid REFERENCES auth.users, name text, tok_connect_mcp_enabled boolean DEFAULT true);
CREATE TABLE public.restaurant_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid, user_id uuid, role text);
CREATE TABLE public.menu_items(id uuid PRIMARY KEY, restaurant_id uuid, name text);
CREATE TABLE storage.objects(id uuid PRIMARY KEY, owner_id uuid);
CREATE TABLE realtime.messages(id uuid PRIMARY KEY, owner_id uuid);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_restaurants ON public.restaurants TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY self_staff ON public.restaurant_staff TO authenticated USING (user_id = auth.uid());
CREATE POLICY owner_menu ON public.menu_items TO authenticated USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid()));
CREATE POLICY self_storage ON storage.objects TO authenticated USING (owner_id = auth.uid());
CREATE POLICY self_realtime ON realtime.messages TO authenticated USING (owner_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, storage, realtime TO authenticated;
CREATE FUNCTION public.enforce_launch_gate() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('tok.fixture.launch_block', true) = 'true' THEN RAISE EXCEPTION 'launch_gate_blocked' USING ERRCODE = 'PT403'; END IF;
END $$;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.enforce_launch_gate';
DO $$ BEGIN EXECUTE format('ALTER ROLE authenticator IN DATABASE %I SET pgrst.db_pre_request = %L', current_database(), 'public.enforce_launch_gate'); END $$;
CREATE FUNCTION public.fixture_assert(p_condition boolean, p_message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Fixture failed: %', p_message; END IF;
END $$;
CREATE FUNCTION public.fixture_expect_error(p_sql text, p_state text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE observed text;
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN others THEN GET STACKED DIAGNOSTICS observed = RETURNED_SQLSTATE; END;
  PERFORM public.fixture_assert(observed = p_state, 'expected SQLSTATE ' || p_state || ', received ' || coalesce(observed, 'success'));
END $$;
CREATE FUNCTION public.fixture_sensitive_rpc() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT count(*) FROM public.menu_items $$;
GRANT EXECUTE ON FUNCTION public.fixture_sensitive_rpc(), public.fixture_assert(boolean,text), public.fixture_expect_error(text,text) TO authenticated, service_role;

\ir ../../supabase/migrations/20261018142000_tok_connect_oauth_delegation.sql
\ir ../../supabase/migrations/20261023043000_tok_connect_broker_access_lifetime.sql

SELECT public.fixture_assert(EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole,
  LATERAL unnest(s.setconfig) AS config(value) WHERE r.rolname='authenticator'
  AND s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())
  AND value='pgrst.db_pre_request=public.enforce_tok_connect_oauth_and_launch_gate'), 'effective database role hook composed');

INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
INSERT INTO public.restaurants VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Owned A',true), ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Owned B',true);
INSERT INTO public.menu_items VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic A'), ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic B');
INSERT INTO storage.objects VALUES ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
INSERT INTO realtime.messages VALUES ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
SET ROLE service_role;
SELECT public.service_store_tok_connect_broker_client('client-a','Synthetic A',ARRAY['https://client.example/callback'],repeat('x',64));
SELECT public.service_store_tok_connect_broker_client('client-b','Synthetic B',ARRAY['https://client.example/callback'],repeat('x',64));
SELECT public.service_store_tok_connect_broker_client('40000000-0000-4000-8000-000000000001','S256 proof',ARRAY['https://client.example/callback'],repeat('x',64));
RESET ROLE;
INSERT INTO auth.oauth_authorizations VALUES ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','https://client.example/callback','synthetic-challenge','s256','synthetic-code','approved',now()+interval '5 minutes','code');
SET ROLE service_role;
SELECT public.fixture_assert(public.service_verify_tok_connect_broker_authorization('40000000-0000-4000-8000-000000000001',encode(extensions.digest('synthetic-code','sha256'),'hex'),'https://client.example/callback','synthetic-challenge'), 'approved native S256 code accepted');
SELECT public.fixture_assert(NOT public.service_verify_tok_connect_broker_authorization('40000000-0000-4000-8000-000000000001',encode(extensions.digest('synthetic-code','sha256'),'hex'),'https://client.example/callback','other-challenge'), 'wrong challenge rejected');
SELECT public.fixture_assert(NOT public.service_verify_tok_connect_broker_authorization('40000000-0000-4000-8000-000000000001',encode(extensions.digest('synthetic-code','sha256'),'hex'),'https://other.example/callback','synthetic-challenge'), 'wrong redirect rejected');
RESET ROLE;
UPDATE auth.oauth_authorizations SET code_challenge_method = 'plain';
SET ROLE service_role;
SELECT public.fixture_assert(NOT public.service_verify_tok_connect_broker_authorization('40000000-0000-4000-8000-000000000001',encode(extensions.digest('synthetic-code','sha256'),'hex'),'https://client.example/callback','synthetic-challenge'), 'direct native plain code rejected');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"native-session"}',false);
SELECT public.fixture_assert(public.tok_connect_oauth_request_allowed(), 'native session needs no delegated grant');
SELECT public.fixture_assert((SELECT count(*) FROM public.menu_items)=1, 'native owner RLS preserved');
SELECT public.fixture_assert((SELECT count(*) FROM storage.objects)=1 AND (SELECT count(*) FROM realtime.messages)=1, 'native storage and realtime preserved');
SELECT public.fixture_expect_error($q$SELECT public.set_tok_connect_oauth_grant('unmanaged','Old',ARRAY['account:read'],'{}')$q$,'42501');
SELECT public.fixture_expect_error($q$SELECT public.set_tok_connect_oauth_grant('client-a','A',ARRAY['restaurant:read'],ARRAY['10000000-0000-4000-8000-000000000002']::uuid[])$q$,'42501');
SELECT public.fixture_expect_error($q$SELECT public.set_tok_connect_oauth_grant('client-a','A',ARRAY['admin:all'],'{}')$q$,'22023');
SELECT public.set_tok_connect_oauth_grant('client-a','A',ARRAY['account:read','restaurant:read'],ARRAY['10000000-0000-4000-8000-000000000001']::uuid[]);
SELECT public.fixture_assert(public.get_tok_connect_managed_oauth_clients(ARRAY['client-a','old']) = '["client-a"]'::jsonb, 'managed membership has no native secret');
SELECT public.fixture_expect_error($q$SELECT public.service_get_tok_connect_broker_client('client-a')$q$,'42501');
SELECT public.fixture_expect_error($q$SELECT public.service_resolve_tok_connect_broker_access(repeat('1',64))$q$,'42501');

SET ROLE service_role;
SELECT public.service_create_tok_connect_broker_session('50000000-0000-4000-8000-000000000001','client-a','00000000-0000-4000-8000-000000000001',repeat('1',64),repeat('2',64),repeat('x',64),repeat('y',64),now()+interval '59 minutes');
SELECT public.fixture_assert(public.service_resolve_tok_connect_broker_access(repeat('1',64))->>'user_id' = '00000000-0000-4000-8000-000000000001', 'opaque binding');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('2',64),'client-b','60000000-0000-4000-8000-000000000001') IS NULL, 'refresh cross-client denied');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('2',64),'client-a','60000000-0000-4000-8000-000000000001') IS NOT NULL, 'refresh claim succeeds once');
SELECT public.fixture_assert(public.service_resolve_tok_connect_broker_access(repeat('1',64)) IS NULL, 'access closed during uncertain refresh');
SELECT public.fixture_assert(NOT public.service_rotate_tok_connect_broker_refresh('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',repeat('3',64),repeat('4',64),repeat('x',64),repeat('y',64),now()+interval '5 minutes'), 'wrong CAS claim cannot rotate');
SELECT public.fixture_assert(public.service_rotate_tok_connect_broker_refresh('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',repeat('3',64),repeat('4',64),repeat('x',64),repeat('y',64),now()+interval '59 minutes'), 'claimed refresh rotates with ChatGPT-compatible lifetime');
SELECT public.fixture_assert(public.service_resolve_tok_connect_broker_access(repeat('1',64)) IS NULL AND public.service_resolve_tok_connect_broker_access(repeat('3',64)) IS NOT NULL, 'rotation invalidates previous access');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('2',64),'client-a','60000000-0000-4000-8000-000000000003') IS NULL, 'old refresh replay denied');
SELECT public.fixture_assert(public.service_resolve_tok_connect_broker_access(repeat('3',64)) IS NULL AND public.service_claim_tok_connect_broker_refresh(repeat('4',64),'client-a','60000000-0000-4000-8000-000000000003') IS NULL, 'replay revokes descendants');
SELECT public.service_create_tok_connect_oauth_permit(encode(extensions.digest(repeat('a',64),'sha256'),'hex'),g.id,g.revision,g.user_id,g.client_id,'oauth-session-a',encode(extensions.digest('synthetic-token-a','sha256'),'hex'),'restaurant:read','tok_list_restaurant_menu','10000000-0000-4000-8000-000000000001','data','GET','/menu_items',NULL) FROM public.tok_connect_oauth_grants g WHERE g.client_id='client-a';
SELECT public.service_create_tok_connect_oauth_permit(encode(extensions.digest(repeat('b',64),'sha256'),'hex'),g.id,g.revision,g.user_id,g.client_id,'oauth-session-a',encode(extensions.digest('synthetic-token-a','sha256'),'hex'),'account:read','tok_quote_reservation',NULL,'edge','POST','/create-reservation',encode(extensions.digest('{"action":"quote"}','sha256'),'hex')) FROM public.tok_connect_oauth_grants g WHERE g.client_id='client-a';

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"client-a","session_id":"oauth-session-a"}',false);
SELECT set_config('request.headers','{"authorization":"Bearer synthetic-token-a"}',false);
SELECT set_config('request.path','/menu_items',false), set_config('request.method','GET',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'raw native OAuth denied');
SELECT public.fixture_assert((SELECT count(*) FROM public.menu_items)=0 AND (SELECT count(*) FROM storage.objects)=0 AND (SELECT count(*) FROM realtime.messages)=0, 'direct DB storage realtime blocked');
SELECT public.fixture_expect_error('SELECT public.enforce_tok_connect_oauth_and_launch_gate()','PT403');
SELECT public.fixture_expect_error($q$SELECT public.set_tok_connect_oauth_grant('client-a','A',ARRAY['account:write'],'{}')$q$,'42501');
SELECT public.fixture_expect_error($q$SELECT public.revoke_tok_connect_oauth_grant('client-a')$q$,'42501');
SELECT public.fixture_expect_error($q$SELECT public.get_tok_connect_managed_oauth_clients(ARRAY['client-a'])$q$,'42501');
SELECT public.fixture_expect_error($q$SELECT public.service_claim_tok_connect_broker_refresh(repeat('4',64),'client-a','60000000-0000-4000-8000-000000000003')$q$,'42501');
SELECT set_config('request.path','/rpc/fixture_sensitive_rpc',false);
SELECT public.fixture_expect_error('SELECT public.enforce_tok_connect_oauth_and_launch_gate()','PT403');
SELECT set_config('request.path','/menu_items',false);
SELECT set_config('request.headers',jsonb_build_object('authorization','Bearer synthetic-token-a','x-tok-oauth-permit',repeat('a',64))::text,false);
SELECT public.fixture_assert(public.tok_connect_oauth_request_allowed() AND (SELECT count(*) FROM public.menu_items)=1, 'server permit retains original owner RLS');
SELECT public.enforce_tok_connect_oauth_and_launch_gate();
SELECT set_config('tok.fixture.launch_block','true',false);
SELECT public.fixture_expect_error('SELECT public.enforce_tok_connect_oauth_and_launch_gate()','PT403');
SELECT set_config('tok.fixture.launch_block','false',false);
SELECT set_config('request.method','POST',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'method binding');
SELECT set_config('request.method','GET',false), set_config('request.path','/profiles',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'path binding');
SELECT set_config('request.path','/menu_items',false), set_config('request.headers',jsonb_build_object('authorization','Bearer synthetic-token-other','x-tok-oauth-permit',repeat('a',64))::text,false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'exact JWT binding');
SELECT set_config('request.headers',jsonb_build_object('authorization','Bearer synthetic-token-a','x-tok-oauth-permit',repeat('a',64))::text,false);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"client-a","session_id":"other-session"}',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'session binding');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","client_id":"client-a","session_id":"oauth-session-a"}',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'user binding');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"client-b","session_id":"oauth-session-a"}',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed(), 'client binding');

SET ROLE service_role;
SELECT public.fixture_assert(public.service_validate_tok_connect_oauth_edge_permit(encode(extensions.digest(repeat('b',64),'sha256'),'hex'),'00000000-0000-4000-8000-000000000001','client-a','oauth-session-a',encode(extensions.digest('synthetic-token-a','sha256'),'hex'),'POST','/create-reservation',encode(extensions.digest('{"action":"quote"}','sha256'),'hex')) IS NOT NULL, 'exact Edge body accepted');
SELECT public.fixture_assert(public.service_validate_tok_connect_oauth_edge_permit(encode(extensions.digest(repeat('b',64),'sha256'),'hex'),'00000000-0000-4000-8000-000000000001','client-a','oauth-session-a',encode(extensions.digest('synthetic-token-a','sha256'),'hex'),'POST','/create-reservation',encode(extensions.digest('{"action":"create"}','sha256'),'hex')) IS NULL, 'mutated Edge body rejected');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"native-session"}',false);
SELECT public.revoke_tok_connect_oauth_grant('client-a');
SELECT public.fixture_assert((SELECT count(*) FROM public.menu_items)=1, 'native access survives delegated revocation');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"client-a","session_id":"oauth-session-a"}',false);
SELECT public.fixture_assert(NOT public.tok_connect_oauth_request_allowed() AND (SELECT count(*) FROM public.menu_items)=0, 'revocation invalidates a live permit');
SET ROLE service_role;
SELECT public.fixture_assert(public.service_resolve_tok_connect_broker_access(repeat('3',64)) IS NULL AND public.service_claim_tok_connect_broker_refresh(repeat('4',64),'client-a','60000000-0000-4000-8000-000000000003') IS NULL, 'revocation invalidates access and refresh');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"native-session"}',false);
SELECT public.set_tok_connect_oauth_grant('client-a','A',ARRAY['account:read'],'{}');
SET ROLE service_role;
SELECT public.fixture_assert(public.service_resolve_tok_connect_broker_access(repeat('3',64)) IS NULL, 'new grant does not revive old session');
SELECT public.service_create_tok_connect_broker_session('50000000-0000-4000-8000-000000000002','client-a','00000000-0000-4000-8000-000000000001',repeat('5',64),repeat('6',64),repeat('x',64),repeat('y',64),now()+interval '5 minutes');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('6',64),'client-a','60000000-0000-4000-8000-000000000004') IS NOT NULL, 'second session refresh claimed');
SET ROLE authenticated;
SELECT public.revoke_tok_connect_oauth_grant('client-a');
SET ROLE service_role;
SELECT public.fixture_assert(NOT public.service_rotate_tok_connect_broker_refresh('50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000004',repeat('7',64),repeat('8',64),repeat('x',64),repeat('y',64),now()+interval '5 minutes'), 'revocation between claim and rotate wins');
SET ROLE authenticated;
SELECT public.set_tok_connect_oauth_grant('client-a','A',ARRAY['account:read'],'{}');
SET ROLE service_role;
SELECT public.service_create_tok_connect_broker_session('50000000-0000-4000-8000-000000000003','client-a','00000000-0000-4000-8000-000000000001',repeat('9',64),repeat('a',64),repeat('x',64),repeat('y',64),now()+interval '5 minutes');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('a',64),'client-a','60000000-0000-4000-8000-000000000005') IS NOT NULL, 'new family claimed');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('a',64),'client-b','60000000-0000-4000-8000-000000000006') IS NULL, 'cross-client replay cannot revoke');
SELECT public.fixture_assert((SELECT state='refreshing' FROM tok_connect_private.broker_sessions WHERE id='50000000-0000-4000-8000-000000000003'), 'cross-client cannot disrupt family');
SELECT public.fixture_assert(public.service_claim_tok_connect_broker_refresh(repeat('a',64),'client-a','60000000-0000-4000-8000-000000000006') IS NULL, 'duplicate concurrent claim denied');
SELECT public.fixture_assert(NOT public.service_rotate_tok_connect_broker_refresh('50000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000005',repeat('b',64),repeat('c',64),repeat('x',64),repeat('y',64),now()+interval '5 minutes'), 'duplicate concurrent claim revokes pending family');
RESET ROLE;
SELECT 'TOK OAuth SQL isolation fixtures passed' AS result;
