-- Included at the end of tok_workforce_postgres_smoke.sql, in a disposable DB.
-- The parent fixture has already applied workforce + invitation migrations and
-- linked Alice (user ...001 / employee ...001) to Restaurant One.
-- Historical migrations contain BEGIN/COMMIT: apply them before test transactions.
\set ON_ERROR_STOP on
RESET ROLE;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN
  CREATE ROLE authenticator NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END $$;

-- Only missing platform infrastructure is mocked; the actual launch functions,
-- PostgREST hook and restrictive policies below come from committed migrations.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(
  nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'
 )
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(
  _user_id=auth.uid() AND _role=current_setting('test.launch_platform_role',true),
  false
 )
$$;
CREATE TABLE IF NOT EXISTS public.feature_flags (
 name text PRIMARY KEY,
 label text,
 description text,
 is_active boolean NOT NULL DEFAULT false
);
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS description text;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

\ir ../../../supabase/migrations/20261010220000_launch_animation_access_gate.sql
\ir ../../../supabase/migrations/20261013014557_launch_guest_discovery_authenticated_clients_only.sql

-- Reproduce the original failure using the actual pre-request hook.
BEGIN;
UPDATE public.feature_flags SET is_active=true WHERE name='coming-soon';
SET LOCAL "test.is_admin"='no';
SET LOCAL "test.owner"='';
SET LOCAL "test.launch_platform_role"='client';
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}';
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_path text;
BEGIN
 IF public.launch_gate_enabled() IS NOT TRUE THEN
  RAISE EXCEPTION 'Regression fixture requires an active launch gate';
 END IF;
 FOREACH v_path IN ARRAY ARRAY[
  '/rpc/tok_workforce_my_restaurants','/tok_workforce_employees'
 ] LOOP
  PERFORM set_config('request.path',v_path,true);
  BEGIN
   PERFORM public.enforce_launch_gate();
   RAISE EXCEPTION 'Legacy gate unexpectedly accepted %',v_path;
  EXCEPTION WHEN SQLSTATE 'PT403' THEN
   IF SQLERRM<>'TOK_LAUNCH_CLOSED' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
ROLLBACK;

CREATE TEMP TABLE workforce_launch_baseline AS
 SELECT
  pg_get_functiondef('public.enforce_launch_gate()'::regprocedure) AS hook_definition,
  (SELECT proacl FROM pg_proc WHERE oid='public.launch_table_allowed(text)'::regprocedure) AS table_acl,
  (SELECT proacl FROM pg_proc WHERE oid='public.launch_rpc_allowed(text)'::regprocedure) AS rpc_acl,
  (SELECT rolconfig FROM pg_roles WHERE rolname='authenticator') AS authenticator_settings,
  (SELECT to_jsonb(f) FROM public.feature_flags f WHERE f.name='coming-soon') AS launch_flag;

\ir ../../../supabase/migrations/20261018191000_tok_workforce_launch_access.sql

BEGIN;
DO $$
DECLARE v_before record;
BEGIN
 SELECT * INTO v_before FROM pg_temp.workforce_launch_baseline;
 IF pg_get_functiondef('public.enforce_launch_gate()'::regprocedure)
  IS DISTINCT FROM v_before.hook_definition THEN
  RAISE EXCEPTION 'Workforce access changed the launch hook';
 END IF;
 IF (SELECT proacl FROM pg_proc WHERE oid='public.launch_table_allowed(text)'::regprocedure)
  IS DISTINCT FROM v_before.table_acl
  OR (SELECT proacl FROM pg_proc WHERE oid='public.launch_rpc_allowed(text)'::regprocedure)
  IS DISTINCT FROM v_before.rpc_acl THEN
  RAISE EXCEPTION 'Workforce access changed existing EXECUTE grants';
 END IF;
 IF (SELECT rolconfig FROM pg_roles WHERE rolname='authenticator')
  IS DISTINCT FROM v_before.authenticator_settings THEN
  RAISE EXCEPTION 'Workforce access changed the configured pre-request hook';
 END IF;
 IF (SELECT to_jsonb(f) FROM public.feature_flags f WHERE f.name='coming-soon')
  IS DISTINCT FROM v_before.launch_flag THEN
  RAISE EXCEPTION 'Workforce access changed the launch feature flag';
 END IF;
END $$;

