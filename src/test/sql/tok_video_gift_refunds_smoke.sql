-- Run after scripts/security/test-video-gift-refunds.mjs prepares its fresh
-- disposable fixture and applies the refund migration twice. All money logic
-- uses native historical wallet/gift triggers, including the image ledger guard.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $$ BEGIN
  PERFORM public.fixture_video_assert((SELECT sum(credits)=531 AND count(*)=4
    FROM private_finance.ai_video_credit_releases),'all three historical failures restored exactly once');
  PERFORM public.fixture_video_assert((SELECT sum(remaining)=1100 FROM private_finance.admin_ai_credit_grants
    WHERE restaurant_id='98200000-0000-4000-8000-000000000002'),'historical original lots restored');
  PERFORM public.fixture_video_assert(NOT EXISTS (
    SELECT * FROM private_finance.ai_video_credit_releases EXCEPT SELECT * FROM public.fixture_video_release_after
  ) AND NOT EXISTS (
    SELECT * FROM public.fixture_video_release_after EXCEPT SELECT * FROM private_finance.ai_video_credit_releases
  ),'migration replay leaves exact release receipts unchanged');
  PERFORM public.fixture_video_assert(NOT EXISTS (
    SELECT 1 FROM private_finance.admin_ai_credit_grants g JOIN public.fixture_video_grant_before old ON old.id=g.id
    WHERE g.amount<>old.amount OR g.granted_at<>old.granted_at OR g.expires_at<>old.expires_at
      OR (g.restaurant_id<>'98200000-0000-4000-8000-000000000002' AND g.remaining<>old.remaining)
  ),'success/uncertain/mismatched lots and every original expiry stay unchanged');
  PERFORM public.fixture_video_assert((SELECT count(*)=3 FROM public.ai_usage_logs u
    JOIN public.fixture_video_cases c ON c.job_id::text=u.metadata->>'video_job_id'
    WHERE c.label LIKE 'historic_failed_%' AND u.status='failure'
      AND u.metadata->>'admin_ai_gift_refunded'='177'),'historical refund metadata matches journal');
  PERFORM public.fixture_video_assert((SELECT coalesce(sum(s.credits),0)=0 FROM private_finance.admin_ai_credit_spends s
    JOIN public.restaurant_video_generations j ON j.usage_log_id=s.usage_id
    JOIN public.fixture_video_cases c ON c.job_id=j.id WHERE c.label LIKE 'historic_failed_%'),
    'historical spends are consumed by restitution');
  INSERT INTO public.fixture_video_checks VALUES ('01 historical repair and migration replay: exact 531 credits, four original allocations');
END $$;

DO $$
DECLARE j public.restaurant_video_generations; v_expiry timestamptz;
  v_key uuid := gen_random_uuid(); v_options jsonb := '{"version":1,"referenceMediaIds":["98500000-0000-4000-8000-000000000006"],"logoMediaId":null,"allowInterpretation":true}';
BEGIN
  SELECT * INTO j FROM public.reserve_restaurant_brand_video_generation(
    '98200000-0000-4000-8000-000000000006','98100000-0000-4000-8000-000000000001',v_key,
    'Synthetic brand request with original photo',false,177,v_options);
  PERFORM public.fixture_video_assert((SELECT array_agg(s.credits ORDER BY s.credits)=ARRAY[77,100]
    FROM private_finance.admin_ai_credit_spends s WHERE s.usage_id=j.usage_log_id),'native gift allocation spans two original lots');
  v_expiry := clock_timestamp()-interval '1 minute';
  UPDATE private_finance.admin_ai_credit_grants SET expires_at=v_expiry WHERE restaurant_id=j.restaurant_id;
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-delayed-completion','completed','delayed-result.mp4',NULL);
  PERFORM public.reserve_restaurant_brand_video_generation(j.restaurant_id,j.user_id,v_key,
    'Synthetic brand request with original photo',false,177,v_options);
  PERFORM public.fixture_video_assert((SELECT status='failed' AND storage_path IS NULL FROM public.restaurant_video_generations WHERE id=j.id),
    'delayed completion never reopens a terminal refunded job');
  PERFORM public.fixture_video_assert((SELECT status='failure' AND metadata->>'billing_state'='refunded'
    FROM public.ai_usage_logs WHERE id=j.usage_log_id),'delayed completion never recharges a failed job');
  PERFORM public.fixture_video_assert((SELECT sum(remaining)=600 AND bool_and(expires_at=v_expiry)
    FROM private_finance.admin_ai_credit_grants WHERE restaurant_id=j.restaurant_id),
    'failure/replay restore only original expired lots, without extending them');
  PERFORM public.fixture_video_assert(public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(j.restaurant_id))=0,
    'expired restored lots never become spendable');
  PERFORM public.fixture_video_assert((SELECT sum(credits)=177 AND count(*)=2 FROM private_finance.ai_video_credit_releases
    WHERE job_id=j.id),'one receipt per original lot despite finish and request replays');
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM private_finance.admin_ai_credit_spends WHERE usage_id=j.usage_log_id),
    'no allocated gift remains after refund');
  INSERT INTO public.fixture_video_checks VALUES ('02 new brand failure: split lots, expiry, delayed completion/replays and zero extra wallet credit');
