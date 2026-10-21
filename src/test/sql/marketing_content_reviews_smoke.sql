-- Run against scripts/verification/test-marketing-content-reviews.mjs, or a
-- disposable PostgreSQL fixture with the migration and fixtures installed.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Content review assertion: %',message; END IF; END $$;

SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.marketing_content_review_targets),'no historical backfill');
SELECT pg_temp.assert_true(public.marketing_content_review_allows_delivery('00000000-0000-4000-8000-000000001002'),'untracked historical item keeps native delivery');

DO $$
DECLARE v_role text; v_table text; v_statement text; v_denied boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['marketing_content_review_targets','marketing_content_reviews'] LOOP
    PERFORM pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('public.'||v_table)::regclass),'RLS '||v_table);
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      EXECUTE 'SET LOCAL ROLE '||quote_ident(v_role);
      FOREACH v_statement IN ARRAY ARRAY['SELECT * FROM public.'||v_table,'INSERT INTO public.'||v_table||' DEFAULT VALUES',
        'UPDATE public.'||v_table||' SET status=''approved''','DELETE FROM public.'||v_table] LOOP
        v_denied:=false;
        BEGIN EXECUTE v_statement; EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
        IF NOT v_denied THEN RAISE EXCEPTION 'Unexpected table privilege % %',v_role,v_statement; END IF;
      END LOOP;
      RESET ROLE;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE 'SET LOCAL ROLE '||quote_ident(v_role);
    v_denied:=false;
    BEGIN PERFORM public.claim_marketing_content_review(repeat('c',64),'123'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Public claim allowed'; END IF;
    v_denied:=false;
    BEGIN PERFORM public.admin_get_marketing_content_review_status('campaign','00000000-0000-4000-8000-000000001001');
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    IF NOT v_denied THEN RAISE EXCEPTION 'Public admin status allowed'; END IF;
    RESET ROLE;
  END LOOP;
END $$;

DO $$
DECLARE v_chat text; v_denied boolean;
BEGIN
  FOREACH v_chat IN ARRAY ARRAY['0123','-0702','0','-0'] LOOP
    v_denied:=false;
    BEGIN PERFORM public.claim_marketing_content_review(repeat('f',64),v_chat);
    EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
    PERFORM pg_temp.assert_true(v_denied,'noncanonical chat cannot create an alternate transport lock');
  END LOOP;
END $$;

-- Native bundle: no review before all three rows exist, then wait for the last
-- required visual. No per-item duplicates are enqueued for grouped content.
INSERT INTO public.marketing_campaigns(id,name,channels,metadata,audience_definition,audience_name)
VALUES('20000000-0000-4000-8000-000000000001','Lausanne',ARRAY['instagram'],'{"bundle_item_count":3}',
  '{"cities":["Lausanne"],"recipient_emails":["private@example.invalid"],"contact_ids":["private-id"]}','Restaurateurs lausannois');
INSERT INTO public.marketing_calendar_items(id,campaign_id,integration_id,title,channel,scheduled_at,content,targeting)
VALUES('20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001003',
  'Premier','instagram',now()+interval '1 day','{"body":"Premier texte exact","visual_required":true,"visual_status":"ready","visual_url":"https://fixture.supabase.co/storage/v1/object/public/marketing/one.png"}',
  '{"cities":["Lausanne"],"recipient_emails":["private@example.invalid"],"phone":"private-phone"}');
UPDATE public.marketing_content_review_targets SET next_attempt_at=now();
SELECT pg_temp.assert_true(public.claim_marketing_content_review(repeat('1',64),'123') IS NULL,'incomplete native bundle waits');
SELECT pg_temp.assert_true((SELECT status='waiting_items' FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'waiting_items state');
INSERT INTO public.marketing_calendar_items(id,campaign_id,integration_id,title,channel,scheduled_at,content)
VALUES('20000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001003',
  'Deuxième','instagram',now()+interval '2 days','{"body":"Deuxième texte","visual_required":true,"visual_status":"ready","visual_url":"https://fixture.supabase.co/storage/v1/object/public/marketing/two.png"}'),
('20000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001003',
  'Troisième','instagram',now()+interval '3 days','{"body":"Troisième texte","visual_required":true,"visual_status":"pending_generation"}');
UPDATE public.marketing_content_review_targets SET next_attempt_at=now();
SELECT pg_temp.assert_true(public.claim_marketing_content_review(repeat('1',64),'123') IS NULL,'all required visuals wait');
SELECT pg_temp.assert_true((SELECT status='waiting_visuals' FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'waiting_visuals state');
UPDATE public.marketing_calendar_items SET content=content||'{"visual_status":"ready","visual_url":"https://fixture.supabase.co/storage/v1/object/public/marketing/three.png"}'
WHERE id='20000000-0000-4000-8000-000000000013';
UPDATE public.marketing_content_review_targets SET next_attempt_at=now();

DO $$
DECLARE v_review jsonb; v_id uuid; v_revision bigint; v_result jsonb; v_native jsonb;
BEGIN
  v_review:=public.claim_marketing_content_review(repeat('1',64),'123'); v_id:=(v_review->>'id')::uuid; v_revision:=(v_review->>'revision')::bigint;
  PERFORM pg_temp.assert_true(jsonb_array_length(v_review#>'{snapshot,items}')=3,'one full 3-post review');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.marketing_content_review_targets),'only campaign target');
  PERFORM pg_temp.assert_true(v_review::text NOT LIKE '%private@example.invalid%' AND v_review::text NOT LIKE '%private-phone%'
    AND v_review::text NOT LIKE '%private-id%' AND v_review::text NOT LIKE '%DO_NOT_COPY%','snapshot excludes contacts/secrets');
  PERFORM pg_temp.assert_true(v_review#>>'{snapshot,campaign,audience_definition,selected_recipient_count}'='1','audience count retained');
  PERFORM pg_temp.assert_true(v_review#>>'{snapshot,items,0,content,body}'='Premier texte exact','exact final text retained');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('2',64),'123') IS NULL,'duplicate worker cannot claim delivering');
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('1',64),'123',90,'approved','telegram:456') IS NULL,'incomplete document cannot approve');
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[10,11]::bigint[],NULL,false,'delivered');
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[11,12]::bigint[],NULL,true,'delivered');
  PERFORM pg_temp.assert_true((SELECT status='delivering' AND document_complete AND cardinality(message_ids)=3 FROM public.marketing_content_reviews WHERE id=v_id),'ACKs monotone/deduplicated and no pending before buttons');
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[90]::bigint[],90,true,'delivered');
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('1',64),'999',90,'approved','telegram:456') IS NULL,'wrong chat denied');
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('1',64),'123',91,'approved','telegram:456') IS NULL,'wrong control message denied');
  -- Native scheduling/approval alone does not satisfy the content gate and
  -- ordinary operational counters/status/version changes do not requeue it.
  UPDATE public.marketing_calendar_items SET approval_status='approved',approved_by='11111111-1111-4111-8111-111111111111',
    approved_at=now(),status='scheduled',audience_size=42,attempt_count=1,
    content=content||'{"daily_publication_authorization":{"authorized_at":"fixture"}}'
  WHERE campaign_id='20000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true((SELECT revision=v_revision FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'operational changes do not increment revision');
  PERFORM pg_temp.assert_true(NOT public.marketing_content_review_allows_delivery('20000000-0000-4000-8000-000000000011'),'native approval alone blocked');
  SELECT jsonb_agg(jsonb_build_array(id,status,approval_status,approved_by,approved_at,scheduled_at)) INTO v_native
    FROM public.marketing_calendar_items WHERE campaign_id='20000000-0000-4000-8000-000000000001';
  v_result:=public.decide_marketing_content_review(repeat('1',64),'123',90,'approved','telegram:456');
  PERFORM pg_temp.assert_true(v_result->>'status'='approved','first valid decision wins');
  PERFORM pg_temp.assert_true(public.marketing_content_review_allows_delivery('20000000-0000-4000-8000-000000000011'),'current approved content passes content gate');
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('1',64),'123',90,'rejected','telegram:456') IS NULL,'decision replay rejected');
  PERFORM pg_temp.assert_true((public.record_marketing_content_review_delivery(v_id,ARRAY[90]::bigint[],90,true,'delivered')->>'status')='approved','late final ACK preserves callback winner');
  PERFORM pg_temp.assert_true(v_native=(SELECT jsonb_agg(jsonb_build_array(id,status,approval_status,approved_by,approved_at,scheduled_at))
    FROM public.marketing_calendar_items WHERE campaign_id='20000000-0000-4000-8000-000000000001'),'callback never mutates native approval/scheduling');
  UPDATE public.marketing_calendar_items SET content=jsonb_set(content,'{body}','"Texte modifié"') WHERE id='20000000-0000-4000-8000-000000000011';
  PERFORM pg_temp.assert_true(NOT public.marketing_content_review_allows_delivery('20000000-0000-4000-8000-000000000011'),'material edit invalidates approval');
  PERFORM pg_temp.assert_true((SELECT revision>v_revision AND status='queued' FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'material edit queues new revision');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_id;
END $$;

-- A lost final ACK remains uncertain, receives no automatic resend, and may be
-- decided through its token only when the complete dossier had been persisted.
UPDATE public.marketing_content_review_targets SET next_attempt_at=now();
DO $$
DECLARE v_review jsonb; v_id uuid; v_status jsonb; v_revision bigint; v_denied boolean;
BEGIN
  v_review:=public.claim_marketing_content_review(repeat('2',64),'123');v_id:=(v_review->>'id')::uuid;v_revision:=(v_review->>'revision')::bigint;
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[101,102]::bigint[],NULL,true,'delivered');
  PERFORM public.record_marketing_content_review_delivery(v_id,'{}',NULL,false,'delivery_unknown','content_review_delivery_unknown');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('3',64),'123') IS NULL,'unknown delivery is never automatically replayed');
  PERFORM pg_temp.assert_true((public.decide_marketing_content_review(repeat('2',64),'123',109,'rejected','telegram:456')->>'status')='rejected','complete unknown final ACK callback may bind control id');
  v_status:=public.admin_retry_marketing_content_review('campaign','20000000-0000-4000-8000-000000000001',v_revision,v_id,'Nouvel aperçu');
  PERFORM pg_temp.assert_true(v_status->>'status'='queued','explicit retry after rejection');
  PERFORM pg_temp.assert_true(public.admin_retry_marketing_content_review('campaign','20000000-0000-4000-8000-000000000001',v_revision,v_id,NULL)->>'status'='queued','retry double click deduplicates');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_id;
  v_review:=public.claim_marketing_content_review(repeat('3',64),'123');
  PERFORM pg_temp.assert_true(v_review->>'id'<>v_id::text AND (v_review->>'revision')::bigint=v_revision,'same content can get a new explicit attempt');
  v_denied:=false;
  BEGIN PERFORM public.admin_retry_marketing_content_review('campaign','20000000-0000-4000-8000-000000000001',v_revision,v_id,NULL);
  EXCEPTION WHEN serialization_failure THEN v_denied:=true; END;
  PERFORM pg_temp.assert_true(v_denied,'old expected review id fences retry after new claim');
  v_id:=(v_review->>'id')::uuid;
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[110]::bigint[],NULL,true,'delivered');
  UPDATE public.marketing_content_reviews SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day',
    transport_lease_until=now()-interval '1 day' WHERE id=v_id;
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('3',64),'123',119,'approved','telegram:456') IS NULL,'expired callback denied');
  v_status:=public.admin_get_marketing_content_review_status('campaign','20000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(v_status->>'status'='expired','expired surfaced without resend');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('4',64),'123') IS NULL,'expired attempt not auto retried');
  PERFORM public.admin_retry_marketing_content_review('campaign','20000000-0000-4000-8000-000000000001',v_revision,v_id,NULL);
  v_review:=public.claim_marketing_content_review(repeat('4',64),'123');v_id:=(v_review->>'id')::uuid;
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[120]::bigint[],NULL,true,'delivered');
  UPDATE public.marketing_calendar_items SET targeting='{"cities":["Genève"]}' WHERE id='20000000-0000-4000-8000-000000000011';
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('4',64),'123',129,'approved','telegram:456') IS NULL,'stale audience callback denied');
  PERFORM pg_temp.assert_true((SELECT status='stale' FROM public.marketing_content_reviews WHERE id=v_id),'stale attempt remains history');
  -- Advance the elapsed transport bound before unrelated scenarios below.
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_id;
END $$;

