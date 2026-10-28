\set ON_ERROR_STOP on
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
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
 BEGIN
  INSERT INTO public.tok_workforce_shifts(restaurant_id,employee_id,shift_date,start_time,end_time)
  VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-11-03','09:00','17:00');
  RAISE EXCEPTION 'Absent staff scheduled during approved holiday';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Absent staff scheduled during approved holiday' THEN RAISE; END IF;
 END;
 INSERT INTO public.tok_workforce_shifts(restaurant_id,employee_id,shift_date,start_time,end_time)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-11-05','09:00','17:00');
 BEGIN
  INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count)
  VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sick','2026-11-05','2026-11-05',1);
  RAISE EXCEPTION 'Conflicting absence accepted over a scheduled shift';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Conflicting absence accepted over a scheduled shift' THEN RAISE; END IF;
 END;
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
-- Exercise an upgrade after the original workforce scenarios and links exist.
RESET ROLE;
ALTER TABLE public.restaurants ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
CREATE TABLE public.email_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 to_email text NOT NULL, subject text NOT NULL,
 body_html text NOT NULL, body_text text,
 status text NOT NULL DEFAULT 'queued', error text,
 sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 provider_message_id text, provider_status text, provider_checked_at timestamptz
);
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_queue TO authenticated;
\i supabase/migrations/20261018190000_tok_workforce_invitations.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_error(p_command text,p_state text DEFAULT '42501') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_failed boolean := false;
BEGIN
 BEGIN EXECUTE p_command;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> p_state THEN
   RAISE EXCEPTION 'Unexpected SQLSTATE %, expected %: %',SQLSTATE,p_state,SQLERRM;
  END IF;
  v_failed := true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'Unauthorized/invalid operation succeeded: %',p_command; END IF;
END $$;

\set r1 '10000000-0000-4000-8000-000000000001'
\set r2 '10000000-0000-4000-8000-000000000002'
\set clara '20000000-0000-4000-8000-000000000004'
\set clara_user '00000000-0000-4000-8000-000000000004'
\set no_invite '20000000-0000-4000-8000-000000000005'
\set inactive '20000000-0000-4000-8000-000000000006'
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 (:'clara_user','Clara@Example.TEST',NULL),
 ('00000000-0000-4000-8000-000000000005','no-invite@example.test',now());
INSERT INTO public.tok_workforce_employees(restaurant_id,id,first_name,last_name,email) VALUES
 (:'r1',:'clara','<Clara &>','Four',NULL),
 (:'r1',:'no_invite','No','Invitation','no-invite@example.test'),
 (:'r1',:'inactive','Inactive','Six','inactive@example.test');
UPDATE public.tok_workforce_employees SET is_active=false WHERE id=:'inactive';

SET ROLE authenticated;
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(linked) FROM public.tok_workforce_my_restaurants()),
 'migration preserves existing linked accounts');
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000005';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_my_restaurants()),
 'matching verified email alone no longer grants an invitation');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_claim_employee(%L)',:'r1'));

SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET "test.owner"='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.expect_error(format(
 'UPDATE public.tok_workforce_employees SET user_id=%L WHERE id=%L',:'clara_user',:'clara'));
SELECT pg_temp.expect_error(format(
 'INSERT INTO public.tok_workforce_employees(restaurant_id,first_name,last_name,user_id) VALUES(%L,%L,%L,%L)',
 :'r1','Forged','Link',:'clara_user'));
SELECT pg_temp.expect_error(format(
 'SELECT public.tok_workforce_invite_employee(%L,%L,%L)',:'r1',:'clara','bad email'),'22023');
SELECT pg_temp.expect_error(format(
 'SELECT public.tok_workforce_invite_employee(%L,%L,%L)',:'r1',:'inactive','inactive@example.test'));
SELECT public.tok_workforce_invite_employee(:'r1',:'clara',' Clara@Example.TEST ');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(delivery_status='queued' AND accepted_at IS NULL)
  FROM public.tok_workforce_list_invitations(:'r1')),
 'queued email is not presented as accepted access');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.email_queue),
 'raw outbox content is not exposed to the restaurateur');
SELECT pg_temp.assert_true(
 NOT has_table_privilege('authenticated','public.tok_workforce_invitations','INSERT'),
 'browser cannot forge invitation records');
SELECT pg_temp.assert_true(
 NOT has_function_privilege('anon','public.tok_workforce_invite_employee(uuid,uuid,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.tok_workforce_claim_employee(uuid)','EXECUTE'),
 'anonymous invitation and claim RPC execution denied');