UPDATE public.feature_flags SET is_active=true WHERE name='coming-soon';
SET LOCAL "test.is_admin"='no';
SET LOCAL "test.owner"='';
SET LOCAL "test.launch_platform_role"='client';
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","user_metadata":{"role":"admin"}}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_platform_role text; v_resource text; v_path text;
BEGIN
 IF public.launch_gate_enabled() IS NOT TRUE THEN
  RAISE EXCEPTION 'Workforce test must run with the launch gate active';
 END IF;
 FOREACH v_platform_role IN ARRAY ARRAY['client','restaurateur'] LOOP
  PERFORM set_config('test.launch_platform_role',v_platform_role,true);
  FOREACH v_resource IN ARRAY ARRAY[
   'tok_workforce_settings','tok_workforce_employees','tok_workforce_shifts',
   'tok_workforce_time_entries','tok_workforce_validations','tok_workforce_absences',
   'tok_workforce_requests','tok_workforce_exchanges','tok_workforce_clock_sessions',
   'tok_workforce_clock_events','tok_workforce_invitations'
  ] LOOP
   IF public.launch_table_allowed(v_resource) IS NOT TRUE THEN
    RAISE EXCEPTION 'Workforce table % blocked for %',v_resource,v_platform_role;
   END IF;
   PERFORM set_config('request.path','/'||v_resource,true);
   PERFORM public.enforce_launch_gate();
   PERFORM set_config('request.path','/rest/v1/'||v_resource,true);
   PERFORM public.enforce_launch_gate();
   -- A resource-name suffix must not inherit access through a prefix wildcard.
   PERFORM set_config('request.path','/'||v_resource||'_unexpected',true);
   BEGIN
    PERFORM public.enforce_launch_gate();
    RAISE EXCEPTION 'Workforce table-name suffix was accepted: %',v_resource;
   EXCEPTION WHEN SQLSTATE 'PT403' THEN
    IF SQLERRM<>'TOK_LAUNCH_CLOSED' THEN RAISE; END IF;
   END;
  END LOOP;
  FOREACH v_resource IN ARRAY ARRAY[
   'tok_workforce_my_restaurants','tok_workforce_claim_employee',
   'tok_workforce_invite_employee','tok_workforce_list_invitations',
   'tok_workforce_revoke_invitation','tok_workforce_punch',
   'tok_workforce_team_directory','tok_workforce_respond_exchange',
   'tok_workforce_review_exchange','tok_workforce_review_request'
  ] LOOP
   IF public.launch_rpc_allowed(v_resource) IS NOT TRUE THEN
    RAISE EXCEPTION 'Workforce RPC % blocked for %',v_resource,v_platform_role;
   END IF;
   PERFORM set_config('request.path','/rpc/'||v_resource,true);
   PERFORM public.enforce_launch_gate();
   PERFORM set_config('request.path','/rest/v1/rpc/'||v_resource,true);
   PERFORM public.enforce_launch_gate();
   PERFORM set_config('request.path','/rpc/'||v_resource||'_unexpected',true);
   BEGIN
    PERFORM public.enforce_launch_gate();
    RAISE EXCEPTION 'Workforce RPC-name suffix was accepted: %',v_resource;
   EXCEPTION WHEN SQLSTATE 'PT403' THEN
    IF SQLERRM<>'TOK_LAUNCH_CLOSED' THEN RAISE; END IF;
   END;
  END LOOP;
  FOREACH v_path IN ARRAY ARRAY[
   '/orders','/email_queue','/tok_workforce_access_audit',
   '/rpc/create_order','/rpc/tok_workforce_unknown','/rpc/arbitrary_rpc'
  ] LOOP
   PERFORM set_config('request.path',v_path,true);
   BEGIN
    PERFORM public.enforce_launch_gate();
    RAISE EXCEPTION 'Launch gate accepted unrelated endpoint % for %',v_path,v_platform_role;
   EXCEPTION WHEN SQLSTATE 'PT403' THEN
    IF SQLERRM<>'TOK_LAUNCH_CLOSED' THEN RAISE; END IF;
   END;
  END LOOP;
 END LOOP;
END $$;

-- Passing the launch hook never bypasses membership, ownership, or existing RLS.
SET LOCAL "test.launch_platform_role"='client';
SET LOCAL request.path='/rpc/tok_workforce_my_restaurants';
SELECT public.enforce_launch_gate();
DO $$
DECLARE v_changed integer;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.tok_workforce_my_restaurants()
  WHERE restaurant_id='10000000-0000-4000-8000-000000000001'
   AND employee_id='20000000-0000-4000-8000-000000000001' AND linked
 ) THEN
  RAISE EXCEPTION 'Linked Alice cannot access her employee portal during launch';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.tok_workforce_my_restaurants()
  WHERE restaurant_id<>'10000000-0000-4000-8000-000000000001'
 ) THEN
  RAISE EXCEPTION 'Employee portal disclosed another restaurant';
 END IF;
 PERFORM set_config('request.path','/tok_workforce_employees',true);
 PERFORM public.enforce_launch_gate();
 IF NOT EXISTS (
  SELECT 1 FROM public.tok_workforce_employees
  WHERE id='20000000-0000-4000-8000-000000000001' AND user_id=auth.uid()
 ) THEN
  RAISE EXCEPTION 'Employee RLS blocks Alice own active profile during launch';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.tok_workforce_employees
  WHERE id<>'20000000-0000-4000-8000-000000000001'
 ) THEN
  RAISE EXCEPTION 'Employee RLS disclosed another personnel file';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.tok_workforce_time_entries
  WHERE employee_id<>'20000000-0000-4000-8000-000000000001'
 ) THEN
  RAISE EXCEPTION 'Employee RLS disclosed another employee hours';
 END IF;
 IF EXISTS (SELECT 1 FROM public.tok_workforce_invitations) THEN
  RAISE EXCEPTION 'Ordinary employee can read manager invitation records';
 END IF;
 UPDATE public.tok_workforce_employees SET role='manager'
  WHERE id='20000000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed<>0 THEN RAISE EXCEPTION 'Employee elevated their own workforce role'; END IF;
 BEGIN
  INSERT INTO public.tok_workforce_requests(
   restaurant_id,employee_id,request_type,description,status
  ) VALUES (
   '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002',
   'other','Foreign request must be denied','pending'
  );
  RAISE EXCEPTION 'Employee wrote to another restaurant';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.path','/rpc/tok_workforce_invite_employee',true);
 PERFORM public.enforce_launch_gate();
 BEGIN
  PERFORM public.tok_workforce_invite_employee(
   '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002',NULL
  );
  RAISE EXCEPTION 'Passing launch gate authorized a foreign invitation';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET LOCAL request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}';
