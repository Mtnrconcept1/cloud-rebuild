-- Commercial compensation accounting.
-- Implements the two-step remuneration plan:
-- 1. 60-day commission-only sprint.
-- 2. Fixed engaged/team-lead compensation with recurring reservation commission.

CREATE TABLE IF NOT EXISTS public.commercial_compensation_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sprint',
  sprint_started_at date NOT NULL DEFAULT CURRENT_DATE,
  engaged_at date,
  employment_active boolean NOT NULL DEFAULT false,
  team_lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_compensation_profiles_status_check
    CHECK (status IN ('sprint', 'engaged', 'team_lead', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_commercial_compensation_profiles_team_lead
  ON public.commercial_compensation_profiles(team_lead_id)
  WHERE team_lead_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_commercial_compensation_profiles ON public.commercial_compensation_profiles;
CREATE TRIGGER set_updated_at_commercial_compensation_profiles
  BEFORE UPDATE ON public.commercial_compensation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commercial_compensation_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_compensation_profiles_admin_select" ON public.commercial_compensation_profiles;
CREATE POLICY "commercial_compensation_profiles_admin_select"
  ON public.commercial_compensation_profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "commercial_compensation_profiles_admin_write" ON public.commercial_compensation_profiles;
CREATE POLICY "commercial_compensation_profiles_admin_write"
  ON public.commercial_compensation_profiles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_compensation_profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.commercial_compensation_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  amount_chf numeric(10, 2) NOT NULL,
  source_objectid bigint,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_compensation_adjustments_amount_check CHECK (amount_chf <> 0),
  CONSTRAINT commercial_compensation_adjustments_kind_check CHECK (
    kind IN (
      'manual_bonus',
      'manual_prime',
      'sprint_bonus',
      'upgrade_starter_business',
      'upgrade_business_premium',
      'upgrade_premium_elite',
      'campaign_pack_100',
      'campaign_pack_250',
      'ai_growth_pack',
      'correction'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_commercial_compensation_adjustments_user_period
  ON public.commercial_compensation_adjustments(commercial_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_compensation_adjustments_restaurant
  ON public.commercial_compensation_adjustments(restaurant_id)
  WHERE restaurant_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_commercial_compensation_adjustments ON public.commercial_compensation_adjustments;
CREATE TRIGGER set_updated_at_commercial_compensation_adjustments
  BEFORE UPDATE ON public.commercial_compensation_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.commercial_compensation_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_compensation_adjustments_admin_commercial_select" ON public.commercial_compensation_adjustments;
CREATE POLICY "commercial_compensation_adjustments_admin_commercial_select"
  ON public.commercial_compensation_adjustments
  FOR SELECT
  TO authenticated
  USING (
    commercial_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "commercial_compensation_adjustments_admin_write" ON public.commercial_compensation_adjustments;
CREATE POLICY "commercial_compensation_adjustments_admin_write"
  ON public.commercial_compensation_adjustments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_compensation_adjustments TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_plan_key(p_plan_slug text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_plan_slug, '')) IN ('pro', 'business') THEN 'business'
    WHEN lower(COALESCE(p_plan_slug, '')) = 'premium' THEN 'premium'
    WHEN lower(COALESCE(p_plan_slug, '')) = 'elite' THEN 'elite'
    ELSE 'starter'
  END;
$$;

CREATE OR REPLACE FUNCTION public.commercial_signature_commission_chf(
  p_plan_slug text,
  p_phase text DEFAULT 'sprint'
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_phase, 'sprint')) IN ('engaged', 'team_lead', 'fixed') THEN
      CASE public.commercial_plan_key(p_plan_slug)
        WHEN 'business' THEN 120
        WHEN 'premium' THEN 190
        WHEN 'elite' THEN 300
        ELSE 60
      END
    ELSE
      CASE public.commercial_plan_key(p_plan_slug)
        WHEN 'business' THEN 220
        WHEN 'premium' THEN 350
        WHEN 'elite' THEN 650
        ELSE 120
      END
  END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.commercial_sprint_bonus_chf(p_signature_count integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_signature_count, 0) >= 40 THEN 4000
    WHEN COALESCE(p_signature_count, 0) >= 30 THEN 2500
    WHEN COALESCE(p_signature_count, 0) >= 20 THEN 1500
    WHEN COALESCE(p_signature_count, 0) >= 10 THEN 500
    ELSE 0
  END::numeric;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
  p_user_id uuid,
  p_roles public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_role public.app_role;
  v_roles public.app_role[];
  v_old_roles public.app_role[];
  v_last_admin_removal boolean;
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT COALESCE(array_agg(deduped.role_name ORDER BY deduped.role_name::text), ARRAY['client'::public.app_role])
  INTO v_roles
  FROM (
    SELECT DISTINCT role_name
    FROM unnest(COALESCE(p_roles, ARRAY['client'::public.app_role])) AS role_name
    WHERE role_name IS NOT NULL
  ) AS deduped;

  IF COALESCE(array_length(v_roles, 1), 0) = 0 THEN
    v_roles := ARRAY['client'::public.app_role];
  END IF;

  PERFORM 1
  FROM public.user_roles
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(ur.role ORDER BY ur.role::text), ARRAY[]::public.app_role[])
  INTO v_old_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  v_last_admin_removal :=
    'admin'::public.app_role = ANY(v_old_roles)
    AND NOT ('admin'::public.app_role = ANY(v_roles))
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::public.app_role
        AND ur.user_id <> p_user_id
    );

  IF v_last_admin_removal THEN
    RAISE EXCEPTION 'Cannot remove the last admin role.';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  IF 'commercial'::public.app_role = ANY(v_roles) THEN
    INSERT INTO public.commercial_compensation_profiles (
      user_id,
      status,
      sprint_started_at,
      employment_active
    )
    VALUES (
      p_user_id,
      'sprint',
      CURRENT_DATE,
      false
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      status = CASE
        WHEN public.commercial_compensation_profiles.status = 'inactive' THEN 'sprint'
        ELSE public.commercial_compensation_profiles.status
      END,
      updated_at = now();
  ELSE
    UPDATE public.commercial_compensation_profiles
    SET
      status = 'inactive',
      employment_active = false,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    v_actor_id,
    'admin_set_user_roles',
    'user_roles',
    p_user_id,
    jsonb_build_object('roles', COALESCE(to_jsonb(v_old_roles), '[]'::jsonb)),
    jsonb_build_object('roles', COALESCE(to_jsonb(v_roles), '[]'::jsonb))
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
  v_is_admin boolean := auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role);
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

  IF NOT v_is_admin AND v_target_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT v_is_admin
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
      public.commercial_signature_commission_chf(cpf.signed_subscription_plan_slug, v_phase) AS commission_chf
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
    SELECT DISTINCT cpf.signed_restaurant_id AS restaurant_id
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
    AND r.confirmed_at < v_period_end_ts
    AND COALESCE(r.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'pending', 'refused')
    AND r.cancelled_by IS NULL;

  v_personal_reservation_commission_chf := CASE
    WHEN v_employment_active THEN COALESCE(v_personal_reservation_count, 0)::numeric * 0.10
    ELSE 0
  END;

  IF v_employment_active AND v_status = 'team_lead' THEN
    WITH team_commercials AS (
      SELECT ccp.user_id
      FROM public.commercial_compensation_profiles ccp
      WHERE ccp.team_lead_id = v_target_user_id
        AND ccp.user_id <> v_target_user_id
    ),
    team_restaurants AS (
      SELECT DISTINCT cpf.signed_restaurant_id AS restaurant_id
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

REVOKE ALL ON FUNCTION public.commercial_plan_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commercial_signature_commission_chf(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commercial_sprint_bonus_chf(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commercial_plan_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_signature_commission_chf(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_sprint_bonus_chf(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
