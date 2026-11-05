-- Disposable fixture only. The harness supplies 486 quotes computed by the
-- actual TypeScript normalizer/quote function, not a second JavaScript formula.
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

INSERT INTO public.restaurants(id,owner_id,name)
  SELECT ('98200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    '98100000-0000-4000-8000-000000000001','Synthetic marketing settings fixture'
  FROM generate_series(20,23) n;
INSERT INTO public.restaurant_ai_subscriptions(restaurant_id,status,activated_at,current_period_start,current_period_end,monthly_photo_retouch_credits)
  SELECT id,'cancelled',now()-interval '40 days',now()-interval '40 days',now()-interval '10 days',0
  FROM public.restaurants WHERE id >= '98200000-0000-4000-8000-000000000020';
INSERT INTO private_finance.admin_ai_credit_grants(restaurant_id,granted_by,request_id,amount,remaining,reason,granted_at,expires_at)
  SELECT id,'98100000-0000-4000-8000-000000000001',gen_random_uuid(),10000,10000,
    'Synthetic marketing contract credits',now()-interval '1 day',now()+interval '2 days'
  FROM public.restaurants WHERE id >= '98200000-0000-4000-8000-000000000020' AND id <> '98200000-0000-4000-8000-000000000023';
INSERT INTO public.restaurant_media(id,restaurant_id,storage_bucket,storage_path,media_type) VALUES
  ('98500000-0000-4000-8000-000000000020','98200000-0000-4000-8000-000000000020','restaurant-images','98200000-0000-4000-8000-000000000020/product.webp','photo'),
  ('98500000-0000-4000-8000-000000000021','98200000-0000-4000-8000-000000000020','restaurant-images','98200000-0000-4000-8000-000000000020/presenter.webp','photo'),
  ('98500000-0000-4000-8000-000000000022','98200000-0000-4000-8000-000000000020','restaurant-images','98200000-0000-4000-8000-000000000020/logo.png','photo'),
  ('98500000-0000-4000-8000-000000000023','98200000-0000-4000-8000-000000000021','restaurant-images','98200000-0000-4000-8000-000000000021/foreign.webp','photo'),
  ('98500000-0000-4000-8000-000000000024','98200000-0000-4000-8000-000000000022','restaurant-images','98200000-0000-4000-8000-000000000022/legacy.webp','photo'),
  ('98500000-0000-4000-8000-000000000025','98200000-0000-4000-8000-000000000023','restaurant-images','98200000-0000-4000-8000-000000000023/unfunded.webp','photo');

CREATE TEMP TABLE fixture_marketing_options AS SELECT '{
  "version":2,"duration":15,"resolution":"1080p","aspectRatio":"4:3","outputFormat":"mov","bitrateMode":"high",
  "referenceMediaIds":["98500000-0000-4000-8000-000000000020","98500000-0000-4000-8000-000000000021"],
  "logoMediaId":"98500000-0000-4000-8000-000000000022","allowInterpretation":true,
  "marketing":{"creativeFormat":"ugc","productDescription":"The selected restaurant dish","hook":"Close-up reveal",
    "setting":"Natural light in the supplied location","avatarMediaId":"98500000-0000-4000-8000-000000000021",
    "productMediaId":"98500000-0000-4000-8000-000000000020","startImageMediaId":"98500000-0000-4000-8000-000000000021",
    "endImageMediaId":"98500000-0000-4000-8000-000000000020","audioMode":"voiceover","language":"fr",
    "voiceoverText":"Bienvenue chez nous.","callToAction":"Menu à 20 CHF"}
}'::jsonb AS options;

DO $$
DECLARE j public.restaurant_video_generations; replay public.restaurant_video_generations;
  v_options jsonb; v_key uuid := gen_random_uuid(); v_rejected boolean := false;
