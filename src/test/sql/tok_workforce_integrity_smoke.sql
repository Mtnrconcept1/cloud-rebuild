-- Run after the historical workforce/launch smoke in the same disposable DB.
-- Assertions exercise actual PostgreSQL functions, constraints, permissions and RLS.
\set ON_ERROR_STOP on
RESET ROLE;
\ir ../../../supabase/migrations/20261028044351_tok_workforce_integrity_and_workflows.sql

BEGIN;
SET LOCAL "test.is_admin" = 'yes';
SET LOCAL "test.owner" = '';
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "test.launch_platform_role" = 'client';
UPDATE public.tok_workforce_settings SET enabled = true;
INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
  ('00000000-0000-4000-8000-000000000007', 'colleague@example.test', now()),
  ('00000000-0000-4000-8000-000000000008', 'outsider@example.test', now());
INSERT INTO public.tok_workforce_employees(id, restaurant_id, user_id, first_name, last_name, email) VALUES
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000007', 'Charlie', 'Seven', 'colleague@example.test');

SELECT pg_temp.assert_true(public.tok_workforce_duration_seconds('22:00', '02:30', 30) = 14400,
  'server duration includes midnight and deducts the break once');
SELECT pg_temp.assert_true(public.tok_workforce_duration_seconds('09:15:30.5', '17:45:45.5', 30) = 28815,
  'server duration preserves seconds and fractions');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_duration_seconds('09:00', '09:00', 0)$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_duration_seconds('09:00', '10:00', 60)$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_duration_seconds('09:00', '10:00', -1)$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_duration_seconds('24:00', '02:00', 0)$q$, '22023');

-- A manager can work inside this restaurant but cannot sign or read another tenant.
SET LOCAL "test.is_admin" = 'no';
SET LOCAL "test.owner" = '10000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
INSERT INTO public.tok_workforce_time_entries(id, restaurant_id, employee_id, entry_date, start_time, end_time, break_minutes) VALUES
  ('40000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', current_date, '09:00', '17:00', 30),
  ('40000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', current_date + 1, '09:00', '17:00', 30),
  ('40000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', current_date + 2, '09:00', '17:00', 30),
  ('40000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', current_date + 3, '09:00', '17:00', 30);
INSERT INTO public.tok_workforce_time_entries(id, restaurant_id, employee_id, entry_date, start_time, end_time, break_minutes, is_night_work, is_sunday_work)
VALUES ('40000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  current_date + ((6 - EXTRACT(ISODOW FROM current_date)::integer + 7) % 7), '22:00', '02:00', 30, false, false);
SELECT pg_temp.assert_true((SELECT is_night_work AND is_sunday_work FROM public.tok_workforce_time_entries
  WHERE id = '40000000-0000-4000-8000-000000000105'), 'Saturday overnight clock flags are computed by the server');
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_time_entries(restaurant_id,employee_id,entry_date,start_time,end_time,break_minutes)
  VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date,'10:00','11:00',60)$q$, '22023');
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_time_entries SET break_minutes=480
  WHERE id='40000000-0000-4000-8000-000000000101'$q$, '22023');
RESET ROLE;
INSERT INTO public.tok_workforce_time_entries(id, restaurant_id, employee_id, entry_date, start_time, end_time)
VALUES ('40000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002', current_date, '09:00', '17:00');
SET LOCAL ROLE authenticated;

-- Bulk validation is all-or-nothing, tenant checked, limited and version checked.
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries(
  '10000000-0000-4000-8000-000000000001', ARRAY['40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000201']::uuid[],
  'Manager One', 'data:image/png;base64,' || repeat('A',140))$q$, '42501');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.tok_workforce_validations
  WHERE time_entry_id='40000000-0000-4000-8000-000000000101'), 'cross-tenant bulk attempt signs nothing');
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries(
  '10000000-0000-4000-8000-000000000001', array_fill('40000000-0000-4000-8000-000000000101'::uuid, ARRAY[101]),
  'Manager One', 'data:image/png;base64,' || repeat('A',140))$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries(
  '10000000-0000-4000-8000-000000000001', ARRAY['40000000-0000-4000-8000-000000000101']::uuid[],
  'Manager One', 'data:image/png;base64,' || repeat('A',140), '{"40000000-0000-4000-8000-000000000101":2}')$q$, '40001');

