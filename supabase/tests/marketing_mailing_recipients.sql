-- Disposable migrated database only. Synthetic contacts; no provider calls.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.check_mailing_recipients(ok boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mailing recipients assertion failed: %', label; END IF;
END;
$$;
CREATE FUNCTION pg_temp.reject_mailing_recipients(statement text, expected_state text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected mailing recipients rejection: %', statement;
END;
$$;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES ('71800000-0000-4000-8000-000000000001','mailing-admin@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES ('71800000-0000-4000-8000-000000000001','admin');
INSERT INTO public.feature_flags(name,label,is_active) VALUES ('admin-marketing-operations','Mailing recipients test',true)
ON CONFLICT (name) DO UPDATE SET is_active=true;
INSERT INTO public.marketing_admin_web_sessions(sid_hash,csrf_hash,user_id,mfa_verified_at,expires_at)
VALUES (repeat('a',64),repeat('b',64),'71800000-0000-4000-8000-000000000001',now(),now()+interval '1 hour');

INSERT INTO public.marketing_contacts(id,contact_type,display_name,email,lawful_basis,consent_source,consent_at,lifecycle_status,opted_out_at,metadata)
VALUES
('71810000-0000-4000-8000-000000000001','restaurant_lead','Contact prêt','ready@example.test','consent','Fixture',now(),'qualified',NULL,'{}'),
('71810000-0000-4000-8000-000000000002','restaurant_lead','Contact opposé','out@example.test','none',NULL,NULL,'opted_out',now(),'{}'),
('71810000-0000-4000-8000-000000000003','restaurant_lead','Contact suspendu','suppressed@example.test','consent','Fixture',now(),'qualified',NULL,'{"email_suppressed":true}'),
('71810000-0000-4000-8000-000000000004','registered_user','Profil existant','registered@example.test','none',NULL,NULL,'new',NULL,'{"unchanged":true}'),
('71810000-0000-4000-8000-000000000005','restaurant_lead','Hors liste','unselected@example.test','consent','Fixture',now(),'qualified',NULL,'{}');

-- There is no direct helper access, even with a service credential or admin JWT.
SET LOCAL ROLE anon;
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.admin_prepare_marketing_mailing_recipients('["new@example.test"]')$q$,'42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"71800000-0000-4000-8000-000000000001","aal":"aal2"}',true);
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.admin_prepare_marketing_mailing_recipients('["new@example.test"]')$q$,'42501');
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["new@example.test"]}')$q$,'42501');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.admin_prepare_marketing_mailing_recipients('["new@example.test"]')$q$,'42501');
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('c',64),repeat('b',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["new@example.test"]}')$q$,'42501');
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('c',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["new@example.test"]}')$q$,'42501');
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),NULL,'admin_prepare_marketing_mailing_recipients','{"p_emails":["new@example.test"]}')$q$,'42501');
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["new@example.test"],"lawful_basis":"consent"}')$q$,'22023');
-- A valid address preceding an invalid one must never be partially imported,
-- including retries made through the real session/CSRF dispatcher.
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["atomic@example.test","broken"]}')$q$,'22023');
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["atomic@example.test","broken"]}')$q$,'22023');
RESET ROLE;
SELECT pg_temp.check_mailing_recipients(NOT EXISTS (SELECT 1 FROM public.marketing_contacts WHERE email_normalized IN ('new@example.test','atomic@example.test')),'rejected operations leave no contacts, including retries');
SET LOCAL ROLE service_role;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_prepare_marketing_mailing_recipients',
    '{"p_emails":[" Ready@Example.test ","ready@example.test","out@example.test","suppressed@example.test","registered@example.test","new@example.test"]}');
  PERFORM pg_temp.check_mailing_recipients(v_result->>'recipient_count'='5','normalized unique count');
  PERFORM pg_temp.check_mailing_recipients(v_result->>'created_count'='1' AND v_result->>'existing_count'='4','only missing contact inserted');
  PERFORM pg_temp.check_mailing_recipients(v_result#>>'{estimate,total}'='5','estimate excludes unselected contact');
  PERFORM pg_temp.check_mailing_recipients(v_result#>>'{estimate,eligible}'='1','opt-out, suppression and missing authorization retained');
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_prepare_marketing_mailing_recipients','{"p_emails":["NEW@EXAMPLE.TEST"]}');
  PERFORM pg_temp.check_mailing_recipients(v_result->>'created_count'='0' AND v_result->>'existing_count'='1','idempotent import');
END;
$$;
RESET ROLE;

SELECT pg_temp.check_mailing_recipients((SELECT count(*)=1 FROM public.marketing_contacts WHERE email_normalized='new@example.test'),'unique contact identity');
SELECT pg_temp.check_mailing_recipients((SELECT contact_type='manual' AND lawful_basis='none' AND consent_at IS NULL AND source_system='mailing_import'
  AND created_by='71800000-0000-4000-8000-000000000001' FROM public.marketing_contacts WHERE email_normalized='new@example.test'),'new contact provenance without invented consent');
SELECT pg_temp.check_mailing_recipients((SELECT opted_out_at IS NOT NULL AND lawful_basis='none' AND lifecycle_status='opted_out'
  FROM public.marketing_contacts WHERE email_normalized='out@example.test'),'suppression preserved');
SELECT pg_temp.check_mailing_recipients((SELECT contact_type='registered_user' AND metadata='{"unchanged":true}'::jsonb
  FROM public.marketing_contacts WHERE email_normalized='registered@example.test'),'registered profile preserved');

-- The bounded estimator keeps the original response and eligibility semantics.
DO $$
DECLARE v_result jsonb; v_filter jsonb;
BEGIN
  v_filter := '{"audience_kind":"mixed","recipient_emails":[" Ready@Example.test ","ready@example.test","out@example.test","suppressed@example.test","registered@example.test","new@example.test","absent@example.test"]}';
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_estimate_marketing_audience',jsonb_build_object('p_filter',v_filter,'p_channels',jsonb_build_array('email','instagram')));
  PERFORM pg_temp.check_mailing_recipients(v_result->>'total'='5' AND v_result->>'eligible'='1'
    AND v_result->>'eligible_count'='1' AND (v_result->>'consent_coverage')::numeric=20,'bounded estimate counts matched identities once');
  PERFORM pg_temp.check_mailing_recipients(EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'channels') ch
    WHERE ch->>'channel'='email' AND ch->>'eligible'='1' AND ch->>'delivery_mode'='individual'),'email eligibility unchanged');
  PERFORM pg_temp.check_mailing_recipients(EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'channels') ch
    WHERE ch->>'channel'='instagram' AND ch->>'eligible'='5' AND ch->>'delivery_mode'='public'),'public channel count unchanged');
  PERFORM pg_temp.check_mailing_recipients(v_result->>'estimated_at' IS NOT NULL
    AND v_result->>'warning'='Estimate only; eligibility is rechecked atomically at dispatch time.','estimate metadata unchanged');
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_estimate_marketing_audience',jsonb_build_object('p_filter',v_filter,'p_channels',jsonb_build_array('instagram')));
  PERFORM pg_temp.check_mailing_recipients(v_result->>'eligible'='5','public-only estimate retained');
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_estimate_marketing_audience','{"p_filter":{"audience_kind":"mixed","recipient_emails":["absent@example.test"]},"p_channels":["email"]}');
  PERFORM pg_temp.check_mailing_recipients(v_result->>'total'='0' AND v_result->>'eligible'='0'
    AND (v_result->>'consent_coverage')::numeric=0,'no matched identity never widens the audience');
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_estimate_marketing_audience','{"p_filter":{"audience_kind":"restaurant","selections":{}},"p_channels":["email"]}');
  PERFORM pg_temp.check_mailing_recipients(v_result->>'total'='4' AND v_result->>'eligible'='2','legacy estimate unchanged');
