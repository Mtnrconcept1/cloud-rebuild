-- super_admin_sensitive_rls_hardening
-- Keep sensitive admin/accounting/security surfaces restricted to the
-- platform super admin account or service_role. Business owner/client access
-- policies on operational tables are intentionally left untouched.

CREATE OR REPLACE FUNCTION public.auth_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = auth.uid()
        AND lower(au.email) = 'rbarman@hotmail.ch'
    );
$$;

REVOKE ALL ON FUNCTION public.auth_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_super_admin() TO authenticated, service_role;

DO $$
DECLARE
  v_super_admin_id uuid;
BEGIN
  SELECT au.id
  INTO v_super_admin_id
  FROM auth.users au
  WHERE lower(au.email) = 'rbarman@hotmail.ch'
  LIMIT 1;

  IF v_super_admin_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_super_admin_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

-- Roles remain visible to the current user, but role management is now a
-- super-admin operation. This prevents another admin account from granting
-- itself or others elevated access.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "public_read_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_self_select" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_super_admin_all" ON public.user_roles;

CREATE POLICY "user_roles_self_select"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.auth_is_super_admin());

CREATE POLICY "user_roles_super_admin_all"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.auth_is_super_admin())
  WITH CHECK (public.auth_is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- Feature flags are public to read, but only the platform super admin can
-- change rollout state from the Data API.
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_admin_all" ON public.feature_flags;
DROP POLICY IF EXISTS "feature_flags_super_admin_write" ON public.feature_flags;

CREATE POLICY "feature_flags_super_admin_write"
  ON public.feature_flags
  FOR ALL
  TO authenticated
  USING (public.auth_is_super_admin())
  WITH CHECK (public.auth_is_super_admin());

-- Audit and email queues must not accept direct client inserts. SECURITY
-- DEFINER helpers and Edge Functions can still write through service_role or
-- owner-bypassed server code.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_super_admin_select" ON public.audit_log;

CREATE POLICY "audit_log_super_admin_select"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.auth_is_super_admin());

DROP POLICY IF EXISTS "Admins can view email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Authenticated can insert emails" ON public.email_queue;
DROP POLICY IF EXISTS "email_queue_super_admin_select" ON public.email_queue;

CREATE POLICY "email_queue_super_admin_select"
  ON public.email_queue
  FOR SELECT
  TO authenticated
  USING (public.auth_is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.email_queue FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT ON public.email_queue TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
GRANT ALL ON public.email_queue TO service_role;

-- Admin-only technical/financial tables. These tables should not have owner
-- access from ordinary users; all direct access is restricted to the super
-- admin account. Service role remains available for trusted Edge Functions.
DO $$
DECLARE
  t text;
  p record;
  super_admin_tables text[] := ARRAY[
    'admin_user_account_states',
    'admin_supabase_advisor_snapshots',
    'admin_dashboard_log_reset_history',
    'admin_month_locks',
    'admin_marketplace_alerts',
    'admin_marketplace_alert_events',
    'marketplace_alert_states',
    'marketplace_alert_state_history',
    'feature_flag_audit_logs',
    'edge_function_audit_logs',
    'ai_admin_events',
    'ai_security_events',
    'platform_revenue_entries',
    'platform_cost_entries',
    'marketing_budget_periods',
    'ai_usage_costs',
    'commercial_commissions',
    'restaurant_deals',
    'stripe_webhook_events',
    'rate_limit_buckets',
    'tok_connect_access_tokens',
    'tok_connect_idempotency_keys'
  ];
BEGIN
  FOREACH t IN ARRAY super_admin_tables LOOP
    IF to_regclass(format('%I.%I', 'public', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      FOR p IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.auth_is_super_admin()) WITH CHECK (public.auth_is_super_admin())',
        t || '_super_admin_all',
        t
      );

      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END;
$$;

-- Commercial compensation remains readable by the commercial for their own
-- figures, but administrative writes require the platform super admin.
ALTER TABLE public.commercial_compensation_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_compensation_profiles_admin_select" ON public.commercial_compensation_profiles;
DROP POLICY IF EXISTS "commercial_compensation_profiles_admin_write" ON public.commercial_compensation_profiles;
DROP POLICY IF EXISTS "commercial_compensation_profiles_self_or_super_select" ON public.commercial_compensation_profiles;
DROP POLICY IF EXISTS "commercial_compensation_profiles_super_admin_write" ON public.commercial_compensation_profiles;

CREATE POLICY "commercial_compensation_profiles_self_or_super_select"
  ON public.commercial_compensation_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.auth_is_super_admin());

CREATE POLICY "commercial_compensation_profiles_super_admin_write"
  ON public.commercial_compensation_profiles
  FOR ALL
  TO authenticated
  USING (public.auth_is_super_admin())
  WITH CHECK (public.auth_is_super_admin());

ALTER TABLE public.commercial_compensation_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commercial_compensation_adjustments_admin_commercial_select" ON public.commercial_compensation_adjustments;
DROP POLICY IF EXISTS "commercial_compensation_adjustments_admin_write" ON public.commercial_compensation_adjustments;
DROP POLICY IF EXISTS "commercial_compensation_adjustments_self_or_super_select" ON public.commercial_compensation_adjustments;
DROP POLICY IF EXISTS "commercial_compensation_adjustments_super_admin_write" ON public.commercial_compensation_adjustments;

CREATE POLICY "commercial_compensation_adjustments_self_or_super_select"
  ON public.commercial_compensation_adjustments
  FOR SELECT
  TO authenticated
  USING (commercial_user_id = auth.uid() OR public.auth_is_super_admin());

