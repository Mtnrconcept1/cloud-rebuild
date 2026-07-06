-- Enforce restaurant subscription access for Actualites posts.
-- Starter has no access, Pro has 1 post per ISO week, Premium/Elite/custom are unlimited.

CREATE OR REPLACE FUNCTION public.restaurant_actualites_subscription_plan(
  p_restaurant_id uuid
)
RETURNS TABLE (
  has_access boolean,
  plan_slug text,
  weekly_post_limit integer,
  unlimited_posts boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH selected_plan AS (
    SELECT lower(COALESCE(rsp.slug, ras.plan, '')) AS slug
    FROM public.restaurant_ai_subscriptions ras
    LEFT JOIN public.restaurant_subscription_plans rsp
      ON rsp.id = ras.restaurant_subscription_plan_id
    WHERE ras.restaurant_id = p_restaurant_id
      AND ras.status IN ('trialing', 'active')
      AND (ras.current_period_end IS NULL OR ras.current_period_end > now())
    ORDER BY ras.current_period_end DESC NULLS LAST, ras.created_at DESC
    LIMIT 1
  )
  SELECT
    COALESCE((SELECT slug IN ('pro', 'premium', 'elite', 'custom') FROM selected_plan), false) AS has_access,
    (SELECT slug FROM selected_plan) AS plan_slug,
    CASE
      WHEN (SELECT slug FROM selected_plan) = 'pro' THEN 1
      WHEN (SELECT slug FROM selected_plan) IN ('premium', 'elite', 'custom') THEN NULL
      ELSE 0
    END AS weekly_post_limit,
    COALESCE((SELECT slug IN ('premium', 'elite', 'custom') FROM selected_plan), false) AS unlimited_posts;
$$;

REVOKE ALL ON FUNCTION public.restaurant_actualites_subscription_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_actualites_subscription_plan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restaurant_actualites_week_window()
RETURNS TABLE (
  week_started_at timestamptz,
  week_ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (date_trunc('week', timezone('Europe/Zurich', now())) AT TIME ZONE 'Europe/Zurich') AS week_started_at,
    ((date_trunc('week', timezone('Europe/Zurich', now())) + interval '7 days') AT TIME ZONE 'Europe/Zurich') AS week_ends_at;
$$;

REVOKE ALL ON FUNCTION public.restaurant_actualites_week_window() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_actualites_week_window() TO service_role;

CREATE OR REPLACE FUNCTION public.restaurant_actualites_weekly_post_count(
  p_restaurant_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH week_window AS (
    SELECT *
    FROM public.restaurant_actualites_week_window()
  )
  SELECT count(*)::integer
  FROM public.social_posts p
  CROSS JOIN week_window w
  WHERE p.restaurant_id = p_restaurant_id
    AND p.status IN ('draft', 'scheduled', 'published')
    AND p.created_at >= w.week_started_at
    AND p.created_at < w.week_ends_at;
$$;

REVOKE ALL ON FUNCTION public.restaurant_actualites_weekly_post_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_actualites_weekly_post_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.restaurant_can_create_actualites_post(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access record;
  v_used integer := 0;
BEGIN
  SELECT *
  INTO v_access
  FROM public.restaurant_actualites_subscription_plan(p_restaurant_id);

  IF NOT COALESCE(v_access.has_access, false) THEN
    RETURN false;
  END IF;

  IF COALESCE(v_access.unlimited_posts, false) OR v_access.weekly_post_limit IS NULL THEN
    RETURN true;
  END IF;

  v_used := public.restaurant_actualites_weekly_post_count(p_restaurant_id);
  RETURN v_used < GREATEST(COALESCE(v_access.weekly_post_limit, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_can_create_actualites_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_can_create_actualites_post(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_restaurant_actualites_access(
  p_restaurant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_access record;
  v_used integer := 0;
  v_week record;
  v_remaining integer := NULL;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.auth_is_admin()
     AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Non autorise.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_access
  FROM public.restaurant_actualites_subscription_plan(p_restaurant_id);

  SELECT *
  INTO v_week
  FROM public.restaurant_actualites_week_window();

  v_used := public.restaurant_actualites_weekly_post_count(p_restaurant_id);

  IF v_access.weekly_post_limit IS NOT NULL THEN
    v_remaining := GREATEST(COALESCE(v_access.weekly_post_limit, 0) - v_used, 0);
  END IF;

  RETURN jsonb_build_object(
    'hasAccess', COALESCE(v_access.has_access, false),
    'planSlug', v_access.plan_slug,
    'weeklyPostLimit', v_access.weekly_post_limit,
    'weeklyPostsUsed', v_used,
    'remainingWeeklyPosts', v_remaining,
    'unlimitedPosts', COALESCE(v_access.unlimited_posts, false),
    'weekStartedAt', v_week.week_started_at,
    'weekEndsAt', v_week.week_ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_actualites_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_actualites_access(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "social_posts_insert" ON public.social_posts;
CREATE POLICY "social_posts_insert"
  ON public.social_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND public.auth_owns_restaurant(restaurant_id)
    AND status IN ('draft', 'scheduled', 'published')
    AND public.restaurant_can_create_actualites_post(restaurant_id)
  );

NOTIFY pgrst, 'reload schema';
