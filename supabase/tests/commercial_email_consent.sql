-- Executed ONLY by scripts/test-commercial-consent-postgres.mjs on a disposable localhost DB.
CREATE SCHEMA test_fixture;
CREATE TABLE test_fixture.signature(signature_data text);
INSERT INTO test_fixture.signature VALUES ('__SIGNATURE_FIXTURE__');
GRANT USAGE ON SCHEMA test_fixture TO authenticated;
GRANT SELECT ON test_fixture.signature TO authenticated;
INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,5) i;
INSERT INTO public.user_roles VALUES
 ('00000000-0000-4000-8000-000000000001','commercial'),('00000000-0000-4000-8000-000000000002','commercial'),
 ('00000000-0000-4000-8000-000000000003','commercial'),('00000000-0000-4000-8000-000000000004','admin'),('00000000-0000-4000-8000-000000000005','client');
INSERT INTO public.commercial_compensation_profiles(user_id,status) VALUES ('00000000-0000-4000-8000-000000000003','inactive');
INSERT INTO public.commercial_prospect_catalog(source_objectid) VALUES(1),(2),(3);
INSERT INTO public.commercial_prospect_followups VALUES(2,'00000000-0000-4000-8000-000000000002');
CREATE FUNCTION pg_temp.assert_true(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label;END IF;END$$;
CREATE FUNCTION pg_temp.expect_error(query text,state text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN
 BEGIN EXECUTE query;
 EXCEPTION WHEN OTHERS THEN caught:=true; IF SQLSTATE<>state THEN RAISE EXCEPTION 'FAIL %: expected %, got % (%)',label,state,SQLSTATE,SQLERRM; END IF; END;
 IF NOT caught THEN RAISE EXCEPTION 'FAIL %: no error',label; END IF;
END$$;
CREATE FUNCTION pg_temp.sign(mail text,request_id uuid,consent boolean DEFAULT true,doc_hash text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.commercial_record_signed_email_consent_v2(1,'Restaurant test',mail,'Personne Test','Gérant',(SELECT signature_data FROM test_fixture.signature),consent,
  coalesce(doc_hash,public.commercial_get_email_consent_context(1)->>'document_hash'),request_id)
$$;

SET ROLE anon;
SELECT pg_temp.expect_error('SELECT public.commercial_get_email_consent_context(1)','42501','anonymous RPC');
SELECT pg_temp.expect_error('SELECT * FROM public.commercial_email_consent_receipts','42501','anonymous table');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SELECT pg_temp.expect_error('SELECT public.commercial_get_email_consent_context(1)','42501','client role');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.expect_error('SELECT public.commercial_get_email_consent_context(1)','42501','inactive commercial');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.expect_error('SELECT public.commercial_get_email_consent_context(2)','42501','prospect assignment');
SELECT pg_temp.expect_error('SELECT public.commercial_get_email_consent_context(999)','22023','unknown prospect');
SELECT pg_temp.assert_true(public.commercial_get_email_consent_context(1)->'document'='null'::jsonb,'missing controller stays unconfigured');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('owner@example.com','00000000-0000-4000-8000-000000000010',true,repeat('a',64))$q$,'22023','missing controller blocks signature');
SELECT pg_temp.expect_error($q$SELECT public.commercial_configure_email_consent_controller(1,'Exploitant test','Rue de test 1, Genève','contact@example.com',true)$q$,'42501','commercial cannot configure controller');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
SELECT pg_temp.expect_error($q$SELECT public.commercial_configure_email_consent_controller(1,'Exploitant test','Rue de test 1, Genève','contact@example.com',true)$q$,'42501','admin requires MFA');
SELECT set_config('test.aal','aal2',false);
SELECT public.commercial_configure_email_consent_controller(1,'Exploitant test','Rue de test 1, Genève','contact@example.com',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT set_config('test.aal','aal1',false);
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('owner@example.com','00000000-0000-4000-8000-000000000010',false)$q$,'22023','explicit approval required');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('owner@example.com','00000000-0000-4000-8000-000000000010',true,repeat('b',64))$q$,'22023','document hash binding');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('invalid','00000000-0000-4000-8000-000000000010')$q$,'22023','invalid email');
SELECT pg_temp.expect_error($q$SELECT public.commercial_record_signed_email_consent_v2(1,'Restaurant test','owner@example.com','Personne Test','Gérant','data:image/png;base64,iVBORw0KGgo'||repeat('A',200),true,public.commercial_get_email_consent_context(1)->>'document_hash','00000000-0000-4000-8000-000000000010')$q$,'22023','invalid PNG dimensions');
SELECT set_config('test.connector_allowed','false',false);
SELECT pg_temp.expect_error('SELECT public.commercial_get_email_consent_context(1)','42501','connector isolation');
SELECT set_config('test.connector_allowed','true',false);
SELECT set_config('test.receipt',pg_temp.sign(' OWNER@EXAMPLE.COM ','00000000-0000-4000-8000-000000000010')::text,false);
SELECT pg_temp.assert_true((current_setting('test.receipt')::jsonb->>'email_eligible')::boolean,'native signature grants email consent');
SELECT pg_temp.assert_true(current_setting('test.receipt')::jsonb->'email_verified'='false'::jsonb,'mailbox not verified');
SELECT pg_temp.assert_true(current_setting('test.receipt')::jsonb->>'evidence_quality'='system_event','captured proof not identity verified');
SELECT pg_temp.assert_true(pg_temp.sign('owner@example.com','00000000-0000-4000-8000-000000000010')->>'receipt_id'=current_setting('test.receipt')::jsonb->>'receipt_id','idempotent retry');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('different@example.com','00000000-0000-4000-8000-000000000010')$q$,'22023','request id bound to payload');
SELECT pg_temp.sign('first.last@example.com','00000000-0000-4000-8000-000000000011');
SELECT pg_temp.assert_true(NOT(public.commercial_get_email_consent_context(1)->'latest' ? 'signature_data'),'context does not leak signature');
SELECT pg_temp.expect_error('SELECT * FROM public.commercial_email_consent_receipts','42501','authenticated cannot read private proofs directly');
SELECT pg_temp.expect_error('SELECT * FROM public.tok_consent_settings','42501','controller cannot be overwritten directly');
SELECT pg_temp.expect_error($q$INSERT INTO public.commercial_email_consent_receipts DEFAULT VALUES$q$,'42501','no direct forged insert');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT pg_temp.expect_error(format('SELECT public.commercial_get_email_consent_receipt(%L)',current_setting('test.receipt')::jsonb->>'receipt_id'),'42501','other commercial cannot read proof');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.marketing_lawful_basis_evidence e WHERE source_reference=current_setting('test.receipt')::jsonb->>'receipt_id'),'one automatic evidence, not duplicate');
SELECT pg_temp.assert_true((SELECT evidence_quality='system_event' AND lawful_basis_before='none' AND lawful_basis_after='consent' FROM public.marketing_lawful_basis_evidence WHERE source_reference=current_setting('test.receipt')::jsonb->>'receipt_id'),'correct provenance and transition');
SELECT pg_temp.assert_true((SELECT last_verified_at IS NULL AND metadata->>'commercial_email_consent_only'='true' AND NOT(metadata ? 'signature_data') FROM public.marketing_contacts WHERE email_normalized='owner@example.com'),'scope and no fake email verification');
SELECT pg_temp.assert_true(coalesce(current_setting('app.marketing_lawful_basis_context',true),'')='','trigger context restored');
SELECT pg_temp.expect_error($q$UPDATE public.commercial_email_consent_receipts SET signer_name='Changed' WHERE email='owner@example.com'$q$,'42501','proof immutable');