END;
$$;

DO $$
DECLARE v_invalid jsonb; v_filter jsonb; v_role text;
BEGIN
  FOR v_invalid IN SELECT * FROM (VALUES ('null'::jsonb), ('[]'::jsonb), ('[null]'::jsonb), ('[1]'::jsonb),
    ('["broken"]'::jsonb), ('["a..b@example.test"]'::jsonb), ('["a@-example.test"]'::jsonb),
    ('["a@example.test\r\nBcc: other@example.test"]'::jsonb),
    (to_jsonb(array_fill('a@example.test'::text,ARRAY[501])))) invalid(value)
  LOOP
    PERFORM pg_temp.reject_mailing_recipients(format('SELECT public.marketing_normalize_mailing_recipients(%L::jsonb)',v_invalid::text),'22023');
  END LOOP;
  PERFORM pg_temp.check_mailing_recipients(jsonb_array_length(public.marketing_normalize_mailing_recipients(
    (SELECT jsonb_agg('recipient-'||n||'@example.test') FROM generate_series(1,500) n)))=500,'maximum batch accepted');
  FOR v_filter IN SELECT * FROM (VALUES
    ('{"audience_kind":"mixed","recipient_emails":[]}'::jsonb),
    ('{"audience_kind":"restaurant","recipient_emails":["ready@example.test"]}'::jsonb),
    ('{"audience_kind":"mixed","recipient_emails":["ready@example.test"],"selections":{}}'::jsonb),
    ('{"audience_kind":"mixed","recipient_emails":["ready@example.test"],"city":"Genève"}'::jsonb)
  ) invalid(value) LOOP
    PERFORM pg_temp.reject_mailing_recipients(format('SELECT public.marketing_validate_audience_filter(%L::jsonb)',v_filter::text),'22023');
  END LOOP;
  v_filter := '{"audience_kind":"mixed","recipient_emails":["registered@example.test","new@example.test"]}';
  PERFORM pg_temp.check_mailing_recipients((SELECT count(*)=2 FROM public.marketing_contacts c WHERE public.marketing_contact_matches_filter(c.id,v_filter)),'exact list includes registered and manual identities');
  PERFORM pg_temp.check_mailing_recipients(NOT public.marketing_contact_matches_filter('71810000-0000-4000-8000-000000000005',v_filter),'no audience widening');
  PERFORM pg_temp.check_mailing_recipients((SELECT count(*)=4 FROM public.marketing_contacts c WHERE public.marketing_contact_matches_filter(c.id,'{"audience_kind":"restaurant","selections":{}}')),'legacy restaurant filter unchanged');
  PERFORM pg_temp.check_mailing_recipients(NOT (public.marketing_redact_audit_record(
    '{"id":"safe","audience_definition":{"recipient_emails":["private@example.test"]},"targeting":{"recipient_emails":["private@example.test"]}}') ? 'audience_definition'),'campaign coordinates redacted from audits');
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    PERFORM pg_temp.check_mailing_recipients(NOT has_function_privilege(v_role,'public.admin_prepare_marketing_mailing_recipients(jsonb)','EXECUTE'),'helper ACL '||v_role);
    PERFORM pg_temp.check_mailing_recipients(NOT has_function_privilege(v_role,'public.marketing_mailing_recipient_contact_ids(jsonb)','EXECUTE'),'private resolver ACL '||v_role);
  END LOOP;
  PERFORM pg_temp.reject_mailing_recipients('SELECT public.marketing_mailing_recipient_contact_ids(NULL)','22023');
  PERFORM pg_temp.check_mailing_recipients(public.marketing_mailing_recipient_contact_ids(
    '{"audience_kind":"restaurant","selections":{}}') IS NULL,'validated legacy filter uses the original audience');
  PERFORM pg_temp.check_mailing_recipients(cardinality(public.marketing_mailing_recipient_contact_ids(
    '{"audience_kind":"mixed","recipient_emails":["absent@example.test"]}'))=0,'empty explicit match is distinct from legacy');
