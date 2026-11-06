BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';
UPDATE public.restaurant_video_generations SET updated_at = clock_timestamp();
CREATE TEMP TABLE reconciliation_accounting_before AS
  SELECT (SELECT coalesce(sum(remaining),0) FROM private_finance.admin_ai_credit_grants) AS credits,
    (SELECT count(*) FROM public.ai_usage_logs) AS usage_count;
INSERT INTO public.restaurant_video_generations
  (id,restaurant_id,user_id,idempotency_key,prompt,duration,resolution,aspect_ratio,credit_units,status,provider_request_id,updated_at)
SELECT ('98900000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  '98200000-0000-4000-8000-000000000001','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
  'Synthetic reconciliation fixture',10,'720p','9:16',0,
  CASE n WHEN 1 THEN 'queued' WHEN 2 THEN 'needs_review' WHEN 3 THEN 'archiving'
    WHEN 4 THEN 'completed' WHEN 5 THEN 'failed' WHEN 6 THEN 'needs_review' ELSE 'queued' END,
  CASE WHEN n = 6 THEN NULL ELSE 'fixture-accepted-' || n END,
  CASE WHEN n = 7 THEN clock_timestamp() ELSE clock_timestamp() - (100 - n) * interval '1 minute' END
FROM generate_series(1,7) AS n;

DO $$ DECLARE ids uuid[]; BEGIN
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.claim_restaurant_video_reconciliation();
  PERFORM public.fixture_video_assert(ids = ARRAY['98900000-0000-4000-8000-000000000001'::uuid,
    '98900000-0000-4000-8000-000000000002'::uuid], 'oldest two accepted jobs are claimed');
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.claim_restaurant_video_reconciliation();
  PERFORM public.fixture_video_assert(ids = ARRAY['98900000-0000-4000-8000-000000000003'::uuid],
    'leased jobs rotate out so the following restaurant can progress');
  PERFORM public.fixture_video_assert((SELECT count(*)=0 FROM public.claim_restaurant_video_reconciliation()),
    'active leases, terminal jobs, recent jobs and unknown provider receipts are excluded');
  UPDATE public.restaurant_video_generations SET updated_at=clock_timestamp()-interval '181 seconds'
    WHERE id='98900000-0000-4000-8000-000000000001';
  SELECT array_agg(id) INTO ids FROM public.claim_restaurant_video_reconciliation();
  PERFORM public.fixture_video_assert(ids=ARRAY['98900000-0000-4000-8000-000000000001'::uuid],
    'a crashed check becomes available again after its lease');
  PERFORM public.fixture_video_assert((SELECT count(*)=1 FROM cron.job WHERE jobname='tok-video-reconcile'
    AND schedule='*/2 * * * *' AND command LIKE '%vault.decrypted_secrets%'
    AND command LIKE '%"action":"reconcile"%'),'scheduler configuration is idempotent and resolves Vault at execution');
  PERFORM public.fixture_video_assert((SELECT credits=(SELECT coalesce(sum(remaining),0) FROM private_finance.admin_ai_credit_grants)
    AND usage_count=(SELECT count(*) FROM public.ai_usage_logs) FROM reconciliation_accounting_before),
    'claiming jobs never charges or refunds credits');
  PERFORM public.fixture_video_assert(NOT has_function_privilege('anon','public.claim_restaurant_video_reconciliation()','EXECUTE')
    AND NOT has_function_privilege('authenticated','public.claim_restaurant_video_reconciliation()','EXECUTE')
    AND has_function_privilege('service_role','public.claim_restaurant_video_reconciliation()','EXECUTE'),
    'claim RPC is service-role only');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.claim_restaurant_video_reconciliation(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated caller reached internal video queue'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.role='anon';
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN PERFORM public.claim_restaurant_video_reconciliation(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'non-service claim reached internal video queue'; END IF;
END $$;
ROLLBACK;