BEGIN
  SELECT options INTO v_options FROM fixture_marketing_options;
  SELECT * INTO j FROM public.reserve_restaurant_brand_video_generation(
    '98200000-0000-4000-8000-000000000020','98100000-0000-4000-8000-000000000001',v_key,
    'Only animate the selected restaurant references.',true,1152,v_options);
  PERFORM public.fixture_video_assert(j.duration=15 AND j.resolution='1080p' AND j.aspect_ratio='4:3'
    AND j.generate_audio AND j.credit_units=1152 AND j.request_options=v_options
    AND j.provider_model='bytedance/seedance-2.5/reference-to-video','all selected marketing parameters are stored atomically');
  PERFORM public.fixture_video_assert(public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(j.restaurant_id))=8848,
    'only the confirmed 1152 credits were reserved');
  SELECT * INTO replay FROM public.reserve_restaurant_brand_video_generation(j.restaurant_id,j.user_id,v_key,
    'Only animate the selected restaurant references.',true,1152,v_options);
  PERFORM public.fixture_video_assert(replay.id=j.id AND replay.usage_log_id=j.usage_log_id
    AND (SELECT count(*)=1 FROM public.ai_usage_logs WHERE restaurant_id=j.restaurant_id),
    'identical settings replay the original job and ledger');
  BEGIN
    PERFORM public.reserve_restaurant_brand_video_generation(j.restaurant_id,j.user_id,v_key,
      'Only animate the selected restaurant references.',true,1152,jsonb_set(v_options,'{outputFormat}','"mp4"'));
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM<>'idempotency_conflict' THEN RAISE; END IF; v_rejected:=true;
  END;
  PERFORM public.fixture_video_assert(v_rejected,'changing a non-price setting still conflicts with the paid request snapshot');
  PERFORM public.fixture_video_assert(public.claim_restaurant_video_submission(j.id),'first provider submission may be claimed');
  PERFORM public.fixture_video_assert(NOT public.claim_restaurant_video_submission(j.id),'a duplicate may not submit again');
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-marketing-accepted','queued');
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-marketing-accepted','completed',
    j.restaurant_id::text||'/'||j.id::text||'.mov');
  PERFORM public.finish_restaurant_video_generation(j.id,'fixture-marketing-accepted','failed',NULL,'video_provider_failed');
  PERFORM public.fixture_video_assert((SELECT status='completed' AND storage_path LIKE '%.mov' AND request_options=v_options
    FROM public.restaurant_video_generations WHERE id=j.id),'MOV completion is terminal and retains the chosen parameters');
  PERFORM public.fixture_video_assert((SELECT metadata->>'billing_state'='charged' AND metadata->>'request_contract'='marketing-v2'
    FROM public.ai_usage_logs WHERE id=j.usage_log_id),'completed marketing generation is charged once and tagged v2');
END $$;

DO $$
DECLARE v_case record; j public.restaurant_video_generations; v_count integer:=0;
BEGIN
  FOR v_case IN SELECT * FROM public.fixture_video_marketing_matrix LOOP
    SELECT * INTO j FROM public.reserve_restaurant_brand_video_generation(
      '98200000-0000-4000-8000-000000000020','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
      'Only animate the selected restaurant references.',false,v_case.credits,v_case.options);
    PERFORM public.fixture_video_assert(j.credit_units=v_case.credits AND j.request_options=v_case.options
      AND j.duration=(v_case.options->>'duration')::integer AND j.resolution=v_case.options->>'resolution'
      AND j.aspect_ratio=v_case.options->>'aspectRatio','SQL and TypeScript quote/columns match every supported configuration');
    -- This is a local confirmed-refusal fixture, not a real provider call.
    PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_invalid_input');
    PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_invalid_input');
    v_count:=v_count+1;
  END LOOP;
  PERFORM public.fixture_video_assert(v_count=486,'all 27 durations, 3 resolutions and 6 ratios were exercised');
  PERFORM public.fixture_video_assert(public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(
    '98200000-0000-4000-8000-000000000020'))=8848,'486 confirmed refusals refund exactly their original gift reservations');
  PERFORM public.fixture_video_assert((SELECT max(credits)=4043 FROM public.fixture_video_marketing_matrix),
    'maximum supported quote matches the narrowly increased credit ceiling');
END $$;

DO $$
DECLARE v_options jsonb; v_case record; v_denied boolean; v_before bigint;
BEGIN
  SELECT options INTO v_options FROM fixture_marketing_options;
  SELECT count(*) INTO v_before FROM public.ai_usage_logs;
  FOR v_case IN SELECT * FROM (VALUES
    (jsonb_set(v_options,'{duration}','31'),true,1152,'video_duration_invalid'),
    (jsonb_set(v_options,'{duration}','10.5'),true,1152,'invalid_video_request'),
    (jsonb_set(v_options,'{resolution}','"2160p"'),true,1152,'invalid_video_request'),
    (jsonb_set(v_options,'{aspectRatio}','"auto"'),true,1152,'invalid_video_request'),
    (jsonb_set(v_options,'{outputFormat}','"webm"'),true,1152,'invalid_video_request'),
    (jsonb_set(v_options,'{bitrateMode}','"ultra"'),true,1152,'invalid_video_request'),
    (jsonb_set(v_options,'{marketing,language}','"unknown"'),true,1152,'video_marketing_settings_invalid'),
    (jsonb_set(v_options,'{marketing,creativeFormat}','"private-template-id"'),true,1152,'video_marketing_settings_invalid'),
    (jsonb_set(v_options,'{marketing,hook}',to_jsonb(repeat('a',501))),true,1152,'video_marketing_settings_invalid'),
    (jsonb_set(v_options,'{marketing,avatarMediaId}','"98500000-0000-4000-8000-000000000022"'),true,1152,'video_marketing_reference_invalid'),
    (jsonb_set(v_options,'{marketing,audioMode}','"silent"'),true,1152,'video_audio_mode_mismatch'),
    (jsonb_set(v_options,'{marketing,voiceoverText}','""'),true,1152,'video_voiceover_required'),
    (jsonb_set(v_options,'{allowInterpretation}','false'),true,1152,'invalid_video_request'),
    (v_options||'{"nativeMarketingId":"not-allowed"}',true,1152,'invalid_video_request'),
    (v_options,true,1151,'video_quote_changed'),
    (jsonb_set(v_options,'{referenceMediaIds}','["98500000-0000-4000-8000-000000000023"]'),true,1152,'video_reference_not_found'),
    (jsonb_set(v_options,'{logoMediaId}','"98500000-0000-4000-8000-000000000023"'),true,1152,'video_reference_not_found')
  ) AS rejected(options,audio,credits,reason) LOOP
    v_denied:=false;
    BEGIN
      PERFORM public.reserve_restaurant_brand_video_generation(
        '98200000-0000-4000-8000-000000000020','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
        'Only animate the selected restaurant references.',v_case.audio,v_case.credits,v_case.options);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM<>v_case.reason THEN RAISE; END IF; v_denied:=true;
    END;
    PERFORM public.fixture_video_assert(v_denied,'invalid marketing contract rejected: '||v_case.reason);
  END LOOP;
  PERFORM public.fixture_video_assert((SELECT count(*)=v_before FROM public.ai_usage_logs),
    'validation errors create neither paid ledger entries nor reservations');
  PERFORM public.fixture_video_assert(public.tok_credit_balance_from_usage(public.get_restaurant_credit_usage(
    '98200000-0000-4000-8000-000000000020'))=8848,'invalid contracts leave gift credits unchanged');