RESET ROLE;
SELECT pg_temp.assert_true(
 (SELECT email='clara@example.test' AND user_id IS NULL FROM public.tok_workforce_employees WHERE id=:'clara'),
 'invitation saves normalized real email without linking account');
SELECT pg_temp.assert_true(
 (SELECT email_confirmed_at IS NULL FROM auth.users WHERE id=:'clara_user'),
 'inviting never auto-confirms the recipient email');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(
  to_email='clara@example.test'
  AND body_html LIKE '%&lt;Clara &amp;&gt;%'
  AND body_html NOT LIKE '%<Clara &>%'
  AND body_html LIKE '%https://www.thetok.ch/equipe/mon-espace?restaurant=' || :'r1' || '%'
 ) FROM public.email_queue), 'one escaped email with canonical restaurant continuation');
SELECT email_queue_id AS first_queue FROM public.tok_workforce_invitations WHERE employee_id=:'clara' \gset

SET ROLE authenticated;
SELECT pg_temp.assert_true(
 (public.tok_workforce_invite_employee(:'r1',:'clara')->>'reused')::boolean,
 'double click reuses pending email');
RESET ROLE;
UPDATE public.email_queue SET status='processing' WHERE id=:'first_queue';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
 public.tok_workforce_invite_employee(:'r1',:'clara')->>'delivery_status'='processing',
 'in-flight email is reused');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.email_queue),'duplicate calls do not enqueue twice');
UPDATE public.email_queue SET status='queued' WHERE id=:'first_queue';

SET ROLE authenticated;
SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'clara'));
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_list_invitations(%L)',:'r1'));
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_revoke_invitation(%L,%L)',:'r1',:'clara'));
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_invitations),
 'another restaurant cannot read invitations');
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'clara'));
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_my_restaurants()),
 'unverified account cannot discover pending invitation');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_claim_employee(%L)',:'r1'));
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id=:'clara_user';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(NOT linked) FROM public.tok_workforce_my_restaurants()),
 'verified recipient discovers exactly one unaccepted invitation');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_claim_employee(%L)',:'r2'));

SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET "test.owner"='10000000-0000-4000-8000-000000000001';
SELECT public.tok_workforce_revoke_invitation(:'r1',:'clara');
SELECT public.tok_workforce_revoke_invitation(:'r1',:'clara');
SELECT pg_temp.assert_true(
 (SELECT revoked_at IS NOT NULL AND delivery_status='cancelled'
  FROM public.tok_workforce_list_invitations(:'r1')), 'revocation cancels queued email idempotently');
SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_my_restaurants()),
 'revoked invitation disappears');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_claim_employee(%L)',:'r1'));

RESET ROLE;
UPDATE public.tok_workforce_invitations SET invited_at=now()-interval '61 seconds' WHERE employee_id=:'clara';
SET ROLE authenticated;
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET "test.owner"='10000000-0000-4000-8000-000000000001';
SELECT public.tok_workforce_invite_employee(:'r1',:'clara');
RESET ROLE;
UPDATE public.tok_workforce_invitations
 SET invited_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE employee_id=:'clara';
SET ROLE authenticated;
SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_my_restaurants()),
 'expired invitation disappears');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_claim_employee(%L)',:'r1'));

SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET "test.owner"='10000000-0000-4000-8000-000000000001';
SELECT public.tok_workforce_invite_employee(:'r1',:'clara');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.tok_workforce_invitations),
 'resends keep one current invitation per employee');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.email_queue),'explicit valid resend creates a new message');
UPDATE public.email_queue SET status='failed',error='Transport timeout'
 WHERE id=(SELECT email_queue_id FROM public.tok_workforce_invitations WHERE employee_id=:'clara');
UPDATE public.tok_workforce_invitations SET invited_at=now()-interval '61 seconds' WHERE employee_id=:'clara';
CREATE TEMP TABLE retry_snapshot AS SELECT q.id,q.body_html,q.body_text FROM public.email_queue q
 JOIN public.tok_workforce_invitations i ON i.email_queue_id=q.id WHERE i.employee_id=:'clara';
SET ROLE authenticated;
SELECT pg_temp.assert_true(
 (public.tok_workforce_invite_employee(:'r1',:'clara')->>'reused')::boolean,
 'failed transport retry reuses provider idempotency key');
RESET ROLE;
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(q.status='queued' AND q.error IS NULL
  AND q.body_html=s.body_html AND q.body_text=s.body_text
  AND q.metadata->>'workforce_retry_count'='1')
  FROM public.email_queue q JOIN retry_snapshot s ON s.id=q.id),
 'retry preserves message body and queue ID and records attempt');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.email_queue),'failed retry does not create duplicate outbox row');
