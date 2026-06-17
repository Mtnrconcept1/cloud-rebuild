DO $$
BEGIN
  IF to_regprocedure('public.get_customer_crm_profiles_source(uuid,text,integer,integer)') IS NULL
     AND to_regprocedure('public.get_customer_crm_profiles(uuid,text,integer,integer)') IS NOT NULL THEN
    ALTER FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer)
      RENAME TO get_customer_crm_profiles_source;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_session_has_sensitive_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.role() = 'service_role'
    OR COALESCE(auth.jwt()->>'aal', '') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION public.restaurant_has_elite_crm_subscription(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_ai_subscriptions ras
    LEFT JOIN public.restaurant_subscription_plans rsp
      ON rsp.id = ras.restaurant_subscription_plan_id
    WHERE ras.restaurant_id = p_restaurant_id
      AND ras.status IN ('trialing', 'active')
      AND (ras.current_period_end IS NULL OR ras.current_period_end > now())
      AND lower(COALESCE(rsp.slug, ras.plan, '')) = 'elite'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_customer_crm_profiles(
  p_restaurant_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 80,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  full_name text,
  email text,
  phone text,
  city text,
  address text,
  avatar_url text,
  loyalty_points integer,
  total_orders integer,
  total_reservations integer,
  restaurants_count integer,
  total_spent numeric,
  avg_order_value numeric,
  first_seen_at timestamptz,
  last_activity_at timestamptz,
  last_order_at timestamptz,
  last_reservation_at timestamptz,
  last_restaurant_name text,
  preferred_channel text,
  preferred_service text,
  preferred_weekday integer,
  favorite_order_hour integer,
  favorite_reservation_hour integer,
  favorite_items jsonb,
  favorite_cuisines text[],
  crm_score integer,
  total_matching_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.crm_session_has_sensitive_access() THEN
    RAISE EXCEPTION 'CRM two-factor authentication required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_restaurant_id IS NULL THEN
    IF NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'Admin access required for global CRM.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF public.auth_is_admin() THEN
    -- Admins can inspect a restaurant CRM after MFA.
    NULL;
  ELSIF NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Access denied for restaurant CRM.'
      USING ERRCODE = '42501';
  ELSIF NOT public.restaurant_has_elite_crm_subscription(p_restaurant_id) THEN
    RAISE EXCEPTION 'Elite subscription required for CRM.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.get_customer_crm_profiles_source(p_restaurant_id, p_search, p_limit, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_session_has_sensitive_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crm_session_has_sensitive_access() FROM anon;
REVOKE EXECUTE ON FUNCTION public.crm_session_has_sensitive_access() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crm_session_has_sensitive_access() TO service_role;

REVOKE ALL ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_has_elite_crm_subscription(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_customer_crm_profiles_source(uuid, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_crm_profiles_source(uuid, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_crm_profiles_source(uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_crm_profiles_source(uuid, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_crm_profiles(uuid, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