-- New e-mail permission on an existing unauthorised contact must not create call/push rights.
INSERT INTO public.marketing_contacts(email,phone,user_id,display_name) VALUES('scope@example.com','0791234567','00000000-0000-4000-8000-000000000005','Scope fixture');
INSERT INTO public.notification_preferences VALUES('00000000-0000-4000-8000-000000000005','{"marketing":true}','{"email":true,"push":true,"in_app":true}');
INSERT INTO public.marketing_contacts(email,lawful_basis,source_system,display_name,metadata) VALUES('legacy@example.com','existing_customer','test_fixture','Existing customer','{"lawful_basis_evidence":{"source":"test_fixture","note":"Preexisting customer fixture for regression test"}}');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.sign('scope@example.com','00000000-0000-4000-8000-000000000012');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT public.marketing_contact_is_eligible(id,'email') AND NOT public.marketing_contact_is_eligible(id,'manual_call') AND NOT public.marketing_contact_is_eligible(id,'push') AND NOT public.marketing_contact_is_eligible(id,'in_app') FROM public.marketing_contacts WHERE email_normalized='scope@example.com'),'email consent cannot expand other channels');
SELECT pg_temp.assert_true((SELECT public.marketing_contact_is_eligible(id,'email') FROM public.marketing_contacts WHERE email_normalized='legacy@example.com'),'unrelated customer eligibility preserved');
UPDATE public.notification_preferences SET channels='{"email":false,"push":true,"in_app":true}';
SELECT pg_temp.assert_true((SELECT NOT public.marketing_contact_is_eligible(id,'email') FROM public.marketing_contacts WHERE email_normalized='scope@example.com'),'notification preference preserved');

INSERT INTO public.marketing_contacts(email,display_name,opted_out_at,lifecycle_status) VALUES('optedout@example.com','Opted out fixture',now(),'opted_out');
INSERT INTO public.marketing_contacts(email,display_name,suppression_reason) VALUES('suppressed@example.com','Suppression fixture','provider_bounced');
INSERT INTO public.marketing_contacts(email,display_name,metadata) VALUES('metadata@example.com','Suppression flag fixture','{"email_suppressed":true}');
SET ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('optedout@example.com','00000000-0000-4000-8000-000000000020')$q$,'42501','opt-out preserved');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('suppressed@example.com','00000000-0000-4000-8000-000000000021')$q$,'42501','provider suppression preserved');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('metadata@example.com','00000000-0000-4000-8000-000000000022')$q$,'42501','metadata suppression preserved');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.commercial_email_consent_receipts WHERE email IN('optedout@example.com','suppressed@example.com','metadata@example.com')),'blocked attempts write no proof');
UPDATE public.marketing_contacts SET opted_out_at=now(),lifecycle_status='opted_out',lawful_basis='none' WHERE email_normalized='owner@example.com';
SET ROLE authenticated;
SELECT pg_temp.assert_true((pg_temp.sign('owner@example.com','00000000-0000-4000-8000-000000000010')->>'withdrawn')::boolean,'retry after withdrawal never reactivates');
SELECT pg_temp.expect_error($q$SELECT pg_temp.sign('owner@example.com','00000000-0000-4000-8000-000000000023')$q$,'42501','new signature cannot bypass earlier opposition');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT lawful_basis='none' AND opted_out_at IS NOT NULL FROM public.marketing_contacts WHERE email_normalized='owner@example.com'),'withdrawal still authoritative');
SELECT pg_temp.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('public.commercial_email_consent_receipts'::regclass,'public.tok_consent_settings'::regclass)),'RLS active');
SELECT 'PASS: commercial consent SQL regression assertions';
