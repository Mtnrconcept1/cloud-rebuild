-- Run ONLY in the disposable database described by the companion fixture.
-- Apply fixture, 20261027020556 migration, then this file with ON_ERROR_STOP.
-- Uses real PostgreSQL roles/grants/RLS; no production account or network I/O.
BEGIN;
CREATE FUNCTION pg_temp.check_courier_security(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Courier security assertion failed: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.courier_write_denied(statement text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN true;
  END;
  RETURN false;
END $$;

-- Anonymous callers have no profile, dispatch or placement mutation path.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SELECT pg_temp.check_courier_security(
  (SELECT count(*) FROM public.couriers)=0,'anonymous courier profile is private');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$INSERT INTO public.couriers(user_id,status) VALUES ('72000000-0000-4000-8000-000000000004','approved')$q$),
  'anonymous cannot provision approved courier');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$SELECT public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000001')$q$),
  'anonymous cannot autoassign reservations');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000003"}',true);
SELECT pg_temp.check_courier_security(
  (SELECT iban FROM public.couriers WHERE id='72020000-0000-4000-8000-000000000001')='SYNTHETIC-PRIVATE-IBAN',
  'courier retains own private profile');
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.dispatch_attempts)=1,'courier retains own offer');
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.dispatch_jobs)=1,'courier retains assigned job');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.couriers SET status='approved',rating=999,acceptance_rate=999 WHERE id='72020000-0000-4000-8000-000000000001'$q$),
  'courier cannot self approve or forge dispatch ranking');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$INSERT INTO public.couriers(user_id,status) VALUES ('72000000-0000-4000-8000-000000000003','approved')$q$),
  'courier cannot bypass trusted profile provisioning');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$INSERT INTO public.dispatch_attempts(dispatch_job_id,courier_id) VALUES ('72040000-0000-4000-8000-000000000002','72020000-0000-4000-8000-000000000001')$q$),
  'courier cannot fabricate an offer to gain another order');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.dispatch_attempts SET status='accepted' WHERE id='72041000-0000-4000-8000-000000000001'$q$),
  'courier cannot accept outside guarded offer workflow');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$DELETE FROM public.dispatch_attempts WHERE id='72041000-0000-4000-8000-000000000001'$q$),
  'courier cannot delete offer evidence');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.dispatch_jobs SET status='delivered',delivered_at=now(),earnings_base=100000 WHERE id='72040000-0000-4000-8000-000000000001'$q$),
  'courier cannot bypass delivery proof or forge earnings');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.delivery_tracking SET status='delivered' WHERE order_id='72030000-0000-4000-8000-000000000001'$q$),
  'courier cannot forge customer delivery status');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$SELECT public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000001')$q$),
  'courier cannot mutate unrelated reservation slots');
SELECT pg_temp.check_courier_security(NOT has_table_privilege(current_user,'public.dispatch_jobs','TRUNCATE'),
  'direct truncate is also revoked');

-- Customers retain sanitized driver tracking, without the courier IBAN/history.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.couriers)=0,'active customer cannot read courier IBAN');
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.courier_locations)=0,'active customer cannot read raw courier history');
SELECT pg_temp.check_courier_security(
  (SELECT driver_phone FROM public.delivery_tracking WHERE order_id='72030000-0000-4000-8000-000000000001')='synthetic-phone',
  'active customer retains sanitized tracking');
SELECT pg_temp.check_courier_security(
  public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000002')='72060000-0000-4000-8000-000000000001',
  'reservation owner retains own autoassignment');
SELECT public.fixture_create_own_reservation('72070000-0000-4000-8000-000000000005');
SELECT pg_temp.check_courier_security(
  (SELECT table_id FROM public.reservation_slots WHERE reservation_id='72070000-0000-4000-8000-000000000005')='72060000-0000-4000-8000-000000000001',
  'trusted own reservation insertion still triggers automatic placement');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000004"}',true);
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.delivery_tracking)=0,'unrelated customer tracking stays private');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$SELECT public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000001')$q$),
  'another customer cannot autoassign a known reservation UUID');
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$SELECT public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000001')$q$),
  'authenticated role without user identity cannot autoassign');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000001"}',true);
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.couriers)=0,'restaurant cannot read assigned courier IBAN');
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.delivery_tracking)=1,'restaurant retains delivery tracking');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.dispatch_jobs SET earnings_base=100000,status='delivered' WHERE id='72040000-0000-4000-8000-000000000001'$q$),
  'restaurant cannot bypass guarded courier completion');
