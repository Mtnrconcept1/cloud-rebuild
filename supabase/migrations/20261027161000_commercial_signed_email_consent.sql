-- Signature de prospection TOK : consentement distinct du contrat d'abonnement.
BEGIN;
CREATE TABLE IF NOT EXISTS public.commercial_email_consent_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_objectid bigint NOT NULL REFERENCES public.commercial_prospect_catalog(source_objectid),
  marketing_contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id),
  restaurant_name text NOT NULL CHECK (char_length(restaurant_name) BETWEEN 2 AND 200),
  signer_name text NOT NULL CHECK (char_length(signer_name) BETWEEN 2 AND 160),
  signer_role text NOT NULL CHECK (char_length(signer_role) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 254),
  text_version text NOT NULL DEFAULT 'tok-b2b-email-v1',
  consent_text text NOT NULL,
  signature_data text NOT NULL CHECK (char_length(signature_data) BETWEEN 200 AND 180000),
  signer_confirmed boolean NOT NULL CHECK (signer_confirmed IS TRUE),
  captured_by uuid NOT NULL REFERENCES auth.users(id),
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_email_consent_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_email_consent_receipts FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS commercial_email_consent_receipts_contact_idx ON public.commercial_email_consent_receipts(marketing_contact_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS commercial_email_consent_receipts_prospect_idx ON public.commercial_email_consent_receipts(source_objectid, signed_at DESC);
COMMENT ON TABLE public.commercial_email_consent_receipts IS 'Preuves privées de signature commerciale B2B. Pas de lecture directe par le navigateur.';

CREATE OR REPLACE FUNCTION public.commercial_record_signed_email_consent(
 p_source_objectid bigint, p_restaurant_name text, p_email text,
 p_signer_name text, p_signer_role text, p_signature_data text,
 p_explicit_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','pg_temp' AS $$
DECLARE
 v_actor uuid := auth.uid();
 v_email text := lower(btrim(coalesce(p_email,'')));
 v_contact public.marketing_contacts%ROWTYPE;
 v_receipt uuid;
 v_text text := 'Je confirme représenter le restaurant indiqué et j’autorise TOK à utiliser l’adresse e-mail professionnelle renseignée afin de m’envoyer par e-mail des présentations de services, nouveautés, offres et campagnes commerciales TOK. Cette autorisation est facultative, n’engage aucun abonnement et peut être retirée à tout moment grâce au lien de désabonnement présent dans chaque e-mail ou en contactant TOK.';
BEGIN
 IF v_actor IS NULL OR NOT public.has_role(v_actor,'commercial'::public.app_role) THEN
   RAISE EXCEPTION 'commercial_access_required' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM public.commercial_compensation_profiles WHERE user_id=v_actor AND status='inactive')
   OR EXISTS (SELECT 1 FROM public.commercial_demo_accounts WHERE user_id=v_actor AND NOT is_active) THEN
   RAISE EXCEPTION 'commercial_account_inactive' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.commercial_prospect_catalog WHERE source_objectid=p_source_objectid) THEN
   RAISE EXCEPTION 'unknown_prospect' USING ERRCODE='22023';
 END IF;
 IF EXISTS (SELECT 1 FROM public.commercial_prospect_followups WHERE source_objectid=p_source_objectid AND assigned_to IS NOT NULL AND assigned_to<>v_actor) THEN
   RAISE EXCEPTION 'prospect_owned_by_another_commercial' USING ERRCODE='42501';
 END IF;
 IF p_explicit_consent IS DISTINCT FROM TRUE
   OR char_length(btrim(coalesce(p_restaurant_name,''))) NOT BETWEEN 2 AND 200
   OR char_length(btrim(coalesce(p_signer_name,''))) NOT BETWEEN 2 AND 160
   OR char_length(btrim(coalesce(p_signer_role,''))) NOT BETWEEN 2 AND 100
   OR v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
   OR char_length(v_email)>254
   OR p_signature_data IS NULL
   OR p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
   OR char_length(p_signature_data) NOT BETWEEN 200 AND 180000 THEN
   RAISE EXCEPTION 'invalid_or_unsigned_consent' USING ERRCODE='22023';
 END IF;
 -- Serialize on the email identity, including a concurrent opt-out transaction.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 33));
 SELECT * INTO v_contact FROM public.marketing_contacts WHERE email_normalized=v_email FOR UPDATE;
 IF FOUND THEN
   IF v_contact.opted_out_at IS NOT NULL OR v_contact.lifecycle_status='opted_out'
     OR v_contact.suppression_reason IS NOT NULL
     OR coalesce((v_contact.metadata->>'email_suppressed')::boolean,false) THEN
     RAISE EXCEPTION 'contact_suppressed_reconsent_requires_independent_verification' USING ERRCODE='42501';
   END IF;
   UPDATE public.marketing_contacts SET lawful_basis='consent',
     consent_source='commercial_signed_tok_b2b_v1',consent_at=now(),
     updated_at=now(),version=version+1
   WHERE id=v_contact.id;
 ELSE
   INSERT INTO public.marketing_contacts
    (contact_type,source_objectid,source_system,source_reference,display_name,email,
     email_normalized,lawful_basis,consent_source,consent_at,created_by)
   VALUES ('restaurant_prospect',p_source_objectid,'commercial_signed',gen_random_uuid()::text,
    btrim(p_restaurant_name),v_email,v_email,'consent','commercial_signed_tok_b2b_v1',now(),v_actor)
   RETURNING * INTO v_contact;
 END IF;
 INSERT INTO public.commercial_email_consent_receipts
  (source_objectid,marketing_contact_id,restaurant_name,signer_name,signer_role,email,
   consent_text,signature_data,signer_confirmed,captured_by)
 VALUES (p_source_objectid,v_contact.id,btrim(p_restaurant_name),btrim(p_signer_name),
  btrim(p_signer_role),v_email,v_text,p_signature_data,true,v_actor)
 RETURNING id INTO v_receipt;
 INSERT INTO public.marketing_lawful_basis_evidence
  (contact_id,event_type,lawful_basis_before,lawful_basis_after,evidence_source,
   evidence_note,evidence_recorded_at,evidence_quality,source_system,source_reference,
   actor_user_id,evidence_fingerprint)
 VALUES (v_contact.id,'granted',coalesce(v_contact.lawful_basis,'none'),'consent',
   'commercial_signed_tok_b2b_v1','Signature manuscrite capturée dans Cockpit TOK, reçu privé '||v_receipt::text,
   now(),'verified','commercial_cockpit',v_receipt::text,v_actor,
   encode(digest(v_receipt::text||':'||v_email,'sha256'),'hex'));
 RETURN jsonb_build_object('receipt_id',v_receipt,'email',v_email,'consent_at',now());
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_record_signed_email_consent(bigint,text,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commercial_record_signed_email_consent(bigint,text,text,text,text,text,boolean) TO authenticated;
COMMIT;
