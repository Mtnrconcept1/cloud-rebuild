-- Run after the Plinko migration in a disposable database. All fixture writes
-- roll back. No auth.users fixture or user login is required for visitor play.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
DO $test$
DECLARE
  a text := repeat('a', 64); b text := repeat('b', 64); c text := repeat('c', 64);
  d text := repeat('d', 64); e text := repeat('e', 64);
  req uuid := '11111111-1111-4111-8111-111111111111';
  result jsonb; original_id text; reward_id text; n integer; table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['plinko_sessions', 'plinko_plays', 'plinko_rewards'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || table_name)::regclass) THEN RAISE EXCEPTION 'RLS disabled for %', table_name; END IF;
    IF has_table_privilege('anon', 'public.' || table_name, 'SELECT') OR has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
      OR has_table_privilege('anon', 'public.' || table_name, 'INSERT') OR has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE') THEN
      RAISE EXCEPTION 'Private visitor data exposed in %', table_name;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.create_plinko_session(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.record_plinko_play(text,uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.claim_plinko_reward(text,text,boolean)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.get_plinko_status(text)', 'EXECUTE') THEN RAISE EXCEPTION 'Privileged RPC exposed'; END IF;

  BEGIN
    PERFORM public.get_plinko_status(a);
    RAISE EXCEPTION 'Guessed session accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  result := public.create_plinko_session(a);
  IF NOT (result->>'available')::boolean OR (result->>'playsUsed')::int <> 0 OR result->'reward' <> 'null'::jsonb THEN RAISE EXCEPTION 'Incorrect new visitor state'; END IF;
  result := public.record_plinko_play(a, req, 'replay', gen_random_uuid());
  original_id := result->'play'->>'id';
  IF NOT (result->>'available')::boolean OR (result->>'attemptsRemaining')::int <> 1 OR result->'reward' <> 'null'::jsonb THEN RAISE EXCEPTION 'Replay did not grant one free drop'; END IF;
  result := public.record_plinko_play(a, req, 'free_meal', gen_random_uuid());
  IF result->'play'->>'id' <> original_id OR result->'play'->>'outcome' <> 'replay' OR NOT (result->>'idempotentReplay')::boolean OR (result->>'playsUsed')::int <> 1 THEN RAISE EXCEPTION 'Retry rerolled or consumed replay'; END IF;
  result := public.record_plinko_play(a, gen_random_uuid(), 'tok_one_month', gen_random_uuid());
  reward_id := result->'reward'->>'id';
  IF (result->>'available')::boolean OR (result->>'playsUsed')::int <> 2 OR result->'reward'->>'status' <> 'pending_email' THEN RAISE EXCEPTION 'Win did not persist an unclaimed prize'; END IF;
  IF EXISTS (SELECT 1 FROM public.plinko_rewards WHERE id = reward_id::uuid AND (email IS NOT NULL OR marketing_consent)) THEN RAISE EXCEPTION 'Email or consent collected before claim'; END IF;
  result := public.record_plinko_play(a, gen_random_uuid(), 'free_meal', gen_random_uuid());
  IF NOT (result->>'alreadyClaimed')::boolean OR (result->>'playsUsed')::int <> 2 OR result->'reward'->>'id' <> reward_id THEN RAISE EXCEPTION 'Exhausted session awarded another draw'; END IF;

  result := public.claim_plinko_reward(a, ' Winner@Example.Test ', false);
  IF result->'reward'->>'status' <> 'pending_fulfillment' OR result->'reward' ? 'email' THEN RAISE EXCEPTION 'Claim not private and durable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plinko_rewards WHERE id = reward_id::uuid AND email = 'winner@example.test' AND NOT marketing_consent AND marketing_consent_at IS NULL) THEN RAISE EXCEPTION 'Claim email/consent incorrect'; END IF;
  IF (SELECT count(*) FROM public.email_queue WHERE metadata->>'plinko_reward_id' = reward_id AND status = 'queued') <> 2
    OR NOT EXISTS (SELECT 1 FROM public.email_queue WHERE to_email = 'winner@example.test' AND metadata->>'plinko_reward_id' = reward_id)
    OR NOT EXISTS (SELECT 1 FROM public.email_queue WHERE to_email = 'contact@thetok.ch' AND metadata->>'plinko_reward_id' = reward_id) THEN RAISE EXCEPTION 'Visitor receipt/support handoff not queued atomically'; END IF;
  result := public.claim_plinko_reward(a, 'WINNER@example.test', true);
  IF NOT (result->>'idempotentReplay')::boolean OR EXISTS (SELECT 1 FROM public.plinko_rewards WHERE id = reward_id::uuid AND marketing_consent) THEN RAISE EXCEPTION 'Claim retry changed consent'; END IF;
  IF (SELECT count(*) FROM public.email_queue WHERE metadata->>'plinko_reward_id' = reward_id) <> 2 THEN RAISE EXCEPTION 'Claim retry duplicated queued messages'; END IF;
  BEGIN PERFORM public.claim_plinko_reward(a, 'other@example.test', false); RAISE EXCEPTION 'Claim email replacement accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;

  PERFORM public.create_plinko_session(b);
  PERFORM public.record_plinko_play(b, gen_random_uuid(), 'half_price', gen_random_uuid());
  BEGIN PERFORM public.claim_plinko_reward(b, 'winner@example.test', false); RAISE EXCEPTION 'Duplicate email campaign claim accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (public.get_plinko_status(b))->'reward'->>'status' <> 'pending_email' THEN RAISE EXCEPTION 'Rejected duplicate claim modified prize'; END IF;
  PERFORM public.claim_plinko_reward(b, 'second@example.test', true);
  IF NOT EXISTS (SELECT 1 FROM public.plinko_rewards WHERE email = 'second@example.test' AND marketing_consent AND marketing_consent_at IS NOT NULL) THEN RAISE EXCEPTION 'Explicit consent timestamp missing'; END IF;
  PERFORM public.create_plinko_session(c);
  PERFORM public.record_plinko_play(c, gen_random_uuid(), 'lost', gen_random_uuid());
  BEGIN PERFORM public.claim_plinko_reward(c, 'third@example.test'); RAISE EXCEPTION 'Loss awarded prize'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (public.get_plinko_status(c))->'reward' <> 'null'::jsonb THEN RAISE EXCEPTION 'Loss has reward'; END IF;

  PERFORM public.create_plinko_session(d);
  PERFORM public.record_plinko_play(d, gen_random_uuid(), 'free_meal', gen_random_uuid());
  SELECT count(*) INTO n FROM public.plinko_rewards;
  IF n <> 3 THEN RAISE EXCEPTION 'Expected exactly 3 actual prizes, got %', n; END IF;
  -- A queue failure rolls the email claim and BOTH message inserts back.
  ALTER TABLE public.email_queue ADD CONSTRAINT plinko_smoke_fail_support CHECK (to_email <> 'contact@thetok.ch') NOT VALID;
  BEGIN PERFORM public.claim_plinko_reward(d, 'rollback@example.test'); RAISE EXCEPTION 'Queue failure did not abort claim'; EXCEPTION WHEN check_violation THEN NULL; END;
  IF (public.get_plinko_status(d))->'reward'->>'status' <> 'pending_email'
    OR EXISTS (SELECT 1 FROM public.plinko_rewards WHERE email = 'rollback@example.test')
    OR EXISTS (SELECT 1 FROM public.email_queue WHERE to_email = 'rollback@example.test') THEN RAISE EXCEPTION 'Queue failure left a partial claim'; END IF;
  ALTER TABLE public.email_queue DROP CONSTRAINT plinko_smoke_fail_support;
  UPDATE public.plinko_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = d;
  BEGIN PERFORM public.get_plinko_status(d); RAISE EXCEPTION 'Expired token accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.claim_plinko_reward(d, 'expired@example.test'); RAISE EXCEPTION 'Expired claim accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM public.create_plinko_session(e);
  UPDATE public.feature_flags SET is_active = false WHERE name = 'plinko-welcome';
  IF (public.get_plinko_status(e)->>'available')::boolean THEN RAISE EXCEPTION 'Disabled flag permits play'; END IF;
  BEGIN PERFORM public.record_plinko_play(e, gen_random_uuid(), 'free_meal', gen_random_uuid()); RAISE EXCEPTION 'Disabled campaign draw accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  result := public.record_plinko_play(a, req, 'lost', gen_random_uuid());
  IF result->'requestedPlay'->>'id' <> original_id OR result->'requestedPlay'->>'outcome' <> 'replay'
    OR result->'play'->>'outcome' <> 'tok_one_month' OR result->'reward'->>'id' <> reward_id
    OR (result->>'available')::boolean THEN RAISE EXCEPTION 'Stale retry did not preserve original receipt and current claim'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN PERFORM public.get_plinko_status(a); RAISE EXCEPTION 'Non-service JWT accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
ROLLBACK;