SELECT pg_temp.check_courier_security(
  public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000001')='72060000-0000-4000-8000-000000000001',
  'restaurant owner retains autoassignment');

-- Admin writes use the existing role-checking SECURITY DEFINER review RPC.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"72000000-0000-4000-8000-000000000005"}',true);
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.couriers)=1,'admin retains private profile review');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.couriers SET status='approved' WHERE id='72020000-0000-4000-8000-000000000001'$q$),
  'authenticated admin also uses guarded review rather than direct profile writes');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$DELETE FROM public.dispatch_attempts WHERE id='72041000-0000-4000-8000-000000000001'$q$),
  'authenticated admin cannot directly delete offer evidence');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$UPDATE public.dispatch_jobs SET status='delivered' WHERE id='72040000-0000-4000-8000-000000000001'$q$),
  'authenticated admin cannot directly bypass delivery proof');
SELECT pg_temp.check_courier_security(pg_temp.courier_write_denied(
  $q$DELETE FROM public.delivery_tracking WHERE order_id='72030000-0000-4000-8000-000000000001'$q$),
  'authenticated admin cannot directly delete tracking');
SELECT public.admin_review_courier_profile('72020000-0000-4000-8000-000000000001','approved','Synthetic admin review');
SELECT pg_temp.check_courier_security(
  (SELECT status FROM public.couriers WHERE id='72020000-0000-4000-8000-000000000001')='approved',
  'guarded admin review still updates courier status');
SELECT pg_temp.check_courier_security(
  public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000004')='72060000-0000-4000-8000-000000000001',
  'admin retains autoassignment');

-- Edge handlers retain the service-role mutation capabilities they already use.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.couriers SET is_online=true WHERE id='72020000-0000-4000-8000-000000000001';
INSERT INTO public.couriers(id,user_id,status) VALUES
 ('72020000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000004','pending_approval');
INSERT INTO public.dispatch_attempts(dispatch_job_id,courier_id) VALUES
 ('72040000-0000-4000-8000-000000000002','72020000-0000-4000-8000-000000000001');
UPDATE public.dispatch_jobs SET status='picked_up' WHERE id='72040000-0000-4000-8000-000000000001';
UPDATE public.delivery_tracking SET status='in_transit' WHERE order_id='72030000-0000-4000-8000-000000000001';
SELECT pg_temp.check_courier_security((SELECT is_online FROM public.couriers WHERE id='72020000-0000-4000-8000-000000000001'),
  'trusted presence updates still work');
SELECT pg_temp.check_courier_security((SELECT count(*) FROM public.dispatch_attempts)=2,'trusted dispatch still creates offers');
SELECT pg_temp.check_courier_security(
  (SELECT status FROM public.dispatch_jobs WHERE id='72040000-0000-4000-8000-000000000001')='picked_up',
  'trusted job progression still works');
SELECT pg_temp.check_courier_security(
  (SELECT status FROM public.delivery_tracking WHERE order_id='72030000-0000-4000-8000-000000000001')='in_transit',
  'trusted tracking progression still works');
SELECT pg_temp.check_courier_security(
  public.floor_plan_autoassign_reservation('72070000-0000-4000-8000-000000000003')='72060000-0000-4000-8000-000000000001',
  'service role retains autoassignment');
INSERT INTO public.reservations(id,restaurant_id,user_id,date,time,party_size,status)
VALUES('72070000-0000-4000-8000-000000000006','72010000-0000-4000-8000-000000000001',
 '72000000-0000-4000-8000-000000000002',current_date+41,'19:00',2,'confirmed');
SELECT pg_temp.check_courier_security(
  (SELECT table_id FROM public.reservation_slots WHERE reservation_id='72070000-0000-4000-8000-000000000006')='72060000-0000-4000-8000-000000000001',
  'service insertion without a user subject still triggers autoassignment');
RESET ROLE;
ROLLBACK;
