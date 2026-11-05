BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Distinguish an administrator's attestation from evidence independently verified by TOK.
ALTER TABLE public.marketing_lawful_basis_evidence
  DROP CONSTRAINT IF EXISTS marketing_lawful_basis_evidence_evidence_quality_check;
ALTER TABLE public.marketing_lawful_basis_evidence
  ADD CONSTRAINT marketing_lawful_basis_evidence_evidence_quality_check
  CHECK (evidence_quality IN ('verified', 'operator_attested', 'system_event', 'migration_snapshot'));

DO $quality$
DECLARE
  v_definition text := pg_get_functiondef('public.marketing_capture_lawful_basis_evidence()'::regprocedure);
  v_old constant text := 'v_quality NOT IN (''verified'',''system_event'',''migration_snapshot'')';
  v_new constant text := 'v_quality NOT IN (''verified'',''operator_attested'',''system_event'',''migration_snapshot'')';
BEGIN
  IF strpos(v_definition, v_new) > 0 THEN NULL;
  ELSIF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Unexpected lawful basis evidence trigger; reconcile migration history';
  ELSE
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END;
$quality$;

-- The legacy import remains unchanged: an address list alone grants no permission.
-- This separate operation requires an explicit, attributable statement of previous
-- consent and its ORIGINAL date/source. No evidence file must be uploaded.
-- Existing identities are never changed, even if currently unqualified/suppressed.
CREATE OR REPLACE FUNCTION public.admin_prepare_marketing_mailing_recipients_attested(
  p_emails jsonb, p_attestation jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $attested$
DECLARE
  v_emails jsonb;
  v_source text;
  v_consent_date date;
  v_consent_at timestamptz;
  v_created integer;
  v_count integer;
BEGIN
  PERFORM public.marketing_require_admin();
  v_emails := public.marketing_normalize_mailing_recipients(p_emails);
  IF jsonb_typeof(p_attestation) IS DISTINCT FROM 'object'
     OR p_attestation -> 'confirmed' IS DISTINCT FROM 'true'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_attestation) key
                WHERE key NOT IN ('confirmed', 'source', 'consentDate')) THEN
    RAISE EXCEPTION 'Explicit consent attestation required' USING ERRCODE = '22023';
  END IF;
  v_source := NULLIF(btrim(p_attestation ->> 'source'), '');
  IF v_source IS NULL OR char_length(v_source) NOT BETWEEN 3 AND 200
     OR COALESCE(p_attestation ->> 'consentDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Original consent date and source are required' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_consent_date := (p_attestation ->> 'consentDate')::date;
    IF to_char(v_consent_date, 'YYYY-MM-DD') <> p_attestation ->> 'consentDate' THEN
      RAISE EXCEPTION 'Invalid original consent date' USING ERRCODE = '22023';
    END IF;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'Invalid original consent date' USING ERRCODE = '22023';
  END;
  IF v_consent_date > CURRENT_DATE OR v_consent_date < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'Original consent date outside supported range' USING ERRCODE = '22023';
  END IF;
  v_consent_at := v_consent_date::timestamptz;
  v_count := jsonb_array_length(v_emails);

  INSERT INTO public.marketing_contacts (
    contact_type, source_system, display_name, email, target_fingerprint,
    lawful_basis, consent_source, consent_at, lifecycle_status, metadata, created_by
  )
  SELECT
    'manual', 'mailing_import', 'Destinataire importé', recipients.email,
    encode(extensions.digest(recipients.email, 'sha256'), 'hex'),
    'consent', v_source, v_consent_at, 'qualified',
    jsonb_build_object(
      'imported_for_mailing', true,
      'lawful_basis_evidence', jsonb_build_object(
        'source', v_source,
        'note', 'Attestation administrative de consentement anterieur; documents non controles par TOK.',
        'recorded_at', clock_timestamp(),
        'quality', 'operator_attested',
        'source_system', 'marketing_admin_attestation'
      )
    ),
    public.marketing_actor_user_id()
  FROM jsonb_array_elements_text(v_emails) recipients(email)
  ON CONFLICT (email_normalized) WHERE email_normalized IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN jsonb_build_object(
    'recipient_count', v_count,
    'created_count', v_created,
    'existing_count', v_count - v_created,
    'attested_created_count', v_created,
    'estimate', public.admin_estimate_marketing_audience(
      jsonb_build_object('audience_kind', 'mixed', 'recipient_emails', v_emails),
      ARRAY['email']::text[]
    )
  );
END;
$attested$;
REVOKE ALL ON FUNCTION public.admin_prepare_marketing_mailing_recipients_attested(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- The existing BFF dispatcher continues to enforce live admin session and CSRF.
DO $dispatch$
DECLARE
  v_signature regprocedure := to_regprocedure('public.service_execute_marketing_admin_operation(text,text,text,jsonb)');
  v_definition text;
  v_anchor constant text := '    WHEN ''admin_prepare_marketing_mailing_recipients'' THEN';
  v_branch constant text := $branch$    WHEN 'admin_prepare_marketing_mailing_recipients_attested' THEN
      IF p_csrf_hash IS NULL THEN
        RAISE EXCEPTION 'Marketing CSRF proof required' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_args) arg(k)
                 WHERE arg.k NOT IN ('p_emails', 'p_attestation'))
         OR v_args -> 'p_attestation' IS NULL THEN
        RAISE EXCEPTION 'Invalid recipient attestation arguments' USING ERRCODE = '22023';
      END IF;
      v_result := public.admin_prepare_marketing_mailing_recipients_attested(
        v_args -> 'p_emails', v_args -> 'p_attestation');
$branch$;
BEGIN
  IF v_signature IS NULL THEN RAISE EXCEPTION 'Required marketing dispatcher is missing'; END IF;
  v_definition := pg_get_functiondef(v_signature);
  IF strpos(v_definition, v_branch) > 0 THEN NULL;
  ELSIF strpos(v_definition, 'WHEN ''admin_prepare_marketing_mailing_recipients_attested''') > 0
    OR (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'Unexpected marketing dispatcher; reconcile migration history';
  ELSE
    EXECUTE replace(v_definition, v_anchor, v_branch || v_anchor);
  END IF;
END;
$dispatch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
