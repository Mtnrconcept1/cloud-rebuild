-- Durable, non-sensitive signup recovery created with the auth user, before
-- email confirmation. Documents, signatures and banking data never belong here.
CREATE TABLE IF NOT EXISTS public.signup_application_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  requested_role public.app_role NOT NULL,
  safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'awaiting_email'
    CHECK (status IN ('awaiting_email', 'ready', 'finalized', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_application_drafts_operation_id_key UNIQUE (operation_id),
  CONSTRAINT signup_application_drafts_user_role_key UNIQUE (user_id, requested_role),
  CONSTRAINT signup_application_drafts_privileged_role_check
    CHECK (requested_role IN ('restaurateur'::public.app_role, 'courier'::public.app_role))
);

CREATE INDEX IF NOT EXISTS signup_application_drafts_owner_expiry_idx
  ON public.signup_application_drafts (user_id, expires_at DESC);

ALTER TABLE public.signup_application_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_application_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signup_application_drafts_owner_select ON public.signup_application_drafts;
CREATE POLICY signup_application_drafts_owner_select
  ON public.signup_application_drafts
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id AND expires_at > now());

DROP POLICY IF EXISTS signup_application_drafts_admin_select ON public.signup_application_drafts;
CREATE POLICY signup_application_drafts_admin_select
  ON public.signup_application_drafts
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.capture_signup_application_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := lower(COALESCE(NEW.raw_user_meta_data->>'signup_intent', ''));
  v_operation_id uuid;
  v_payload jsonb;
BEGIN
  IF v_role NOT IN ('restaurateur', 'courier') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_operation_id := (NEW.raw_user_meta_data->>'signup_operation_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_operation_id_invalid';
  END;
  IF v_operation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'signup_operation_id_required';
  END IF;

  -- Allow-list only recovery fields. In particular: no IBAN, tax identifier,
  -- address, phone, document, signature, or commercial referral token.
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'full_name', NEW.raw_user_meta_data->>'full_name',
    'city', NEW.raw_user_meta_data->>'signup_city',
    'business_name', NEW.raw_user_meta_data->>'signup_business_name',
    'restaurant_name', NEW.raw_user_meta_data->>'signup_restaurant_name',
    'restaurant_description', NEW.raw_user_meta_data->>'signup_restaurant_description',
    'vehicle_type', NEW.raw_user_meta_data->>'signup_vehicle_type',
    'selected_subscription_plan_id', NEW.raw_user_meta_data->>'signup_subscription_plan_id',
    'selected_subscription_billing_period', NEW.raw_user_meta_data->>'signup_subscription_billing_period',
    'legal_acceptance_version', NEW.raw_user_meta_data->>'legal_acceptance_version',
    'legal_terms_accepted_at', NEW.raw_user_meta_data->>'legal_terms_accepted_at',
    'privacy_policy_accepted_at', NEW.raw_user_meta_data->>'privacy_policy_accepted_at'
  ));

  INSERT INTO public.signup_application_drafts (
    user_id, operation_id, requested_role, safe_payload, status, expires_at
  ) VALUES (
    NEW.id, v_operation_id, v_role::public.app_role, v_payload,
    CASE WHEN NEW.email_confirmed_at IS NULL THEN 'awaiting_email' ELSE 'ready' END,
    now() + interval '7 days'
  )
  ON CONFLICT (user_id, requested_role) DO UPDATE
  SET safe_payload = EXCLUDED.safe_payload,
      updated_at = now(),
      expires_at = GREATEST(public.signup_application_drafts.expires_at, EXCLUDED.expires_at)
  WHERE public.signup_application_drafts.operation_id = EXCLUDED.operation_id
    AND public.signup_application_drafts.status <> 'finalized';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_signup_application_draft_on_auth_user ON auth.users;
CREATE TRIGGER capture_signup_application_draft_on_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.capture_signup_application_draft();

CREATE OR REPLACE FUNCTION public.mark_signup_application_draft_finalized(p_operation_id uuid)
RETURNS public.signup_application_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draft public.signup_application_drafts;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  UPDATE public.signup_application_drafts
  SET status = 'finalized', finalized_at = COALESCE(finalized_at, now()), updated_at = now()
  WHERE operation_id = p_operation_id
    AND user_id = (SELECT auth.uid())
    AND expires_at > now()
  RETURNING * INTO v_draft;

  IF v_draft.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'signup_draft_not_found';
  END IF;
  RETURN v_draft;
END;
$$;

REVOKE ALL ON TABLE public.signup_application_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.signup_application_drafts TO authenticated;
GRANT ALL ON TABLE public.signup_application_drafts TO service_role;

REVOKE ALL ON FUNCTION public.capture_signup_application_draft() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_signup_application_draft() TO service_role;
REVOKE ALL ON FUNCTION public.mark_signup_application_draft_finalized(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_signup_application_draft_finalized(uuid) TO authenticated, service_role;
