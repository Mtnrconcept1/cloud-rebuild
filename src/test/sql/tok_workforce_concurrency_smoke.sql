-- Run only after tok_workforce_postgres_smoke.sql in its disposable PostgreSQL.
-- dblink opens a second real session: these cases cannot run on single-session PGlite.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF position('test.is_admin' IN pg_get_functiondef('public.auth_is_admin()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'This concurrency suite requires the disposable workforce smoke database.';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS dblink;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', p_label; END IF;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_command text, p_state text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN EXECUTE p_command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'Unexpected SQLSTATE %, expected %: %', SQLSTATE, p_state, SQLERRM;
    END IF;
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Expected SQLSTATE %', p_state; END IF;
END $$;

BEGIN;
SET LOCAL "test.is_admin" = 'yes';
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000003';
UPDATE public.tok_workforce_settings SET enabled = true;
INSERT INTO public.tok_workforce_time_entries(id, restaurant_id, employee_id, entry_date, start_time, end_time, break_minutes) VALUES
 ('40000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date,'09:00','17:00',30),
 ('40000000-0000-4000-8000-000000000902','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+1,'09:00','17:00',30),
 ('40000000-0000-4000-8000-000000000903','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+2,'09:00','17:00',30);
INSERT INTO public.tok_workforce_requests(id, restaurant_id, employee_id, request_type, description,
 requested_entry_id, requested_entry_version, requested_start_time, requested_end_time, requested_break_minutes) VALUES
 ('50000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','correction','Race: signing wins',
 '40000000-0000-4000-8000-000000000901',1,'09:00','18:00',30),
 ('50000000-0000-4000-8000-000000000902','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','correction','Race: correction wins',
 '40000000-0000-4000-8000-000000000902',1,'09:00','18:00',30);
COMMIT;

-- The server connects to its own private socket, including in the CI container.
-- No external database URL, service key or production credential is used.
SELECT dblink_connect('workforce_writer', format('host=%L port=%s dbname=%L user=%L application_name=tok_workforce_race',
 split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database(), session_user));
SELECT dblink_exec('workforce_writer', $q$BEGIN;
 SET LOCAL statement_timeout='10s'; SET LOCAL "test.is_admin"='no';
 SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
 SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
 SET LOCAL "request.jwt.claim.role"='authenticated'; SET LOCAL ROLE authenticated$q$);
SELECT pg_temp.assert_true(amount=1, 'first writer creates the signature before committing')
FROM dblink('workforce_writer', $q$SELECT count(*) FROM public.tok_workforce_validate_entries(
 '10000000-0000-4000-8000-000000000001',ARRAY['40000000-0000-4000-8000-000000000901'::uuid],
 'Test Manager','data:image/png;base64,' || repeat('A',100),'{"40000000-0000-4000-8000-000000000901":1}')$q$) AS t(amount bigint);

BEGIN;
SET LOCAL "test.is_admin"='no';
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000901',true,NULL)$q$, '40001');
-- A different restaurant remains writable while the first restaurant is locked.
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000002';
INSERT INTO public.tok_workforce_time_entries(id,restaurant_id,employee_id,entry_date,start_time,end_time)
VALUES('40000000-0000-4000-8000-000000000904','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',current_date,'09:00','17:00');
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT dblink_exec('workforce_writer', 'COMMIT');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.tok_workforce_review_request('50000000-0000-4000-8000-000000000901',true,NULL)$q$, '55000');
SELECT pg_temp.assert_true((SELECT status='pending' FROM public.tok_workforce_requests WHERE id='50000000-0000-4000-8000-000000000901')
 AND (SELECT version=1 AND end_time='17:00'::time FROM public.tok_workforce_time_entries WHERE id='40000000-0000-4000-8000-000000000901'),
 'a signature winning the race leaves the correction pending and the signed content intact');
COMMIT;

-- Reverse order: an applied correction wins; a stale signature cannot attest v1.
SELECT dblink_exec('workforce_writer', $q$BEGIN;
 SET LOCAL statement_timeout='10s'; SET LOCAL "test.is_admin"='no';
 SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
 SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
 SET LOCAL "request.jwt.claim.role"='authenticated'; SET LOCAL ROLE authenticated;
 DO $$ BEGIN PERFORM public.tok_workforce_review_request('50000000-0000-4000-8000-000000000902',true,'Correction committed first'); END $$$q$);
BEGIN;
SET LOCAL "test.is_admin"='no';
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET LOCAL "request.jwt.claim.role"='authenticated';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries(
 '10000000-0000-4000-8000-000000000001',ARRAY['40000000-0000-4000-8000-000000000902'::uuid],
 'Test Manager','data:image/png;base64,' || repeat('A',100),'{"40000000-0000-4000-8000-000000000902":1}')$q$, '40001');
RESET ROLE;
SELECT dblink_exec('workforce_writer', 'COMMIT');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT * FROM public.tok_workforce_validate_entries(
 '10000000-0000-4000-8000-000000000001',ARRAY['40000000-0000-4000-8000-000000000902'::uuid],
 'Test Manager','data:image/png;base64,' || repeat('A',100),'{"40000000-0000-4000-8000-000000000902":1}')$q$, '40001');
SELECT pg_temp.assert_true(entry_version=2 AND entry_snapshot->>'end_time'='18:00:00', 'only corrected v2 can be signed')
FROM public.tok_workforce_validate_entries('10000000-0000-4000-8000-000000000001',
 ARRAY['40000000-0000-4000-8000-000000000902'::uuid], 'Test Manager', 'data:image/png;base64,' || repeat('A',100),
 '{"40000000-0000-4000-8000-000000000902":2}');
COMMIT;

-- A night service and an absence cannot both win a concurrent insertion.
SELECT dblink_exec('workforce_writer', $q$BEGIN;
 SET LOCAL statement_timeout='10s'; SET LOCAL "test.is_admin"='no';
 SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
 SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003'; SET LOCAL ROLE authenticated;
 INSERT INTO public.tok_workforce_shifts(id,restaurant_id,employee_id,shift_date,start_time,end_time)
 VALUES('30000000-0000-4000-8000-000000000901','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date+200,'22:00','02:00')$q$);
BEGIN;
SET LOCAL "test.is_admin"='no';
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','vacation',current_date+201,current_date+201,1)$q$, '40001');
RESET ROLE;
SELECT dblink_exec('workforce_writer', 'COMMIT');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$INSERT INTO public.tok_workforce_absences(restaurant_id,employee_id,absence_type,start_date,end_date,days_count)
 VALUES('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','vacation',current_date+201,current_date+201,1)$q$, '23514');
COMMIT;

-- Reproduce row-lock/advisory-lock inversion. The API writer waits for an entry;
-- a direct UPDATE already owns that row. Its trigger must fail fast, not deadlock.
SELECT dblink_exec('workforce_writer', $q$BEGIN;
 SET LOCAL statement_timeout='10s'; SET LOCAL "test.is_admin"='no';
 SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
 SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003'; SET LOCAL ROLE authenticated$q$);
BEGIN;
SET LOCAL "test.is_admin"='no';
SET LOCAL "test.owner"='10000000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT id FROM public.tok_workforce_time_entries WHERE id='40000000-0000-4000-8000-000000000903' FOR UPDATE;
RESET ROLE;
SELECT dblink_send_query('workforce_writer', $q$SELECT count(*) FROM public.tok_workforce_validate_entries(
 '10000000-0000-4000-8000-000000000001',ARRAY['40000000-0000-4000-8000-000000000903'::uuid],
 'Test Manager','data:image/png;base64,' || repeat('A',100),'{"40000000-0000-4000-8000-000000000903":1}')$q$);
DO $$ DECLARE v_waiting boolean := false; BEGIN
  FOR attempt IN 1..100 LOOP
    SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE a.application_name='tok_workforce_race' AND NOT l.granted AND l.locktype='transactionid') INTO v_waiting;
    EXIT WHEN v_waiting;
    PERFORM pg_sleep(0.02);
  END LOOP;
  IF NOT v_waiting THEN RAISE EXCEPTION 'The second session did not reach the controlled row-lock race.'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$UPDATE public.tok_workforce_time_entries SET end_time='19:00'
 WHERE id='40000000-0000-4000-8000-000000000903'$q$, '40001');
COMMIT;
SELECT pg_temp.assert_true(amount=1, 'the waiting signer completes after the competing update fails without deadlock')
FROM dblink_get_result('workforce_writer') AS t(amount bigint);
SELECT * FROM dblink_get_result('workforce_writer') AS t(amount bigint);
SELECT dblink_exec('workforce_writer', 'COMMIT');
SELECT pg_temp.assert_true((SELECT version=1 AND end_time='17:00'::time FROM public.tok_workforce_time_entries
 WHERE id='40000000-0000-4000-8000-000000000903'), 'failed competing edit cannot modify signed content');
SELECT dblink_disconnect('workforce_writer');
SELECT 'TOK WORKFORCE CONCURRENCY POSTGRES SMOKE PASSED' AS result;
