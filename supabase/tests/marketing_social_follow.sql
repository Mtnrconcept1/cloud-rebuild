-- ISOLATED TEST DATABASE ONLY: fixture, migration twice, then this file.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin@example.test');
INSERT INTO public.user_roles VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin');
INSERT INTO public.feature_flags VALUES('admin-marketing-operations',true);
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,expires_at,mfa_verified_at)
VALUES(repeat('a',64),repeat('b',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()+interval '1 hour',now());
INSERT INTO public.marketing_integrations(id,name,channel,status,public_configuration,secret_ref) VALUES
('aaaaaaaa-1111-4111-8111-111111111111','TOK Instagram','instagram','connected','{"ig_user_id":"17841447348180505","private_test_marker":"must-not-be-returned"}','TEST_SECRET_REF'),
('bbbbbbbb-1111-4111-8111-111111111111','TOK Facebook','facebook','connected','{"page_id":"1409554725565734","private_test_marker":"must-not-be-returned"}','TEST_SECRET_REF');
INSERT INTO public.restaurants(id,name,city,opening_hours,directory_source_reference,is_demo) VALUES
('11111111-1111-4111-8111-111111111111','Alpha','Genève','{"social_website":"https://alpha.example/","keep":"unchanged"}',NULL,false),
('22222222-2222-4222-8222-222222222222','Alpha annexe','Genève','{}','source-two',false),
('33333333-3333-4333-8333-333333333333','Troisième restaurant','Lausanne','{"social_instagram":"https://instagram.com/stoppin_gva"}',NULL,false),
('44444444-4444-4444-8444-444444444444','Delta','Onex','{}','4321',false),
('55555555-5555-4555-8555-555555555555','Sans site','Onex','{}',NULL,false),
('66666666-6666-4666-8666-666666666666','Démo','Genève','{}',NULL,true);
INSERT INTO public.marketing_contacts(id,source_system,source_reference,source_objectid,website) VALUES
('aaaaaaaa-2222-4222-8222-222222222222','commercial_prospect_catalog','source-two',NULL,'https://two.example/'),
('aaaaaaaa-3333-4333-8333-333333333333','commercial_prospect_catalog',NULL,4321,'https://four.example/');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

CREATE FUNCTION pg_temp.expect_social_error(p_operation text,p_args jsonb,p_message text,
  p_sid text DEFAULT repeat('a',64),p_csrf text DEFAULT repeat('b',64)) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_failed boolean:=false;
BEGIN
  BEGIN PERFORM public.service_execute_marketing_social_follow_operation(p_sid,p_csrf,p_operation,p_args);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>p_message THEN RAISE EXCEPTION 'Expected %, received % for %',p_message,SQLERRM,p_operation; END IF;
    v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Request unexpectedly accepted: %',p_operation; END IF;
END;
$$;

DO $$
DECLARE
  v_role text; v_table text; v_page jsonb; v_result jsonb; v_profile uuid; v_candidate jsonb;
  v_record jsonb; v_jobs jsonb; v_job jsonb; v_old_lease text; v_new_lease text; v_complete jsonb;
  v_count integer; v_initial_hours jsonb;
  v_origin_request jsonb; v_other_origin_request jsonb; v_origin_token text; v_origin_result jsonb; v_policy jsonb; v_retry_date timestamptz;
  v_list jsonb:='{"query":"","platform":"all","status":"all","limit":20,"offset":0}';
BEGIN
  -- Real database grants/RLS, not source-string assertions.
  FOREACH v_table IN ARRAY ARRAY['marketing_social_profiles','marketing_social_profile_restaurants','marketing_social_follows','marketing_social_discovery_jobs','marketing_social_origin_guards'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||v_table)::regclass) THEN RAISE EXCEPTION 'RLS missing on %',v_table; END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(v_role,'public.'||v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Direct table privilege: % %',v_role,v_table; END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(v_role,'public.marketing_social_upsert_candidate(uuid,jsonb)','EXECUTE')
      OR has_function_privilege(v_role,'public.marketing_social_restaurant_sources()','EXECUTE')
      OR has_function_privilege(v_role,'public.marketing_social_profile_json(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private helper exposed to %',v_role; END IF;
    IF has_function_privilege(v_role,'public.service_execute_marketing_social_follow_operation(text,text,text,jsonb)','EXECUTE')<>(v_role='service_role') THEN RAISE EXCEPTION 'Dispatcher grant is wrong for %',v_role; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'marketing_social_%' OR p.proname='service_execute_marketing_social_follow_operation')
    AND p.prosecdef AND NOT COALESCE(array_to_string(p.proconfig,',') LIKE '%search_path=%',false)) THEN RAISE EXCEPTION 'Unsafe definer search path'; END IF;

  -- The dispatcher rejects missing CSRF, bad sessions, flags, current role removal and direct user JWTs.
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required',repeat('c',64));
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required',repeat('a',64),NULL);
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required',repeat('a',64),repeat('c',64));
  UPDATE public.marketing_admin_web_sessions SET expires_at=now()-interval '1 second';
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required');
  UPDATE public.marketing_admin_web_sessions SET expires_at=now()+interval '1 hour',revoked_at=now();
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required');
  UPDATE public.marketing_admin_web_sessions SET revoked_at=NULL;
  UPDATE public.feature_flags SET is_active=false;
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required');
  UPDATE public.feature_flags SET is_active=true;
  DELETE FROM public.user_roles;
  PERFORM pg_temp.expect_social_error('list',v_list,'authentication_required');
  INSERT INTO public.user_roles VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin');
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  PERFORM pg_temp.expect_social_error('list',v_list,'Service role required');
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  v_page:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'list',v_list);
  IF v_page->>'total'<>'0' OR v_page->'collection'->>'eligibleRestaurants'<>'5' OR v_page->'collection'->>'pending'<>'5'
    OR position('must-not-be-returned' IN v_page::text)>0 OR position('TEST_SECRET_REF' IN v_page::text)>0 THEN RAISE EXCEPTION 'Unsafe or incorrect initial list'; END IF;
  v_page:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'restaurants','{"query":"","limit":2,"offset":0}');
  IF v_page->>'total'<>'5' OR jsonb_array_length(v_page->'items')<>2 OR v_page->'items'->0->>'websiteUrl'<>'https://alpha.example/' THEN RAISE EXCEPTION 'Restaurant page failed'; END IF;
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'restaurants','{"query":"Onex","limit":2,"offset":0}');
  IF v_result->>'total'<>'2' OR v_result->'items'->0->>'websiteUrl'<>'https://four.example/'
    OR v_result->'items'->1->'websiteUrl'<>'null'::jsonb THEN RAISE EXCEPTION 'Restaurant search or missing websites hidden'; END IF;
  IF (SELECT website_url FROM public.marketing_social_restaurant_sources() WHERE id='22222222-2222-4222-8222-222222222222')<>'https://two.example/' THEN RAISE EXCEPTION 'Contact website association failed'; END IF;
  PERFORM pg_temp.expect_social_error('claim','{"limit":1,"restaurantId":null,"website":"https://arbitrary.example/"}','social_follow_invalid_request');
  PERFORM pg_temp.expect_social_error('claim','{"limit":4,"restaurantId":null}','social_follow_invalid_request');
  PERFORM pg_temp.expect_social_error('list',v_list||'{"actor_id":"forged"}','social_follow_invalid_request');
  PERFORM pg_temp.expect_social_error('list',v_list||'{"limit":null}','social_follow_invalid_request');

  -- One canonical account is shared by duplicate restaurant listings; every new candidate requires review.
  v_candidate:='{"platform":"instagram","canonicalKey":"cafe.alpha","url":"https://www.instagram.com/cafe.alpha/","sourceUrl":"https://alpha.example/contact","sourceKind":"manual","context":"Identité à vérifier."}';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'add',jsonb_build_object('restaurantId','11111111-1111-4111-8111-111111111111','candidate',v_candidate));
  v_profile:=(v_result->'profile'->>'id')::uuid;
  IF v_result->>'duplicate'<>'false' OR v_result->'profile'->>'followStatus'<>'unknown' OR v_result->'profile'->>'verificationStatus'<>'needs_review' OR v_result->'profile'->>'version'<>'0' THEN RAISE EXCEPTION 'Candidate was confirmed automatically'; END IF;
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'add',jsonb_build_object('restaurantId','22222222-2222-4222-8222-222222222222','candidate',v_candidate));
  IF v_result->>'duplicate'<>'true' OR v_result->'profile'->>'id'<>v_profile::text OR v_result->'profile'->>'restaurantCount'<>'2'
    OR (SELECT count(*) FROM public.marketing_social_profiles)<>1 THEN RAISE EXCEPTION 'Global profile deduplication failed'; END IF;
  PERFORM pg_temp.expect_social_error('add',jsonb_build_object('restaurantId','66666666-6666-4666-8666-666666666666','candidate',v_candidate),'social_follow_restaurant_not_found');
  PERFORM pg_temp.expect_social_error('add',jsonb_build_object('restaurantId','11111111-1111-4111-8111-111111111111','candidate',v_candidate||'{"url":"https://evil.example/profile"}'),'social_follow_invalid_request');

  -- A private-account request remains requested, and stale versions cannot overwrite newer observations.
  v_record:=jsonb_build_object('profileId',v_profile,'followStatus','requested','verificationStatus','verified','expectedVersion',0,
    'expectedSourceAccountId','17841447348180505','confirmedWithTokAccount',false,'note','Demande privée envoyée manuellement.');
  PERFORM pg_temp.expect_social_error('record',v_record,'social_follow_identity_required');
  PERFORM pg_temp.expect_social_error('record',v_record||'{"confirmedWithTokAccount":true,"verificationStatus":"needs_review"}','social_follow_identity_required');
  PERFORM pg_temp.expect_social_error('record',v_record-'expectedVersion','social_follow_invalid_request');
  v_record:=v_record||'{"confirmedWithTokAccount":true}';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'record',v_record);
  IF v_result->>'followStatus'<>'requested' OR v_result->>'version'<>'1' OR v_result->>'confirmedBy'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN RAISE EXCEPTION 'Request converted to a follow'; END IF;
  PERFORM pg_temp.expect_social_error('record',v_record,'social_follow_conflict');
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'record',v_record||'{"expectedVersion":1,"followStatus":"followed"}');
  IF v_result->>'version'<>'2' OR v_result->>'followStatus'<>'followed' THEN RAISE EXCEPTION 'Manual confirmation failed'; END IF;
  v_page:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'list',v_list||'{"status":"unknown"}');
  IF v_page->>'total'<>'0' OR v_page->'counts'->>'followed'<>'1' THEN RAISE EXCEPTION 'Status counts or filtering failed'; END IF;

  -- A changed TOK account gets its own observation, without inheriting the former actor's history.
  UPDATE public.marketing_integrations SET public_configuration='{"ig_user_id":"17841499999999999"}' WHERE channel='instagram';
  v_page:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'list',v_list);
  IF v_page->'items'->0->>'followStatus'<>'unknown' OR v_page->'items'->0->>'version'<>'0' OR v_page->'items'->0->>'verificationStatus'<>'needs_review' THEN RAISE EXCEPTION 'Old actor status leaked into new account'; END IF;
  PERFORM pg_temp.expect_social_error('record',v_record||'{"expectedVersion":2}','social_follow_account_changed');
  v_record:=v_record||'{"expectedSourceAccountId":"17841499999999999","expectedVersion":0,"followStatus":"not_followed","confirmedWithTokAccount":false}';
  PERFORM public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'record',v_record);
  IF (SELECT count(*) FROM public.marketing_social_follows WHERE profile_id=v_profile)<>2
    OR (SELECT follow_status FROM public.marketing_social_follows WHERE profile_id=v_profile AND source_account_id='17841447348180505')<>'followed' THEN RAISE EXCEPTION 'Actor history lost'; END IF;
  UPDATE public.marketing_integrations SET public_configuration='{}' WHERE channel='instagram';
  PERFORM pg_temp.expect_social_error('record',v_record||'{"expectedVersion":1}','social_follow_account_unavailable');
  UPDATE public.marketing_integrations SET public_configuration='{"ig_user_id":"17841499999999999"}' WHERE channel='instagram';

  -- Atomic capacity, lease tokens, durable completion, and original restaurant fields are preserved.
  SELECT opening_hours INTO v_initial_hours FROM public.restaurants WHERE id='11111111-1111-4111-8111-111111111111';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'claim','{"limit":3,"restaurantId":null}');
  v_jobs:=v_result->'jobs';
  IF jsonb_array_length(v_jobs)<>3 OR v_result->'collection'->>'processing'<>'3' OR v_result->'collection'->>'hasMore'<>'false' THEN RAISE EXCEPTION 'Global lease quota failed'; END IF;
  PERFORM pg_temp.expect_social_error('claim','{"limit":1,"restaurantId":null}','social_follow_collection_busy');
  v_job:=v_jobs->0;
  v_complete:=jsonb_build_object('restaurantId',v_job->>'restaurantId','leaseToken',v_job->>'leaseToken','crawlStatus','success',
    'profiles',jsonb_build_array(v_candidate||'{"sourceKind":"website","context":"Discovered later."}'),'visitedUrls',jsonb_build_array('https://alpha.example/'),'diagnostics','[]'::jsonb,'retryAfter',NULL,'networkAttempted',true);
  PERFORM pg_temp.expect_social_error('complete',v_complete||'{"leaseToken":"ffffffff-ffff-4fff-8fff-ffffffffffff"}','social_follow_conflict');
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'complete',v_complete);
  IF v_result->>'deduplicated'<>'1' OR v_result->>'discovered'<>'0' THEN RAISE EXCEPTION 'Collection deduplication failed'; END IF;
  PERFORM pg_temp.expect_social_error('complete',v_complete,'social_follow_conflict');
  IF (SELECT context FROM public.marketing_social_profile_restaurants WHERE profile_id=v_profile AND restaurant_id='11111111-1111-4111-8111-111111111111')<>'Identité à vérifier.'
    OR (SELECT follow_status FROM public.marketing_social_follows WHERE profile_id=v_profile AND source_account_id='17841499999999999')<>'not_followed'
    OR (SELECT opening_hours FROM public.restaurants WHERE id='11111111-1111-4111-8111-111111111111') IS DISTINCT FROM v_initial_hours THEN RAISE EXCEPTION 'Recollection overwrote manual state or restaurant data'; END IF;
  PERFORM pg_temp.expect_social_error('claim','{"limit":1,"restaurantId":"11111111-1111-4111-8111-111111111111"}','social_follow_collection_busy');
  v_job:=v_jobs->1;
  PERFORM public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'complete',jsonb_build_object('restaurantId',v_job->>'restaurantId','leaseToken',v_job->>'leaseToken','crawlStatus','no_profiles','profiles','[]'::jsonb,'visitedUrls','[]'::jsonb,'diagnostics','[]'::jsonb,'retryAfter',NULL,'networkAttempted',true));
  v_job:=v_jobs->2;
  v_candidate:='{"platform":"instagram","canonicalKey":"stoppin_gva","url":"https://www.instagram.com/stoppin_gva/","sourceUrl":"https://www.instagram.com/stoppin_gva/","sourceKind":"database","context":"Lien de la fiche à vérifier."}';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'complete',jsonb_build_object('restaurantId',v_job->>'restaurantId','leaseToken',v_job->>'leaseToken','crawlStatus','no_website','profiles',jsonb_build_array(v_candidate),'visitedUrls','[]'::jsonb,'diagnostics','[]'::jsonb,'retryAfter',NULL,'networkAttempted',true));
  SELECT public.marketing_social_profile_json(id) INTO v_result FROM public.marketing_social_profiles WHERE canonical_key='stoppin_gva';
  IF v_result->>'verificationStatus'<>'needs_review' OR v_result->>'followStatus'<>'unknown' OR v_result->>'sourceKind'<>'database' THEN RAISE EXCEPTION 'Database link was trusted without review'; END IF;

  -- A cancelled worker loses its lease; a delayed retry gets a new token and cannot accept stale completion.
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'claim','{"limit":1,"restaurantId":"44444444-4444-4444-8444-444444444444"}');
  v_job:=v_result->'jobs'->0; v_old_lease:=v_job->>'leaseToken';
  v_complete:=jsonb_build_object('restaurantId',v_job->>'restaurantId','leaseToken',v_old_lease,'crawlStatus','error','profiles','[]'::jsonb,'visitedUrls','[]'::jsonb,'diagnostics',jsonb_build_array('website_timeout'),'retryAfter',NULL,'networkAttempted',true);
  UPDATE public.marketing_social_discovery_jobs SET lease_expires_at=now()-interval '1 second' WHERE restaurant_id='44444444-4444-4444-8444-444444444444';
  PERFORM pg_temp.expect_social_error('complete',v_complete,'social_follow_conflict');
  PERFORM public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'claim','{"limit":1,"restaurantId":"55555555-5555-4555-8555-555555555555"}');
  IF (SELECT status<>'error' OR next_attempt_at<=now() FROM public.marketing_social_discovery_jobs WHERE restaurant_id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Expired lease was not deferred'; END IF;
  UPDATE public.marketing_social_discovery_jobs SET next_attempt_at=now()-interval '1 second' WHERE restaurant_id='44444444-4444-4444-8444-444444444444';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'claim','{"limit":1,"restaurantId":null}');
  v_new_lease:=v_result->'jobs'->0->>'leaseToken';
  IF v_new_lease IS NULL OR v_new_lease=v_old_lease THEN RAISE EXCEPTION 'Retry lease was not rotated'; END IF;
  PERFORM pg_temp.expect_social_error('complete',v_complete,'social_follow_conflict');
  UPDATE public.marketing_admin_web_sessions SET revoked_at=now();
  PERFORM pg_temp.expect_social_error('complete',v_complete||jsonb_build_object('leaseToken',v_new_lease),'authentication_required');
  UPDATE public.marketing_admin_web_sessions SET revoked_at=NULL;
  PERFORM public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'complete',v_complete||jsonb_build_object('leaseToken',v_new_lease));
  IF (SELECT next_attempt_at<=now() OR attempts<>2 FROM public.marketing_social_discovery_jobs WHERE restaurant_id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Error retry budget failed'; END IF;
  UPDATE public.marketing_social_discovery_jobs SET attempts=3,next_attempt_at=NULL WHERE restaurant_id='44444444-4444-4444-8444-444444444444';
  -- Explicit retries must use a fixed expired-lease deadline, even when the earlier busy response rolls back.
  UPDATE public.marketing_social_discovery_jobs SET lease_expires_at=now()-interval '1 minute',last_attempt_at=now()-interval '2 minutes'
    WHERE restaurant_id='55555555-5555-4555-8555-555555555555';
  PERFORM pg_temp.expect_social_error('claim','{"limit":1,"restaurantId":"55555555-5555-4555-8555-555555555555"}','social_follow_collection_busy');
  UPDATE public.marketing_social_discovery_jobs SET lease_expires_at=now()-interval '16 minutes',last_attempt_at=now()-interval '18 minutes'
    WHERE restaurant_id='55555555-5555-4555-8555-555555555555';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'claim','{"limit":1,"restaurantId":"55555555-5555-4555-8555-555555555555"}');
  IF jsonb_array_length(v_result->'jobs')<>1 THEN RAISE EXCEPTION 'Explicit expired lease never becomes claimable'; END IF;
  v_page:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'progress','{}');
  IF v_page->>'hasMore'<>'false' THEN RAISE EXCEPTION 'Busy or exhausted queue advertises immediate work'; END IF;
  SELECT count(*) INTO v_count FROM public.audit_log;
  IF v_count<10 OR EXISTS(SELECT 1 FROM public.audit_log WHERE new_data::text LIKE '%must-not-be-returned%'
    OR new_data::text LIKE '%'||repeat('a',64)||'%' OR new_data::text LIKE '%TEST_SECRET_REF%' OR old_data IS NOT NULL) THEN RAISE EXCEPTION 'Audit is missing or exposes credentials'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_log WHERE new_data->>'operation'='record'
    AND new_data->>'sourceAccountId'='17841447348180505' AND new_data->>'verificationStatus'='verified')
    OR NOT EXISTS(SELECT 1 FROM public.audit_log WHERE new_data->>'operation'='record'
    AND new_data->>'sourceAccountId'='17841499999999999') THEN RAISE EXCEPTION 'Audit does not distinguish TOK actors'; END IF;

  -- Representative canonical Instagram, Facebook slug and numeric/legacy identities pass actual table constraints.
  FOR v_candidate IN SELECT value FROM jsonb_array_elements('[
    {"platform":"facebook","canonicalKey":"slug:cafe.alpha","url":"https://www.facebook.com/cafe.alpha/"},
    {"platform":"facebook","canonicalKey":"id:123456789","url":"https://www.facebook.com/profile.php?id=123456789"},
    {"platform":"instagram","canonicalKey":"restaurant_01","url":"https://www.instagram.com/restaurant_01/"}
  ]'::jsonb) LOOP
    v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'add',jsonb_build_object('restaurantId','11111111-1111-4111-8111-111111111111',
      'candidate',v_candidate||jsonb_build_object('sourceUrl','https://alpha.example/','sourceKind','manual','context','Canonical contract fixture')));
    IF v_result->'profile'->>'profileUrl'<>v_candidate->>'url' OR v_result->'profile'->>'canonicalKey'<>v_candidate->>'canonicalKey' THEN RAISE EXCEPTION 'Canonical contract and SQL disagree'; END IF;
  END LOOP;

  -- Distinct restaurant leases share one physical HTTP slot and one durable robots policy per origin.
  v_origin_request:=jsonb_build_object('restaurantId','55555555-5555-4555-8555-555555555555',
    'leaseToken',v_result->'jobs'->0->>'leaseToken','origin','https://shared.example','kind','robots');
  SELECT v_origin_request||jsonb_build_object('leaseToken',lease_token) INTO v_origin_request
    FROM public.marketing_social_discovery_jobs WHERE restaurant_id='55555555-5555-4555-8555-555555555555';
  UPDATE public.marketing_social_discovery_jobs SET status='pending',attempts=0,next_attempt_at=NULL
    WHERE restaurant_id='44444444-4444-4444-8444-444444444444';
  v_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'claim','{"limit":1,"restaurantId":"44444444-4444-4444-8444-444444444444"}');
  v_other_origin_request:=jsonb_build_object('restaurantId','44444444-4444-4444-8444-444444444444',
    'leaseToken',v_result->'jobs'->0->>'leaseToken','origin','https://shared.example','kind','robots');
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_origin_request);
  IF v_origin_result->>'kind'<>'reserved' THEN RAISE EXCEPTION 'Origin was not reserved'; END IF;
  v_origin_token:=v_origin_result->>'requestToken';
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_other_origin_request);
  IF v_origin_result->>'kind'<>'deferred' THEN RAISE EXCEPTION 'Concurrent origin reservation admitted two HTTP requests'; END IF;
  v_policy:='{"rules":[{"allow":false,"path":"/private*"}],"crawlDelayMs":20000,"denyAll":false}';
  PERFORM pg_temp.expect_social_error('finish_origin',(v_other_origin_request-'kind')||jsonb_build_object('requestToken',v_origin_token,'robotsPolicy',v_policy,'retryAfter',NULL),'social_follow_conflict');
  PERFORM pg_temp.expect_social_error('finish_origin',(v_origin_request-'kind')||jsonb_build_object('requestToken',v_origin_token,'robotsPolicy','[]'::jsonb,'retryAfter',NULL),'social_follow_invalid_request');
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'finish_origin',
    (v_origin_request-'kind')||jsonb_build_object('requestToken',v_origin_token,'robotsPolicy',v_policy,'retryAfter',NULL));
  IF (v_origin_result->>'nextAllowedAt')::timestamptz<clock_timestamp()+interval '19 seconds' THEN RAISE EXCEPTION 'Delay is not measured from the real finish'; END IF;
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_other_origin_request);
  IF v_origin_result->>'kind'<>'cached' OR v_origin_result->'robotsPolicy'<>v_policy
    OR (v_origin_result->>'robotsExpiresAt')::timestamptz<(SELECT next_allowed_at FROM public.marketing_social_origin_guards WHERE origin='https://shared.example') THEN RAISE EXCEPTION 'Cold worker cannot reuse the robots policy'; END IF;
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_other_origin_request||'{"kind":"html"}');
  IF v_origin_result->>'kind'<>'deferred' THEN RAISE EXCEPTION 'Cached robots incorrectly bypasses the HTTP cooldown'; END IF;
  UPDATE public.marketing_social_origin_guards SET next_allowed_at=now()-interval '1 second' WHERE origin='https://shared.example';
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_other_origin_request||'{"kind":"html"}');
  v_old_lease:=v_origin_result->>'requestToken';
  UPDATE public.marketing_social_origin_guards SET lease_expires_at=now()-interval '1 second' WHERE origin='https://shared.example';
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_origin_request||'{"kind":"html"}');
  IF v_origin_result->>'kind'<>'deferred' OR (v_origin_result->>'retryAfter')::timestamptz<now()+interval '18 seconds' THEN RAISE EXCEPTION 'Expired physical request lost its cooldown'; END IF;
  PERFORM pg_temp.expect_social_error('finish_origin',(v_other_origin_request-'kind')||jsonb_build_object('requestToken',v_old_lease,'robotsPolicy',NULL,'retryAfter',NULL),'social_follow_conflict');
  UPDATE public.marketing_social_origin_guards SET next_allowed_at=now()-interval '1 second' WHERE origin='https://shared.example';
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'reserve_origin',v_origin_request||'{"kind":"html"}');
  v_origin_token:=v_origin_result->>'requestToken'; v_retry_date:=now()+interval '15 days';
  v_origin_result:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'finish_origin',
    (v_origin_request-'kind')||jsonb_build_object('requestToken',v_origin_token,'robotsPolicy',NULL,'retryAfter',v_retry_date));
  IF (v_origin_result->>'nextAllowedAt')::timestamptz<v_retry_date THEN RAISE EXCEPTION 'Server Retry-After was shortened'; END IF;
  v_complete:=(v_other_origin_request-'kind'-'origin')||jsonb_build_object('crawlStatus','error','profiles','[]'::jsonb,'visitedUrls','[]'::jsonb,
    'diagnostics',jsonb_build_array('crawl_delay_deferred'),'retryAfter',v_retry_date,'networkAttempted',false);
  PERFORM public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'complete',v_complete);
  IF (SELECT status<>'pending' OR attempts<>0 OR next_attempt_at<v_retry_date FROM public.marketing_social_discovery_jobs
    WHERE restaurant_id='44444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Waiting for another worker consumed retry attempts'; END IF;
  PERFORM pg_temp.expect_social_error('reserve_origin',v_other_origin_request,'social_follow_conflict');
  v_page:=public.service_execute_marketing_social_follow_operation(repeat('a',64),repeat('b',64),'progress','{}');
  IF v_page->>'hasMore'<>'false' THEN RAISE EXCEPTION 'Deferred pending job advertises immediate work'; END IF;
END;
$$;
ROLLBACK;
