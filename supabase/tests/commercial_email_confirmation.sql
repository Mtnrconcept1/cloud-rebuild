-- Only on the disposable localhost PostgreSQL fixture; no live e-mail or actual signatory.
CREATE FUNCTION pg_temp.check_ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label;END IF;END$$;
CREATE FUNCTION pg_temp.check_error(query text,state text,label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean:=false;
BEGIN BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN caught:=true; IF SQLSTATE<>state THEN RAISE EXCEPTION 'FAIL %: expected %, got % (%)',label,state,SQLSTATE,SQLERRM;END IF;END;
IF NOT caught THEN RAISE EXCEPTION 'FAIL %: no error',label;END IF;END$$;
CREATE FUNCTION pg_temp.sign_confirm(mail text,request uuid) RETURNS jsonb LANGUAGE sql AS $$
SELECT public.commercial_record_signed_email_consent_v2(1,'Restaurant double confirmation',mail,'Signataire Test','Gérant',
(SELECT signature_data FROM test_fixture.signature),true,public.commercial_get_email_consent_context(1)->>'document_hash',request)$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.check_error('SELECT * FROM public.commercial_email_confirmations','42501','no direct private read');
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('a',64),'confirm')$q$,'42501','commercial cannot confirm a mailbox');
SELECT pg_temp.check_error('SELECT public.commercial_consent_email_payload(gen_random_uuid())','42501','commercial cannot obtain email payload/token');
SELECT set_config('test.double',pg_temp.sign_confirm('double@example.com','00000000-0000-4000-8000-000000000201')::text,false);
SELECT pg_temp.check_ok(current_setting('test.double')::jsonb->>'confirmation_state'='pending','signature stays pending');
SELECT pg_temp.check_ok(current_setting('test.double')::jsonb->'withdrawn'='false'::jsonb,'pending signature is not a withdrawal');
SELECT pg_temp.check_ok(current_setting('test.double')::jsonb->'email_eligible'='false'::jsonb,'signature cannot grant campaigns');
SELECT pg_temp.check_ok(current_setting('test.double')::jsonb->'email_verified'='false'::jsonb,'mailbox not yet verified');
SELECT pg_temp.check_ok(NOT(current_setting('test.double')::jsonb ? 'token_hash'),'no confirmation hash exposed to collector');
SELECT pg_temp.check_ok(pg_temp.sign_confirm('double@example.com','00000000-0000-4000-8000-000000000201')->>'receipt_id'=current_setting('test.double')::jsonb->>'receipt_id','same signature retry returns original');
RESET ROLE;
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.commercial_email_confirmations WHERE email='double@example.com'),'one confirmation for retried signature');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.email_queue WHERE to_email='double@example.com'),'one transactional outbox row');
SELECT pg_temp.check_ok((SELECT status='consent_pending' AND body_html IS NULL AND body_text IS NULL AND NOT(metadata ? 'token') FROM public.email_queue WHERE to_email='double@example.com'),'old generic worker cannot claim the consent outbox');
SELECT pg_temp.check_ok((SELECT lawful_basis='none' AND NOT public.marketing_contact_is_eligible(id,'email') FROM public.marketing_contacts WHERE email_normalized='double@example.com'),'no lawful basis granted on capture');
SELECT pg_temp.check_ok((SELECT count(*)=0 FROM public.marketing_lawful_basis_evidence WHERE source_reference=current_setting('test.double')::jsonb->>'receipt_id'),'no granted/reaffirmed event before mailbox approval');
-- Reimport cannot bypass the authoritative private gate, even with another legal basis.
UPDATE public.marketing_contacts SET lawful_basis='legitimate_interest',metadata=metadata||'{"lawful_basis_evidence":{"source":"test","note":"Imported fixture for gating regression"}}'::jsonb WHERE email_normalized='double@example.com';
SELECT pg_temp.check_ok((SELECT NOT public.marketing_contact_is_eligible(id,'email') AND NOT public.marketing_contact_is_eligible(id,'manual_email') FROM public.marketing_contacts WHERE email_normalized='double@example.com'),'reimport does not bypass pending confirmation');
SELECT set_config('test.queue',(SELECT queue_id::text FROM public.commercial_email_confirmations WHERE email='double@example.com'),false);
SET ROLE service_role;
SELECT pg_temp.check_error($q$UPDATE public.commercial_email_confirmations SET confirmed_at=now()$q$,'42501','no direct service table write');
SELECT pg_temp.check_ok(public.commercial_consent_email_payload(current_setting('test.queue')::uuid)->>'email'='double@example.com','server payload recipient is signed recipient');
SELECT set_config('test.claim',public.commercial_claim_consent_email(current_setting('test.queue')::uuid,repeat('a',64),repeat('b',64))::text,false);
SELECT pg_temp.check_ok(public.commercial_claim_consent_email(current_setting('test.queue')::uuid,repeat('a',64),repeat('b',64)) IS NULL,'no concurrent double send claim');
SELECT pg_temp.check_ok(public.commercial_consent_public_action(repeat('a',64),'view')->>'state'='pending','receipt view never confirms');
SELECT pg_temp.check_ok(public.commercial_settle_consent_email(current_setting('test.queue')::uuid,(current_setting('test.claim')::jsonb->>'lease_token')::uuid,'provider-id',NULL),'provider acceptance is settled');
SELECT pg_temp.check_ok(public.commercial_consent_public_action(repeat('a',64),'view')->>'state'='pending','accepted mail is not consent');
SELECT pg_temp.check_ok(public.commercial_consent_public_action(repeat('a',64),'confirm')->>'state'='confirmed','explicit confirmation succeeds');
SELECT pg_temp.check_ok(public.commercial_consent_public_action(repeat('a',64),'confirm')->'email_eligible'='true'::jsonb,'repeat confirmation is idempotent');
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('c',64),'confirm')$q$,'22023','forged token rejected');
RESET ROLE;
SELECT pg_temp.check_ok((SELECT email_verified=false FROM public.commercial_email_consent_receipts WHERE id=(current_setting('test.double')::jsonb->>'receipt_id')::uuid),'original signature is unchanged');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.audit_log WHERE action='commercial_consent_mail_confirmed' AND entity_id=(current_setting('test.double')::jsonb->>'receipt_id')::uuid),'confirmation audit exactly once');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.marketing_lawful_basis_evidence WHERE source_reference=current_setting('test.double')::jsonb->>'receipt_id'),'one confirmation basis event');
SET ROLE authenticated;
SELECT pg_temp.check_ok(public.commercial_get_email_consent_receipt((current_setting('test.double')::jsonb->>'receipt_id')::uuid)->'email_verified'='true'::jsonb,'combined receipt records mailbox confirmation');
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('a',64),'withdraw')$q$,'42501','withdrawal RPC not directly callable by commercial');
RESET ROLE;
-- A pending delivery is cancelled on withdrawal.
INSERT INTO public.marketing_deliveries(id,contact_id,status) SELECT gen_random_uuid(),id,'queued' FROM public.marketing_contacts WHERE email_normalized='double@example.com';
SET ROLE service_role;
SELECT pg_temp.check_ok(public.commercial_consent_public_action(repeat('a',64),'withdraw')->>'state'='withdrawn','mailbox holder can withdraw');
SELECT pg_temp.check_ok(public.commercial_consent_public_action(repeat('a',64),'withdraw')->>'state'='withdrawn','withdrawal is idempotent');
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('a',64),'confirm')$q$,'42501','old link cannot clear withdrawal');
RESET ROLE;
SELECT pg_temp.check_ok((SELECT bool_and(status='cancelled') FROM public.marketing_deliveries),'queued campaigns cancelled');
SELECT pg_temp.check_ok((SELECT NOT public.marketing_contact_is_eligible(id,'email') FROM public.marketing_contacts WHERE email_normalized='double@example.com'),'withdrawal blocks future campaigns');
SELECT pg_temp.check_error($q$UPDATE public.commercial_email_confirmations SET revoked_at=NULL WHERE email='double@example.com'$q$,'42501','revocation immutable');