-- Correction captures the requested version and actually changes the pending entry.
SET LOCAL "test.owner" = '';
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
INSERT INTO public.tok_workforce_requests(id, restaurant_id, employee_id, request_type, description,
  requested_entry_id, requested_entry_version, requested_start_time, requested_end_time, requested_break_minutes)
VALUES ('50000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  'correction', 'Corriger le début du service', '40000000-0000-4000-8000-000000000101', 1, '08:30', '17:00', 30),
  ('50000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  'correction', 'Demande avant une signature concurrente', '40000000-0000-4000-8000-000000000102', 1, '08:00', '17:00', 30),
  ('50000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  'correction', 'Demande avant une édition concurrente', '40000000-0000-4000-8000-000000000103', 1, '08:00', '17:00', 30);
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_requests(restaurant_id,employee_id,request_type,description,
 requested_entry_id,requested_entry_version,requested_start_time,requested_end_time,requested_break_minutes)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','correction','Forged target',
 '40000000-0000-4000-8000-000000000201',1,'08:00','17:00',30)$q$, '42501');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000101', true, 'Heure de début confirmée');
SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000101', true, 'Repeated call');
SELECT pg_temp.assert_true((SELECT version=2 AND start_time='08:30' FROM public.tok_workforce_time_entries
  WHERE id='40000000-0000-4000-8000-000000000101'), 'correction applies once and increments the version');
SELECT pg_temp.assert_true((SELECT status='approved' AND review_note='Heure de début confirmée'
  AND previous_entry_snapshot->>'start_time'='09:00:00' AND applied_entry_snapshot->>'start_time'='08:30:00'
  FROM public.tok_workforce_requests WHERE id='50000000-0000-4000-8000-000000000101'), 'correction retains its before/after evidence and first decision');
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries(
  '10000000-0000-4000-8000-000000000001', ARRAY['40000000-0000-4000-8000-000000000101']::uuid[],
  'Manager One', 'data:image/png;base64,' || repeat('A',140), '{"40000000-0000-4000-8000-000000000101":1}')$q$, '40001');
SELECT count(*) FROM public.tok_workforce_validate_entries(
  '10000000-0000-4000-8000-000000000001', ARRAY['40000000-0000-4000-8000-000000000102','40000000-0000-4000-8000-000000000101']::uuid[],
  'Manager One', 'data:image/png;base64,' || repeat('A',140), '{"40000000-0000-4000-8000-000000000101":2,"40000000-0000-4000-8000-000000000102":1}');
SELECT count(*) FROM public.tok_workforce_validate_entries(
  '10000000-0000-4000-8000-000000000001', ARRAY['40000000-0000-4000-8000-000000000101']::uuid[],
  'Another Name', 'data:image/png;base64,' || repeat('B',140), '{"40000000-0000-4000-8000-000000000101":2}');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.tok_workforce_validations
  WHERE time_entry_id IN ('40000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000102')), 'repeated validation never duplicates evidence');
SELECT pg_temp.assert_true((SELECT signed_name='Manager One' AND signed_by=auth.uid() AND entry_version=2
  AND entry_snapshot->>'version'='2' AND entry_hash=encode(sha256(convert_to(entry_snapshot::text,'UTF8')),'hex')
  FROM public.tok_workforce_validations WHERE time_entry_id='40000000-0000-4000-8000-000000000101'), 'signature binds actor, version, exact snapshot and SHA-256');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000102',true,NULL::text)$q$, '55000');