END $$;

DO $$
DECLARE j public.restaurant_video_generations; v_options jsonb; v_denied boolean:=false;
BEGIN
  v_options:='{"version":1,"referenceMediaIds":["98500000-0000-4000-8000-000000000024"],"logoMediaId":null,"allowInterpretation":true}';
  SELECT * INTO j FROM public.reserve_restaurant_brand_video_generation(
    '98200000-0000-4000-8000-000000000022','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
    'Legacy ten-second restaurant video',false,417,v_options);
  PERFORM public.fixture_video_assert(j.duration=10 AND j.resolution='720p' AND j.aspect_ratio='9:16'
    AND j.credit_units=417 AND j.request_options=v_options,'v1 caller retains the original format, snapshot and confirmed price');
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_invalid_input');
  SELECT * INTO j FROM public.reserve_restaurant_video_generation(
    '98200000-0000-4000-8000-000000000022','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
    'Legacy single-reference video',5,'720p','9:16',false,'98500000-0000-4000-8000-000000000024',177);
  PERFORM public.fixture_video_assert(j.credit_units=177 AND j.request_options='{}'::jsonb AND j.duration=5,
    'old single-reference RPC signature and rate remain usable');
  PERFORM public.finish_restaurant_video_generation(j.id,NULL,'failed',NULL,'video_provider_invalid_input');
  SELECT options INTO v_options FROM public.fixture_video_marketing_matrix WHERE credits=4043 LIMIT 1;
  v_options:=jsonb_set(jsonb_set(v_options,'{referenceMediaIds}','["98500000-0000-4000-8000-000000000025"]'),'{logoMediaId}','null');
  BEGIN
    PERFORM public.reserve_restaurant_brand_video_generation(
      '98200000-0000-4000-8000-000000000023','98100000-0000-4000-8000-000000000001',gen_random_uuid(),
      'Only animate the selected restaurant references.',false,4043,v_options);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'TOK credits exhausted%' THEN RAISE; END IF; v_denied:=true;
  END;
  PERFORM public.fixture_video_assert(v_denied,'maximum configuration still requires the native credit balance');
  PERFORM public.fixture_video_assert(NOT EXISTS(SELECT 1 FROM public.restaurant_video_generations
    WHERE restaurant_id='98200000-0000-4000-8000-000000000023'),'insufficient funds roll back the whole job reservation');
  PERFORM public.fixture_video_assert((SELECT NOT public AND file_size_limit=104857600
    AND allowed_mime_types @> ARRAY['video/mp4','video/quicktime'] FROM storage.buckets WHERE id='restaurant-ai-videos'),
    'MP4 and MOV share the same private, size-limited storage bucket');
END $$;

DO $$ DECLARE v_role text; BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM public.fixture_video_assert(NOT has_function_privilege(v_role,
      'public.reserve_restaurant_brand_video_generation(uuid,uuid,uuid,text,boolean,integer,jsonb)','EXECUTE'),
      'public roles cannot reserve marketing credits');
  END LOOP;
  PERFORM public.fixture_video_assert(has_function_privilege('service_role',
    'public.reserve_restaurant_brand_video_generation(uuid,uuid,uuid,text,boolean,integer,jsonb)','EXECUTE'),
    'server role keeps its reservation grant');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_denied boolean:=false; BEGIN
  BEGIN PERFORM public.reserve_restaurant_brand_video_generation(NULL,NULL,NULL,NULL,false,NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'authenticated caller reached marketing reservation'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE v_denied boolean:=false; BEGIN
  BEGIN PERFORM public.reserve_restaurant_brand_video_generation(NULL,NULL,NULL,NULL,false,NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anonymous caller reached marketing reservation'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.role='anon';
DO $$ DECLARE v_denied boolean:=false; BEGIN
  BEGIN PERFORM public.reserve_restaurant_brand_video_generation(NULL,NULL,NULL,NULL,false,NULL,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'non-service claim reached marketing reservation'; END IF;
END $$;
ROLLBACK;
