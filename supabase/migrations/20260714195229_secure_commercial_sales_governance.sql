-- Secure the commercial prospect workflow.
--
-- The public table used to be directly writable by every commercial user,
-- including its commission snapshots.  From this migration onward all writes
-- go through record_commercial_prospect_followup(), financial values are
-- derived server-side and every mutation is recorded in an append-only log.

CREATE OR REPLACE FUNCTION public.commercial_refusal_reason_codes_valid(p_codes text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(cardinality(p_codes), 0) <= 18
    AND COALESCE((
      SELECT bool_and(code = ANY (ARRAY[
        'price_too_high',
        'commission_too_high',
        'already_with_competitor',
        'no_need',
        'no_time',
        'decision_maker_absent',
        'consult_partner',
        'contract_too_restrictive',
        'tools_not_useful',
        'unclear_roi',
        'tok_not_known_enough',
        'refuses_digital',
        'previous_bad_experience',
        'technical_constraints',
        'budget_unavailable',
        'seasonal_or_closing',
        'not_interested_unspecified',
        'other'
      ]::text[]))
      FROM unnest(COALESCE(p_codes, ARRAY[]::text[])) AS code
    ), true)
    AND COALESCE(cardinality(p_codes), 0) = COALESCE((
      SELECT count(DISTINCT code)::integer
      FROM unnest(COALESCE(p_codes, ARRAY[]::text[])) AS code
    ), 0);
$$;

REVOKE ALL ON FUNCTION public.commercial_refusal_reason_codes_valid(text[])
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.commercial_prospect_followups
  ADD COLUMN IF NOT EXISTS refusal_reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS refusal_other_text text;

-- Billing data only exists for a signed prospect.  The former NOT NULL/default
-- combination leaked a fictitious monthly billing period onto unsigned rows.
ALTER TABLE public.commercial_prospect_followups
  ALTER COLUMN signed_subscription_billing_period DROP NOT NULL,
  ALTER COLUMN signed_subscription_billing_period DROP DEFAULT;

-- Make the administrator-controlled profile an unambiguous source of truth.
UPDATE public.commercial_compensation_profiles
SET employment_active = false,
    updated_at = now()
WHERE status IN ('sprint', 'inactive')
  AND employment_active;

ALTER TABLE public.commercial_compensation_profiles
  DROP CONSTRAINT IF EXISTS commercial_compensation_profiles_employment_state_check,
  ADD CONSTRAINT commercial_compensation_profiles_employment_state_check
    CHECK (NOT employment_active OR status IN ('engaged', 'team_lead')),
  DROP CONSTRAINT IF EXISTS commercial_compensation_profiles_no_self_lead_check,
  ADD CONSTRAINT commercial_compensation_profiles_no_self_lead_check
    CHECK (team_lead_id IS NULL OR team_lead_id <> user_id);

CREATE OR REPLACE FUNCTION public.validate_commercial_compensation_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.employment_active AND NEW.status NOT IN ('engaged', 'team_lead') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'employment_active requires an engaged or team_lead profile';
  END IF;

  IF NEW.team_lead_id IS NOT NULL THEN
    IF NEW.team_lead_id = NEW.user_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A commercial cannot lead themself';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.commercial_compensation_profiles lead_profile
      JOIN public.user_roles lead_role
        ON lead_role.user_id = lead_profile.user_id
       AND lead_role.role = 'commercial'::public.app_role
      WHERE lead_profile.user_id = NEW.team_lead_id
        AND lead_profile.status = 'team_lead'
        AND lead_profile.employment_active
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'team_lead_id must reference an active commercial team lead';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_commercial_compensation_profile
  ON public.commercial_compensation_profiles;
CREATE TRIGGER validate_commercial_compensation_profile
  BEFORE INSERT OR UPDATE OF status, employment_active, team_lead_id
  ON public.commercial_compensation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_compensation_profile();

REVOKE ALL ON FUNCTION public.validate_commercial_compensation_profile()
  FROM PUBLIC, anon, authenticated, service_role;

-- A Supabase identity must map to at most one sales representative.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_representatives_user_id_fkey'
      AND conrelid = 'public.sales_representatives'::regclass
  ) THEN
    ALTER TABLE public.sales_representatives
      ADD CONSTRAINT sales_representatives_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_representatives_user_id
  ON public.sales_representatives(user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commercial_build_signature_snapshot(
  p_commercial_user_id uuid,
  p_plan_slug text,
  p_billing_period text,
  p_signed_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_key text := public.commercial_plan_key(p_plan_slug);
  v_plan_slug text;
  v_plan_name text;
  v_monthly_price numeric;
  v_billing_period text := lower(trim(COALESCE(p_billing_period, '')));
  v_profile_status text := 'sprint';
  v_employment_active boolean := false;
  v_phase text := 'sprint';
  v_mode text := 'commission_only';
  v_reservation_rate numeric := 0;
  v_commission numeric := 0;
BEGIN
  IF p_commercial_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_user_required';
  END IF;

  IF v_billing_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_subscription_billing_period';
  END IF;

  SELECT ccp.status, ccp.employment_active
  INTO v_profile_status, v_employment_active
  FROM public.commercial_compensation_profiles ccp
  WHERE ccp.user_id = p_commercial_user_id;

  v_employment_active := COALESCE(v_employment_active, false)
    AND COALESCE(v_profile_status, 'sprint') IN ('engaged', 'team_lead');
  v_phase := CASE WHEN v_employment_active THEN 'engaged' ELSE 'sprint' END;
  v_mode := CASE WHEN v_employment_active THEN 'fixed_plus_reservation' ELSE 'commission_only' END;
  v_reservation_rate := CASE WHEN v_employment_active THEN 0.02 ELSE 0 END;

  CASE v_plan_key
    WHEN 'business' THEN
      v_plan_slug := 'pro';
      v_plan_name := 'TOK Business';
      v_monthly_price := 129;
    WHEN 'premium' THEN
      v_plan_slug := 'premium';
      v_plan_name := 'TOK Premium';
      v_monthly_price := 199;
    WHEN 'elite' THEN
      v_plan_slug := 'elite';
      v_plan_name := 'TOK Elite';
      v_monthly_price := 499;
    ELSE
      v_plan_slug := 'starter';
      v_plan_name := 'TOK Starter';
      v_monthly_price := 69;
  END CASE;

  v_commission := public.commercial_signature_commission_chf(v_plan_slug, v_phase);

  RETURN jsonb_build_object(
    'plan_slug', v_plan_slug,
    'plan_name', v_plan_name,
    'billing_period', v_billing_period,
    'monthly_price_chf', v_monthly_price,
    'contract_value_chf', CASE WHEN v_billing_period = 'yearly' THEN v_monthly_price * 12 ELSE v_monthly_price END,
    'phase', v_phase,
    'acquisition_commission_rate', 0,
    'acquisition_commission_chf', v_commission,
    'commercial_compensation_mode', v_mode,
    'reservation_commission_rate', v_reservation_rate,
    'reservation_commission_starts_at', CASE WHEN v_employment_active THEN COALESCE(p_signed_at, now()) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_build_signature_snapshot(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

-- Rebuild every legacy signature from server-owned plans and the signer's
-- administrator profile.  signed_by/signed_at remain unchanged.
WITH secured AS (
  SELECT
    cpf.source_objectid,
    public.commercial_build_signature_snapshot(
      cpf.signed_by,
      cpf.signed_subscription_plan_slug,
      COALESCE(cpf.signed_subscription_billing_period, 'monthly'),
      cpf.signed_at
    ) AS snapshot
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.status = 'signed'
    AND cpf.signed_by IS NOT NULL
    AND cpf.signed_at IS NOT NULL
)
UPDATE public.commercial_prospect_followups cpf
SET signed_subscription_plan_slug = secured.snapshot->>'plan_slug',
    signed_subscription_plan_name = secured.snapshot->>'plan_name',
    signed_subscription_billing_period = secured.snapshot->>'billing_period',
    signed_subscription_monthly_price_chf = (secured.snapshot->>'monthly_price_chf')::numeric,
    signed_subscription_contract_value_chf = (secured.snapshot->>'contract_value_chf')::numeric,
    acquisition_commission_rate = (secured.snapshot->>'acquisition_commission_rate')::numeric,
    acquisition_commission_chf = (secured.snapshot->>'acquisition_commission_chf')::numeric,
    commercial_compensation_mode = secured.snapshot->>'commercial_compensation_mode',
    reservation_commission_rate = (secured.snapshot->>'reservation_commission_rate')::numeric,
    reservation_commission_starts_at = NULLIF(secured.snapshot->>'reservation_commission_starts_at', '')::timestamptz,
    refusal_reason_codes = ARRAY[]::text[],
    refusal_other_text = NULL,
    updated_at = now()
FROM secured
WHERE cpf.source_objectid = secured.source_objectid;

-- Unsigned rows may contain client-supplied legacy rates.  Remove them before
-- enabling the consistency constraint.
UPDATE public.commercial_prospect_followups
SET signed_by = NULL,
    signed_by_name = NULL,
    signed_at = NULL,
    signed_restaurant_id = NULL,
    signed_subscription_plan_slug = NULL,
    signed_subscription_plan_name = NULL,
    signed_subscription_billing_period = NULL,
    signed_subscription_monthly_price_chf = NULL,
    signed_subscription_contract_value_chf = NULL,
    acquisition_commission_rate = 0,
    acquisition_commission_chf = 0,
    commercial_compensation_mode = 'commission_only',
    reservation_commission_rate = 0,
    reservation_commission_starts_at = NULL,
    refusal_reason_codes = CASE
      WHEN status = 'not_interested' THEN
        CASE WHEN cardinality(refusal_reason_codes) > 0
          THEN refusal_reason_codes
          ELSE ARRAY['not_interested_unspecified']::text[]
        END
      ELSE ARRAY[]::text[]
    END,
    refusal_other_text = CASE WHEN status = 'not_interested' THEN refusal_other_text ELSE NULL END,
    updated_at = now()
WHERE status <> 'signed';

ALTER TABLE public.commercial_prospect_followups
  DROP CONSTRAINT IF EXISTS commercial_prospect_followups_refusal_codes_check,
  ADD CONSTRAINT commercial_prospect_followups_refusal_codes_check
    CHECK (public.commercial_refusal_reason_codes_valid(refusal_reason_codes)),
  DROP CONSTRAINT IF EXISTS commercial_prospect_followups_refusal_state_check,
  ADD CONSTRAINT commercial_prospect_followups_refusal_state_check
    CHECK (
      (
        status = 'not_interested'
        AND cardinality(refusal_reason_codes) > 0
        AND (
          NOT ('other' = ANY(refusal_reason_codes))
          OR NULLIF(trim(COALESCE(refusal_other_text, '')), '') IS NOT NULL
        )
      )
      OR (
        status <> 'not_interested'
        AND cardinality(refusal_reason_codes) = 0
        AND refusal_other_text IS NULL
      )
    ),
  DROP CONSTRAINT IF EXISTS commercial_prospect_followups_refusal_other_length_check,
  ADD CONSTRAINT commercial_prospect_followups_refusal_other_length_check
    CHECK (refusal_other_text IS NULL OR char_length(refusal_other_text) <= 500),
  DROP CONSTRAINT IF EXISTS commercial_prospect_followups_signature_snapshot_check,
  ADD CONSTRAINT commercial_prospect_followups_signature_snapshot_check
    CHECK (
      (
        status = 'signed'
        AND signed_by IS NOT NULL
        AND signed_at IS NOT NULL
        AND signed_subscription_plan_slug IS NOT NULL
        AND signed_subscription_plan_slug IN ('starter', 'pro', 'premium', 'elite')
        AND NULLIF(trim(COALESCE(signed_subscription_plan_name, '')), '') IS NOT NULL
        AND signed_subscription_billing_period IS NOT NULL
        AND signed_subscription_billing_period IN ('monthly', 'yearly')
        AND signed_subscription_monthly_price_chf IS NOT NULL
        AND signed_subscription_monthly_price_chf > 0
        AND signed_subscription_contract_value_chf IS NOT NULL
        AND signed_subscription_contract_value_chf >= signed_subscription_monthly_price_chf
        AND acquisition_commission_rate IS NOT NULL
        AND acquisition_commission_rate = 0
        AND acquisition_commission_chf IS NOT NULL
        AND acquisition_commission_chf >= 0
        AND commercial_compensation_mode IS NOT NULL
        AND reservation_commission_rate IS NOT NULL
        AND (
          (
            commercial_compensation_mode = 'commission_only'
            AND reservation_commission_rate = 0
            AND reservation_commission_starts_at IS NULL
          )
          OR (
            commercial_compensation_mode = 'fixed_plus_reservation'
            AND reservation_commission_rate = 0.02
            AND reservation_commission_starts_at IS NOT NULL
          )
        )
      )
      OR (
        status <> 'signed'
        AND signed_by IS NULL
        AND signed_at IS NULL
        AND signed_restaurant_id IS NULL
        AND signed_subscription_plan_slug IS NULL
        AND signed_subscription_plan_name IS NULL
        AND signed_subscription_billing_period IS NULL
        AND signed_subscription_monthly_price_chf IS NULL
        AND signed_subscription_contract_value_chf IS NULL
        AND acquisition_commission_rate = 0
        AND acquisition_commission_chf = 0
        AND commercial_compensation_mode = 'commission_only'
        AND reservation_commission_rate = 0
        AND reservation_commission_starts_at IS NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS ux_commercial_followups_signed_restaurant
  ON public.commercial_prospect_followups(signed_restaurant_id)
  WHERE status = 'signed' AND signed_restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_followups_owner_status_updated
  ON public.commercial_prospect_followups(assigned_to, status, updated_at DESC)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_followups_refusal_reasons
  ON public.commercial_prospect_followups USING gin(refusal_reason_codes)
  WHERE status = 'not_interested';

CREATE TABLE IF NOT EXISTS public.commercial_prospect_followup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_objectid bigint NOT NULL,
  operation text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_kind text NOT NULL,
  old_status public.commercial_visit_status,
  new_status public.commercial_visit_status NOT NULL,
  old_row jsonb,
  new_row jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_prospect_followup_history_operation_check
    CHECK (operation IN ('baseline', 'insert', 'update')),
  CONSTRAINT commercial_prospect_followup_history_actor_kind_check
    CHECK (actor_kind IN ('commercial', 'admin', 'service_role', 'system'))
);

COMMENT ON TABLE public.commercial_prospect_followup_history IS
  'Append-only audit trail for prospect ownership, status, refusal and secured signature snapshots.';

CREATE INDEX IF NOT EXISTS idx_commercial_followup_history_source_changed
  ON public.commercial_prospect_followup_history(source_objectid, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_followup_history_actor_changed
  ON public.commercial_prospect_followup_history(actor_user_id, changed_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commercial_followup_history_status_changed
  ON public.commercial_prospect_followup_history(new_status, changed_at DESC);

INSERT INTO public.commercial_prospect_followup_history (
  source_objectid, operation, actor_user_id, actor_kind,
  old_status, new_status, old_row, new_row, changed_at
)
SELECT
  cpf.source_objectid, 'baseline', NULL, 'system',
  NULL, cpf.status, NULL, to_jsonb(cpf), now()
FROM public.commercial_prospect_followups cpf
WHERE NOT EXISTS (
  SELECT 1
  FROM public.commercial_prospect_followup_history history
  WHERE history.source_objectid = cpf.source_objectid
);

ALTER TABLE public.commercial_prospect_followup_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_followup_history_admin_select
  ON public.commercial_prospect_followup_history;
CREATE POLICY commercial_followup_history_admin_select
  ON public.commercial_prospect_followup_history
  FOR SELECT TO authenticated
  USING (public.auth_is_super_admin());

DROP POLICY IF EXISTS commercial_followup_history_owner_select
  ON public.commercial_prospect_followup_history;
CREATE POLICY commercial_followup_history_owner_select
  ON public.commercial_prospect_followup_history
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'commercial'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.commercial_prospect_followups cpf
      WHERE cpf.source_objectid = commercial_prospect_followup_history.source_objectid
        AND (
          cpf.assigned_to = (SELECT auth.uid())
          OR cpf.last_contacted_by = (SELECT auth.uid())
          OR cpf.signed_by = (SELECT auth.uid())
        )
    )
  );

REVOKE ALL ON TABLE public.commercial_prospect_followup_history
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_prospect_followup_history
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_commercial_followup_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'commercial prospect history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS prevent_commercial_followup_history_mutation
  ON public.commercial_prospect_followup_history;
CREATE TRIGGER prevent_commercial_followup_history_mutation
  BEFORE UPDATE OR DELETE ON public.commercial_prospect_followup_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_commercial_followup_history_mutation();

REVOKE ALL ON FUNCTION public.prevent_commercial_followup_history_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_commercial_prospect_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_kind text := CASE
    WHEN auth.role() = 'service_role' THEN 'service_role'
    WHEN public.auth_is_super_admin() THEN 'admin'
    WHEN public.has_role(auth.uid(), 'commercial'::public.app_role) THEN 'commercial'
    ELSE 'system'
  END;
BEGIN
  INSERT INTO public.commercial_prospect_followup_history (
    source_objectid,
    operation,
    actor_user_id,
    actor_kind,
    old_status,
    new_status,
    old_row,
    new_row,
    changed_at
  )
  VALUES (
    NEW.source_objectid,
    CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
    v_actor_id,
    v_actor_kind,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_commercial_prospect_followup
  ON public.commercial_prospect_followups;
CREATE TRIGGER audit_commercial_prospect_followup
  AFTER INSERT OR UPDATE ON public.commercial_prospect_followups
  FOR EACH ROW EXECUTE FUNCTION public.audit_commercial_prospect_followup();

REVOKE ALL ON FUNCTION public.audit_commercial_prospect_followup()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_commercial_prospect_followup_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'commercial prospect followups are append-only; record a new status instead';
END;
$$;

DROP TRIGGER IF EXISTS prevent_commercial_prospect_followup_delete
  ON public.commercial_prospect_followups;
CREATE TRIGGER prevent_commercial_prospect_followup_delete
  BEFORE DELETE ON public.commercial_prospect_followups
  FOR EACH ROW EXECUTE FUNCTION public.prevent_commercial_prospect_followup_delete();

REVOKE ALL ON FUNCTION public.prevent_commercial_prospect_followup_delete()
  FROM PUBLIC, anon, authenticated, service_role;

-- Direct writes are removed for every Data API role. Commercial changes must
-- pass the guarded RPC; corrections remain auditable status events.
ALTER TABLE public.commercial_prospect_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_prospect_followups_admin_commercial_select"
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS "commercial_prospect_followups_admin_commercial_insert"
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS "commercial_prospect_followups_admin_commercial_update"
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS commercial_prospect_followups_owner_select
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS commercial_prospect_followups_admin_select
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS commercial_prospect_followups_admin_insert
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS commercial_prospect_followups_admin_update
  ON public.commercial_prospect_followups;
DROP POLICY IF EXISTS commercial_prospect_followups_admin_delete
  ON public.commercial_prospect_followups;

CREATE POLICY commercial_prospect_followups_owner_select
  ON public.commercial_prospect_followups
  FOR SELECT TO authenticated
  USING (
    public.auth_is_super_admin()
    OR (
      public.has_role((SELECT auth.uid()), 'commercial'::public.app_role)
      AND (
        assigned_to = (SELECT auth.uid())
        OR last_contacted_by = (SELECT auth.uid())
        OR signed_by = (SELECT auth.uid())
      )
    )
  );

REVOKE ALL ON TABLE public.commercial_prospect_followups FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.commercial_prospect_followups
  FROM authenticated, service_role;
GRANT SELECT ON TABLE public.commercial_prospect_followups
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_commercial_prospect_followups()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_super_admin boolean := public.auth_is_super_admin();
  v_is_commercial boolean := public.has_role(auth.uid(), 'commercial'::public.app_role);
  v_followups jsonb;
BEGIN
  IF NOT v_is_super_admin AND NOT v_is_commercial THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_access_required';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'source_objectid', cpf.source_objectid,
        'status', cpf.status,
        'can_edit', CASE
          WHEN v_is_super_admin THEN true
          WHEN cpf.status = 'signed' THEN false
          ELSE cpf.assigned_to IS NULL OR cpf.assigned_to = v_actor_id
        END,
        'is_own', v_is_super_admin OR (
          cpf.assigned_to = v_actor_id
          OR cpf.last_contacted_by = v_actor_id
          OR cpf.signed_by = v_actor_id
        ),
        'notes', CASE WHEN v_is_super_admin OR cpf.assigned_to = v_actor_id OR cpf.last_contacted_by = v_actor_id OR cpf.signed_by = v_actor_id THEN cpf.notes ELSE NULL END,
        'refusal_reason_codes', CASE WHEN v_is_super_admin OR cpf.assigned_to = v_actor_id OR cpf.last_contacted_by = v_actor_id OR cpf.signed_by = v_actor_id THEN to_jsonb(cpf.refusal_reason_codes) ELSE '[]'::jsonb END,
        'refusal_other_text', CASE WHEN v_is_super_admin OR cpf.assigned_to = v_actor_id OR cpf.last_contacted_by = v_actor_id OR cpf.signed_by = v_actor_id THEN cpf.refusal_other_text ELSE NULL END,
        'assigned_to', CASE WHEN v_is_super_admin OR cpf.assigned_to = v_actor_id THEN cpf.assigned_to ELSE NULL END,
        'assigned_to_name', cpf.assigned_to_name,
        'last_contacted_by', CASE WHEN v_is_super_admin OR cpf.last_contacted_by = v_actor_id THEN cpf.last_contacted_by ELSE NULL END,
        'last_contacted_by_name', CASE WHEN v_is_super_admin OR cpf.last_contacted_by = v_actor_id THEN cpf.last_contacted_by_name ELSE NULL END,
        'signed_by', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_by ELSE NULL END,
        'signed_by_name', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_by_name ELSE NULL END,
        'signed_at', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_at ELSE NULL END,
        'signed_restaurant_id', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_restaurant_id ELSE NULL END,
        'signed_subscription_plan_slug', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_subscription_plan_slug ELSE NULL END,
        'signed_subscription_plan_name', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_subscription_plan_name ELSE NULL END,
        'signed_subscription_billing_period', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_subscription_billing_period ELSE NULL END,
        'signed_subscription_monthly_price_chf', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_subscription_monthly_price_chf ELSE NULL END,
        'signed_subscription_contract_value_chf', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.signed_subscription_contract_value_chf ELSE NULL END,
        'acquisition_commission_rate', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.acquisition_commission_rate ELSE NULL END,
        'acquisition_commission_chf', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.acquisition_commission_chf ELSE NULL END,
        'commercial_compensation_mode', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.commercial_compensation_mode ELSE NULL END,
        'reservation_commission_rate', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.reservation_commission_rate ELSE NULL END,
        'reservation_commission_starts_at', CASE WHEN v_is_super_admin OR cpf.signed_by = v_actor_id THEN cpf.reservation_commission_starts_at ELSE NULL END,
        'visited_at', CASE WHEN v_is_super_admin OR cpf.assigned_to = v_actor_id THEN cpf.visited_at ELSE NULL END,
        'next_follow_up_at', CASE WHEN v_is_super_admin OR cpf.assigned_to = v_actor_id THEN cpf.next_follow_up_at ELSE NULL END,
        'updated_at', cpf.updated_at
      )
      ORDER BY cpf.source_objectid
    ),
    '[]'::jsonb
  )
  INTO v_followups
  FROM public.commercial_prospect_followups cpf;

  RETURN jsonb_build_object('followups', v_followups);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_commercial_prospect_followup(
  p_source_objectid bigint,
  p_status public.commercial_visit_status,
  p_notes text DEFAULT NULL,
  p_next_follow_up_at date DEFAULT NULL,
  p_refusal_reason_codes text[] DEFAULT ARRAY[]::text[],
  p_refusal_other_text text DEFAULT NULL,
  p_subscription_plan_slug text DEFAULT NULL,
  p_subscription_billing_period text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_super_admin boolean := public.auth_is_super_admin();
  v_is_commercial boolean := public.has_role(auth.uid(), 'commercial'::public.app_role);
  v_existing public.commercial_prospect_followups%ROWTYPE;
  v_result public.commercial_prospect_followups%ROWTYPE;
  v_exists boolean := false;
  v_owner_id uuid;
  v_actor_name text;
  v_owner_name text;
  v_now timestamptz := now();
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_refusal_other text := NULLIF(trim(COALESCE(p_refusal_other_text, '')), '');
  v_reasons text[] := COALESCE(p_refusal_reason_codes, ARRAY[]::text[]);
  v_snapshot jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authentication_required';
  END IF;

  IF NOT v_is_commercial THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'commercial_access_required';
  END IF;

  IF p_source_objectid IS NULL OR p_source_objectid <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_source_objectid';
  END IF;

  IF p_status IS NULL OR p_status = 'not_visited'::public.commercial_visit_status THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_commercial_status';
  END IF;

  IF char_length(COALESCE(v_notes, '')) > 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_notes_too_long';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.source_objectid = p_source_objectid
  FOR UPDATE;
  v_exists := FOUND;

  IF v_exists AND p_expected_updated_at IS NOT NULL
    AND v_existing.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'commercial_followup_changed_reload_required';
  END IF;

  IF v_exists AND NOT v_is_super_admin THEN
    IF v_existing.assigned_to IS NOT NULL AND v_existing.assigned_to <> v_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'prospect_owned_by_another_commercial';
    END IF;

    IF v_existing.status = 'signed'::public.commercial_visit_status THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'signed_prospect_is_admin_locked';
    END IF;
  END IF;

  v_owner_id := COALESCE(v_existing.assigned_to, v_existing.signed_by, v_actor_id);
  IF v_is_super_admin AND NOT v_is_commercial AND v_owner_id = v_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'commercial_owner_required';
  END IF;

  SELECT NULLIF(trim(p.full_name), '')
  INTO v_actor_name
  FROM public.profiles p
  WHERE p.user_id = v_actor_id;
  v_actor_name := COALESCE(v_actor_name, 'Commercial TOK');

  SELECT NULLIF(trim(p.full_name), '')
  INTO v_owner_name
  FROM public.profiles p
  WHERE p.user_id = v_owner_id;
  v_owner_name := COALESCE(v_existing.assigned_to_name, v_owner_name, v_actor_name, 'Commercial TOK');

  IF p_status = 'in_progress'::public.commercial_visit_status THEN
    IF p_next_follow_up_at IS NULL OR p_next_follow_up_at < CURRENT_DATE THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'future_follow_up_date_required';
    END IF;
  ELSIF p_next_follow_up_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'follow_up_date_only_allowed_for_revisit';
  END IF;

  IF p_status = 'not_interested'::public.commercial_visit_status THEN
    IF cardinality(v_reasons) = 0
      OR NOT public.commercial_refusal_reason_codes_valid(v_reasons)
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_reason_required';
    END IF;

    IF 'other' = ANY(v_reasons) AND v_refusal_other IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_other_text_required';
    END IF;

    IF char_length(COALESCE(v_refusal_other, '')) > 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'refusal_other_text_too_long';
    END IF;
  ELSE
    v_reasons := ARRAY[]::text[];
    v_refusal_other := NULL;
  END IF;

  IF p_status = 'signed'::public.commercial_visit_status THEN
    IF lower(trim(COALESCE(p_subscription_plan_slug, ''))) NOT IN ('starter', 'pro', 'premium', 'elite') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_subscription_plan';
    END IF;
    IF lower(trim(COALESCE(p_subscription_billing_period, ''))) NOT IN ('monthly', 'yearly') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_subscription_billing_period';
    END IF;

    v_snapshot := public.commercial_build_signature_snapshot(
      v_owner_id,
      lower(trim(p_subscription_plan_slug)),
      lower(trim(p_subscription_billing_period)),
      COALESCE(v_existing.signed_at, v_now)
    );
  ELSE
    v_snapshot := '{}'::jsonb;
  END IF;

  INSERT INTO public.commercial_prospect_followups (
    source_objectid,
    status,
    notes,
    assigned_to,
    assigned_to_name,
    last_contacted_by,
    last_contacted_by_name,
    visited_at,
    next_follow_up_at,
    refusal_reason_codes,
    refusal_other_text,
    signed_by,
    signed_by_name,
    signed_at,
    signed_restaurant_id,
    signed_subscription_plan_slug,
    signed_subscription_plan_name,
    signed_subscription_billing_period,
    signed_subscription_monthly_price_chf,
    signed_subscription_contract_value_chf,
    acquisition_commission_rate,
    acquisition_commission_chf,
    commercial_compensation_mode,
    reservation_commission_rate,
    reservation_commission_starts_at,
    created_at,
    updated_at
  )
  VALUES (
    p_source_objectid,
    p_status,
    v_notes,
    v_owner_id,
    v_owner_name,
    v_actor_id,
    v_actor_name,
    COALESCE(v_existing.visited_at, v_now),
    CASE WHEN p_status = 'in_progress' THEN p_next_follow_up_at ELSE NULL END,
    v_reasons,
    v_refusal_other,
    CASE WHEN p_status = 'signed' THEN v_owner_id ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_owner_name ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN COALESCE(v_existing.signed_at, v_now) ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_existing.signed_restaurant_id ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'plan_slug' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'plan_name' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'billing_period' ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'monthly_price_chf')::numeric ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'contract_value_chf')::numeric ELSE NULL END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'acquisition_commission_rate')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'acquisition_commission_chf')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN v_snapshot->>'commercial_compensation_mode' ELSE 'commission_only' END,
    CASE WHEN p_status = 'signed' THEN (v_snapshot->>'reservation_commission_rate')::numeric ELSE 0 END,
    CASE WHEN p_status = 'signed' THEN NULLIF(v_snapshot->>'reservation_commission_starts_at', '')::timestamptz ELSE NULL END,
    COALESCE(v_existing.created_at, v_now),
    v_now
  )
  ON CONFLICT (source_objectid) DO UPDATE
  SET status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      assigned_to = EXCLUDED.assigned_to,
      assigned_to_name = EXCLUDED.assigned_to_name,
      last_contacted_by = EXCLUDED.last_contacted_by,
      last_contacted_by_name = EXCLUDED.last_contacted_by_name,
      visited_at = COALESCE(public.commercial_prospect_followups.visited_at, EXCLUDED.visited_at),
      next_follow_up_at = EXCLUDED.next_follow_up_at,
      refusal_reason_codes = EXCLUDED.refusal_reason_codes,
      refusal_other_text = EXCLUDED.refusal_other_text,
      signed_by = EXCLUDED.signed_by,
      signed_by_name = EXCLUDED.signed_by_name,
      signed_at = EXCLUDED.signed_at,
      signed_restaurant_id = EXCLUDED.signed_restaurant_id,
      signed_subscription_plan_slug = EXCLUDED.signed_subscription_plan_slug,
      signed_subscription_plan_name = EXCLUDED.signed_subscription_plan_name,
      signed_subscription_billing_period = EXCLUDED.signed_subscription_billing_period,
      signed_subscription_monthly_price_chf = EXCLUDED.signed_subscription_monthly_price_chf,
      signed_subscription_contract_value_chf = EXCLUDED.signed_subscription_contract_value_chf,
      acquisition_commission_rate = EXCLUDED.acquisition_commission_rate,
      acquisition_commission_chf = EXCLUDED.acquisition_commission_chf,
      commercial_compensation_mode = EXCLUDED.commercial_compensation_mode,
      reservation_commission_rate = EXCLUDED.reservation_commission_rate,
      reservation_commission_starts_at = EXCLUDED.reservation_commission_starts_at,
      updated_at = EXCLUDED.updated_at
  WHERE public.commercial_prospect_followups.assigned_to IS NULL
    OR public.commercial_prospect_followups.assigned_to = v_actor_id
    OR v_is_super_admin
  RETURNING * INTO v_result;

  IF v_result.source_objectid IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'prospect_claimed_by_another_commercial_reload_required';
  END IF;

  RETURN jsonb_build_object(
    'followup', to_jsonb(v_result),
    'commission_generated_chf', CASE
      WHEN v_result.status = 'signed' THEN v_result.acquisition_commission_chf
      ELSE 0
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_commercial_commission_summary(
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_start date := COALESCE(p_period_start, date_trunc('month', now())::date);
  v_period_end date := COALESCE(p_period_end, CURRENT_DATE);
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_total numeric := 0;
  v_count integer := 0;
  v_commercials jsonb := '[]'::jsonb;
  v_signatures jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'super_admin_access_required';
  END IF;
  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_period';
  END IF;

  v_start_ts := v_period_start::timestamptz;
  v_end_ts := (v_period_end + 1)::timestamptz;

  SELECT
    COALESCE(count(*), 0)::integer,
    COALESCE(sum(cpf.acquisition_commission_chf), 0)::numeric
  INTO v_count, v_total
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.status = 'signed'
    AND cpf.signed_at >= v_start_ts
    AND cpf.signed_at < v_end_ts;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'commercial_user_id', grouped.commercial_user_id,
      'commercial_name', grouped.commercial_name,
      'signatures_count', grouped.signatures_count,
      'commission_chf', round(grouped.commission_chf, 2)
    )
    ORDER BY grouped.commission_chf DESC, grouped.commercial_name
  ), '[]'::jsonb)
  INTO v_commercials
  FROM (
    SELECT
      cpf.signed_by AS commercial_user_id,
      COALESCE(NULLIF(max(cpf.signed_by_name), ''), 'Commercial TOK') AS commercial_name,
      count(*)::integer AS signatures_count,
      sum(cpf.acquisition_commission_chf)::numeric AS commission_chf
    FROM public.commercial_prospect_followups cpf
    WHERE cpf.status = 'signed'
      AND cpf.signed_at >= v_start_ts
      AND cpf.signed_at < v_end_ts
    GROUP BY cpf.signed_by
  ) grouped;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'source_objectid', cpf.source_objectid,
      'commercial_user_id', cpf.signed_by,
      'commercial_name', COALESCE(NULLIF(cpf.signed_by_name, ''), 'Commercial TOK'),
      'signed_at', cpf.signed_at,
      'plan_slug', cpf.signed_subscription_plan_slug,
      'plan_name', cpf.signed_subscription_plan_name,
      'commission_chf', round(cpf.acquisition_commission_chf, 2)
    )
    ORDER BY cpf.signed_at DESC, cpf.source_objectid
  ), '[]'::jsonb)
  INTO v_signatures
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.status = 'signed'
    AND cpf.signed_at >= v_start_ts
    AND cpf.signed_at < v_end_ts;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', v_period_start, 'end', v_period_end),
    'total_commission_chf', round(v_total, 2),
    'signed_restaurants_count', v_count,
    'commercials', v_commercials,
    'signatures', v_signatures
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.get_commercial_compensation_summary(
  p_commercial_user_id uuid DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_target_user_id uuid := COALESCE(p_commercial_user_id, auth.uid());
  v_is_super_admin boolean := public.auth_is_super_admin();
  v_period_start date := COALESCE(p_period_start, date_trunc('month', now())::date);
  v_period_end date := COALESCE(p_period_end, CURRENT_DATE);
  v_period_start_ts timestamptz;
  v_period_end_ts timestamptz;
  v_profile public.commercial_compensation_profiles%ROWTYPE;
  v_profile_exists boolean := false;
  v_status text := 'sprint';
  v_sprint_started_at date;
  v_sprint_end_at date;
  v_employment_active boolean := false;
  v_phase text := 'sprint';
  v_fixed_salary_chf numeric := 0;
  v_period_signature_count integer := 0;
  v_period_signature_commission_chf numeric := 0;
  v_sprint_signature_count integer := 0;
  v_sprint_bonus_chf numeric := 0;
  v_sprint_bonus_payable_chf numeric := 0;
  v_personal_reservation_count integer := 0;
  v_personal_reservation_base_chf numeric := 0;
  v_personal_reservation_commission_chf numeric := 0;
  v_team_reservation_count integer := 0;
  v_team_reservation_base_chf numeric := 0;
  v_team_reservation_commission_chf numeric := 0;
  v_adjustments_chf numeric := 0;
  v_signature_breakdown jsonb := '[]'::jsonb;
  v_adjustments jsonb := '[]'::jsonb;
  v_total_chf numeric := 0;
BEGIN
  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'commercial_user_required';
  END IF;

  IF NOT v_is_super_admin AND v_target_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT v_is_super_admin
    AND NOT public.has_role(v_actor_id, 'commercial'::public.app_role)
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  v_period_start_ts := v_period_start::timestamptz;
  v_period_end_ts := (v_period_end + 1)::timestamptz;

  SELECT *
  INTO v_profile
  FROM public.commercial_compensation_profiles ccp
  WHERE ccp.user_id = v_target_user_id;

  v_profile_exists := FOUND;

  IF v_profile_exists THEN
    v_status := v_profile.status;
    v_sprint_started_at := v_profile.sprint_started_at;
    v_employment_active := v_profile.employment_active AND v_profile.status IN ('engaged', 'team_lead');
  ELSE
    SELECT COALESCE(MIN(cpf.signed_at)::date, CURRENT_DATE)
    INTO v_sprint_started_at
    FROM public.commercial_prospect_followups cpf
    WHERE cpf.signed_by = v_target_user_id
      AND cpf.status = 'signed';
  END IF;

  v_sprint_started_at := COALESCE(v_sprint_started_at, CURRENT_DATE);
  v_sprint_end_at := v_sprint_started_at + 60;
  v_phase := CASE WHEN v_employment_active THEN 'engaged' ELSE 'sprint' END;
  v_fixed_salary_chf := CASE
    WHEN v_employment_active AND v_status = 'team_lead' THEN 3500
    WHEN v_employment_active THEN 2500
    ELSE 0
  END;

  SELECT COUNT(*)::integer
  INTO v_sprint_signature_count
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.signed_by = v_target_user_id
    AND cpf.status = 'signed'
    AND cpf.signed_at IS NOT NULL
    AND cpf.signed_at >= v_sprint_started_at::timestamptz
    AND cpf.signed_at < (v_sprint_started_at + 60)::timestamptz;

  v_sprint_bonus_chf := public.commercial_sprint_bonus_chf(v_sprint_signature_count);
  v_sprint_bonus_payable_chf := CASE
    WHEN v_period_start <= v_sprint_end_at AND v_period_end >= v_sprint_end_at THEN v_sprint_bonus_chf
    ELSE 0
  END;

  WITH period_signatures AS (
    SELECT
      public.commercial_plan_key(cpf.signed_subscription_plan_slug) AS plan_key,
      COALESCE(NULLIF(cpf.signed_subscription_plan_name, ''), cpf.signed_subscription_plan_slug, 'TOK Starter') AS plan_name,
      COALESCE(cpf.acquisition_commission_chf, 0)::numeric AS commission_chf
    FROM public.commercial_prospect_followups cpf
    WHERE cpf.signed_by = v_target_user_id
      AND cpf.status = 'signed'
      AND cpf.signed_at IS NOT NULL
      AND cpf.signed_at >= v_period_start_ts
      AND cpf.signed_at < v_period_end_ts
  ),
  grouped AS (
    SELECT
      plan_key,
      MAX(plan_name) AS plan_name,
      COUNT(*)::integer AS signatures_count,
      SUM(commission_chf)::numeric AS commission_chf
    FROM period_signatures
    GROUP BY plan_key
  )
  SELECT
    COALESCE(SUM(signatures_count), 0)::integer,
    COALESCE(SUM(commission_chf), 0)::numeric,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'plan_key', plan_key,
          'plan_name', plan_name,
          'signatures_count', signatures_count,
          'commission_chf', round(commission_chf, 2)
        )
        ORDER BY CASE plan_key
          WHEN 'starter' THEN 1
          WHEN 'business' THEN 2
          WHEN 'premium' THEN 3
          WHEN 'elite' THEN 4
          ELSE 5
        END
      ),
      '[]'::jsonb
    )
  INTO v_period_signature_count, v_period_signature_commission_chf, v_signature_breakdown
  FROM grouped;

  WITH personal_restaurants AS (
    SELECT
      cpf.signed_restaurant_id AS restaurant_id,
      GREATEST(
        cpf.signed_at,
        COALESCE(cpf.reservation_commission_starts_at, cpf.signed_at),
        COALESCE(v_profile.engaged_at::timestamptz, cpf.signed_at)
      ) AS commission_starts_at
    FROM public.commercial_prospect_followups cpf
    WHERE cpf.signed_by = v_target_user_id
      AND cpf.status = 'signed'
      AND cpf.signed_restaurant_id IS NOT NULL
  )
  SELECT
    COUNT(r.id)::integer,
    COUNT(r.id)::numeric * 5
  INTO v_personal_reservation_count, v_personal_reservation_base_chf
  FROM public.reservations r
  JOIN personal_restaurants pr ON pr.restaurant_id = r.restaurant_id
  WHERE r.confirmed_at IS NOT NULL
    AND r.confirmed_at >= v_period_start_ts
    AND r.confirmed_at >= pr.commission_starts_at
    AND r.confirmed_at < v_period_end_ts
    AND COALESCE(r.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'pending', 'refused')
    AND r.cancelled_by IS NULL;

  v_personal_reservation_commission_chf := CASE
    WHEN v_employment_active THEN COALESCE(v_personal_reservation_count, 0)::numeric * 0.10
    ELSE 0
  END;

  IF v_employment_active AND v_status = 'team_lead' THEN
    WITH team_commercials AS (
      SELECT ccp.user_id, ccp.engaged_at
      FROM public.commercial_compensation_profiles ccp
      WHERE ccp.team_lead_id = v_target_user_id
        AND ccp.user_id <> v_target_user_id
    ),
    team_restaurants AS (
      SELECT
        cpf.signed_restaurant_id AS restaurant_id,
        GREATEST(
          cpf.signed_at,
          COALESCE(cpf.reservation_commission_starts_at, cpf.signed_at),
          COALESCE(tc.engaged_at::timestamptz, cpf.signed_at)
        ) AS commission_starts_at
      FROM public.commercial_prospect_followups cpf
      JOIN team_commercials tc ON tc.user_id = cpf.signed_by
      WHERE cpf.status = 'signed'
        AND cpf.signed_restaurant_id IS NOT NULL
    )
    SELECT
      COUNT(r.id)::integer,
      COUNT(r.id)::numeric * 5
    INTO v_team_reservation_count, v_team_reservation_base_chf
    FROM public.reservations r
    JOIN team_restaurants tr ON tr.restaurant_id = r.restaurant_id
    WHERE r.confirmed_at IS NOT NULL
      AND r.confirmed_at >= v_period_start_ts
      AND r.confirmed_at >= tr.commission_starts_at
      AND r.confirmed_at < v_period_end_ts
      AND COALESCE(r.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'pending', 'refused')
      AND r.cancelled_by IS NULL;

    v_team_reservation_commission_chf := COALESCE(v_team_reservation_count, 0)::numeric * 0.05;
  END IF;

  SELECT
    COALESCE(SUM(cca.amount_chf), 0)::numeric,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'kind', cca.kind,
          'label', cca.label,
          'amount_chf', round(cca.amount_chf, 2),
          'occurred_at', cca.occurred_at,
          'restaurant_id', cca.restaurant_id,
          'source_objectid', cca.source_objectid,
          'notes', cca.notes
        )
        ORDER BY cca.occurred_at DESC
      ),
      '[]'::jsonb
    )
  INTO v_adjustments_chf, v_adjustments
  FROM public.commercial_compensation_adjustments cca
  WHERE cca.commercial_user_id = v_target_user_id
    AND cca.occurred_at >= v_period_start_ts
    AND cca.occurred_at < v_period_end_ts;

  v_total_chf :=
    COALESCE(v_fixed_salary_chf, 0)
    + COALESCE(v_period_signature_commission_chf, 0)
    + COALESCE(v_personal_reservation_commission_chf, 0)
    + COALESCE(v_team_reservation_commission_chf, 0)
    + COALESCE(v_sprint_bonus_payable_chf, 0)
    + COALESCE(v_adjustments_chf, 0);

  RETURN jsonb_build_object(
    'commercial_user_id', v_target_user_id,
    'period', jsonb_build_object(
      'start', v_period_start,
      'end', v_period_end
    ),
    'profile', jsonb_build_object(
      'exists', v_profile_exists,
      'status', v_status,
      'employment_active', v_employment_active,
      'sprint_started_at', v_sprint_started_at,
      'sprint_end_at', v_sprint_end_at,
      'engaged_at', CASE WHEN v_profile_exists THEN v_profile.engaged_at ELSE NULL END,
      'team_lead_id', CASE WHEN v_profile_exists THEN v_profile.team_lead_id ELSE NULL END,
      'engagement_eligible', v_sprint_signature_count >= 50
    ),
    'fixed_salary', jsonb_build_object(
      'monthly_chf', round(v_fixed_salary_chf, 2),
      'rule', CASE
        WHEN v_status = 'team_lead' THEN 'Responsable commercial: 3500 CHF/mois si actif.'
        WHEN v_status = 'engaged' THEN 'Commercial engage: 2500 CHF/mois si actif.'
        ELSE 'Aucun fixe pendant le sprint de 60 jours.'
      END
    ),
    'signatures', jsonb_build_object(
      'period_count', v_period_signature_count,
      'sprint_count', v_sprint_signature_count,
      'target_for_engagement', 50,
      'commission_phase', v_phase,
      'commission_chf', round(v_period_signature_commission_chf, 2),
      'breakdown', v_signature_breakdown
    ),
    'sprint_bonus', jsonb_build_object(
      'current_best_chf', round(v_sprint_bonus_chf, 2),
      'payable_this_period_chf', round(v_sprint_bonus_payable_chf, 2),
      'paid_at_sprint_end', v_sprint_end_at
    ),
    'reservations', jsonb_build_object(
      'enabled', v_employment_active,
      'tok_base_per_honored_reservation_chf', 5,
      'personal_count', COALESCE(v_personal_reservation_count, 0),
      'personal_rate_chf', 0.10,
      'personal_base_chf', round(COALESCE(v_personal_reservation_base_chf, 0), 2),
      'personal_commission_chf', round(v_personal_reservation_commission_chf, 2),
      'team_count', COALESCE(v_team_reservation_count, 0),
      'team_rate_chf', 0.05,
      'team_base_chf', round(COALESCE(v_team_reservation_base_chf, 0), 2),
      'team_commission_chf', round(v_team_reservation_commission_chf, 2)
    ),
    'adjustments', jsonb_build_object(
      'amount_chf', round(COALESCE(v_adjustments_chf, 0), 2),
      'items', v_adjustments
    ),
    'total_chf', round(v_total_chf, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_commercial_prospect_followups()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_commercial_prospect_followup(
  bigint, public.commercial_visit_status, text, date, text[], text, text, text, timestamptz
)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_admin_commercial_commission_summary(date, date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_commercial_prospect_followups()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_commercial_prospect_followup(
  bigint, public.commercial_visit_status, text, date, text[], text, text, text, timestamptz
)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_commercial_commission_summary(date, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_commercial_prospect_followup(
  bigint, public.commercial_visit_status, text, date, text[], text, text, text, timestamptz
) IS
  'Only supported commercial write path. Derives identity, ownership and every financial snapshot server-side.';

NOTIFY pgrst, 'reload schema';