CREATE POLICY "commercial_compensation_adjustments_super_admin_write"
  ON public.commercial_compensation_adjustments
  FOR ALL
  TO authenticated
  USING (public.auth_is_super_admin())
  WITH CHECK (public.auth_is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_compensation_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_compensation_adjustments TO authenticated;

CREATE INDEX IF NOT EXISTS idx_commercial_compensation_adjustments_created_by
  ON public.commercial_compensation_adjustments(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_prospect_followups_last_contacted_by
  ON public.commercial_prospect_followups(last_contacted_by)
  WHERE last_contacted_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_commercial_prospect_commission_summary(
  p_source_objectid bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_super_admin boolean := public.auth_is_super_admin();
  v_followup public.commercial_prospect_followups%ROWTYPE;
  v_reservations_count integer := 0;
  v_reservation_base_chf numeric := 0;
  v_reservation_commission_chf numeric := 0;
  v_reservation_rate numeric := 0.02;
  v_reservation_start timestamptz;
BEGIN
  IF p_source_objectid IS NULL THEN
    RAISE EXCEPTION 'source_objectid_required';
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT v_is_super_admin
    AND NOT public.has_role(v_actor_id, 'commercial'::public.app_role)
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_followup
  FROM public.commercial_prospect_followups cpf
  WHERE cpf.source_objectid = p_source_objectid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'exists', false,
      'source_objectid', p_source_objectid
    );
  END IF;

  IF auth.role() <> 'service_role'
    AND NOT v_is_super_admin
    AND v_followup.signed_by IS DISTINCT FROM v_actor_id
    AND v_followup.assigned_to IS DISTINCT FROM v_actor_id
    AND v_followup.last_contacted_by IS DISTINCT FROM v_actor_id
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_reservation_start := COALESCE(
    v_followup.reservation_commission_starts_at,
    v_followup.signed_at,
    v_followup.created_at
  );

  IF v_followup.status = 'signed'
    AND v_followup.commercial_compensation_mode = 'fixed_plus_reservation'
    AND v_followup.signed_restaurant_id IS NOT NULL
  THEN
    SELECT
      COUNT(*)::integer,
      (COUNT(*)::numeric * 5)::numeric
    INTO v_reservations_count, v_reservation_base_chf
    FROM public.reservations r
    WHERE r.restaurant_id = v_followup.signed_restaurant_id
      AND r.confirmed_at IS NOT NULL
      AND r.confirmed_at >= v_reservation_start
      AND COALESCE(r.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'pending', 'refused')
      AND r.cancelled_by IS NULL;

    v_reservation_rate := COALESCE(NULLIF(v_followup.reservation_commission_rate, 0), 0.02);
    v_reservation_commission_chf := v_reservation_base_chf * v_reservation_rate;
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'source_objectid', v_followup.source_objectid,
    'signed_restaurant_id', v_followup.signed_restaurant_id,
    'subscription', jsonb_build_object(
      'plan_slug', v_followup.signed_subscription_plan_slug,
      'plan_name', v_followup.signed_subscription_plan_name,
      'billing_period', v_followup.signed_subscription_billing_period,
      'monthly_price_chf', v_followup.signed_subscription_monthly_price_chf,
      'contract_value_chf', v_followup.signed_subscription_contract_value_chf
    ),
    'acquisition_commission', jsonb_build_object(
      'rate', v_followup.acquisition_commission_rate,
      'amount_chf', round(COALESCE(v_followup.acquisition_commission_chf, 0), 2)
    ),
    'reservation_commission', jsonb_build_object(
      'enabled', v_followup.commercial_compensation_mode = 'fixed_plus_reservation',
      'rate', v_reservation_rate,
      'tok_base_per_reservation_chf', 5,
      'amount_per_reservation_chf', round(5 * v_reservation_rate, 2),
      'starts_at', v_reservation_start,
      'reservations_count', v_reservations_count,
      'base_chf', round(v_reservation_base_chf, 2),
      'amount_chf', round(v_reservation_commission_chf, 2)
    )
  );
END;
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
  IF NOT v_is_service_role AND NOT public.auth_is_super_admin() THEN
    RAISE EXCEPTION 'Super admin access required.';
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

REVOKE ALL ON FUNCTION public.get_commercial_prospect_commission_summary(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_commercial_prospect_commission_summary(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_compensation_summary(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;

-- Trigger/internal SECURITY DEFINER routines should not be callable through
-- the Data API by anon/authenticated users. Triggers can still execute them.
DO $$
DECLARE
  fn text;
  internal_security_definer_functions text[] := ARRAY[
    'public.handle_new_user()',
    'public.handle_email_confirmation()',
    'public.log_feature_flag_audit()',
    'public.prevent_accounting_period_mutation_when_locked()',
    'public.guard_ad_campaign_client_write()',
    'public.record_actualites_order_conversion_trigger()',
    'public.record_actualites_reservation_conversion_trigger()',
    'public.trg_ensure_order_number()',
    'public.trg_ensure_reservation_reference()',
    'public.trigger_invoice_notification()',
    'public.trigger_recompute_review_stats()',
    'public.trigger_refresh_kpis()',
    'public.trigger_reservation_notifications()',
    'public.trigger_restaurant_review_notification()',
    'public.trigger_review_reply_notification()',
    'public.trigger_review_report_admin_notification()',
    'public.update_loyalty_tier()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_security_definer_functions LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