-- Expiration, provider retry and supersession use distinct synthetic addresses.
SET ROLE authenticated;
SELECT pg_temp.sign_confirm('expired@example.com','00000000-0000-4000-8000-000000000202');
SELECT pg_temp.sign_confirm('retry@example.com','00000000-0000-4000-8000-000000000203');
SELECT pg_temp.sign_confirm('supersede@example.com','00000000-0000-4000-8000-000000000204');
RESET ROLE;
SELECT set_config('test.expired_queue',(SELECT queue_id::text FROM public.commercial_email_confirmations WHERE email='expired@example.com'),false);
SELECT set_config('test.retry_queue',(SELECT queue_id::text FROM public.commercial_email_confirmations WHERE email='retry@example.com'),false);
SELECT set_config('test.supersede_queue',(SELECT queue_id::text FROM public.commercial_email_confirmations WHERE email='supersede@example.com'),false);
SET ROLE service_role;
SELECT public.commercial_claim_consent_email(current_setting('test.expired_queue')::uuid,repeat('d',64),repeat('b',64));
SELECT public.commercial_claim_consent_email(current_setting('test.supersede_queue')::uuid,repeat('e',64),repeat('b',64));
SELECT set_config('test.retry_claim',public.commercial_claim_consent_email(current_setting('test.retry_queue')::uuid,repeat('f',64),repeat('b',64))::text,false);
SELECT public.commercial_settle_consent_email(current_setting('test.retry_queue')::uuid,(current_setting('test.retry_claim')::jsonb->>'lease_token')::uuid,NULL,'provider_http_503');
RESET ROLE;
SELECT pg_temp.check_ok((SELECT delivery_state='retry' AND confirmed_at IS NULL FROM public.commercial_email_confirmations WHERE email='retry@example.com'),'provider failure is retryable, never confirmed');
UPDATE public.commercial_email_confirmations SET retry_after=now()-interval '1 minute' WHERE email='retry@example.com';
-- Fixture clock advancement: changing signed deadlines requires owner-only disabled trigger in disposable DB.
ALTER TABLE public.commercial_email_confirmations DISABLE TRIGGER commercial_confirmation_protect;
UPDATE public.commercial_email_confirmations SET requested_at=now()-interval '3 days',expires_at=now()-interval '1 day' WHERE email='expired@example.com';
ALTER TABLE public.commercial_email_confirmations ENABLE TRIGGER commercial_confirmation_protect;
SET ROLE service_role;
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('d',64),'confirm')$q$,'22023','expired confirmation denied');
SELECT public.commercial_recover_consent_emails();
SELECT pg_temp.check_ok(public.commercial_claim_consent_email(current_setting('test.retry_queue')::uuid,repeat('f',64),repeat('b',64)) IS NOT NULL,'same-token same-payload retry accepted');
RESET ROLE;
UPDATE public.commercial_email_confirmations SET lease_until=now()-interval '1 minute',first_attempt_at=now()-interval '25 hours' WHERE email='retry@example.com';
SET ROLE service_role;
SELECT public.commercial_recover_consent_emails();
SELECT pg_temp.check_ok(public.commercial_claim_consent_email(current_setting('test.retry_queue')::uuid,repeat('f',64),repeat('b',64)) IS NULL,'no retry after provider idempotency window');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.sign_confirm('supersede@example.com','00000000-0000-4000-8000-000000000205');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('e',64),'confirm')$q$,'42501','superseded link cannot authorize');
RESET ROLE;
UPDATE public.marketing_contacts SET suppression_reason='provider_bounced' WHERE email_normalized='supersede@example.com';
SELECT pg_temp.check_ok((SELECT bool_and(revoked_at IS NOT NULL) FROM public.commercial_email_confirmations WHERE email='supersede@example.com'),'provider suppression permanently revokes all links');
SELECT pg_temp.check_ok((SELECT count(*)=1 FROM public.commercial_email_confirmations WHERE email='supersede@example.com' AND superseded_at IS NULL),'one current confirmation');
SET ROLE anon;
SELECT pg_temp.check_error($q$SELECT public.commercial_consent_public_action(repeat('a',64),'view')$q$,'42501','public clients cannot bypass Edge boundary');
SELECT pg_temp.check_error('SELECT * FROM public.commercial_email_confirmations','42501','anonymous confirmation table protected');
RESET ROLE;
SELECT 'PASS: mailbox confirmation, outbox, service boundary, immutable evidence, opt-out, expiry, idempotency and retry assertions';