UPDATE public.email_queue SET status='sent',provider_status='delivered',sent_at=now()
 WHERE id=(SELECT id FROM retry_snapshot);
SET ROLE authenticated;
SELECT pg_temp.assert_true(
 public.tok_workforce_invite_employee(:'r1',:'clara')->>'delivery_status'='sent',
 'immediate sent retry cannot duplicate message');
SELECT pg_temp.assert_true(
 (SELECT delivery_status='sent' AND provider_status='delivered' AND accepted_at IS NULL
 FROM public.tok_workforce_list_invitations(:'r1')), 'provider delivery still requires employee acceptance');

SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true(public.tok_workforce_claim_employee(:'r1')=:'clara'::uuid,'verified employee accepts own invitation');
SELECT pg_temp.assert_true(public.tok_workforce_claim_employee(:'r1')=:'clara'::uuid,'acceptance is idempotent');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(linked) FROM public.tok_workforce_my_restaurants()),'accepted account sees personal space');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(id=:'clara'::uuid) FROM public.tok_workforce_employees),
 'accepted employee only sees own personnel file');
RESET ROLE;
SELECT pg_temp.assert_true(
 (SELECT accepted_at IS NOT NULL AND accepted_by=:'clara_user'::uuid AND revoked_at IS NULL
  FROM public.tok_workforce_invitations WHERE employee_id=:'clara'), 'claim records acceptance atomically');
SET ROLE authenticated;
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET "test.owner"='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'clara'),'P0001');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_revoke_invitation(%L,%L)',:'r1',:'clara'),'P0001');
UPDATE public.tok_workforce_employees SET is_active=false WHERE id=:'clara';
SET "test.owner"='';
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_my_restaurants()),'deactivated employee loses membership');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_employees),'deactivated employee loses direct RLS read');
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_punch(%L,%L)',:'r1','clock_in'),'P0001');

RESET ROLE;
UPDATE public.restaurants SET is_demo=true WHERE id=:'r1';
SET ROLE authenticated;
SET "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET "test.owner"='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'no_invite'),'P0001');
RESET ROLE;
UPDATE public.restaurants SET is_demo=false WHERE id=:'r1';
SET "test.is_admin"='yes';
UPDATE public.tok_workforce_settings SET enabled=false WHERE restaurant_id=:'r1';
SET ROLE authenticated;
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'no_invite'));
RESET ROLE;
UPDATE public.tok_workforce_settings SET enabled=true WHERE restaurant_id=:'r1';
SET "test.is_admin"='no';

-- Quotas are based on trusted outbox metadata and enforced before email writes.
INSERT INTO public.email_queue(to_email,subject,body_html,status,metadata,created_at)
 SELECT 'no-invite@example.test','Fixture','Fixture','sent',
 jsonb_build_object('type','tok_workforce_invitation','restaurant_id',:'r1','employee_id',:'no_invite'),
 now()-interval '2 hours' FROM generate_series(1,5);
SET ROLE authenticated;
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'no_invite'),'P0001');
RESET ROLE;
SELECT pg_temp.assert_true(
 NOT EXISTS(SELECT 1 FROM public.tok_workforce_invitations WHERE employee_id=:'no_invite'),
 'daily quota rejection is atomic');
DELETE FROM public.email_queue WHERE subject='Fixture';
INSERT INTO public.email_queue(to_email,subject,body_html,status,metadata)
 SELECT 'quota@example.test','Fixture','Fixture','sent',
 jsonb_build_object('type','tok_workforce_invitation','restaurant_id',:'r1','employee_id',gen_random_uuid())
 FROM generate_series(1,100);
SET ROLE authenticated;
SELECT pg_temp.expect_error(format('SELECT public.tok_workforce_invite_employee(%L,%L,NULL)',:'r1',:'no_invite'),'P0001');
RESET ROLE;
DELETE FROM public.email_queue WHERE subject='Fixture';
SET ROLE authenticated;
SELECT pg_temp.expect_error(format(
 'SELECT public.tok_workforce_invite_employee(%L,%L,%L)',:'r1',:'no_invite','one@example.test'),'23505');
RESET ROLE;
SELECT pg_temp.assert_true(
 (SELECT email='no-invite@example.test' FROM public.tok_workforce_employees WHERE id=:'no_invite')
 AND (SELECT count(*)=3 FROM public.email_queue),
 'duplicate recipient rejection rolls back personnel update and email');
\ir tok_workforce_launch_smoke.sql
\ir tok_workforce_integrity_smoke.sql
SELECT 'TOK WORKFORCE POSTGRES SMOKE PASSED (including invitation delivery, claim, expiry, revocation and RLS)' AS result;
