-- Dedicated commercial contract evidence. This intentionally does not reuse
-- the restaurateur contract table. Activation remains blocked pending Swiss legal review.

CREATE TABLE IF NOT EXISTS public.commercial_contract_versions (
  version text PRIMARY KEY,
  title text NOT NULL,
  effective_date date NOT NULL,
  legal_review_status text NOT NULL DEFAULT 'pending'
    CHECK (legal_review_status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((legal_review_status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

INSERT INTO public.commercial_contract_versions (version, title, effective_date)
VALUES ('TOK-CH-COM-2026-08-v1', 'Contrat de collaboration commerciale TOK', DATE '2026-08-01')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.commercial_contract_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version text NOT NULL REFERENCES public.commercial_contract_versions(version),
  effective_date date NOT NULL,
  commercial_user_id uuid NOT NULL REFERENCES auth.users(id),
  tok_party jsonb NOT NULL,
  commercial_party jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  compensation_snapshot jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  signature_proof jsonb NOT NULL,
  signature_proof_hash text NOT NULL CHECK (signature_proof_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE (commercial_user_id, contract_version),
  CHECK (commercial_party ->> 'id' = commercial_user_id::text),
  CHECK (jsonb_typeof(compensation_snapshot) = 'object'),
  CHECK (jsonb_typeof(signature_proof) = 'object')
);

CREATE INDEX IF NOT EXISTS commercial_contract_acceptances_user_accepted_idx
  ON public.commercial_contract_acceptances (commercial_user_id, accepted_at DESC);

ALTER TABLE public.commercial_contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_contract_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_contract_versions_roles_read ON public.commercial_contract_versions;
CREATE POLICY commercial_contract_versions_roles_read
ON public.commercial_contract_versions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'commercial'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS commercial_contract_acceptances_owner_admin_read ON public.commercial_contract_acceptances;
CREATE POLICY commercial_contract_acceptances_owner_admin_read
ON public.commercial_contract_acceptances FOR SELECT TO authenticated
USING (
  commercial_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

REVOKE ALL ON TABLE public.commercial_contract_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commercial_contract_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.commercial_contract_versions TO authenticated;
GRANT SELECT ON TABLE public.commercial_contract_acceptances TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_commercial_contract_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'commercial_contract_evidence_is_immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS commercial_contract_acceptances_immutable ON public.commercial_contract_acceptances;
CREATE TRIGGER commercial_contract_acceptances_immutable
BEFORE UPDATE OR DELETE ON public.commercial_contract_acceptances
FOR EACH ROW EXECUTE FUNCTION public.prevent_commercial_contract_evidence_mutation();

CREATE OR REPLACE FUNCTION public.accept_commercial_contract(
  p_contract_version text,
  p_effective_date date,
  p_tok_party jsonb,
  p_commercial_party jsonb,
  p_content_hash text,
  p_compensation_snapshot jsonb,
  p_signature_proof jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.commercial_contract_versions%ROWTYPE;
  v_acceptance_id uuid;
  v_signature_hash text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'commercial'::public.app_role) THEN
    RAISE EXCEPTION 'commercial_access_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_version
  FROM public.commercial_contract_versions
  WHERE version = p_contract_version;

  IF NOT FOUND OR v_version.legal_review_status <> 'approved' THEN
    RAISE EXCEPTION 'swiss_legal_review_required_before_activation' USING ERRCODE = '55000';
  END IF;
  IF p_effective_date <> v_version.effective_date
    OR p_commercial_party ->> 'id' <> v_actor::text
    OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR COALESCE(p_signature_proof ->> 'method', '') <> 'typed_name_and_explicit_consent'
    OR length(trim(COALESCE(p_signature_proof ->> 'typedName', ''))) < 2
  THEN
    RAISE EXCEPTION 'invalid_commercial_contract_evidence';
  END IF;

  v_signature_hash := encode(digest(convert_to(p_signature_proof::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.commercial_contract_acceptances (
    contract_version, effective_date, commercial_user_id, tok_party, commercial_party,
    content_hash, compensation_snapshot, signature_proof, signature_proof_hash, created_by
  ) VALUES (
    p_contract_version, p_effective_date, v_actor, p_tok_party, p_commercial_party,
    p_content_hash, p_compensation_snapshot, p_signature_proof, v_signature_hash, v_actor
  )
  RETURNING id INTO v_acceptance_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, new_data)
  VALUES (
    v_actor, 'commercial_contract_accepted', 'commercial_contract_acceptance', v_acceptance_id,
    jsonb_build_object('contract_version', p_contract_version, 'content_hash', p_content_hash, 'accepted_at', clock_timestamp())
  );
  RETURN v_acceptance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_commercial_contract_evidence_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_commercial_contract(text, date, jsonb, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_commercial_contract(text, date, jsonb, jsonb, text, jsonb, jsonb) TO authenticated;

COMMENT ON TABLE public.commercial_contract_acceptances IS
  'Append-only proof for the dedicated commercial contract; distinct from restaurant partner contracts.';
COMMENT ON COLUMN public.commercial_contract_acceptances.compensation_snapshot IS
  'Immutable tariff appendix copied from the authoritative commercial compensation rules at acceptance.';

NOTIFY pgrst, 'reload schema';