SET LOCAL "test.launch_platform_role"='restaurateur';
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
SET LOCAL request.path='/tok_workforce_employees';
SELECT public.enforce_launch_gate();
DO $$
BEGIN
 IF public.tok_workforce_can_manage('10000000-0000-4000-8000-000000000001') IS NOT TRUE THEN
  RAISE EXCEPTION 'Owner lost management access during launch';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.tok_workforce_employees
  WHERE restaurant_id='10000000-0000-4000-8000-000000000001'
 ) THEN
  RAISE EXCEPTION 'Owner cannot read their own personnel records';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.tok_workforce_employees
  WHERE restaurant_id<>'10000000-0000-4000-8000-000000000001'
 ) OR EXISTS (
  SELECT 1 FROM public.tok_workforce_invitations
  WHERE restaurant_id<>'10000000-0000-4000-8000-000000000001'
 ) THEN
  RAISE EXCEPTION 'Owner RLS disclosed another restaurant';
 END IF;
END $$;

-- An authenticated role without a real subject cannot use the exception.
SET LOCAL "request.jwt.claim.sub"='';
SET LOCAL request.jwt.claims='{"role":"authenticated"}';
SET LOCAL "test.launch_platform_role"='';
SET LOCAL "test.owner"='';
DO $$
DECLARE v_path text;
BEGIN
 FOREACH v_path IN ARRAY ARRAY[
  '/tok_workforce_employees','/rpc/tok_workforce_my_restaurants'
 ] LOOP
  PERFORM set_config('request.path',v_path,true);
  BEGIN
   PERFORM public.enforce_launch_gate();
   RAISE EXCEPTION 'Missing authenticated subject accepted for %',v_path;
  EXCEPTION WHEN SQLSTATE 'PT403' THEN
   IF SQLERRM<>'TOK_LAUNCH_CLOSED' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;

SET LOCAL "request.jwt.claim.role"='anon';
SET LOCAL request.jwt.claims='{"role":"anon"}';
SET LOCAL ROLE anon;
DO $$
DECLARE v_rpc text;
BEGIN
 FOREACH v_rpc IN ARRAY ARRAY[
  'tok_workforce_my_restaurants','tok_workforce_claim_employee',
  'tok_workforce_invite_employee','tok_workforce_list_invitations',
  'tok_workforce_revoke_invitation','tok_workforce_punch',
  'tok_workforce_team_directory','tok_workforce_respond_exchange',
  'tok_workforce_review_exchange','tok_workforce_review_request'
 ] LOOP
  IF public.launch_rpc_allowed(v_rpc) IS TRUE THEN
   RAISE EXCEPTION 'Anonymous workforce RPC became allowed: %',v_rpc;
  END IF;
  PERFORM set_config('request.path','/rpc/'||v_rpc,true);
  BEGIN
   PERFORM public.enforce_launch_gate();
   RAISE EXCEPTION 'Anonymous workforce endpoint accepted: %',v_rpc;
  EXCEPTION WHEN SQLSTATE 'PT403' THEN
   IF SQLERRM<>'TOK_LAUNCH_CLOSED' THEN RAISE; END IF;
  END;
 END LOOP;
 -- The prior catalog exception is preserved; no change to public discovery.
 PERFORM set_config('request.path','/rpc/search_restaurants_catalog_page',true);
 PERFORM public.enforce_launch_gate();
 BEGIN
  PERFORM 1 FROM public.tok_workforce_employees;
  RAISE EXCEPTION 'Anonymous personnel table privilege was granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

RESET ROLE;
ROLLBACK;
DROP TABLE pg_temp.workforce_launch_baseline;
SELECT 'TOK WORKFORCE LAUNCH POSTGRES SMOKE PASSED' AS result;