-- Membership and cancellation preserve one active campaign dossier.
DO $$
DECLARE v_before bigint; v_result jsonb;
BEGIN
  SELECT revision INTO v_before FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001';
  UPDATE public.marketing_calendar_items SET status='cancelled' WHERE id='20000000-0000-4000-8000-000000000013';
  SELECT public.marketing_build_content_review_snapshot(target_type,target_id,revision) INTO v_result
    FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(v_result->>'status'='ready' AND jsonb_array_length(v_result#>'{snapshot,items}')=2,'cancel one member reviews two remaining');
  PERFORM pg_temp.assert_true((SELECT revision>v_before FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'cancellation increments revision');
  UPDATE public.marketing_calendar_items SET campaign_id=NULL WHERE id='20000000-0000-4000-8000-000000000012';
  PERFORM pg_temp.assert_true((SELECT status='queued' FROM public.marketing_content_review_targets WHERE target_type='item' AND target_id='20000000-0000-4000-8000-000000000012'),'detached member queues standalone');
  UPDATE public.marketing_calendar_items SET campaign_id='20000000-0000-4000-8000-000000000001' WHERE id='20000000-0000-4000-8000-000000000012';
  PERFORM pg_temp.assert_true((SELECT status='cancelled' FROM public.marketing_content_review_targets WHERE target_type='item' AND target_id='20000000-0000-4000-8000-000000000012'),'reattached standalone cancelled');
  DELETE FROM public.marketing_calendar_items WHERE id='20000000-0000-4000-8000-000000000012';
  SELECT public.marketing_build_content_review_snapshot(target_type,target_id,revision) INTO v_result
    FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(v_result->>'status'='ready' AND jsonb_array_length(v_result#>'{snapshot,items}')=1,'deletion reviews remaining membership');
  UPDATE public.marketing_calendar_items SET status='cancelled' WHERE id='20000000-0000-4000-8000-000000000011';
  SELECT public.marketing_build_content_review_snapshot(target_type,target_id,revision) INTO v_result
    FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(v_result->>'status'='cancelled','all cancelled members cancel dossier');
  UPDATE public.marketing_calendar_items SET status='draft' WHERE id='20000000-0000-4000-8000-000000000011';
  UPDATE public.marketing_campaigns SET status='cancelled' WHERE id='20000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true((SELECT status='cancelled' FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'parent cancellation immediate');
  UPDATE public.marketing_campaigns SET status='draft' WHERE id='20000000-0000-4000-8000-000000000001';
END $$;

-- Changing destination with the same integration id invalidates only tracked
-- targets; operational probe/credential fields are intentionally irrelevant.
DO $$
DECLARE v_revision bigint;
BEGIN
  SELECT revision INTO v_revision FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001';
  UPDATE public.marketing_integrations SET last_checked_at=now(),public_configuration=public_configuration||'{"access_token":"NEW_SECRET"}'
    WHERE id='00000000-0000-4000-8000-000000001003';
  PERFORM pg_temp.assert_true((SELECT revision=v_revision FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'operational integration update ignored');
  UPDATE public.marketing_integrations SET public_configuration=public_configuration||'{"ig_user_id":"17849999999999999"}'
    WHERE id='00000000-0000-4000-8000-000000001003';
  PERFORM pg_temp.assert_true((SELECT revision>v_revision FROM public.marketing_content_review_targets WHERE target_id='20000000-0000-4000-8000-000000000001'),'same integration new account invalidates');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.marketing_content_review_targets WHERE target_id='00000000-0000-4000-8000-000000001001'),'integration update does not backfill old campaigns');
END $$;

-- Text-only Facebook is valid, an Instagram post without a visual is not.
INSERT INTO public.marketing_calendar_items(id,title,channel,scheduled_at,content)
VALUES('30000000-0000-4000-8000-000000000001','Facebook texte','facebook',now(),'{"body":"Texte seul"}'),
('30000000-0000-4000-8000-000000000002','Instagram sans image','instagram',now(),'{"body":"Texte seul"}');
SELECT pg_temp.assert_true((public.marketing_build_content_review_snapshot('item','30000000-0000-4000-8000-000000000001',1)->>'status')='ready','Facebook text-only readiness');
SELECT pg_temp.assert_true((public.marketing_build_content_review_snapshot('item','30000000-0000-4000-8000-000000000002',1)->>'status')='waiting_visuals','Instagram requires visual');

-- Bounds are enforced before a dossier or Telegram decision token exists.
INSERT INTO public.marketing_campaigns(id,name,metadata) VALUES
  ('31000000-0000-4000-8000-000000000001','Trente-deux posts','{"bundle_item_count":32}'),
  ('31000000-0000-4000-8000-000000000002','Métadonnées incomplètes','{"bundle_item_count":"invalid"}');
INSERT INTO public.marketing_calendar_items(campaign_id,title,channel,scheduled_at,content)
SELECT '31000000-0000-4000-8000-000000000001','Post '||n,'facebook',now()+n*interval '1 day','{"body":"Texte final"}'::jsonb FROM generate_series(1,32) n;
SELECT pg_temp.assert_true(jsonb_array_length(public.marketing_build_content_review_snapshot('campaign','31000000-0000-4000-8000-000000000001',1)#>'{snapshot,items}')=32,'native upper bound 32 accepted');
INSERT INTO public.marketing_calendar_items(campaign_id,title,channel,scheduled_at,content)
VALUES('31000000-0000-4000-8000-000000000001','Post 33','facebook',now(),'{"body":"Excédent"}'),
('31000000-0000-4000-8000-000000000002','Post isolé','facebook',now(),'{"body":"Attendre la définition complète"}');
SELECT pg_temp.assert_true((public.marketing_build_content_review_snapshot('campaign','31000000-0000-4000-8000-000000000001',1)->>'error')='too_many_items','33 posts rejected before sending');
SELECT pg_temp.assert_true((public.marketing_build_content_review_snapshot('campaign','31000000-0000-4000-8000-000000000002',1)->>'status')='waiting_items','malformed bundle count fails closed without aborting source creation');
INSERT INTO public.marketing_calendar_items(id,title,channel,scheduled_at,content)
VALUES('31000000-0000-4000-8000-000000000003','Texte trop long','facebook',now(),jsonb_build_object('body',repeat('x',262144)));
SELECT pg_temp.assert_true((public.marketing_build_content_review_snapshot('item','31000000-0000-4000-8000-000000000003',1)->>'error')='snapshot_too_large','oversized snapshot rejected before sending');
SELECT pg_temp.assert_true(public.marketing_content_review_audience('{"city":"Lausanne","cities":["Lausanne"],"segments":[{"email":"private@example.invalid"}],"phone":"private"}')=
  '{"city":"Lausanne","cities":["Lausanne"]}'::jsonb,'audience facets do not contain nested contact records');

-- Exercise the permitted RPCs under the real service SQL role as well as the
-- JWT guard. Explicit retry retires an uncertain attempt before a new token.
UPDATE public.marketing_content_review_targets SET next_attempt_at=now()+interval '1 day';
INSERT INTO public.marketing_calendar_items(id,title,channel,scheduled_at,content)
VALUES('32000000-0000-4000-8000-000000000001','Aperçu individuel','facebook',now(),'{"body":"Texte à valider"}');
UPDATE public.marketing_content_review_targets SET next_attempt_at=now() WHERE target_id='32000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
DO $$
DECLARE v_review jsonb; v_id uuid; v_denied boolean;
BEGIN
  v_review:=public.claim_marketing_content_review(repeat('6',64),'123');v_id:=(v_review->>'id')::uuid;
  PERFORM pg_temp.assert_true(v_review->>'target_id'='32000000-0000-4000-8000-000000000001','service RPC can claim private outbox');
  v_denied:=false;
  BEGIN PERFORM public.record_marketing_content_review_delivery(v_id,'{}',900,false,'delivered');
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  PERFORM pg_temp.assert_true(v_denied,'control before complete document rejected');
  v_denied:=false;
  BEGIN PERFORM public.record_marketing_content_review_delivery(v_id,'{}',NULL,true,'delivered');
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  PERFORM pg_temp.assert_true(v_denied,'empty complete document rejected');
  PERFORM public.record_marketing_content_review_delivery(v_id,ARRAY[800]::bigint[],NULL,true,'delivered');
  PERFORM public.record_marketing_content_review_delivery(v_id,'{}',NULL,false,'delivery_unknown','content_review_delivery_unknown');
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);v_denied:=false;
  BEGIN PERFORM public.claim_marketing_content_review(repeat('7',64),'123'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  PERFORM pg_temp.assert_true(v_denied,'service RPC also requires service JWT role');
  PERFORM set_config('request.jwt.claims','{"role":"service_role","sub":"11111111-1111-4111-8111-111111111111"}',true);
END $$;
RESET ROLE;
DO $$
DECLARE v_status jsonb; v_old uuid; v_review jsonb;
BEGIN
  v_status:=public.admin_get_marketing_content_review_status('item','32000000-0000-4000-8000-000000000001');v_old:=(v_status#>>'{review,id}')::uuid;
  PERFORM pg_temp.assert_true(v_status#>>'{review,last_error_code}'='content_review_delivery_unknown','safe failure reason surfaced');
  PERFORM public.admin_retry_marketing_content_review('item','32000000-0000-4000-8000-000000000001',(v_status->>'revision')::bigint,v_old,NULL);
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('6',64),'123',809,'approved','telegram:456') IS NULL,'explicit retry fences uncertain old token immediately');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('7',64),'123') IS NULL,'explicit retry retains uncertain sender lease');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_old;
  v_review:=public.claim_marketing_content_review(repeat('7',64),'123');
  PERFORM pg_temp.assert_true(v_review->>'id'<>v_old::text,'uncertain retry uses a fresh attempt');
  PERFORM public.record_marketing_content_review_delivery((v_review->>'id')::uuid,'{}',NULL,false,'failed','content_review_telegram_rejected');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('8',64),'123') IS NULL,'known failure does not auto retry');
  v_status:=public.admin_get_marketing_content_review_status('item','32000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(v_status->>'status'='failed','known failed delivery visible');
  PERFORM public.admin_retry_marketing_content_review('item','32000000-0000-4000-8000-000000000001',(v_status->>'revision')::bigint,(v_status#>>'{review,id}')::uuid,NULL);
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=(v_status#>>'{review,id}')::uuid;
END $$;

DO $$
DECLARE v_review jsonb; v_status jsonb;
BEGIN
  v_review:=public.claim_marketing_content_review(repeat('8',64),'123');
  UPDATE public.marketing_content_reviews SET updated_at=now()-interval '6 minutes',transport_lease_until=now()-interval '1 minute'
    WHERE id=(v_review->>'id')::uuid;
  v_status:=public.admin_get_marketing_content_review_status('item','32000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(v_status->>'status'='delivery_unknown','lost worker becomes explicitly recoverable after timeout');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('9',64),'123') IS NULL,'lost worker remains unavailable for automatic replay');
  PERFORM pg_temp.assert_true(public.decide_marketing_content_review(repeat('8',64),'123',999,'approved','telegram:456') IS NULL,'lost incomplete worker cannot be approved');
END $$;

-- Several ready targets distinguish a chat transport lease from per-target
-- deduplication. Source edits and uncertain sends keep ownership until its bound;
-- acknowledged completion allows the next dossier without waiting for a decision.
UPDATE public.marketing_content_review_targets SET next_attempt_at=now()+interval '1 day';
INSERT INTO public.marketing_calendar_items(id,title,channel,scheduled_at,content)
VALUES('33000000-0000-4000-8000-000000000001','Transport un','facebook',now(),'{"body":"Premier dossier"}'),
('33000000-0000-4000-8000-000000000002','Transport deux','facebook',now(),'{"body":"Deuxième dossier"}'),
('33000000-0000-4000-8000-000000000003','Transport trois','facebook',now(),'{"body":"Troisième dossier"}'),
('33000000-0000-4000-8000-000000000004','Transport quatre','facebook',now(),'{"body":"Quatrième dossier"}');
UPDATE public.marketing_content_review_targets SET next_attempt_at=now() WHERE target_id IN
  ('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002',
   '33000000-0000-4000-8000-000000000003','33000000-0000-4000-8000-000000000004');
DO $$
DECLARE v_first jsonb; v_other jsonb; v_next jsonb; v_replacement jsonb;
  v_first_id uuid; v_other_id uuid; v_next_id uuid; v_lease timestamptz;
BEGIN
  v_first:=public.claim_marketing_content_review(repeat('a',63)||'1','701');v_first_id:=(v_first->>'id')::uuid;
  PERFORM pg_temp.assert_true(v_first->>'target_id'='33000000-0000-4000-8000-000000000001','first chat reserves first target');
  PERFORM pg_temp.assert_true(NOT (v_first ? 'transport_lease_until') AND NOT (v_first ? 'chat_id') AND NOT (v_first ? 'token_hash'),'transport ownership remains private');
  PERFORM pg_temp.assert_true((SELECT transport_lease_until BETWEEN clock_timestamp()+interval '4 minutes' AND clock_timestamp()+interval '6 minutes'
    FROM public.marketing_content_reviews WHERE id=v_first_id),'new sender gets bounded five-minute lease');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('a',63)||'2','701') IS NULL,'same chat cannot reserve another ready target');
  v_other:=public.claim_marketing_content_review(repeat('a',63)||'2','-702');v_other_id:=(v_other->>'id')::uuid;
  PERFORM pg_temp.assert_true(v_other->>'target_id'='33000000-0000-4000-8000-000000000002','different chat can progress independently');
  PERFORM public.record_marketing_content_review_delivery(v_first_id,ARRAY[7011]::bigint[],NULL,false,'delivered');
  PERFORM public.record_marketing_content_review_delivery(v_first_id,ARRAY[7012]::bigint[],NULL,true,'delivered');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('a',63)||'3','701') IS NULL,'document ACKs do not release the chat');
  PERFORM public.record_marketing_content_review_delivery(v_first_id,'{}',7013,false,'delivered');
  PERFORM pg_temp.assert_true((SELECT status='pending' AND transport_lease_until > clock_timestamp()
    AND transport_lease_until < clock_timestamp()+interval '2 seconds' FROM public.marketing_content_reviews WHERE id=v_first_id),'final control ACK replaces long lease with private-chat cooldown');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('a',63)||'3','701') IS NULL,'dossier boundary preserves private-chat pacing');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_first_id;
  v_next:=public.claim_marketing_content_review(repeat('a',63)||'3','701');v_next_id:=(v_next->>'id')::uuid;
  PERFORM pg_temp.assert_true(v_next->>'target_id'='33000000-0000-4000-8000-000000000003','finished sender allows next target');

  SELECT transport_lease_until INTO v_lease FROM public.marketing_content_reviews WHERE id=v_other_id;
  UPDATE public.marketing_calendar_items SET content='{"body":"Deuxième dossier révisé"}' WHERE id='33000000-0000-4000-8000-000000000002';
  UPDATE public.marketing_content_review_targets SET next_attempt_at=now() WHERE target_id='33000000-0000-4000-8000-000000000002';
  PERFORM pg_temp.assert_true((SELECT status='stale' AND transport_lease_until=v_lease FROM public.marketing_content_reviews WHERE id=v_other_id),'invalidation retains live sender lease');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('a',63)||'4','-702') IS NULL,'stale sender still excludes a second worker for its chat');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_other_id;
  v_replacement:=public.claim_marketing_content_review(repeat('a',63)||'4','-702');
  PERFORM pg_temp.assert_true(v_replacement->>'target_id'='33000000-0000-4000-8000-000000000002'
    AND v_replacement->>'id'<>v_other_id::text AND (v_replacement->>'revision')::bigint>(v_other->>'revision')::bigint,'lease expiry allows the new material revision');
  PERFORM public.record_marketing_content_review_delivery((v_replacement->>'id')::uuid,'{}',NULL,false,'failed','content_review_telegram_rejected');
  PERFORM pg_temp.assert_true((SELECT transport_lease_until > clock_timestamp()+interval '2 seconds'
    AND transport_lease_until < clock_timestamp()+interval '4 seconds'
    FROM public.marketing_content_reviews WHERE id=(v_replacement->>'id')::uuid),'known failure uses the longer group-chat cooldown');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('b',63)||'1','-702') IS NULL,'group pacing remains enforced after a known failure');

  SELECT transport_lease_until INTO v_lease FROM public.marketing_content_reviews WHERE id=v_next_id;
  PERFORM public.record_marketing_content_review_delivery(v_next_id,'{}',NULL,false,'delivery_unknown','content_review_delivery_unknown');
  PERFORM pg_temp.assert_true((SELECT transport_lease_until=v_lease FROM public.marketing_content_reviews WHERE id=v_next_id),'uncertain send retains its original bounded lease');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('a',63)||'5','701') IS NULL,'uncertain sender blocks chat despite another ready target');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_next_id;
  v_replacement:=public.claim_marketing_content_review(repeat('a',63)||'5','701');
  PERFORM pg_temp.assert_true(v_replacement->>'target_id'='33000000-0000-4000-8000-000000000004','lease expiry moves to another target, never resends uncertain dossier');
  PERFORM pg_temp.assert_true((SELECT status='delivery_unknown' FROM public.marketing_content_reviews WHERE id=v_next_id),'uncertain attempt remains unchanged after lease expiry');
  PERFORM public.record_marketing_content_review_delivery((v_replacement->>'id')::uuid,'{}',NULL,false,'failed','content_review_telegram_rejected');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=(v_replacement->>'id')::uuid;

  INSERT INTO public.marketing_calendar_items(id,title,channel,scheduled_at,content)
  VALUES('33000000-0000-4000-8000-000000000005','Transport cinq','facebook',now(),'{"body":"Cinquième dossier"}'),
    ('33000000-0000-4000-8000-000000000006','Transport six','facebook',now(),'{"body":"Sixième dossier"}');
  UPDATE public.marketing_content_review_targets SET next_attempt_at=now()
    WHERE target_id IN ('33000000-0000-4000-8000-000000000005','33000000-0000-4000-8000-000000000006');
  v_next:=public.claim_marketing_content_review(repeat('a',63)||'6','701');v_next_id:=(v_next->>'id')::uuid;
  PERFORM public.record_marketing_content_review_delivery(v_next_id,ARRAY[7051]::bigint[],NULL,true,'delivered');
  PERFORM public.record_marketing_content_review_delivery(v_next_id,'{}',NULL,false,'delivery_unknown','content_review_delivery_unknown');
  PERFORM pg_temp.assert_true((public.decide_marketing_content_review(repeat('a',63)||'6','701',7052,'approved','telegram:456')->>'status')='approved','valid callback proves final control was delivered');
  PERFORM pg_temp.assert_true((SELECT transport_lease_until > clock_timestamp() AND transport_lease_until < clock_timestamp()+interval '2 seconds'
    FROM public.marketing_content_reviews WHERE id=v_next_id),'valid callback replaces transport lease with cooldown');
  PERFORM pg_temp.assert_true(public.claim_marketing_content_review(repeat('a',63)||'7','701') IS NULL,'callback preserves boundary pacing');
  UPDATE public.marketing_content_reviews SET transport_lease_until=now()-interval '1 second' WHERE id=v_next_id;
  v_replacement:=public.claim_marketing_content_review(repeat('a',63)||'7','701');
  PERFORM pg_temp.assert_true(v_replacement->>'target_id'='33000000-0000-4000-8000-000000000006','callback permits next dossier');
  PERFORM public.record_marketing_content_review_delivery((v_replacement->>'id')::uuid,'{}',NULL,false,'failed','content_review_telegram_rejected');