END $$;

DO $$ DECLARE j public.restaurant_video_generations; BEGIN
  SELECT * INTO j FROM public.reserve_restaurant_video_generation(
    '98200000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
    'Synthetic ordinary credit request',5,'720p','9:16',false,NULL,177);
  PERFORM public.fixture_video_assert(public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(j.restaurant_id))=823,
    'ordinary plan credits reserved by native wallet');
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_invalid_input');
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_invalid_input');
  PERFORM public.fixture_video_assert(public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(j.restaurant_id))=1000,
    'ordinary failure restores only original plan balance once');
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM private_finance.ai_video_credit_releases WHERE job_id=j.id),
    'no gift is manufactured for an ordinary credit failure');
  INSERT INTO public.fixture_video_checks VALUES ('03 ordinary paid/subscription credits refund once through the unchanged native wallet');
END $$;

DO $$ DECLARE j public.restaurant_video_generations; v_caught boolean := false; BEGIN
  SELECT j0.* INTO j FROM public.restaurant_video_generations j0 JOIN public.fixture_video_cases c ON c.job_id=j0.id
    WHERE c.label='historic_success';
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-success','failed',NULL,'video_provider_failed');
  PERFORM public.fixture_video_assert((SELECT status='completed' FROM public.restaurant_video_generations WHERE id=j.id),
    'late failure cannot change a completed job');
  PERFORM public.fixture_video_assert((SELECT coalesce(sum(credits),0)=177 FROM private_finance.admin_ai_credit_spends
    WHERE usage_id=j.usage_log_id),'completed gift cost stays allocated');
  PERFORM public.fixture_video_assert((SELECT status='success' AND metadata->>'billing_state'='charged'
    FROM public.ai_usage_logs WHERE id=j.usage_log_id),'successful bill stays charged');
  SELECT j0.* INTO j FROM public.restaurant_video_generations j0 JOIN public.fixture_video_cases c ON c.job_id=j0.id
    WHERE c.label='historic_uncertain';
  BEGIN
    PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_submission_unconfirmed');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'cannot_refund_unverified_submission' THEN RAISE; END IF;
    v_caught:=true;
  END;
  PERFORM public.fixture_video_assert(v_caught,'unconfirmed provider submission cannot be refunded');
  PERFORM public.fixture_video_assert((SELECT status='needs_review' FROM public.restaurant_video_generations WHERE id=j.id),
    'unconfirmed job stays reviewable');
  PERFORM public.fixture_video_assert((SELECT coalesce(sum(credits),0)=177 FROM private_finance.admin_ai_credit_spends
    WHERE usage_id=j.usage_log_id),'uncertain reservation stays funded');
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM private_finance.ai_video_credit_releases WHERE job_id=j.id),
    'no release receipt for uncertain job');
  INSERT INTO public.fixture_video_checks VALUES ('04 completed and uncertain provider jobs keep their funded reservations');
END $$;