-- Upgrading an imported prospect is email-only, even when broad notification preferences exist.
INSERT INTO public.marketing_contacts(email,phone,user_id,contact_type,lawful_basis,display_name,metadata)
 VALUES('imported-scope@example.com','0791234567','00000000-0000-4000-8000-000000000005','restaurant_prospect','legitimate_interest','Imported prospect',
 '{"lawful_basis_evidence":{"source":"test_fixture","note":"Imported prospect scope regression"}}');
UPDATE public.notification_preferences SET channels='{"email":true,"push":true,"in_app":true}' WHERE user_id='00000000-0000-4000-8000-000000000005';
SET ROLE authenticated;
SELECT pg_temp.sign_confirm('imported-scope@example.com','00000000-0000-4000-8000-000000000206');
RESET ROLE;
SELECT set_config('test.scope_queue',(SELECT queue_id::text FROM public.commercial_email_confirmations WHERE email='imported-scope@example.com'),false);
SET ROLE service_role;
SELECT public.commercial_claim_consent_email(current_setting('test.scope_queue')::uuid,repeat('9',64),repeat('8',64));
SELECT public.commercial_consent_public_action(repeat('9',64),'confirm');
RESET ROLE;
SELECT pg_temp.check_ok((SELECT public.marketing_contact_is_eligible(id,'email') AND NOT public.marketing_contact_is_eligible(id,'push') AND NOT public.marketing_contact_is_eligible(id,'in_app') AND NOT public.marketing_contact_is_eligible(id,'manual_call') FROM public.marketing_contacts WHERE email_normalized='imported-scope@example.com'),'mailbox approval never grants another channel to an imported prospect');
UPDATE public.notification_preferences SET channels='{"email":false,"push":true,"in_app":true}' WHERE user_id='00000000-0000-4000-8000-000000000005';
SELECT pg_temp.check_ok((SELECT NOT public.marketing_contact_is_eligible(id,'email') FROM public.marketing_contacts WHERE email_normalized='imported-scope@example.com'),'mailbox approval does not override email preferences');
