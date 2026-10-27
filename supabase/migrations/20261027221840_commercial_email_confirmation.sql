-- Mailbox confirmation is separate from the immutable in-person signature.
-- Additive follow-up to 20261027161000; no historical proof or permission is invented.
BEGIN;
CREATE TABLE IF NOT EXISTS public.commercial_email_confirmations (
 receipt_id uuid PRIMARY KEY REFERENCES public.commercial_email_consent_receipts(id),
 contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id),
 email text NOT NULL,
 queue_id uuid UNIQUE NOT NULL REFERENCES public.email_queue(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '48 hours'),
 token_hash text UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 payload_hash text CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 confirmed_at timestamptz,
 revoked_at timestamptz,
 superseded_at timestamptz,
 delivery_state text NOT NULL DEFAULT 'queued' CHECK(delivery_state IN ('queued','processing','retry','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 first_attempt_at timestamptz,
 retry_after timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 provider_message_id text,
 error_code text,
 CHECK(expires_at>requested_at),
 CHECK(confirmed_at IS NULL OR token_hash IS NOT NULL)
);
ALTER TABLE public.commercial_email_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_email_confirmations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.commercial_email_confirmations TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS commercial_email_confirmation_current_idx ON public.commercial_email_confirmations(contact_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS commercial_email_confirmation_recovery_idx ON public.commercial_email_confirmations(delivery_state,retry_after,lease_until) WHERE delivery_state IN ('retry','processing');
CREATE INDEX IF NOT EXISTS commercial_email_confirmation_rate_idx ON public.commercial_email_confirmations(email,requested_at DESC);

CREATE OR REPLACE FUNCTION public.commercial_confirmation_protect()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.receipt_id IS DISTINCT FROM OLD.receipt_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
 OR NEW.email IS DISTINCT FROM OLD.email OR NEW.queue_id IS DISTINCT FROM OLD.queue_id
 OR NEW.requested_at IS DISTINCT FROM OLD.requested_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
 OR (OLD.token_hash IS NOT NULL AND NEW.token_hash IS DISTINCT FROM OLD.token_hash)
 OR (OLD.payload_hash IS NOT NULL AND NEW.payload_hash IS DISTINCT FROM OLD.payload_hash)
 OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
 OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
 OR (OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at)
 THEN RAISE EXCEPTION 'consent_confirmation_is_immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_confirmation_protect() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS commercial_confirmation_protect ON public.commercial_email_confirmations;
CREATE TRIGGER commercial_confirmation_protect BEFORE UPDATE ON public.commercial_email_confirmations FOR EACH ROW EXECUTE FUNCTION public.commercial_confirmation_protect();

-- An opt-out, suppression or recipient change permanently invalidates old links.
CREATE OR REPLACE FUNCTION public.commercial_confirmation_revoke_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.email_normalized IS DISTINCT FROM OLD.email_normalized OR NEW.opted_out_at IS NOT NULL
 OR NEW.lifecycle_status='opted_out' OR NEW.suppression_reason IS NOT NULL
 OR coalesce(NEW.metadata->>'email_suppressed','false') NOT IN ('false','0','')
 OR (OLD.lawful_basis<>'none' AND NEW.lawful_basis='none') THEN
   UPDATE public.commercial_email_confirmations SET revoked_at=now(),
     delivery_state=CASE WHEN delivery_state='sent' THEN 'sent' ELSE 'cancelled' END
     WHERE contact_id=NEW.id AND revoked_at IS NULL;
   UPDATE public.email_queue q SET status='cancelled',error='consent_revoked'
     FROM public.commercial_email_confirmations c WHERE c.contact_id=NEW.id AND q.id=c.queue_id
     AND q.status IN ('queued','consent_pending','processing','failed');
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_confirmation_revoke_contact() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS commercial_confirmation_revoke_contact ON public.marketing_contacts;
CREATE TRIGGER commercial_confirmation_revoke_contact AFTER UPDATE OF email,opted_out_at,lifecycle_status,suppression_reason,metadata,lawful_basis
 ON public.marketing_contacts FOR EACH ROW EXECUTE FUNCTION public.commercial_confirmation_revoke_contact();

CREATE OR REPLACE FUNCTION public.commercial_consent_document()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', 'tok-b2b-mail-confirmation-v3-2026-10-27',
    'controller', s.controller, 'address', s.address, 'contact', s.email,
    'text', 'Je déclare être habilité(e) à utiliser l’adresse professionnelle indiquée pour le restaurant renseigné. J’autorise le responsable identifié ci-dessus à m’envoyer par e-mail des présentations, propositions de démonstration, nouveautés et offres commerciales relatives aux services TOK pour les restaurateurs. Je signe personnellement cette demande et demande l’envoi, à cette adresse, de sa copie et de ma signature. Mon adresse ne sera autorisée pour les campagnes qu’après ma confirmation explicite « JE CONSENS » depuis l’e-mail reçu. La simple ouverture du lien ne confirme rien. Cet accord est libre et facultatif : il n’engage aucun abonnement, achat ou paiement. Il ne couvre ni les appels, ni les SMS, ni la prospection de tiers. Je peux le retirer à tout moment et sans frais, par le lien de désabonnement de chaque e-mail commercial ou en écrivant à l’adresse de contact ci-dessus.',
    'privacy', 'Le nom du restaurant, vos nom et fonction, votre adresse e-mail, le texte accepté, le tracé de signature, la date serveur et l’identifiant du commercial collecteur sont conservés pour gérer votre consentement et en documenter la preuve. Les données sont réservées aux personnes TOK habilitées ; le consentement et les éventuelles oppositions sont transmis au module Marketing TOK. Le retrait bloque les futurs envois ; la preuve peut être conservée dans la mesure nécessaire à la justification des choix et aux obligations applicables. Vous pouvez demander accès, rectification ou effacement au contact indiqué ci-dessus, sous réserve des obligations de conservation. La confirmation par e-mail documente l’accès au lien personnel envoyé à cette boîte, pas l’identité civile ni les pouvoirs du signataire. Signature électronique simple, sans certificat qualifié. Le lien de confirmation expire après 48 heures. Une copie et la signature transitent via notre prestataire d’envoi Resend ; ne transférez pas ce lien personnel. Les informations complémentaires sur les prestataires et les transferts figurent dans la politique de confidentialité TOK.'
  ) FROM public.tok_consent_settings s WHERE s.id IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public.marketing_contact_is_eligible(p_contact_id uuid, p_channel text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT c.opted_out_at IS NULL
    AND (coalesce(c.metadata->>'commercial_email_consent_only', 'false') <> 'true'
      OR (p_channel IN ('email', 'manual_email') AND c.suppression_reason IS NULL AND c.lifecycle_status <> 'opted_out'))
    AND CASE
      WHEN p_channel IN ('email','manual_email') THEN
        c.email_normalized IS NOT NULL
        -- Private gate cannot be cleared by a contact import or editable metadata.
        AND NOT EXISTS (SELECT 1 FROM public.commercial_email_confirmations confirmation
          WHERE confirmation.contact_id=c.id AND confirmation.superseded_at IS NULL
            AND (confirmation.confirmed_at IS NULL OR confirmation.revoked_at IS NOT NULL
              OR confirmation.email IS DISTINCT FROM c.email_normalized))
        AND COALESCE((c.metadata ->> 'email_suppressed')::boolean, false) IS FALSE
        AND (c.lawful_basis IN ('consent','existing_customer') OR (c.lawful_basis = 'legitimate_interest' AND c.contact_type IN ('restaurant_prospect','restaurant_lead')))
        AND (c.user_id IS NULL OR EXISTS (SELECT 1 FROM public.notification_preferences p WHERE p.user_id = c.user_id
          AND COALESCE((p.categories ->> 'marketing')::boolean, false) AND COALESCE((p.channels ->> 'email')::boolean, true)))
      WHEN p_channel IN ('push','in_app') THEN
        c.user_id IS NOT NULL AND c.lawful_basis IN ('consent','existing_customer')
        AND EXISTS (SELECT 1 FROM public.notification_preferences p WHERE p.user_id = c.user_id
          AND COALESCE((p.categories ->> 'marketing')::boolean, false) AND COALESCE((p.channels ->> p_channel)::boolean, true))
      WHEN p_channel = 'manual_call' THEN c.phone_normalized IS NOT NULL AND c.lawful_basis IN ('consent','existing_customer','legitimate_interest')
      WHEN p_channel = 'manual_visit' THEN false
      WHEN p_channel IN ('tok_news','instagram','facebook','linkedin','tiktok','youtube','telegram','google_business','website') THEN false
      ELSE false END
    FROM public.marketing_contacts c WHERE c.id = p_contact_id), false);