DO $$ DECLARE j public.restaurant_video_generations; v_caught boolean := false; BEGIN
  SELECT * INTO j FROM public.reserve_restaurant_video_generation(
    '98200000-0000-4000-8000-000000000009','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
    'Synthetic queued provider failure',5,'720p','9:16',false,NULL,177);
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-queued','queued',NULL,NULL);
  BEGIN
    PERFORM public.finish_restaurant_video_generation(j.id,'fixture-wrong','failed',NULL,'video_provider_failed');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'stale_video_provider_response' THEN RAISE; END IF;
    v_caught:=true;
  END;
  PERFORM public.fixture_video_assert(v_caught,'different provider request cannot release credits');
  PERFORM public.fixture_video_assert((SELECT status='queued' FROM public.restaurant_video_generations WHERE id=j.id),
    'stale failure leaves pending state unchanged');
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-queued','failed',NULL,'video_provider_failed');
  PERFORM public.fixture_video_assert((SELECT sum(remaining)=500 FROM private_finance.admin_ai_credit_grants WHERE restaurant_id=j.restaurant_id),
    'confirmed same-request failure restores original gift');
  INSERT INTO public.fixture_video_checks VALUES ('05 stale provider responses rejected; matching confirmed failure refunds exactly once');
END $$;

DO $$ DECLARE j public.restaurant_video_generations; v_caught boolean := false; BEGIN
  SELECT * INTO j FROM public.reserve_restaurant_video_generation(
    '98200000-0000-4000-8000-000000000008','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
    'Synthetic inconsistent gift cap',5,'720p','9:16',false,NULL,177);
  -- Deliberate local corruption proves the function refuses a double/manual
  -- recharge and rolls the ENTIRE terminal transition back, not just its refund.
  UPDATE private_finance.admin_ai_credit_grants SET remaining=amount WHERE restaurant_id=j.restaurant_id;
  BEGIN
    PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'video_gift_release_grant_mismatch' THEN RAISE; END IF;
    v_caught:=true;
  END;
  PERFORM public.fixture_video_assert(v_caught,'cannot restore beyond the original grant amount');
  PERFORM public.fixture_video_assert((SELECT status='reserved' FROM public.restaurant_video_generations WHERE id=j.id),
    'failed refund rolls back job state');
  PERFORM public.fixture_video_assert((SELECT status='success' AND metadata->>'billing_state'='reserved'
    FROM public.ai_usage_logs WHERE id=j.usage_log_id),'failed refund rolls back billing state');
  PERFORM public.fixture_video_assert((SELECT sum(credits)=177 FROM private_finance.admin_ai_credit_spends WHERE usage_id=j.usage_log_id),
    'failed refund keeps allocation intact');
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM private_finance.ai_video_credit_releases WHERE job_id=j.id),
    'failed refund does not leave a receipt');
  UPDATE private_finance.admin_ai_credit_grants SET remaining=amount-177 WHERE restaurant_id=j.restaurant_id;
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
  INSERT INTO public.fixture_video_checks VALUES ('06 inconsistent lot cap rolls back status, wallet, allocations and journal atomically');
END $$;

DO $$ DECLARE op jsonb; v_restaurant constant uuid := '98200000-0000-4000-8000-000000000007'; BEGIN
  SELECT public.claim_ai_image_operation('98100000-0000-4000-8000-000000000001',v_restaurant,
    'fixture-image-next-to-video',repeat('a',64),6,'fixture-seed','gpt-image-2') INTO op;
  PERFORM public.advance_ai_image_operation((op->>'operation_id')::uuid,(op->>'worker_token')::uuid,'cleanup_pending','fixture cleanup proof');
  PERFORM public.release_ai_image_operation((op->>'operation_id')::uuid,(op->>'worker_token')::uuid,'fixture cleanup proof');
  PERFORM public.release_ai_image_operation((op->>'operation_id')::uuid,(op->>'worker_token')::uuid,'fixture cleanup proof');
  PERFORM public.fixture_video_assert((SELECT sum(remaining)=500 FROM private_finance.admin_ai_credit_grants WHERE restaurant_id=v_restaurant),
    'native image gift refund unchanged, no double restitution');
  PERFORM public.fixture_video_assert((SELECT sum(credits)=6 FROM private_finance.ai_image_credit_releases
    WHERE operation_id=(op->>'operation_id')::uuid),'image receipt remains in its original registry');
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM private_finance.ai_video_credit_releases
    WHERE usage_id=(op->>'usage_id')::uuid),'video refund never touches image allocations');
  INSERT INTO public.fixture_video_checks VALUES ('07 existing native image gift refund remains independent and idempotent');
