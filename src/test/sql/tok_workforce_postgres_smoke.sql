\set ON_ERROR_STOP on
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY,
 email text,
 email_confirmed_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=''
 AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.restaurants (id uuid PRIMARY KEY,name text NOT NULL);
CREATE FUNCTION public.auth_is_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path=''
 AS $$ SELECT current_setting('test.is_admin',true)='yes' $$;
CREATE FUNCTION public.auth_owns_restaurant(p_restaurant_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=''
 AS $$ SELECT current_setting('test.owner',true)=p_restaurant_id::text
 AND auth.uid() IS NOT NULL $$;
\i supabase/migrations/20261014165500_tok_workforce_restaurants.sql
\i supabase/migrations/20261014180000_tok_workforce_clock_teams.sql

SET "test.is_admin"='yes';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
INSERT INTO public.restaurants(id,name) VALUES
 ('10000000-0000-4000-8000-000000000001','Restaurant One'),
 ('10000000-0000-4000-8000-000000000002','Restaurant Two');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-4000-8000-000000000001','one@example.test',now()),
 ('00000000-0000-4000-8000-000000000002','two@example.test',now()),
 ('00000000-0000-4000-8000-000000000003','owner@example.test',now());
INSERT INTO public.tok_workforce_settings(restaurant_id,enabled,updated_by) VALUES
 ('10000000-0000-4000-8000-000000000001',true,'00000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000002',true,'00000000-0000-4000-8000-000000000003');
INSERT INTO public.tok_workforce_employees(restaurant_id,id,first_name,last_name,email,user_id) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Alice','One','one@example.test',NULL),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Bob','Two','two@example.test','00000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','Owner','One','owner@example.test','00000000-0000-4000-8000-000000000003');
UPDATE public.tok_workforce_employees SET role='manager' WHERE id='20000000-0000-4000-8000-000000000003';

SET ROLE authenticated;
SET "test.is_admin"='no';
SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';

DO $$
BEGIN
 IF (SELECT count(*) FROM public.tok_workforce_my_restaurants())<>1 THEN
  RAISE EXCEPTION 'Expected one verified invitation for Alice'; END IF;
END $$;
SELECT public.tok_workforce_claim_employee('10000000-0000-4000-8000-000000000001');
SELECT public.tok_workforce_punch('10000000-0000-4000-8000-000000000001','clock_in');
DO $$
BEGIN
 BEGIN
  PERFORM public.tok_workforce_punch('10000000-0000-4000-8000-000000000002','clock_in');
  RAISE EXCEPTION 'Cross restaurant punch accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Cross restaurant punch accepted' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.tok_workforce_punch('10000000-0000-4000-8000-000000000001','clock_in');
  RAISE EXCEPTION 'Double arrival accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Double arrival accepted' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.tok_workforce_clock_sessions WHERE restaurant_id='10000000-0000-4000-8000-000000000002')<>0
  THEN RAISE EXCEPTION 'Foreign sessions visible through RLS'; END IF;
END $$;
SELECT public.tok_workforce_punch('10000000-0000-4000-8000-000000000001','break_start');
SELECT public.tok_workforce_punch('10000000-0000-4000-8000-000000000001','break_end');
SELECT pg_sleep(1.1);
SELECT public.tok_workforce_punch('10000000-0000-4000-8000-000000000001','clock_out');
DO $$
BEGIN
 IF (SELECT count(*) FROM public.tok_workforce_clock_events) <> 4 THEN
  RAISE EXCEPTION 'Expected four immutable punch events'; END IF;
 IF (SELECT count(*) FROM public.tok_workforce_time_entries) <> 1 THEN
  RAISE EXCEPTION 'Expected one automatically generated hours entry'; END IF;
 BEGIN
  INSERT INTO public.tok_workforce_time_entries(restaurant_id,employee_id,entry_date,start_time,end_time)
  VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date,'09:00','17:00');
  RAISE EXCEPTION 'Employee forged manual hours';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Employee forged manual hours' THEN RAISE; END IF;
 END;
END $$;

INSERT INTO public.tok_workforce_requests(
 restaurant_id,employee_id,request_type,description,status,
 requested_start_date,requested_end_date,requested_days)
 VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 'vacation','Test leave request','pending','2026-11-02','2026-11-04',3);

SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
DO $$
DECLARE v_id uuid; v_hours_id uuid; v_changed integer;
BEGIN
 SELECT id INTO v_id FROM public.tok_workforce_requests WHERE description='Test leave request';
 IF NOT public.tok_workforce_can_schedule('10000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Verified manager cannot supervise team'; END IF;
 IF public.tok_workforce_can_manage('10000000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Manager was escalated to owner'; END IF;
 UPDATE public.tok_workforce_employees SET role='manager'
  WHERE id='20000000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed<>0 THEN RAISE EXCEPTION 'Supervisor could elevate staff roles'; END IF;
 PERFORM public.tok_workforce_review_request(v_id,true);
 IF (SELECT count(*) FROM public.tok_workforce_absences WHERE employee_id='20000000-0000-4000-8000-000000000001')<>1
  THEN RAISE EXCEPTION 'Leave approval did not create an absence'; END IF;
 SELECT id INTO v_hours_id FROM public.tok_workforce_time_entries LIMIT 1;
 INSERT INTO public.tok_workforce_validations(restaurant_id,time_entry_id,signed_by,signed_name,signature_data)
 VALUES ('10000000-0000-4000-8000-000000000001',v_hours_id,auth.uid(),'Owner One',
   'data:image/png;base64,' || repeat('A',140));
END $$;
SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
DO $$
BEGIN
 IF (SELECT count(*) FROM public.tok_workforce_time_entries)<>0 THEN
  RAISE EXCEPTION 'Employee from another restaurant can read Alice hours'; END IF;
 IF (SELECT count(*) FROM public.tok_workforce_validations)<>0 THEN
  RAISE EXCEPTION 'Employee from another restaurant can read Alice signature'; END IF;
END $$;
SELECT 'TOK WORKFORCE POSTGRES SMOKE PASSED' AS result;