UPDATE public.tok_workforce_time_entries SET end_time='18:00' WHERE id='40000000-0000-4000-8000-000000000103';
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000103',true,NULL::text)$q$, '40001');
SELECT pg_temp.assert_true((SELECT bool_and(status='pending') FROM public.tok_workforce_requests
  WHERE id IN ('50000000-0000-4000-8000-000000000102','50000000-0000-4000-8000-000000000103')), 'stale/signed correction failure leaves both decisions pending');
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_time_entries SET end_time='18:00' WHERE id='40000000-0000-4000-8000-000000000101'$q$, '55000');
SELECT pg_temp.expect_error($q$DELETE FROM public.tok_workforce_time_entries WHERE id='40000000-0000-4000-8000-000000000101'$q$, '55000');
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_validations SET signed_name='Forged' WHERE time_entry_id='40000000-0000-4000-8000-000000000101'$q$, '42501');
RESET ROLE;
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_validations SET signed_at=now()-interval '1 year' WHERE time_entry_id='40000000-0000-4000-8000-000000000101'$q$, '55000');
SET LOCAL "test.is_admin"='yes';
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_time_entries SET notes='Admin changed signed content' WHERE id='40000000-0000-4000-8000-000000000101'$q$, '55000');
SET LOCAL "test.is_admin"='no';
SET LOCAL ROLE authenticated;
DELETE FROM public.tok_workforce_time_entries
 WHERE id='40000000-0000-4000-8000-000000000104' AND version=99;
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM public.tok_workforce_time_entries
 WHERE id='40000000-0000-4000-8000-000000000104'), 'stale delete predicate preserves the unvalidated entry');
DELETE FROM public.tok_workforce_time_entries
 WHERE id='40000000-0000-4000-8000-000000000104' AND version=1;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.tok_workforce_time_entries
 WHERE id='40000000-0000-4000-8000-000000000104'), 'manager can delete an unvalidated unreferenced entry');

-- The approved leave has one source link and one effect, including repeated calls.
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
INSERT INTO public.tok_workforce_requests(id,restaurant_id,employee_id,request_type,description,requested_start_date,requested_end_date,requested_days)
VALUES('50000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 'vacation','Vacances',current_date+60,current_date+62,3);
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000201',true,'Congé confirmé');
SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000201',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 AND sum(days_count)=3 FROM public.tok_workforce_absences
 WHERE source_request_id='50000000-0000-4000-8000-000000000201'), 'leave approval has one uniquely linked absence');
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count,source_request_id)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','vacation',current_date+70,current_date+71,2,
 '50000000-0000-4000-8000-000000000201')$q$, '42501');
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_absences SET days_count=2
 WHERE source_request_id='50000000-0000-4000-8000-000000000201'$q$, '55000');
SELECT pg_temp.expect_error($q$DELETE FROM public.tok_workforce_absences
 WHERE source_request_id='50000000-0000-4000-8000-000000000201'$q$, '55000');
UPDATE public.tok_workforce_absences SET notes='Note administrative conservant les dates'
 WHERE source_request_id='50000000-0000-4000-8000-000000000201';
RESET ROLE;
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count,source_request_id)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','vacation',current_date+70,current_date+71,2,
 '50000000-0000-4000-8000-000000000201')$q$, '23505');
SET LOCAL ROLE authenticated;

-- Night services conflict with absences on either calendar date, in both directions.
INSERT INTO public.tok_workforce_shifts(id,restaurant_id,employee_id,shift_date,start_time,end_time,break_minutes)
VALUES('30000000-0000-4000-8000-000000000301','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+40,'22:00','02:00',30);
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sick',current_date+41,current_date+41,1)$q$, '23514');
INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count)
VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007','vacation',current_date+51,current_date+51,1);
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_shifts(restaurant_id,employee_id,shift_date,start_time,end_time)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date+50,'22:00','02:00')$q$, '23514');
INSERT INTO public.tok_workforce_shifts(id,restaurant_id,employee_id,shift_date,start_time,end_time)
VALUES('30000000-0000-4000-8000-000000000302','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date+50,'20:00','21:00');
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_shifts SET end_time='02:00' WHERE id='30000000-0000-4000-8000-000000000302'$q$, '23514');
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_shifts(restaurant_id,employee_id,shift_date,start_time,end_time)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+41,'01:00','03:00')$q$, '23514');

