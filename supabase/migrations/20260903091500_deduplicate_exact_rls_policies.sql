-- Remove strictly equivalent RLS policies without changing effective access.
-- The canonical snake_case policies remain in place; proof_of_delivery gets a
-- single accurately named policy because its shared authorization helper
-- already covers clients, restaurants, couriers and administrators.

DROP POLICY IF EXISTS "Anyone can read active campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "Feature flags are viewable by everyone" ON public.feature_flags;
DROP POLICY IF EXISTS "Users can manage their subscriptions" ON public.notification_subscriptions;

DROP POLICY IF EXISTS proof_of_delivery_client_select ON public.proof_of_delivery;
DROP POLICY IF EXISTS proof_of_delivery_restaurant_select ON public.proof_of_delivery;
DROP POLICY IF EXISTS proof_of_delivery_authorized_select ON public.proof_of_delivery;
CREATE POLICY proof_of_delivery_authorized_select
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (public.auth_can_view_dispatch_job(dispatch_job_id));

-- These table-specific restrictive policies became exact copies of the
-- generic commercial-demo isolation policies created later. Keep the generic
-- names because current governance tests and future table expansion use them.
DROP POLICY IF EXISTS hide_commercial_demo_branches ON public.restaurant_branches;
DROP POLICY IF EXISTS hide_commercial_demo_hours ON public.restaurant_hours;

-- Fail safe if production drift introduces another exact duplicate before
-- this migration is applied. Multiple policies with different predicates are
-- legitimate and are deliberately not rejected.
DO $duplicate_policy_guard$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%I.%I [%s %s] x%s', schemaname, tablename, permissive, cmd, copies),
    ', ' ORDER BY schemaname, tablename, permissive, cmd
  )
  INTO duplicate_summary
  FROM (
    SELECT
      schemaname,
      tablename,
      permissive,
      roles,
      cmd,
      coalesce(qual, '') AS qual,
      coalesce(with_check, '') AS with_check,
      count(*) AS copies
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY
      schemaname,
      tablename,
      permissive,
      roles,
      cmd,
      coalesce(qual, ''),
      coalesce(with_check, '')
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION 'Exact duplicate RLS policies remain: %', duplicate_summary;
  END IF;
END;
$duplicate_policy_guard$;

NOTIFY pgrst, 'reload schema';