END;
$$;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),
    'admin_prepare_marketing_mailing_recipients',jsonb_build_object('p_emails',
      (SELECT jsonb_agg('bounded-'||n||'@example.test') FROM generate_series(1,500) n)));
  PERFORM pg_temp.check_mailing_recipients(v_result->>'recipient_count'='500' AND v_result->>'created_count'='500'
    AND v_result#>>'{estimate,total}'='500' AND v_result#>>'{estimate,eligible}'='0','maximum batch prepares and estimates without invented consent');
END;
$$;

-- Use the real approval and materialization functions with synthetic contacts.
-- Materialization only creates local queue rows; no email provider is called.
INSERT INTO auth.users(id,email) VALUES
  ('71800000-0000-4000-8000-000000000002','registered-blocked@example.test'),
  ('71800000-0000-4000-8000-000000000003','registered-ready@example.test');
INSERT INTO public.notification_preferences(user_id,categories,channels) VALUES
  ('71800000-0000-4000-8000-000000000002','{"marketing":true}','{"email":false}'),
  ('71800000-0000-4000-8000-000000000003','{"marketing":true}','{"email":true}');
INSERT INTO public.marketing_contacts(id,contact_type,display_name,email,user_id,lawful_basis,consent_source,consent_at,last_contact_at)
VALUES
('71810000-0000-4000-8000-000000000006','restaurant_lead','Récent','recent@example.test',NULL,'consent','Fixture',now(),now()),
('71810000-0000-4000-8000-000000000007','restaurant_lead','Réservé','reserved@example.test',NULL,'consent','Fixture',now(),NULL),
('71810000-0000-4000-8000-000000000008','restaurant_lead','Entreprise','business@example.test',NULL,'legitimate_interest',NULL,NULL,NULL),
('71810000-0000-4000-8000-000000000009','manual','Manuel','manual-interest@example.test',NULL,'legitimate_interest',NULL,NULL,NULL),
('71810000-0000-4000-8000-000000000010','registered_user','Préférence refusée','registered-blocked@example.test','71800000-0000-4000-8000-000000000002','consent','Fixture',now(),NULL),
('71810000-0000-4000-8000-000000000011','registered_user','Préférence autorisée','registered-ready@example.test','71800000-0000-4000-8000-000000000003','consent','Fixture',now(),NULL);
INSERT INTO public.marketing_integrations(id,provider,name,channel,status,capabilities)
VALUES ('71870000-0000-4000-8000-000000000001','mailing-fixture','Fixture sans fournisseur','email','connected','{"adapter_deployed":true}');
INSERT INTO public.marketing_automations(automation_key,name,status,conditions)
VALUES ('global_runtime','Runtime de fixture','active','{"global_pause":false,"frequency_cap_hours":72,"daily_cap":500}')
ON CONFLICT (automation_key) DO UPDATE SET status='active',conditions=EXCLUDED.conditions;

DO $$
DECLARE
  v_filter jsonb := '{"audience_kind":"mixed","recipient_emails":["ready@example.test","out@example.test","suppressed@example.test","registered@example.test","new@example.test","recent@example.test","reserved@example.test","business@example.test","manual-interest@example.test","registered-blocked@example.test","registered-ready@example.test"]}';
  v_copy jsonb := '{"mailing_version":"tok-mailing-v1","subject":"Objet","headline":"Titre","body":"Copie revue","call_to_action":"Découvrir","visual_status":"ready","visual_url":"https://assets.example.test/reviewed.png"}';
  v_schedule timestamptz := ((now() AT TIME ZONE 'Europe/Zurich')::date + 1 + time '12:00') AT TIME ZONE 'Europe/Zurich';
  v_daytime boolean := (now() AT TIME ZONE 'Europe/Zurich')::time >= time '08:00'
    AND (now() AT TIME ZONE 'Europe/Zurich')::time < time '20:00';
  v_result jsonb;
  v_invalid jsonb;
  v_invalid_id uuid;
BEGIN
  INSERT INTO public.marketing_campaigns(id,name,status,audience_definition,approved_at,approved_by)
  VALUES ('71850000-0000-4000-8000-000000000001','Campagne bornée','draft',v_filter,now(),'71800000-0000-4000-8000-000000000001');
  INSERT INTO public.marketing_calendar_items(id,campaign_id,integration_id,title,channel,scheduled_at,content,targeting)
  VALUES ('71860000-0000-4000-8000-000000000001','71850000-0000-4000-8000-000000000001',
    '71870000-0000-4000-8000-000000000001','E-mail sélectionné','email',v_schedule,v_copy,v_filter);
  INSERT INTO public.marketing_calendar_items(id,integration_id,title,channel,scheduled_at,content,targeting,status,approval_status,approved_at)
  VALUES ('71860000-0000-4000-8000-000000000002','71870000-0000-4000-8000-000000000001','Réservation existante',
    'email',v_schedule,v_copy,v_filter,'scheduled','approved',now());
  INSERT INTO public.marketing_deliveries(item_id,contact_id,channel,target_hash,status,scheduled_at)
  VALUES ('71860000-0000-4000-8000-000000000002','71810000-0000-4000-8000-000000000007','email','fixture-reservation','queued',now());

  v_result := public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_approve_marketing_item',
    jsonb_build_object('p_item_id','71860000-0000-4000-8000-000000000001','p_scheduled_at',v_schedule));
  PERFORM pg_temp.check_mailing_recipients(v_result->>'approval_status'='approved','exact-list draft approves through authenticated dispatcher');
  PERFORM pg_temp.check_mailing_recipients((SELECT audience_size=5 AND content=v_copy AND targeting=v_filter
    FROM public.marketing_calendar_items WHERE id='71860000-0000-4000-8000-000000000001'),'approval preserves copy and targeting and retains eligibility');
  IF v_daytime THEN
    v_result := public.service_materialize_marketing_deliveries('71860000-0000-4000-8000-000000000001',5000);
    PERFORM pg_temp.check_mailing_recipients(v_result->>'created'='3' AND v_result->>'total'='3','materialization retains frequency and reservation guards');
    PERFORM pg_temp.check_mailing_recipients((SELECT array_agg(contact_id ORDER BY contact_id)=ARRAY[
      '71810000-0000-4000-8000-000000000001'::uuid,'71810000-0000-4000-8000-000000000008'::uuid,'71810000-0000-4000-8000-000000000011'::uuid]
      FROM public.marketing_deliveries WHERE item_id='71860000-0000-4000-8000-000000000001'),'only eligible selected identities reserved');
    v_result := public.service_materialize_marketing_deliveries('71860000-0000-4000-8000-000000000001',5000);
    PERFORM pg_temp.check_mailing_recipients(v_result->>'created'='0' AND v_result->>'total'='3','materialization remains idempotent');
  ELSE
    PERFORM pg_temp.reject_mailing_recipients($q$SELECT public.service_materialize_marketing_deliveries('71860000-0000-4000-8000-000000000001',5000)$q$,'55000');
    PERFORM pg_temp.check_mailing_recipients(NOT EXISTS (SELECT 1 FROM public.marketing_deliveries
      WHERE item_id='71860000-0000-4000-8000-000000000001'),'quiet hours create no queue rows');
    RAISE NOTICE 'Positive materialization cases require 08:00–20:00 Europe/Zurich; quiet-hour rejection verified.';
  END IF;

  INSERT INTO public.marketing_calendar_items(id,integration_id,title,channel,scheduled_at,content,targeting)
  VALUES ('71860000-0000-4000-8000-000000000003','71870000-0000-4000-8000-000000000001',
    'Audience historique','email',v_schedule,v_copy,'{"audience_kind":"restaurant","selections":{}}');
  PERFORM public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_approve_marketing_item',
    jsonb_build_object('p_item_id','71860000-0000-4000-8000-000000000003','p_scheduled_at',v_schedule));
  PERFORM pg_temp.check_mailing_recipients((SELECT audience_size=5 FROM public.marketing_calendar_items
    WHERE id='71860000-0000-4000-8000-000000000003'),'legacy restaurant approval unchanged');
  IF v_daytime THEN
    v_result := public.service_materialize_marketing_deliveries('71860000-0000-4000-8000-000000000003',5000);
    PERFORM pg_temp.check_mailing_recipients(v_result->>'created'='1' AND EXISTS (SELECT 1 FROM public.marketing_deliveries
      WHERE item_id='71860000-0000-4000-8000-000000000003' AND contact_id='71810000-0000-4000-8000-000000000005'),'legacy selection retains cross-campaign reservations');
  END IF;

  FOR v_invalid IN SELECT * FROM (VALUES
    ('{"audience_kind":"mixed","recipient_emails":[]}'::jsonb),
    ('{"audience_kind":"mixed","recipient_emails":["absent@example.test"]}'::jsonb),
    ('{"audience_kind":"mixed","recipient_emails":["ready@example.test"],"city":"Genève"}'::jsonb)
  ) invalid(value) LOOP
    v_invalid_id := gen_random_uuid();
    INSERT INTO public.marketing_calendar_items(id,integration_id,title,channel,scheduled_at,content,targeting)
    VALUES (v_invalid_id,'71870000-0000-4000-8000-000000000001','Audience refusée','email',v_schedule,v_copy,v_invalid);
    PERFORM pg_temp.reject_mailing_recipients(format('SELECT public.service_execute_marketing_admin_operation(%L,%L,%L,%L::jsonb)',
      repeat('a',64),repeat('b',64),'admin_approve_marketing_item',jsonb_build_object('p_item_id',v_invalid_id,'p_scheduled_at',v_schedule)::text),'22023');
    PERFORM pg_temp.check_mailing_recipients((SELECT status='draft' AND approval_status='pending'
      FROM public.marketing_calendar_items WHERE id=v_invalid_id),'invalid or empty audience cannot approve');
    IF v_daytime THEN
      UPDATE public.marketing_calendar_items SET status='scheduled',approval_status='approved',approved_at=now() WHERE id=v_invalid_id;
      IF v_invalid='{"audience_kind":"mixed","recipient_emails":["absent@example.test"]}'::jsonb THEN
        v_result := public.service_materialize_marketing_deliveries(v_invalid_id,5000);
        PERFORM pg_temp.check_mailing_recipients(v_result->>'created'='0','unmatched explicit audience remains empty at dispatch');
      ELSE
        PERFORM pg_temp.reject_mailing_recipients(format('SELECT public.service_materialize_marketing_deliveries(%L::uuid,5000)',v_invalid_id),'22023');
      END IF;
      PERFORM pg_temp.check_mailing_recipients(NOT EXISTS (SELECT 1 FROM public.marketing_deliveries WHERE item_id=v_invalid_id),'invalid stored targeting cannot reserve contacts');
    END IF;
  END LOOP;
  UPDATE public.marketing_campaigns SET approved_at=NULL WHERE id='71850000-0000-4000-8000-000000000001';
  PERFORM pg_temp.reject_mailing_recipients($q$SELECT public.service_materialize_marketing_deliveries('71860000-0000-4000-8000-000000000001',5000)$q$,'42501');
  UPDATE public.marketing_automations SET conditions=jsonb_set(conditions,'{global_pause}','true') WHERE automation_key='global_runtime';
  PERFORM pg_temp.reject_mailing_recipients($q$SELECT public.service_materialize_marketing_deliveries('71860000-0000-4000-8000-000000000003',5000)$q$,'55000');
END;
$$;

DELETE FROM public.user_roles WHERE user_id='71800000-0000-4000-8000-000000000001' AND role='admin';
SET LOCAL ROLE service_role;
SELECT pg_temp.reject_mailing_recipients($q$SELECT public.service_execute_marketing_admin_operation(repeat('a',64),repeat('b',64),'admin_prepare_marketing_mailing_recipients','{"p_emails":["new@example.test"]}')$q$,'42501');
RESET ROLE;
SELECT 'PASS mailing recipients: exact targeting, bounded estimate/approval/materialization, normalization, idempotence, eligibility, role/session/CSRF and audit privacy';
ROLLBACK;
