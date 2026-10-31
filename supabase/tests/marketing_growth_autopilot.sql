-- Assertions against disposable PostgreSQL fixture + actual migration.
DO $test$
BEGIN
 IF public.marketing_contact_is_eligible('00000000-0000-4000-8000-000000000002','email') THEN
   RAISE EXCEPTION 'Bulk email must reject legitimate_interest-only prospect';
 END IF;
 IF NOT public.marketing_contact_is_eligible('00000000-0000-4000-8000-000000000002','manual_email') THEN
   RAISE EXCEPTION 'Historical manually reviewed contact flow must remain available';
 END IF;
 IF NOT public.marketing_contact_is_eligible('00000000-0000-4000-8000-000000000001','email') THEN
   RAISE EXCEPTION 'Verified opted-in email unexpectedly rejected';
 END IF;
END;
$test$;

SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
SELECT public.service_run_marketing_growth_autopilot(50);
RESET ROLE;
RESET request.jwt.claims;

DO $test$
DECLARE v_count integer;
BEGIN
 SELECT count(*) INTO v_count FROM public.marketing_growth_opportunities;
 IF v_count <> 3 THEN RAISE EXCEPTION 'Expected 3 safe tasks, got %',v_count; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.marketing_growth_opportunities WHERE
    contact_id='00000000-0000-4000-8000-000000000001'
    AND action_kind='consented_nurture' AND status='proposed'
 ) THEN RAISE EXCEPTION 'Consented nurture task missing'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.marketing_growth_opportunities WHERE
    contact_id='00000000-0000-4000-8000-000000000002'
    AND action_kind='consented_nurture'
 ) THEN RAISE EXCEPTION 'Unconsented contact promoted to email'; END IF;
 IF EXISTS (
   SELECT 1 FROM public.marketing_growth_opportunities WHERE
    contact_id='00000000-0000-4000-8000-000000000004'
 ) THEN RAISE EXCEPTION 'Opted out contact in queue'; END IF;
 IF (SELECT staged_count FROM public.marketing_growth_snapshots) <> 3 THEN
   RAISE EXCEPTION 'Wrong first run batch count'; END IF;
 IF (SELECT metrics->>'conversion_rate' FROM public.marketing_growth_snapshots) IS NOT NULL THEN
   RAISE EXCEPTION 'Invented marketing conversion rate'; END IF;
 IF (SELECT metrics->>'reservations_created' FROM public.marketing_growth_snapshots) <> '1' THEN
   RAISE EXCEPTION 'Missing real booking baseline'; END IF;
END;
$test$;

SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
SELECT public.service_run_marketing_growth_autopilot(50);
RESET ROLE;
RESET request.jwt.claims;
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.marketing_growth_opportunities) <> 3 THEN
  RAISE EXCEPTION 'Idempotence failed'; END IF;
 IF (SELECT count(*) FROM public.marketing_growth_snapshots) <> 1 THEN
  RAISE EXCEPTION 'Duplicate daily snapshot'; END IF;
END $test$;

-- Next internal cycle after a consent withdrawal and signed conversion:
UPDATE public.marketing_contacts SET opted_out_at=now()
 WHERE id='00000000-0000-4000-8000-000000000001';
INSERT INTO public.commercial_prospect_followups(source_objectid,signed_at) VALUES(2,now());
DELETE FROM public.marketing_growth_snapshots;
SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
SELECT public.service_run_marketing_growth_autopilot(50);
RESET ROLE;
RESET request.jwt.claims;
DO $test$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.marketing_growth_opportunities WHERE
   contact_id='00000000-0000-4000-8000-000000000001' AND status='suppressed'
 ) THEN RAISE EXCEPTION 'Revoked consent was not suppressed'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.marketing_growth_opportunities WHERE
   contact_id='00000000-0000-4000-8000-000000000002' AND status='converted'
 ) THEN RAISE EXCEPTION 'Signed prospect not closed'; END IF;
END $test$;

-- Paused marketing runtime cannot launch new autonomous cycles.
UPDATE public.marketing_automations SET status='paused',conditions='{"global_pause":"true"}'
 WHERE automation_key='global_runtime';
DELETE FROM public.marketing_growth_snapshots;
SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';
SELECT public.service_run_marketing_growth_autopilot(50);
RESET ROLE;
RESET request.jwt.claims;
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM public.marketing_growth_snapshots) THEN
  RAISE EXCEPTION 'Global pause ignored'; END IF;
END $test$;

-- Direct table reads and RPC execution are denied to an ordinary user.
SET ROLE anon;
DO $test$ BEGIN
 BEGIN
  PERFORM public.service_run_marketing_growth_autopilot(50);
  RAISE EXCEPTION 'Anonymous worker access unexpectedly granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM count(*) FROM public.marketing_growth_opportunities;
  RAISE EXCEPTION 'Anonymous queue access unexpectedly granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT 'growth-autopilot-tests-passed' AS result;