-- Same-time two-person swaps must pass the AFTER statement conflict check.
INSERT INTO public.tok_workforce_shifts(id,restaurant_id,employee_id,shift_date,start_time,end_time,break_minutes,status) VALUES
 ('30000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+20,'09:00','17:00',30,'planned'),
 ('30000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date+20,'10:00','18:00',30,'confirmed'),
 ('30000000-0000-4000-8000-000000000403','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date+21,'09:00','17:00',30,'cancelled'),
 ('30000000-0000-4000-8000-000000000404','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date-2,'09:00','17:00',30,'planned');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
INSERT INTO public.tok_workforce_exchanges(id,restaurant_id,requester_id,requester_shift_id,target_employee_id,target_shift_id,
 status,target_accepted_at,target_accepted_by,reviewed_by,reviewed_at)
VALUES('60000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000402',
 'approved',now(),'00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000003',now());
SELECT pg_temp.assert_true((SELECT status='pending' AND target_accepted_at IS NULL AND target_accepted_by IS NULL
 AND reviewed_at IS NULL AND reviewed_by IS NULL FROM public.tok_workforce_exchanges WHERE id='60000000-0000-4000-8000-000000000401'),
 'caller cannot forge colleague consent or review fields');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.tok_workforce_exchange_candidates(
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date-2,current_date+21)),
 'candidate listing excludes cancelled and past shifts');
SELECT pg_temp.assert_true((SELECT bool_and(NOT (to_jsonb(c) ?| ARRAY['hourly_cost_chf','email','user_id','notes']))
 FROM public.tok_workforce_exchange_candidates('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date,current_date+21) c),
 'candidate listing exposes only minimal scheduling fields');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_respond_exchange('60000000-0000-4000-8000-000000000401',true,NULL)$q$, '42501');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000401',true,repeat('N',2001))$q$, '22023');
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000401',true)$q$, '55000');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000007';
SELECT public.tok_workforce_respond_exchange('60000000-0000-4000-8000-000000000401',true,'D’accord');
SELECT public.tok_workforce_respond_exchange('60000000-0000-4000-8000-000000000401',true,'Retry');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000401',true,'  Couverture confirmée  ');
SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000401',true);
SELECT pg_temp.assert_true((SELECT manager_notes='Couverture confirmée' FROM public.tok_workforce_exchanges
 WHERE id='60000000-0000-4000-8000-000000000401'), 'review note is trimmed, persisted and preserved by retries');
SELECT pg_temp.assert_true((SELECT employee_id='20000000-0000-4000-8000-000000000007' FROM public.tok_workforce_shifts
 WHERE id='30000000-0000-4000-8000-000000000401') AND (SELECT employee_id='20000000-0000-4000-8000-000000000001' FROM public.tok_workforce_shifts
 WHERE id='30000000-0000-4000-8000-000000000402'), 'both shifts are swapped once in one transaction');

-- Cancellation belongs to the requester, is idempotent and never moves a shift.
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
INSERT INTO public.tok_workforce_exchanges(id,restaurant_id,requester_id,requester_shift_id,target_employee_id)
VALUES('60000000-0000-4000-8000-000000000402','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000402','20000000-0000-4000-8000-000000000007');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000007';
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_cancel_exchange('60000000-0000-4000-8000-000000000402')$q$, '42501');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
SELECT public.tok_workforce_cancel_exchange('60000000-0000-4000-8000-000000000402');
SELECT public.tok_workforce_cancel_exchange('60000000-0000-4000-8000-000000000402');
SELECT pg_temp.assert_true((SELECT status='cancelled' AND cancelled_by=auth.uid() AND cancelled_at IS NOT NULL
 FROM public.tok_workforce_exchanges WHERE id='60000000-0000-4000-8000-000000000402'), 'requester cancellation is recorded');
INSERT INTO public.tok_workforce_exchanges(id,restaurant_id,requester_id,requester_shift_id,target_employee_id)
VALUES('60000000-0000-4000-8000-000000000403','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000402','20000000-0000-4000-8000-000000000007');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000403',false,repeat('N',2000));
SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000403',false);
SELECT pg_temp.assert_true((SELECT status='rejected' AND char_length(manager_notes)=2000
 FROM public.tok_workforce_exchanges WHERE id='60000000-0000-4000-8000-000000000403'), 'a 2000-character rejection note is preserved by retries');
DELETE FROM public.tok_workforce_shifts WHERE id='30000000-0000-4000-8000-000000000403';
DELETE FROM public.tok_workforce_absences WHERE employee_id='20000000-0000-4000-8000-000000000007'
 AND start_date=current_date+51 AND source_request_id IS NULL;

-- A newly conflicting takeover rolls back shift movement and review together.
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
INSERT INTO public.tok_workforce_shifts(id,restaurant_id,employee_id,shift_date,start_time,end_time) VALUES
 ('30000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+30,'09:00','17:00'),
 ('30000000-0000-4000-8000-000000000502','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000007',current_date+30,'10:00','18:00');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
INSERT INTO public.tok_workforce_exchanges(id,restaurant_id,requester_id,requester_shift_id,target_employee_id)
VALUES('60000000-0000-4000-8000-000000000501','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000501','20000000-0000-4000-8000-000000000007');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000007';
SELECT public.tok_workforce_respond_exchange('60000000-0000-4000-8000-000000000501',true,NULL);
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_exchange('60000000-0000-4000-8000-000000000501',true)$q$, '23514');
SELECT pg_temp.assert_true((SELECT status='pending' FROM public.tok_workforce_exchanges WHERE id='60000000-0000-4000-8000-000000000501')
 AND (SELECT employee_id='20000000-0000-4000-8000-000000000001' FROM public.tok_workforce_shifts WHERE id='30000000-0000-4000-8000-000000000501'),
 'failed takeover preserves both the request and the source shift');

-- Holidays: owner writes, managers/employees read, unrelated tenants see nothing.
SET LOCAL "test.owner" = '10000000-0000-4000-8000-000000000001';
INSERT INTO public.tok_workforce_holidays(id,restaurant_id,holiday_date,name,is_national,created_by)
VALUES('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',current_date+90,' Fête locale ',false,
 '00000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT name='Fête locale' AND created_by=auth.uid() FROM public.tok_workforce_holidays
 WHERE id='70000000-0000-4000-8000-000000000001'), 'holiday metadata is server authored');
SET LOCAL "test.owner" = '';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.tok_workforce_holidays), 'delegated manager can read the restaurant calendar');
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_holidays(restaurant_id,holiday_date,name)
 VALUES('10000000-0000-4000-8000-000000000001',current_date+91,'Manager writes')$q$, '42501');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.tok_workforce_holidays), 'employee can read their restaurant calendar');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_holidays), 'foreign restaurant cannot read holidays');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.tok_workforce_validations), 'foreign restaurant cannot read signed evidence');
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries('10000000-0000-4000-8000-000000000001',
 ARRAY['40000000-0000-4000-8000-000000000104']::uuid[],'Wrong tenant','data:image/png;base64,'||repeat('A',140))$q$, '42501');
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_exchange_candidates('10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000007',current_date,current_date+20)$q$, '42501');
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000008';
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_exchange_candidates('10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000007',current_date,current_date+20)$q$, '42501');

-- New endpoint allowlists preserve RLS/EXECUTE and do not open anonymous access.
SELECT pg_temp.assert_true(public.launch_table_allowed('tok_workforce_holidays'), 'holiday endpoint permitted during launch for authenticated callers');
SELECT pg_temp.assert_true(public.launch_rpc_allowed('tok_workforce_validate_entries')
 AND public.launch_rpc_allowed('tok_workforce_cancel_exchange') AND public.launch_rpc_allowed('tok_workforce_exchange_candidates')
 AND public.launch_rpc_allowed('tok_workforce_can_schedule') AND public.launch_rpc_allowed('tok_workforce_enabled'), 'new exact RPC names permitted during launch');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.tok_workforce_validate_entries(uuid,uuid[],text,text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.tok_workforce_cancel_exchange(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.tok_workforce_exchange_candidates(uuid,uuid,date,date)','EXECUTE')
 AND NOT has_table_privilege('anon','public.tok_workforce_holidays','SELECT'), 'anonymous cannot execute or read workforce additions');
RESET ROLE;
ROLLBACK;
SELECT 'TOK WORKFORCE INTEGRITY POSTGRES SMOKE PASSED' AS result;