END $$;

-- Administrative entry uses the existing dispatcher and rejects stale sessions.
SELECT pg_temp.assert_true((public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_get_marketing_content_review_status',
  '{"p_target_type":"campaign","p_target_id":"20000000-0000-4000-8000-000000000001"}')->>'status')='queued','dispatcher routes status');
DO $$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.service_execute_marketing_admin_operation(repeat('a',64),repeat('c',64),'admin_retry_marketing_content_review',
    '{"p_target_type":"campaign","p_target_id":"20000000-0000-4000-8000-000000000001","p_expected_revision":1}');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  PERFORM pg_temp.assert_true(v_denied,'wrong CSRF rejected');
  PERFORM set_config('app.marketing_web_session_sid_hash','',true);v_denied:=false;
  BEGIN PERFORM public.admin_get_marketing_content_review_status('campaign','20000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  PERFORM pg_temp.assert_true(v_denied,'direct admin status requires active BFF context');
  PERFORM set_config('app.marketing_web_session_sid_hash',repeat('a',64),true);
END $$;

-- Existing cron secrets and destination are reused; malformed URLs cannot carry
-- a secret elsewhere. No publication runtime/global-pause dependency is needed.
UPDATE public.marketing_content_review_targets SET next_attempt_at=now();
SELECT pg_temp.assert_true(public.invoke_marketing_content_review_cron() IS NOT NULL,'queued preview invokes dedicated cron');
SELECT pg_temp.assert_true((SELECT url='https://fixture.supabase.co/functions/v1/ops-incident-control'
  AND body='{"action":"content_review_process"}'::jsonb AND timeout_milliseconds=180000 FROM net.requests ORDER BY id DESC LIMIT 1),'cron endpoint/action/timeout');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM cron.job WHERE jobname='tok-marketing-content-review' AND schedule='*/2 * * * *'),'idempotent dedicated schedule');
UPDATE vault.decrypted_secrets SET decrypted_secret='https://untrusted.invalid/marketing-orchestrator' WHERE name='marketing_edge_url';
SELECT pg_temp.assert_true(public.invoke_marketing_content_review_cron() IS NULL,'untrusted cron URL fails closed');
UPDATE public.feature_flags SET is_active=false WHERE name='admin-marketing-operations';
SELECT pg_temp.assert_true(public.claim_marketing_content_review(repeat('5',64),'123') IS NULL,'disabled feature blocks claiming');
UPDATE public.feature_flags SET is_active=true WHERE name='admin-marketing-operations';

INSERT INTO public.marketing_daily_series VALUES('40000000-0000-4000-8000-000000000001','automatic','active',now()-interval '1 hour');
INSERT INTO public.marketing_daily_runs(id,series_id,status) VALUES('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','processing');
UPDATE public.marketing_daily_runs SET status='succeeded' WHERE id='40000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT status='succeeded' AND last_error='waiting_content_review' FROM public.marketing_daily_runs WHERE id='40000000-0000-4000-8000-000000000002'),'daily standing authorization waits without scheduling');

ROLLBACK;