END $$;

DO $$
DECLARE j public.restaurant_video_generations;
  v_user constant uuid := '98100000-0000-4000-8000-000000000099';
  v_restaurant constant uuid := '98200000-0000-4000-8000-000000000007';
BEGIN
  INSERT INTO auth.users(id,email) VALUES (v_user,'temporary-video-actor@example.invalid');
  INSERT INTO public.restaurant_staff VALUES (v_restaurant,v_user);
  SELECT * INTO j FROM public.reserve_restaurant_video_generation(v_restaurant,v_user,gen_random_uuid(),
    'Synthetic removable video actor',5,'720p','9:16',false,NULL,177);
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_access_denied');
  DELETE FROM public.restaurant_staff WHERE user_id=v_user;
  DELETE FROM auth.users WHERE id=v_user;
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM public.restaurant_video_generations WHERE id=j.id),
    'existing account deletion still cascades to its video jobs');
  PERFORM public.fixture_video_assert((SELECT sum(credits)=177 FROM private_finance.ai_video_credit_releases WHERE job_id=j.id),
    'refund audit keeps the immutable job snapshot without blocking account deletion');
  PERFORM public.fixture_video_assert((SELECT user_id IS NULL FROM public.ai_usage_logs WHERE id=j.usage_log_id),
    'existing usage actor anonymization still runs');
  INSERT INTO public.fixture_video_checks VALUES ('08 existing account-deletion cascade and usage anonymization work while refund receipt survives');
END $$;

DO $$ DECLARE v_role text; BEGIN
  PERFORM public.fixture_video_assert((SELECT relrowsecurity FROM pg_class
    WHERE oid='private_finance.ai_video_credit_releases'::regclass),'release audit has RLS enabled');
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    PERFORM public.fixture_video_assert(NOT has_table_privilege(v_role,'private_finance.ai_video_credit_releases','SELECT,INSERT,UPDATE,DELETE'),
      'release audit is private to owner routines');
    PERFORM public.fixture_video_assert(NOT has_function_privilege(v_role,'private_finance.release_restaurant_video_gifts(uuid,text)','EXECUTE'),
      'private helper cannot be invoked directly');
  END LOOP;
  PERFORM public.fixture_video_assert(has_function_privilege('service_role','public.finish_restaurant_video_generation(uuid,text,text,text,text)','EXECUTE'),
    'existing service RPC remains callable');
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM public.fixture_video_assert(NOT has_function_privilege(v_role,'public.finish_restaurant_video_generation(uuid,text,text,text,text)','EXECUTE'),
      'public callers cannot finalize or refund jobs');
  END LOOP;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_caught boolean := false; BEGIN
  BEGIN PERFORM public.finish_restaurant_video_generation(NULL,NULL,'failed',NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_caught:=true; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'authenticated caller reached finish RPC'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE v_caught boolean := false; BEGIN
  BEGIN PERFORM public.finish_restaurant_video_generation(NULL,NULL,'failed',NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_caught:=true; END;
  IF NOT v_caught THEN RAISE EXCEPTION 'anonymous caller reached finish RPC'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'anon';
DO $$ DECLARE v_caught boolean := false; BEGIN
  BEGIN PERFORM public.finish_restaurant_video_generation(NULL,NULL,'failed',NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM<>'service_role_required' THEN RAISE; END IF;
    v_caught:=true;
  END;
  PERFORM public.fixture_video_assert(v_caught,'internal auth guard rejects a non-service claim even for routine owner');
  INSERT INTO public.fixture_video_checks VALUES ('09 private RLS audit, least-privilege grants and real anon/authenticated execution denials');
END $$;
COMMIT;
