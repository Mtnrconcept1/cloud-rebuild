BEGIN;
SET LOCAL statement_timeout='20s';
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END; $$;
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.prepare_print_fulfillment_submission(uuid,uuid)','EXECUTE'), 'anon prepare denied');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.finish_print_fulfillment_submission(uuid,uuid,text,text,jsonb)','EXECUTE'), 'authenticated finish denied');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000001','73280000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'authenticated unexpectedly prepared submission';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000001','73280000-0000-4000-8000-000000000001')->>'action'='create','first send allowed');
SELECT pg_temp.assert_true(public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000001','73280000-0000-4000-8000-000000000001')->>'action'='reconcile_only','duplicate send blocked');
UPDATE public.print_fulfillment_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='73270000-0000-4000-8000-000000000002';
DO $$ BEGIN
  PERFORM public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000002','73280000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'expired lease unexpectedly allowed';
EXCEPTION WHEN serialization_failure THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.complete_print_fulfillment_job('73270000-0000-4000-8000-000000000002','73280000-0000-4000-8000-000000000002','failed');
  RAISE EXCEPTION 'expired lease unexpectedly completed';
EXCEPTION WHEN serialization_failure THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.finish_print_fulfillment_submission('73270000-0000-4000-8000-000000000003','73280000-0000-4000-8000-000000000099','submitted');
  RAISE EXCEPTION 'wrong lease unexpectedly finished';
EXCEPTION WHEN serialization_failure THEN NULL; END $$;
UPDATE public.print_orders SET status='cancellation_requested' WHERE id='73260000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_true(public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000004','73280000-0000-4000-8000-000000000004')->>'status'='canceled','cancel before send');
SELECT pg_temp.assert_true(public.finish_print_fulfillment_submission('73270000-0000-4000-8000-000000000004','73280000-0000-4000-8000-000000000004','submitted')->>'status'='canceled','cancel wins over observed provider submission');
SELECT pg_temp.assert_true((SELECT status='cancellation_requested' FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000004'),'no state regression');
SELECT pg_temp.assert_true((SELECT result->>'transition_advanced'='false' AND result->>'reconciliation_required'='true' FROM public.print_fulfillment_jobs WHERE id='73270000-0000-4000-8000-000000000004'),'advanced=false recorded and acted on');
UPDATE public.print_orders SET status='shipped' WHERE id='73260000-0000-4000-8000-000000000005';
SELECT pg_temp.assert_true(public.finish_print_fulfillment_submission('73270000-0000-4000-8000-000000000005','73280000-0000-4000-8000-000000000005','submitted')->>'status'='completed','advanced=false shipped stays complete');
SELECT pg_temp.assert_true((SELECT status='shipped' FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000005'),'shipped not regressed');
UPDATE public.print_fulfillment_jobs SET attempt_count=2,lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='73270000-0000-4000-8000-000000000006';
SELECT * FROM public.claim_print_fulfillment_jobs(1,'fixture-reaper',180);
SELECT pg_temp.assert_true((SELECT status='failed' AND lease_token IS NULL AND result->>'reconciliation_required'='true' FROM public.print_fulfillment_jobs WHERE id='73270000-0000-4000-8000-000000000006'),'exhausted processing becomes actionable');
UPDATE public.print_fulfillment_jobs SET attempt_count=2 WHERE id='73270000-0000-4000-8000-000000000007';
SELECT pg_temp.assert_true(public.complete_print_fulfillment_job('73270000-0000-4000-8000-000000000007','73280000-0000-4000-8000-000000000007','retrying')->>'status'='failed','last retry cannot strand job');
UPDATE public.print_orders SET status='refund_pending' WHERE id='73260000-0000-4000-8000-000000000008';
SELECT pg_temp.assert_true(public.complete_print_fulfillment_job('73270000-0000-4000-8000-000000000008','73280000-0000-4000-8000-000000000008','completed')->>'status'='canceled','completion sees concurrent refund');
DO $$ BEGIN
  PERFORM public.complete_print_fulfillment_job('73270000-0000-4000-8000-000000000009','73280000-0000-4000-8000-000000000009','completed');
  RAISE EXCEPTION 'unsubmitted order unexpectedly completed';
EXCEPTION WHEN serialization_failure THEN NULL; END $$;
SELECT pg_temp.assert_true(public.finish_print_fulfillment_submission('73270000-0000-4000-8000-000000000010','73280000-0000-4000-8000-000000000010','submitted')->>'status'='completed','acceptance atomically finishes');
SELECT pg_temp.assert_true((SELECT status='submitted' FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000010'),'acceptance persists order');
SELECT pg_temp.assert_true(public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000011','73280000-0000-4000-8000-000000000011')->>'action'='reconcile_only','legacy attempt never blindly resubmitted');
UPDATE public.print_settings SET new_orders_enabled=false WHERE id='global';
SELECT pg_temp.assert_true(public.prepare_print_fulfillment_submission('73270000-0000-4000-8000-000000000003','73280000-0000-4000-8000-000000000003')->>'action'='paused','kill switch at send gate');
SELECT pg_temp.assert_true((SELECT submission_started_at IS NULL FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000003'),'paused attempt has no marker');
UPDATE public.print_settings SET new_orders_enabled=true WHERE id='global';
SELECT public.complete_print_fulfillment_job('73270000-0000-4000-8000-000000000001','73280000-0000-4000-8000-000000000001','failed');
SELECT pg_temp.assert_true((SELECT result->>'reconciliation_required'='true' FROM public.print_fulfillment_jobs WHERE id='73270000-0000-4000-8000-000000000001'),'failed ambiguous send requires reconciliation');
-- A failed final write rolls back order state AND the event insert.
RESET ROLE;
CREATE FUNCTION pg_temp.reject_fixture_finish() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='fixture_finish_failure'; END; $$;
CREATE TRIGGER reject_fixture_finish BEFORE UPDATE ON public.print_fulfillment_jobs
FOR EACH ROW WHEN (NEW.id='73270000-0000-4000-8000-000000000009' AND NEW.status='completed')
EXECUTE FUNCTION pg_temp.reject_fixture_finish();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM public.finish_print_fulfillment_submission('73270000-0000-4000-8000-000000000009','73280000-0000-4000-8000-000000000009','submitted');
  RAISE EXCEPTION 'finish unexpectedly succeeded';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'fixture_finish_failure' THEN RAISE; END IF;
END $$;
SELECT pg_temp.assert_true((SELECT status='paid' FROM public.print_orders WHERE id='73260000-0000-4000-8000-000000000009'),'finish failure rolls back transition');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.print_order_events WHERE print_order_id='73260000-0000-4000-8000-000000000009'),'finish failure rolls back event');
ROLLBACK;