$$;

CREATE OR REPLACE FUNCTION public.commercial_get_email_consent_receipt(p_receipt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.commercial_email_consent_receipts%ROWTYPE; v_actor uuid;
BEGIN
  SELECT * INTO r FROM public.commercial_email_consent_receipts WHERE id = p_receipt_id;
  IF NOT FOUND OR auth.uid() IS NULL OR (r.captured_by <> auth.uid() AND NOT coalesce(public.has_role(auth.uid(),'admin'),false)) THEN
    RAISE EXCEPTION 'consent_receipt_not_found' USING ERRCODE = '42501';
  END IF;
  v_actor := public.commercial_consent_assert_access(r.source_objectid);
  RETURN (SELECT jsonb_build_object(
    'receipt_id', r.id, 'source_objectid', r.source_objectid, 'restaurant_name', r.restaurant_name,
    'email', r.email, 'signer_name', r.signer_name, 'signer_role', r.signer_role, 'signed_at', r.signed_at,
    'document', r.document, 'document_hash', r.document_hash, 'proof_hash', r.proof_hash,
    'signature_data', r.signature_data, 'approval_method', r.approval_method,
    'captured_by', r.captured_by, 'submission_hash', r.submission_hash, 'hash_format', 'PostgreSQL jsonb::text SHA-256',
    'email_verified', confirmation.confirmed_at IS NOT NULL, 'evidence_quality', 'system_event',
    'confirmation_required', confirmation.receipt_id IS NOT NULL,
    'confirmation_state', CASE WHEN confirmation.receipt_id IS NULL THEN 'legacy'
      WHEN confirmation.superseded_at IS NOT NULL THEN 'superseded'
      WHEN confirmation.revoked_at IS NOT NULL THEN 'withdrawn'
      WHEN confirmation.confirmed_at IS NOT NULL THEN 'confirmed'
      WHEN confirmation.expires_at<=now() THEN 'expired' ELSE 'pending' END,
    'confirmed_at', confirmation.confirmed_at, 'confirmation_expires_at', confirmation.expires_at,
    'email_delivery_state', confirmation.delivery_state, 'email_delivery_error', confirmation.error_code,
    'email_eligible', coalesce(c.email_normalized = r.email AND c.opted_out_at IS NULL
      AND c.suppression_reason IS NULL AND c.lifecycle_status <> 'opted_out'
      AND public.marketing_contact_is_eligible(c.id, 'email'), false),
    'withdrawn', coalesce(c.opted_out_at IS NOT NULL OR c.lifecycle_status = 'opted_out'
      OR confirmation.revoked_at IS NOT NULL
      OR (confirmation.receipt_id IS NULL AND c.lawful_basis = 'none'), true)
  ) FROM public.marketing_contacts c LEFT JOIN public.commercial_email_confirmations confirmation ON confirmation.receipt_id=r.id WHERE c.id = r.marketing_contact_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.commercial_get_email_consent_context(p_source_objectid bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid; v_doc jsonb; v_latest jsonb; v_id uuid; v_admin boolean;
BEGIN
  v_actor := public.commercial_consent_assert_access(p_source_objectid);
  v_admin := coalesce(public.has_role(v_actor, 'admin'), false);
  v_doc := public.commercial_consent_document();
  SELECT id INTO v_id FROM public.commercial_email_consent_receipts
    WHERE source_objectid = p_source_objectid AND (captured_by = v_actor OR v_admin)
    ORDER BY signed_at DESC, id DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    v_latest := public.commercial_get_email_consent_receipt(v_id);
    v_latest := jsonb_build_object('receipt_id',v_id,'signed_at',v_latest->'signed_at','email',v_latest->'email',
      'email_eligible',v_latest->'email_eligible','withdrawn',v_latest->'withdrawn',
      'confirmation_required',v_latest->'confirmation_required','confirmation_state',v_latest->'confirmation_state',
      'confirmed_at',v_latest->'confirmed_at','email_delivery_state',v_latest->'email_delivery_state');
  END IF;
  RETURN jsonb_build_object('document',v_doc,'document_hash',CASE WHEN v_doc IS NOT NULL THEN encode(extensions.digest(v_doc::text,'sha256'),'hex') END,
    'is_admin',v_admin,'latest',v_latest);
END;
$$;

CREATE OR REPLACE FUNCTION public.commercial_record_signed_email_consent_v2(
  p_source_objectid bigint, p_restaurant_name text, p_email text, p_signer_name text, p_signer_role text,
  p_signature_data text, p_explicit_consent boolean, p_document_hash text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid; v_email text := lower(btrim(coalesce(p_email,'')));
  v_doc jsonb; v_hash text; v_submission text; v_receipt uuid := gen_random_uuid(); v_time timestamptz := now();
  v_contact public.marketing_contacts%ROWTYPE; v_prior public.commercial_email_consent_receipts%ROWTYPE;
  v_signature bytea; v_context text := coalesce(current_setting('app.marketing_lawful_basis_context',true),'');
  v_scope boolean; v_old_basis text; v_queue uuid:=gen_random_uuid();
BEGIN
  v_actor := public.commercial_consent_assert_access(p_source_objectid);
  IF p_explicit_consent IS DISTINCT FROM TRUE OR p_request_id IS NULL OR p_document_hash IS NULL OR p_document_hash !~ '^[a-f0-9]{64}$'
    OR char_length(btrim(coalesce(p_restaurant_name,''))) NOT BETWEEN 2 AND 200
    OR char_length(btrim(coalesce(p_signer_name,''))) NOT BETWEEN 2 AND 160
    OR char_length(btrim(coalesce(p_signer_role,''))) NOT BETWEEN 2 AND 100
    OR (coalesce(p_restaurant_name,'') || coalesce(p_signer_name,'') || coalesce(p_signer_role,'')) ~ '[[:cntrl:]]'
    OR v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9]+([.\-][a-z0-9]+)*\.[a-z]{2,}$'
    OR v_email LIKE '%.@%' OR v_email LIKE '.%@%' OR v_email LIKE '%..%' OR length(split_part(v_email,'@',1))>64
    OR length(v_email)>254 OR p_signature_data IS NULL
    OR p_signature_data !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$'
    OR char_length(p_signature_data) NOT BETWEEN 200 AND 180000 THEN
    RAISE EXCEPTION 'invalid_or_unsigned_consent' USING ERRCODE = '22023';
  END IF;
  BEGIN v_signature := decode(substring(p_signature_data from 23),'base64');
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_or_unsigned_consent' USING ERRCODE='22023'; END;
  -- PNG magic + IHDR + the existing pad's 600 x 160 dimensions. Not an identity/ink verification.
  IF octet_length(v_signature)<100 OR encode(substring(v_signature from 1 for 24),'hex') <> '89504e470d0a1a0a0000000d4948445200000258000000a0' THEN
    RAISE EXCEPTION 'invalid_or_unsigned_consent' USING ERRCODE='22023'; END IF;
  v_submission := encode(extensions.digest(jsonb_build_object('prospect',p_source_objectid,'restaurant',btrim(p_restaurant_name),
    'email',v_email,'name',btrim(p_signer_name),'role',btrim(p_signer_role),'signature',p_signature_data,'document_hash',p_document_hash)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('consent-actor:'||v_actor::text,33));
  SELECT * INTO v_prior FROM public.commercial_email_consent_receipts WHERE captured_by=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_prior.submission_hash <> v_submission THEN RAISE EXCEPTION 'consent_request_conflict' USING ERRCODE='22023'; END IF;
    RETURN public.commercial_get_email_consent_receipt(v_prior.id);
  END IF;
  IF (SELECT count(*) FROM public.commercial_email_consent_receipts WHERE captured_by=v_actor AND signed_at>now()-interval '1 hour')>=100 THEN
    RAISE EXCEPTION 'consent_rate_limited' USING ERRCODE='54000'; END IF;
  PERFORM 1 FROM public.commercial_prospect_catalog WHERE source_objectid=p_source_objectid FOR UPDATE;
  PERFORM 1 FROM public.commercial_prospect_followups WHERE source_objectid=p_source_objectid FOR UPDATE;
  PERFORM public.commercial_consent_assert_access(p_source_objectid);
  -- Lock settings until the receipt transaction finishes; no stale displayed identity/text can be accepted.
  PERFORM 1 FROM public.tok_consent_settings WHERE id IS TRUE FOR SHARE;
  v_doc := public.commercial_consent_document();
  IF v_doc IS NULL THEN RAISE EXCEPTION 'consent_controller_missing' USING ERRCODE='22023'; END IF;
  v_hash := encode(extensions.digest(v_doc::text,'sha256'),'hex');
  IF v_hash <> p_document_hash THEN RAISE EXCEPTION 'consent_document_changed' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email,33));
  SELECT * INTO v_contact FROM public.marketing_contacts WHERE email_normalized=v_email FOR UPDATE;
  IF NOT FOUND THEN
    -- No authorization is introduced by this insert. A competing import is reconciled under the row lock below.
    INSERT INTO public.marketing_contacts(contact_type,source_objectid,source_system,source_reference,display_name,email,lawful_basis,created_by)
      VALUES('restaurant_prospect',p_source_objectid,'commercial_signed',v_receipt::text,btrim(p_restaurant_name),v_email,'none',v_actor)
      ON CONFLICT(email_normalized) WHERE email_normalized IS NOT NULL DO NOTHING;
    SELECT * INTO STRICT v_contact FROM public.marketing_contacts WHERE email_normalized=v_email FOR UPDATE;
  END IF;
  IF v_contact.opted_out_at IS NOT NULL OR v_contact.lifecycle_status='opted_out'
    OR v_contact.suppression_reason IS NOT NULL
    OR coalesce(v_contact.metadata->>'email_suppressed','false') NOT IN ('false','0','') THEN
    RAISE EXCEPTION 'contact_suppressed_reconsent_requires_independent_verification' USING ERRCODE='42501';
  END IF;
  IF (SELECT count(*) FROM public.commercial_email_confirmations WHERE email=v_email AND requested_at>now()-interval '24 hours')>=3 THEN
    RAISE EXCEPTION 'consent_rate_limited' USING ERRCODE='54000'; END IF;
  v_old_basis := v_contact.lawful_basis;
  -- An email-only confirmation must not upgrade a legitimate-interest basis into push/call consent.
  v_scope := v_old_basis NOT IN ('consent','existing_customer') OR coalesce(v_contact.metadata->>'commercial_email_consent_only','false')='true';
  INSERT INTO public.commercial_email_consent_receipts(id,request_id,source_objectid,marketing_contact_id,restaurant_name,signer_name,signer_role,email,
    text_version,consent_text,document,document_hash,submission_hash,proof_hash,signature_data,signer_confirmed,captured_by,signed_at)
  VALUES(v_receipt,p_request_id,p_source_objectid,v_contact.id,btrim(p_restaurant_name),btrim(p_signer_name),btrim(p_signer_role),v_email,
    v_doc->>'version',v_doc->>'text',v_doc,v_hash,v_submission,
    encode(extensions.digest(jsonb_build_object('receipt_id',v_receipt,'submission_hash',v_submission,'document',v_doc,'captured_by',v_actor,'signed_at',v_time)::text,'sha256'),'hex'),
    p_signature_data,true,v_actor,v_time);
  -- Only the outbox and private gate are created here. No grant before mailbox confirmation.
  UPDATE public.commercial_email_confirmations SET superseded_at=v_time,
    delivery_state=CASE WHEN delivery_state='sent' THEN 'sent' ELSE 'cancelled' END
    WHERE contact_id=v_contact.id AND superseded_at IS NULL;
  UPDATE public.email_queue q SET status='cancelled',error='consent_superseded'
    FROM public.commercial_email_confirmations c WHERE c.contact_id=v_contact.id
    AND c.superseded_at IS NOT NULL AND q.id=c.queue_id AND q.status IN ('queued','consent_pending','processing','failed');
  INSERT INTO public.email_queue(id,to_email,subject,status,metadata)
    VALUES(v_queue,v_email,'TOK — Confirmez votre autorisation : JE CONSENS','consent_pending',
      jsonb_build_object('kind','commercial_email_consent_confirmation','receipt_id',v_receipt));
  INSERT INTO public.commercial_email_confirmations(receipt_id,contact_id,email,queue_id,requested_at,expires_at)
    VALUES(v_receipt,v_contact.id,v_email,v_queue,v_time,v_time+interval '48 hours');
  UPDATE public.marketing_contacts SET metadata=metadata||jsonb_build_object(
    'commercial_email_consent_receipt_id',v_receipt,'commercial_email_consent_only',v_scope,
    'commercial_email_confirmation_pending',true) WHERE id=v_contact.id;
  INSERT INTO public.audit_log(id,user_id,action,entity_type,entity_id,new_data,created_at)
    VALUES(gen_random_uuid(),v_actor,'commercial_consent_mail_requested','commercial_email_consent_receipts',v_receipt,
      jsonb_build_object('queue_id',v_queue,'document_hash',v_hash,'campaign_authorized',false),v_time);
  RETURN public.commercial_get_email_consent_receipt(v_receipt);
END;
$$;

-- Service-only transport primitives. A queue identifier never gives a browser the confirmation capability.
CREATE OR REPLACE FUNCTION public.commercial_consent_email_payload(p_queue_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('receipt_id',r.id,'queue_id',c.queue_id,'email',r.email,'restaurant_name',r.restaurant_name,
 'signer_name',r.signer_name,'signer_role',r.signer_role,'signed_at',r.signed_at,'signature_data',r.signature_data,
 'document',r.document,'proof_hash',r.proof_hash,'expires_at',c.expires_at)
 FROM public.commercial_email_confirmations c JOIN public.commercial_email_consent_receipts r ON r.id=c.receipt_id
 JOIN public.email_queue q ON q.id=c.queue_id
 WHERE c.queue_id=p_queue_id AND q.to_email=r.email AND c.email=r.email
 AND q.metadata->>'kind'='commercial_email_consent_confirmation'
 AND q.metadata->>'receipt_id'=r.id::text;
$$;
REVOKE ALL ON FUNCTION public.commercial_consent_email_payload(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_consent_email_payload(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_claim_consent_email(p_queue_id uuid,p_token_hash text,p_payload_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.commercial_email_confirmations%ROWTYPE; m public.marketing_contacts%ROWTYPE; v_lease uuid:=gen_random_uuid();
BEGIN
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_payload_hash IS NULL OR p_payload_hash!~'^[a-f0-9]{64}$' THEN
 RAISE EXCEPTION 'consent_delivery_invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.commercial_email_confirmations WHERE queue_id=p_queue_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- All mutating paths lock the contact first, then confirmation, then queue.
 SELECT * INTO m FROM public.marketing_contacts WHERE id=c.contact_id FOR UPDATE;
 SELECT * INTO c FROM public.commercial_email_confirmations WHERE queue_id=p_queue_id FOR UPDATE;
 IF c.delivery_state NOT IN ('queued','retry') OR c.confirmed_at IS NOT NULL OR c.retry_after>now() THEN RETURN NULL; END IF;
 IF c.revoked_at IS NOT NULL OR c.superseded_at IS NOT NULL OR c.expires_at<=now()
 OR m.email_normalized IS DISTINCT FROM c.email OR m.opted_out_at IS NOT NULL OR m.lifecycle_status='opted_out'
 OR m.suppression_reason IS NOT NULL OR coalesce(m.metadata->>'email_suppressed','false') NOT IN ('false','0','') THEN
   UPDATE public.commercial_email_confirmations SET delivery_state='cancelled',error_code='consent_not_sendable' WHERE receipt_id=c.receipt_id;
   UPDATE public.email_queue SET status='cancelled',error='consent_not_sendable' WHERE id=p_queue_id;
   RETURN NULL;
 END IF;
 -- Resend idempotency lives 24h. Never resend a possibly accepted mail after that window.
 IF c.attempts>=5 OR c.first_attempt_at<=now()-interval '23 hours'
 OR (c.token_hash IS NOT NULL AND c.token_hash<>p_token_hash)
 OR (c.payload_hash IS NOT NULL AND c.payload_hash<>p_payload_hash) THEN
   UPDATE public.commercial_email_confirmations SET delivery_state='failed',error_code='consent_delivery_retry_closed' WHERE receipt_id=c.receipt_id;
   UPDATE public.email_queue SET status='failed',error='consent_delivery_retry_closed' WHERE id=p_queue_id;
   RETURN NULL;
 END IF;
 PERFORM 1 FROM public.email_queue WHERE id=p_queue_id AND status='consent_pending' AND to_email=c.email
 AND metadata->>'kind'='commercial_email_consent_confirmation' AND metadata->>'receipt_id'=c.receipt_id::text FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.commercial_email_confirmations SET token_hash=p_token_hash,payload_hash=p_payload_hash,delivery_state='processing',
 attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=v_lease,lease_until=now()+interval '2 minutes',retry_after=NULL,error_code=NULL
 WHERE receipt_id=c.receipt_id;
 UPDATE public.email_queue SET status='processing',error=NULL WHERE id=p_queue_id;
 RETURN jsonb_build_object('lease_token',v_lease);
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_claim_consent_email(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_claim_consent_email(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_settle_consent_email(p_queue_id uuid,p_lease_token uuid,p_provider_id text,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.commercial_email_confirmations%ROWTYPE; v_state text; v_error text;
BEGIN
 SELECT * INTO c FROM public.commercial_email_confirmations WHERE queue_id=p_queue_id FOR UPDATE;
 IF NOT FOUND OR c.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL THEN RETURN false; END IF;
 IF p_provider_id IS NOT NULL AND (length(p_provider_id) NOT BETWEEN 1 AND 200 OR p_provider_id~'[[:cntrl:]]') THEN
 RAISE EXCEPTION 'consent_delivery_invalid' USING ERRCODE='22023'; END IF;
 v_error:=CASE WHEN p_error~'^(provider_http_[0-9]{3}|provider_not_configured|provider_network_error|provider_reference_missing)$' THEN p_error ELSE 'consent_delivery_error' END;
 v_state:=CASE WHEN p_provider_id IS NOT NULL THEN 'sent'
 WHEN c.revoked_at IS NOT NULL OR c.superseded_at IS NOT NULL OR c.expires_at<=now() THEN 'cancelled'
 WHEN c.attempts<5 AND c.first_attempt_at>now()-interval '23 hours' THEN 'retry' ELSE 'failed' END;
 UPDATE public.commercial_email_confirmations SET delivery_state=v_state,provider_message_id=coalesce(provider_message_id,p_provider_id),
 error_code=CASE WHEN p_provider_id IS NULL THEN v_error ELSE NULL END,lease_token=NULL,lease_until=NULL,
 retry_after=CASE WHEN v_state='retry' THEN now()+make_interval(secs=>least(3600,60*(2^c.attempts)::int)) END WHERE receipt_id=c.receipt_id;
 UPDATE public.email_queue SET status=CASE WHEN v_state='retry' THEN 'failed' ELSE v_state END,
 sent_at=CASE WHEN p_provider_id IS NOT NULL THEN coalesce(sent_at,now()) ELSE sent_at END,
 provider_message_id=coalesce(provider_message_id,p_provider_id),error=CASE WHEN p_provider_id IS NULL THEN v_error ELSE NULL END WHERE id=p_queue_id;
 INSERT INTO public.audit_log(id,action,entity_type,entity_id,new_data,created_at)
 VALUES(gen_random_uuid(),'commercial_consent_mail_settled','commercial_email_consent_receipts',c.receipt_id,
 jsonb_build_object('state',v_state,'attempt',c.attempts,'provider_accepted',p_provider_id IS NOT NULL),now());
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_settle_consent_email(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_settle_consent_email(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_recover_consent_emails()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.commercial_email_confirmations%ROWTYPE; v_state text; v_count integer:=0;
BEGIN
 FOR c IN SELECT * FROM public.commercial_email_confirmations
 WHERE (delivery_state='retry' AND retry_after<=now()) OR (delivery_state='processing' AND lease_until<now())
 ORDER BY requested_at LIMIT 20 FOR UPDATE SKIP LOCKED LOOP
   v_state:=CASE WHEN c.revoked_at IS NOT NULL OR c.superseded_at IS NOT NULL OR c.confirmed_at IS NOT NULL OR c.expires_at<=now() THEN 'cancelled'
   WHEN c.attempts>=5 OR c.first_attempt_at<=now()-interval '23 hours' THEN 'failed' ELSE 'queued' END;
   UPDATE public.commercial_email_confirmations SET delivery_state=v_state,lease_token=NULL,lease_until=NULL,retry_after=NULL,
   error_code=CASE WHEN v_state='failed' THEN 'consent_delivery_retry_closed' ELSE error_code END WHERE receipt_id=c.receipt_id;
   UPDATE public.email_queue SET status=CASE WHEN v_state='queued' THEN 'consent_pending' ELSE v_state END WHERE id=c.queue_id;
   v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_recover_consent_emails() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_recover_consent_emails() TO service_role;

CREATE OR REPLACE FUNCTION public.commercial_consent_public_action(p_token_hash text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.commercial_email_confirmations%ROWTYPE; m public.marketing_contacts%ROWTYPE; r public.commercial_email_consent_receipts%ROWTYPE;
 v_state text; v_context text:=coalesce(current_setting('app.marketing_lawful_basis_context',true),'');
BEGIN
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN ('view','confirm','withdraw') THEN
 RAISE EXCEPTION 'consent_link_invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.commercial_email_confirmations WHERE token_hash=p_token_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'consent_link_invalid' USING ERRCODE='22023'; END IF;
 IF p_action='view' THEN
   SELECT * INTO m FROM public.marketing_contacts WHERE id=c.contact_id;
 ELSE
   SELECT * INTO m FROM public.marketing_contacts WHERE id=c.contact_id FOR UPDATE;
   SELECT * INTO c FROM public.commercial_email_confirmations WHERE token_hash=p_token_hash FOR UPDATE;
 END IF;
 SELECT * INTO r FROM public.commercial_email_consent_receipts WHERE id=c.receipt_id;
 IF p_action='confirm' THEN
   IF c.revoked_at IS NOT NULL OR c.superseded_at IS NOT NULL OR m.email_normalized IS DISTINCT FROM c.email
   OR m.opted_out_at IS NOT NULL OR m.lifecycle_status='opted_out' OR m.suppression_reason IS NOT NULL
   OR coalesce(m.metadata->>'email_suppressed','false') NOT IN ('false','0','') THEN
     RAISE EXCEPTION 'consent_link_revoked' USING ERRCODE='42501'; END IF;
   IF c.confirmed_at IS NULL THEN
     IF c.expires_at<=now() THEN RAISE EXCEPTION 'consent_link_expired' USING ERRCODE='22023'; END IF;
     UPDATE public.commercial_email_confirmations SET confirmed_at=now() WHERE receipt_id=c.receipt_id;
     PERFORM set_config('app.marketing_lawful_basis_context',jsonb_build_object(
       'source','commercial_restaurateur_mail_confirmation_v3','note','Confirmation explicite JE CONSENS depuis le lien privé envoyé à la boîte. Signature liée au reçu '||c.receipt_id::text||'. Identité civile non vérifiée.',
       'recorded_at',now(),'quality','system_event','source_system','commercial_cockpit','source_reference',c.receipt_id::text)::text,true);
     UPDATE public.marketing_contacts SET lawful_basis='consent',consent_source='commercial_restaurateur_mail_confirmation_v3',consent_at=now(),
       metadata=metadata||jsonb_build_object('commercial_email_confirmation_pending',false,'commercial_email_confirmed_at',now(),
         'commercial_email_consent_receipt_id',c.receipt_id) WHERE id=c.contact_id;
     PERFORM set_config('app.marketing_lawful_basis_context',v_context,true);
     INSERT INTO public.audit_log(id,action,entity_type,entity_id,new_data,created_at)
       VALUES(gen_random_uuid(),'commercial_consent_mail_confirmed','commercial_email_consent_receipts',c.receipt_id,
       jsonb_build_object('document_hash',r.document_hash,'method','mailbox_link_explicit_post','identity_verified',false),now());
   END IF;
 ELSIF p_action='withdraw' THEN
   -- Even an expired link may withdraw; an old address cannot suppress a replacement address.
   IF m.email_normalized IS DISTINCT FROM c.email THEN RAISE EXCEPTION 'consent_link_revoked' USING ERRCODE='42501'; END IF;
   IF m.opted_out_at IS NULL THEN
     PERFORM set_config('app.marketing_lawful_basis_context',jsonb_build_object('source','commercial_mail_confirmation_withdrawal',
       'note','Retrait explicite depuis le reçu envoyé à la boîte.', 'recorded_at',now(),'quality','system_event',
       'source_system','commercial_cockpit','source_reference',c.receipt_id::text)::text,true);
     UPDATE public.marketing_contacts SET opted_out_at=now(),lifecycle_status='opted_out',lawful_basis='none',
       suppression_reason='Retrait depuis le reçu de consentement TOK',next_action_at=NULL,
       metadata=metadata||jsonb_build_object('email_suppressed',true,'commercial_email_confirmation_pending',false) WHERE id=c.contact_id;
     PERFORM set_config('app.marketing_lawful_basis_context',v_context,true);
     UPDATE public.marketing_deliveries SET status='cancelled',last_error='Contact suppressed',unsubscribed_at=coalesce(unsubscribed_at,now()),lease_token=NULL,lease_expires_at=NULL
       WHERE contact_id=c.contact_id AND status IN ('queued','leased','processing','retrying','manual_required','blocked_configuration');
   END IF;
 END IF;
 SELECT * INTO c FROM public.commercial_email_confirmations WHERE receipt_id=c.receipt_id;
 SELECT * INTO m FROM public.marketing_contacts WHERE id=c.contact_id;
 v_state:=CASE WHEN c.superseded_at IS NOT NULL THEN 'superseded'
   WHEN c.revoked_at IS NOT NULL OR m.opted_out_at IS NOT NULL OR m.lifecycle_status='opted_out'
     OR m.email_normalized IS DISTINCT FROM c.email OR m.suppression_reason IS NOT NULL
     OR coalesce(m.metadata->>'email_suppressed','false') NOT IN ('false','0','') THEN 'withdrawn'
   WHEN c.confirmed_at IS NOT NULL THEN 'confirmed' WHEN c.expires_at<=now() THEN 'expired' ELSE 'pending' END;
 RETURN jsonb_build_object('state',v_state,'receipt_id',c.receipt_id,'email',c.email,'restaurant_name',r.restaurant_name,
 'signer_name',r.signer_name,'signer_role',r.signer_role,'signed_at',r.signed_at,'document',r.document,'signature_data',r.signature_data,
 'proof_hash',r.proof_hash,'confirmed_at',c.confirmed_at,'expires_at',c.expires_at,
 'email_eligible',v_state='confirmed' AND public.marketing_contact_is_eligible(c.contact_id,'email'));
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_consent_public_action(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_consent_public_action(text,text) TO service_role;

-- Existing authenticated RPC grants remain; helper and transport functions stay server-only.
REVOKE ALL ON FUNCTION public.commercial_consent_document() FROM PUBLIC,anon,authenticated;
COMMENT ON TABLE public.commercial_email_confirmations IS 'Mailbox confirmation and bounded transactional outbox state. Raw tokens are not stored. Only an explicit capability POST grants new marketing email consent; original signature remains immutable.';
COMMIT;
