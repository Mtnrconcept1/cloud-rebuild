-- Unapplied draft from PR #987. Native in-person consent, independent of subscription.
BEGIN;

-- Shared with the standalone consent tool; an existing controller is never overwritten.
CREATE TABLE IF NOT EXISTS public.tok_consent_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  controller text NOT NULL CHECK (length(controller) BETWEEN 2 AND 200),
  address text NOT NULL CHECK (length(address) BETWEEN 8 AND 500),
  email text NOT NULL CHECK (length(email) BETWEEN 5 AND 254),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tok_consent_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tok_consent_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tok_consent_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.commercial_email_consent_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  source_objectid bigint NOT NULL REFERENCES public.commercial_prospect_catalog(source_objectid),
  marketing_contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id),
  restaurant_name text NOT NULL CHECK (char_length(restaurant_name) BETWEEN 2 AND 200),
  signer_name text NOT NULL CHECK (char_length(signer_name) BETWEEN 2 AND 160),
  signer_role text NOT NULL CHECK (char_length(signer_role) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254 AND email = lower(email)),
  text_version text NOT NULL,
  consent_text text NOT NULL,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  document_hash text NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
  submission_hash text NOT NULL CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  proof_hash text NOT NULL CHECK (proof_hash ~ '^[a-f0-9]{64}$'),
  signature_data text NOT NULL CHECK (char_length(signature_data) BETWEEN 200 AND 180000),
  signer_confirmed boolean NOT NULL CHECK (signer_confirmed IS TRUE),
  approval_method text NOT NULL DEFAULT 'restaurateur_signature_in_person' CHECK (approval_method = 'restaurateur_signature_in_person'),
  email_verified boolean NOT NULL DEFAULT false CHECK (email_verified IS FALSE),
  captured_by uuid NOT NULL REFERENCES auth.users(id),
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (captured_by, request_id)
);
ALTER TABLE public.commercial_email_consent_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_email_consent_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_email_consent_receipts TO service_role;
CREATE INDEX IF NOT EXISTS commercial_email_consent_receipts_contact_idx ON public.commercial_email_consent_receipts(marketing_contact_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS commercial_email_consent_receipts_prospect_idx ON public.commercial_email_consent_receipts(source_objectid, captured_by, signed_at DESC);
CREATE INDEX IF NOT EXISTS commercial_email_consent_receipts_actor_idx ON public.commercial_email_consent_receipts(captured_by, signed_at DESC);
COMMENT ON TABLE public.commercial_email_consent_receipts IS 'Private proof of consent signed by a restaurateur in person. captured_by identifies the collecting salesperson, not the signatory. No identity/mailbox verification is claimed.';

CREATE OR REPLACE FUNCTION public.commercial_consent_assert_access(p_source_objectid bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid(); v_admin boolean := coalesce(public.has_role(auth.uid(), 'admin'), false);
BEGIN
  IF v_actor IS NULL OR NOT coalesce(public.tok_connect_oauth_request_allowed(), false)
    OR coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'false'
    OR NOT (v_admin OR coalesce(public.has_role(v_actor, 'commercial'), false)) THEN
    RAISE EXCEPTION 'commercial_access_required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_admin AND (
    EXISTS (SELECT 1 FROM public.commercial_compensation_profiles WHERE user_id = v_actor AND status = 'inactive')
    OR EXISTS (SELECT 1 FROM public.commercial_demo_accounts WHERE user_id = v_actor AND NOT is_active)
  ) THEN RAISE EXCEPTION 'commercial_account_inactive' USING ERRCODE = '42501'; END IF;
  IF p_source_objectid IS NULL OR p_source_objectid < 1 OR p_source_objectid > 9007199254740991
    OR NOT EXISTS (SELECT 1 FROM public.commercial_prospect_catalog WHERE source_objectid = p_source_objectid) THEN
    RAISE EXCEPTION 'unknown_prospect' USING ERRCODE = '22023';
  END IF;
  IF NOT v_admin AND EXISTS (SELECT 1 FROM public.commercial_prospect_followups
    WHERE source_objectid = p_source_objectid AND assigned_to IS NOT NULL AND assigned_to <> v_actor) THEN
    RAISE EXCEPTION 'prospect_owned_by_another_commercial' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_consent_assert_access(bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.commercial_consent_document()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', 'tok-b2b-presence-v2-2026-10-27',
    'controller', s.controller, 'address', s.address, 'contact', s.email,
    'text', 'Je déclare être habilité(e) à utiliser l’adresse professionnelle indiquée pour le restaurant renseigné. J’autorise le responsable identifié ci-dessus à m’envoyer par e-mail des présentations, propositions de démonstration, nouveautés et offres commerciales relatives aux services TOK pour les restaurateurs. Je donne moi-même cet accord en cochant la case puis en signant ce formulaire. Cet accord est libre et facultatif : il n’engage aucun abonnement, achat ou paiement. Il ne couvre ni les appels, ni les SMS, ni la prospection de tiers. Je peux le retirer à tout moment et sans frais, par le lien de désabonnement de chaque e-mail commercial ou en écrivant à l’adresse de contact ci-dessus.',
    'privacy', 'Le nom du restaurant, vos nom et fonction, votre adresse e-mail, le texte accepté, le tracé de signature, la date serveur et l’identifiant du commercial collecteur sont conservés pour gérer votre consentement et en documenter la preuve. Les données sont réservées aux personnes TOK habilitées ; le consentement et les éventuelles oppositions sont transmis au module Marketing TOK. Le retrait bloque les futurs envois ; la preuve peut être conservée dans la mesure nécessaire à la justification des choix et aux obligations applicables. Vous pouvez demander accès, rectification ou effacement au contact indiqué ci-dessus, sous réserve des obligations de conservation. Le procédé enregistre une signature électronique simple, sans certificat qualifié ni vérification d’identité civile ou de titularité de la boîte e-mail. Les informations complémentaires sur les prestataires et les transferts figurent dans la politique de confidentialité TOK.'
  ) FROM public.tok_consent_settings s WHERE s.id IS TRUE;
$$;
REVOKE ALL ON FUNCTION public.commercial_consent_document() FROM PUBLIC, anon, authenticated;

-- Preserve all existing channel rules, adding a narrow scope for a newly obtained email-only basis.
-- Based on 20260803020000_marketing_b2b_legitimate_interest_email.sql, verified against production.
CREATE OR REPLACE FUNCTION public.marketing_contact_is_eligible(p_contact_id uuid, p_channel text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT c.opted_out_at IS NULL
    AND (coalesce(c.metadata->>'commercial_email_consent_only', 'false') <> 'true'
      OR (p_channel IN ('email', 'manual_email') AND c.suppression_reason IS NULL AND c.lifecycle_status <> 'opted_out'))
    AND CASE
      WHEN p_channel IN ('email','manual_email') THEN
        c.email_normalized IS NOT NULL
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
-- Existing grants of this existing eligibility function are unchanged.

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
    'email_verified', false, 'evidence_quality', 'system_event',
    'email_eligible', coalesce(c.email_normalized = r.email AND c.opted_out_at IS NULL
      AND c.suppression_reason IS NULL AND c.lifecycle_status <> 'opted_out'
      AND public.marketing_contact_is_eligible(c.id, 'email'), false),
    'withdrawn', coalesce(c.opted_out_at IS NOT NULL OR c.lifecycle_status = 'opted_out' OR c.lawful_basis = 'none', true)
  ) FROM public.marketing_contacts c WHERE c.id = r.marketing_contact_id);
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_get_email_consent_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_get_email_consent_receipt(uuid) TO authenticated;

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
      'email_eligible',v_latest->'email_eligible','withdrawn',v_latest->'withdrawn');
  END IF;
  RETURN jsonb_build_object('document',v_doc,'document_hash',CASE WHEN v_doc IS NOT NULL THEN encode(extensions.digest(v_doc::text,'sha256'),'hex') END,
    'is_admin',v_admin,'latest',v_latest);
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_get_email_consent_context(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_get_email_consent_context(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_configure_email_consent_controller(
  p_source_objectid bigint, p_controller text, p_address text, p_contact text, p_explicit_confirmation boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid; v_email text := lower(btrim(coalesce(p_contact,'')));
BEGIN
  v_actor := public.commercial_consent_assert_access(p_source_objectid);
  IF NOT coalesce(public.has_role(v_actor,'admin'),false) OR coalesce(auth.jwt()->>'aal','') <> 'aal2' THEN
    RAISE EXCEPTION 'consent_admin_mfa_required' USING ERRCODE = '42501'; END IF;
  IF p_explicit_confirmation IS DISTINCT FROM true OR char_length(btrim(coalesce(p_controller,''))) NOT BETWEEN 2 AND 200
    OR char_length(btrim(coalesce(p_address,''))) NOT BETWEEN 8 AND 500
    OR (coalesce(p_controller,'') || coalesce(p_address,'')) ~ '[[:cntrl:]]'
    OR v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9]+([.\-][a-z0-9]+)*\.[a-z]{2,}$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'invalid_or_unsigned_consent' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.tok_consent_settings(id,controller,address,email,updated_by)
    VALUES (true,btrim(p_controller),btrim(p_address),v_email,v_actor)
  ON CONFLICT(id) DO UPDATE SET controller=EXCLUDED.controller,address=EXCLUDED.address,email=EXCLUDED.email,updated_by=v_actor,updated_at=now();
  INSERT INTO public.audit_log(id,user_id,action,entity_type,entity_id,old_data,new_data,created_at)
    VALUES(gen_random_uuid(),v_actor,'commercial_consent_controller_configured','tok_consent_settings',NULL,NULL,
      jsonb_build_object('document_hash',encode(extensions.digest(public.commercial_consent_document()::text,'sha256'),'hex')),now());
  RETURN public.commercial_get_email_consent_context(p_source_objectid);
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_configure_email_consent_controller(bigint,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_configure_email_consent_controller(bigint,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_record_signed_email_consent_v2(
  p_source_objectid bigint, p_restaurant_name text, p_email text, p_signer_name text, p_signer_role text,
  p_signature_data text, p_explicit_consent boolean, p_document_hash text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid; v_email text := lower(btrim(coalesce(p_email,'')));
  v_doc jsonb; v_hash text; v_submission text; v_receipt uuid := gen_random_uuid(); v_time timestamptz := now();
  v_contact public.marketing_contacts%ROWTYPE; v_prior public.commercial_email_consent_receipts%ROWTYPE;
  v_signature bytea; v_context text := coalesce(current_setting('app.marketing_lawful_basis_context',true),'');
  v_scope boolean; v_old_basis text;
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
  v_old_basis := v_contact.lawful_basis;
  v_scope := v_old_basis='none' OR coalesce(v_contact.metadata->>'commercial_email_consent_only','false')='true';
  INSERT INTO public.commercial_email_consent_receipts(id,request_id,source_objectid,marketing_contact_id,restaurant_name,signer_name,signer_role,email,
    text_version,consent_text,document,document_hash,submission_hash,proof_hash,signature_data,signer_confirmed,captured_by,signed_at)
  VALUES(v_receipt,p_request_id,p_source_objectid,v_contact.id,btrim(p_restaurant_name),btrim(p_signer_name),btrim(p_signer_role),v_email,
    v_doc->>'version',v_doc->>'text',v_doc,v_hash,v_submission,
    encode(extensions.digest(jsonb_build_object('receipt_id',v_receipt,'submission_hash',v_submission,'document',v_doc,'captured_by',v_actor,'signed_at',v_time)::text,'sha256'),'hex'),
    p_signature_data,true,v_actor,v_time);
  -- Reuse the authoritative trigger once. Never default a captured signature to "verified".
  PERFORM set_config('app.marketing_lawful_basis_context',jsonb_build_object(
    'source','commercial_restaurateur_signature_v2',
    'note','Consentement e-mail approuvé et signé par le restaurateur en présence ; reçu privé '||v_receipt::text||'. Identité et adresse e-mail non vérifiées.',
    'recorded_at',v_time,'quality','system_event','source_system','commercial_cockpit','source_reference',v_receipt::text)::text,true);
  UPDATE public.marketing_contacts SET lawful_basis='consent',consent_source='commercial_restaurateur_signature_v2',consent_at=v_time,
    metadata=metadata||jsonb_build_object('commercial_email_consent_receipt_id',v_receipt,'commercial_email_consent_only',v_scope)
    WHERE id=v_contact.id;
  PERFORM set_config('app.marketing_lawful_basis_context',v_context,true);
  RETURN public.commercial_get_email_consent_receipt(v_receipt);
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_record_signed_email_consent_v2(bigint,text,text,text,text,text,boolean,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commercial_record_signed_email_consent_v2(bigint,text,text,text,text,text,boolean,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_consent_protect_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'consent_evidence_is_immutable' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION public.commercial_consent_protect_receipt() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS commercial_consent_immutable ON public.commercial_email_consent_receipts;
CREATE TRIGGER commercial_consent_immutable BEFORE UPDATE ON public.commercial_email_consent_receipts
  FOR EACH ROW EXECUTE FUNCTION public.commercial_consent_protect_receipt();
-- Older draft endpoints must never remain an alternative without document binding/idempotency.
DO $$ BEGIN
  IF to_regprocedure('public.commercial_record_signed_email_consent(bigint,text,text,text,text,text,boolean)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.commercial_record_signed_email_consent(bigint,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.marketing_contacts'::regclass AND tgname='marketing_contacts_lawful_basis_evidence' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'Marketing evidence trigger must be active before signed consent is enabled';
  END IF;
END $$;
COMMIT;
