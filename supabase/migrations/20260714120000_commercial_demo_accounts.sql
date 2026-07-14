-- Admin-managed commercial accounts and isolated restaurant demonstration workspaces.
-- Passwords remain in Supabase Auth only and are never persisted in public tables.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_demo_isolation_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_demo_isolation_check
      CHECK (
        is_demo IS FALSE
        OR (
          COALESCE(is_active, false) IS FALSE
          AND COALESCE(is_featured, false) IS FALSE
          AND status = 'demo'
          AND stripe_account_id IS NULL
          AND stripe_connect_details_submitted IS FALSE
          AND stripe_connect_charges_enabled IS FALSE
          AND stripe_connect_payouts_enabled IS FALSE
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.restaurants.is_demo IS
  'True only for isolated commercial demonstration restaurants. Demo rows must never enter public, payment, outbound or accounting flows.';

CREATE TABLE IF NOT EXISTS public.commercial_demo_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  demo_restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  template_version integer NOT NULL DEFAULT 1 CHECK (template_version > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_password_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_demo_accounts IS
  'Authoritative mapping between an admin-managed commercial login and its only restaurant demonstration workspace.';

CREATE INDEX IF NOT EXISTS commercial_demo_accounts_active_idx
  ON public.commercial_demo_accounts (is_active, created_at DESC);

ALTER TABLE public.commercial_demo_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commercial_demo_accounts_admin_all ON public.commercial_demo_accounts;
CREATE POLICY commercial_demo_accounts_admin_all
  ON public.commercial_demo_accounts
  FOR ALL
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

DROP POLICY IF EXISTS commercial_demo_accounts_self_select ON public.commercial_demo_accounts;
CREATE POLICY commercial_demo_accounts_self_select
  ON public.commercial_demo_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_active);

REVOKE ALL ON TABLE public.commercial_demo_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.commercial_demo_accounts FROM authenticated;
GRANT SELECT ON TABLE public.commercial_demo_accounts TO authenticated;
GRANT ALL ON TABLE public.commercial_demo_accounts TO service_role;

DROP TRIGGER IF EXISTS commercial_demo_accounts_updated_at ON public.commercial_demo_accounts;
CREATE TRIGGER commercial_demo_accounts_updated_at
  BEFORE UPDATE ON public.commercial_demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.restaurant_is_demo(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT r.is_demo
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
  ), false)
$$;

REVOKE ALL ON FUNCTION public.restaurant_is_demo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurant_is_demo(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.branch_restaurant_is_demo(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT r.is_demo
    FROM public.restaurant_branches b
    JOIN public.restaurants r ON r.id = b.restaurant_id
    WHERE b.id = p_branch_id
  ), false)
$$;

REVOKE ALL ON FUNCTION public.branch_restaurant_is_demo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branch_restaurant_is_demo(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT
      NOT r.is_demo
      OR r.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'admin'::public.app_role
      )
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
  ), true)
$$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_restaurant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_restaurant(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT public.can_view_commercial_demo_restaurant(b.restaurant_id)
    FROM public.restaurant_branches b
    WHERE b.id = p_branch_id
  ), true)
$$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_branch(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_commercial_demo_post(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT public.can_view_commercial_demo_restaurant(p.restaurant_id)
    FROM public.social_posts p
    WHERE p.id = p_post_id
  ), true)
$$;

REVOKE ALL ON FUNCTION public.can_view_commercial_demo_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_commercial_demo_post(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_demo_restaurant_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
  v_is_admin boolean := COALESCE(public.auth_is_admin(), false);
BEGIN
  IF NOT NEW.is_demo
     AND (
       EXISTS (
         SELECT 1
         FROM auth.users target_user
         WHERE target_user.id = NEW.owner_id
           AND target_user.raw_app_meta_data->>'account_type' = 'commercial_demo'
       )
       OR EXISTS (
         SELECT 1
         FROM public.commercial_demo_accounts account
         WHERE account.user_id = NEW.owner_id
       )
     ) THEN
    RAISE EXCEPTION 'A managed commercial account can only own its demonstration restaurant'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_demo AND NOT (v_is_service_role OR v_is_admin) THEN
      RAISE EXCEPTION 'Only an administrator can create a demonstration restaurant'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo
     AND NOT (v_is_service_role OR v_is_admin) THEN
    RAISE EXCEPTION 'Only an administrator can change demonstration status'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.is_demo
     AND NOT (v_is_service_role OR v_is_admin)
     AND (
       NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
       OR NEW.stripe_connect_details_submitted IS DISTINCT FROM OLD.stripe_connect_details_submitted
       OR NEW.stripe_connect_charges_enabled IS DISTINCT FROM OLD.stripe_connect_charges_enabled
       OR NEW.stripe_connect_payouts_enabled IS DISTINCT FROM OLD.stripe_connect_payouts_enabled
     ) THEN
    RAISE EXCEPTION 'Demonstration restaurant security fields are administrator-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS protect_demo_restaurant_identity ON public.restaurants;
CREATE TRIGGER protect_demo_restaurant_identity
  BEFORE INSERT OR UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.protect_demo_restaurant_identity();

REVOKE ALL ON FUNCTION public.protect_demo_restaurant_identity() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.protect_commercial_demo_account_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = NEW.demo_restaurant_id
      AND r.owner_id = NEW.user_id
      AND r.is_demo
      AND COALESCE(r.is_active, false) IS FALSE
  ) THEN
    RAISE EXCEPTION 'Commercial demo mapping must target an inactive demo restaurant owned by the same account'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS protect_commercial_demo_account_mapping ON public.commercial_demo_accounts;
CREATE TRIGGER protect_commercial_demo_account_mapping
  BEFORE INSERT OR UPDATE OF user_id, demo_restaurant_id, is_active
  ON public.commercial_demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_commercial_demo_account_mapping();

REVOKE ALL ON FUNCTION public.protect_commercial_demo_account_mapping() FROM PUBLIC;

-- Public sign-up metadata must never grant the commercial role. Commercial
-- accounts are created exclusively by the authenticated admin Edge Function.
CREATE OR REPLACE FUNCTION public.guard_commercial_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
  v_is_admin boolean := COALESCE(public.auth_is_admin(), false);
BEGIN
  -- Do not turn an unrelated maintenance UPDATE into a role reassignment.
  -- In particular this preserves legacy commercial accounts when migrations
  -- normalize or touch an already unchanged role value.
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'commercial'::public.app_role THEN
    IF NOT (v_is_service_role OR v_is_admin) THEN
      RAISE EXCEPTION 'Commercial accounts are administrator-managed'
        USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM auth.users target_user
      WHERE target_user.id = NEW.user_id
        AND target_user.raw_app_meta_data->>'account_type' = 'commercial_demo'
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.commercial_demo_accounts account
      WHERE account.user_id = NEW.user_id
        AND account.is_active
    ) THEN
      RAISE EXCEPTION 'Commercial role requires an active administrator-managed demo account'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_commercial_role_assignment ON public.user_roles;
CREATE TRIGGER guard_commercial_role_assignment
  BEFORE INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_role_assignment();

REVOKE ALL ON FUNCTION public.guard_commercial_role_assignment() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END
$$;

-- Administrative authority is role-based. Never retain a hard-coded e-mail
-- bypass, and never let browser roles write directly to the role table.
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
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'::public.app_role
    )
$$;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

-- A demo restaurant is never visible through the public restaurant policy.
DROP POLICY IF EXISTS restaurants_public_select ON public.restaurants;
CREATE POLICY restaurants_public_select
  ON public.restaurants
  FOR SELECT
  TO public
  USING (
    (is_active IS TRUE AND is_demo IS FALSE)
    OR owner_id = (SELECT auth.uid())
  );

-- Hide every restaurant-scoped demo child row from anonymous clients and from
-- unrelated authenticated users. Owner/admin policies continue to allow the
-- commercial and administrators to work inside the isolated demo workspace.
DO $$
DECLARE
  v_table record;
BEGIN
  FOR v_table IN
    SELECT DISTINCT p.tablename
    FROM pg_policies p
    JOIN information_schema.columns c
      ON c.table_schema = p.schemaname
     AND c.table_name = p.tablename
     AND c.column_name = 'restaurant_id'
    WHERE p.schemaname = 'public'
      AND p.cmd IN ('SELECT', 'ALL')
      AND p.tablename <> 'restaurants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS hide_commercial_demo_rows ON public.%I', v_table.tablename);
    EXECUTE format(
      'CREATE POLICY hide_commercial_demo_rows ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (public.can_view_commercial_demo_restaurant(restaurant_id))',
      v_table.tablename
    );
  END LOOP;
END
$$;

-- Social-post children are scoped through post_id rather than restaurant_id.
-- Without this restrictive layer a published demo comment/media row could be
-- read through a permissive child-table policy even while its post is hidden.
DO $$
DECLARE
  v_table record;
BEGIN
  FOR v_table IN
    SELECT DISTINCT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'social_posts'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS hide_commercial_demo_post_rows ON public.%I', v_table.table_name);
    EXECUTE format(
      'CREATE POLICY hide_commercial_demo_post_rows ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (public.can_view_commercial_demo_post(%I))',
      v_table.table_name,
      v_table.column_name
    );
  END LOOP;
END
$$;

-- Apply the same isolation to tables scoped through a restaurant branch
-- (hours, floor-plan tables, delivery rules, etc.).
DO $$
DECLARE
  v_table record;
BEGIN
  FOR v_table IN
    SELECT DISTINCT p.tablename
    FROM pg_policies p
    JOIN information_schema.columns c
      ON c.table_schema = p.schemaname
     AND c.table_name = p.tablename
     AND c.column_name = 'branch_id'
    WHERE p.schemaname = 'public'
      AND p.cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS hide_commercial_demo_branch_rows ON public.%I', v_table.tablename);
    EXECUTE format(
      'CREATE POLICY hide_commercial_demo_branch_rows ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (public.can_view_commercial_demo_branch(branch_id))',
      v_table.tablename
    );
  END LOOP;
END
$$;

-- Branch and opening-hour rows are restaurant-scoped indirectly.
DROP POLICY IF EXISTS hide_commercial_demo_branches ON public.restaurant_branches;
CREATE POLICY hide_commercial_demo_branches
  ON public.restaurant_branches
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (public.can_view_commercial_demo_restaurant(restaurant_id));

DROP POLICY IF EXISTS hide_commercial_demo_hours ON public.restaurant_hours;
CREATE POLICY hide_commercial_demo_hours
  ON public.restaurant_hours
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (public.can_view_commercial_demo_branch(branch_id));

DROP POLICY IF EXISTS restaurant_hours_owner_admin_select ON public.restaurant_hours;
CREATE POLICY restaurant_hours_owner_admin_select
  ON public.restaurant_hours
  FOR SELECT
  TO authenticated
  USING (public.auth_can_access_branch(branch_id));

-- Demo workspaces may edit local catalogue/presentation data, but they must
-- never create operational, financial or paid-external records. This database
-- guard complements the Edge guard and also covers direct Data API writes.
CREATE OR REPLACE FUNCTION public.block_commercial_demo_side_effect_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_restaurant_id uuid;
BEGIN
  BEGIN
    v_restaurant_id := NULLIF(v_row->>'restaurant_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_restaurant_id := NULL;
  END;

  IF v_restaurant_id IS NOT NULL AND public.restaurant_is_demo(v_restaurant_id) THEN
    RAISE EXCEPTION 'DEMO_SIDE_EFFECT_BLOCKED: operational and financial writes are disabled for demonstration restaurants'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.block_commercial_demo_side_effect_row() FROM PUBLIC;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'carts',
    'order_groups',
    'order_items',
    'group_member_orders',
    'orders',
    'reservations',
    'payments',
    'financial_ledger',
    'platform_cost_entries',
    'platform_revenue_entries',
    'commercial_commissions',
    'commercial_compensation_adjustments',
    'restaurant_invoices',
    'restaurant_invoice_line_items',
    'restaurant_contracts',
    'restaurant_documents',
    'restaurant_launch_packs',
    'restaurant_payout_settings',
    'restaurant_credit_purchases',
    'restaurant_ai_subscriptions',
    'restaurant_activation_metrics',
    'restaurant_daily_kpis',
    'ad_campaigns',
    'ad_campaign_events',
    'social_post_promotions',
    'social_post_premium_banners',
    'ai_usage_logs',
    'ai_usage_costs',
    'ai_support_tickets',
    'support_incidents',
    'restaurant_google_booking_events',
    'google_actions_center_bookings',
    'tok_connect_restaurant_grants',
    'user_subscriptions'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.table_name = v_table
           AND c.column_name = 'restaurant_id'
       ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS block_commercial_demo_side_effect_row ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER block_commercial_demo_side_effect_row BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_commercial_demo_side_effect_row()',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.block_commercial_demo_social_side_effect_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_post_id uuid;
  v_restaurant_id uuid;
BEGIN
  BEGIN
    v_post_id := NULLIF(to_jsonb(NEW)->>'post_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_post_id := NULL;
  END;

  SELECT p.restaurant_id
  INTO v_restaurant_id
  FROM public.social_posts p
  WHERE p.id = v_post_id;

  IF v_restaurant_id IS NOT NULL AND public.restaurant_is_demo(v_restaurant_id) THEN
    RAISE EXCEPTION 'DEMO_SIDE_EFFECT_BLOCKED: social engagement and paid promotion writes are disabled for demonstration posts'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.block_commercial_demo_social_side_effect_row() FROM PUBLIC;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'social_feed_events',
    'social_feed_feedback',
    'social_post_comments',
    'social_post_external_shares',
    'social_post_likes',
    'social_post_metrics_daily',
    'social_post_premium_banners',
    'social_post_promotions',
    'social_post_reposts',
    'social_post_saves'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS block_commercial_demo_social_side_effect_row ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER block_commercial_demo_social_side_effect_row BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_commercial_demo_social_side_effect_row()',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- Local offer/photo/review rows remain usable for a sales presentation, while
-- notification and asynchronous AI queues explicitly ignore demo restaurants.
DROP TRIGGER IF EXISTS after_anti_gaspi_subscription_alert ON public.anti_waste_offers;
CREATE TRIGGER after_anti_gaspi_subscription_alert
  AFTER INSERT OR UPDATE ON public.anti_waste_offers
  FOR EACH ROW
  WHEN ((NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.trigger_anti_gaspi_subscription_alert();

DROP TRIGGER IF EXISTS after_flash_sale_subscription_alert ON public.flash_sales;
CREATE TRIGGER after_flash_sale_subscription_alert
  AFTER INSERT OR UPDATE ON public.flash_sales
  FOR EACH ROW
  WHEN ((NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.trigger_flash_sale_subscription_alert();

DROP TRIGGER IF EXISTS after_chefs_table_subscription_alert ON public.chef_table_drops;
CREATE TRIGGER after_chefs_table_subscription_alert
  AFTER INSERT OR UPDATE ON public.chef_table_drops
  FOR EACH ROW
  WHEN ((NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.trigger_chefs_table_subscription_alert();

DROP TRIGGER IF EXISTS notify_restaurant_follow_insert ON public.restaurant_follows;
CREATE TRIGGER notify_restaurant_follow_insert
  AFTER INSERT ON public.restaurant_follows
  FOR EACH ROW
  WHEN ((NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.notify_restaurant_follow();

DROP TRIGGER IF EXISTS after_restaurant_review_notification ON public.reviews;
CREATE TRIGGER after_restaurant_review_notification
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  WHEN ((NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.trigger_restaurant_review_notification();

DROP TRIGGER IF EXISTS after_review_report_admin_notification ON public.review_reports;
CREATE TRIGGER after_review_report_admin_notification
  AFTER INSERT ON public.review_reports
  FOR EACH ROW
  WHEN ((NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.trigger_review_report_admin_notification();

DROP TRIGGER IF EXISTS enqueue_image_analysis_job_on_insert ON public.restaurant_images;
CREATE TRIGGER enqueue_image_analysis_job_on_insert
  AFTER INSERT ON public.restaurant_images
  FOR EACH ROW
  WHEN ((NEW.analysis_status = 'pending'::text) AND (NOT public.restaurant_is_demo(NEW.restaurant_id)))
  EXECUTE FUNCTION public.enqueue_image_analysis_job();

-- SECURITY DEFINER/public RPCs bypass table RLS. Keep demo restaurants out of
-- public discovery feeds and real Google Business operational queues too.
CREATE OR REPLACE FUNCTION public.get_restaurant_actualites_access(p_restaurant_id uuid)
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

  SELECT * INTO v_week FROM public.restaurant_actualites_week_window();

  IF public.restaurant_is_demo(p_restaurant_id) THEN
    RETURN jsonb_build_object(
      'hasAccess', true,
      'planSlug', 'commercial-demo',
      'weeklyPostLimit', NULL,
      'weeklyPostsUsed', public.restaurant_actualites_weekly_post_count(p_restaurant_id),
      'remainingWeeklyPosts', NULL,
      'unlimitedPosts', true,
      'weekStartedAt', v_week.week_started_at,
      'weekEndsAt', v_week.week_ends_at,
      'demo', true
    );
  END IF;

  SELECT *
  INTO v_access
  FROM public.restaurant_actualites_subscription_plan(p_restaurant_id);

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
END
$$;

CREATE OR REPLACE FUNCTION public.restaurant_can_create_actualites_post(p_restaurant_id uuid)
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
  IF public.restaurant_is_demo(p_restaurant_id) THEN
    RETURN auth.role() = 'service_role'
      OR public.auth_is_admin()
      OR public.auth_owns_restaurant(p_restaurant_id);
  END IF;

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
END
$$;

CREATE OR REPLACE FUNCTION public.get_match_group_public_feed()
RETURNS TABLE(
  id uuid,
  restaurant_id uuid,
  creator_id uuid,
  area text,
  time_slot text,
  max_members integer,
  discount_percentage numeric,
  final_discount_percentage numeric,
  status text,
  is_active boolean,
  expires_at timestamptz,
  scheduled_at timestamptz,
  lock_at timestamptz,
  member_count integer,
  restaurant jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    og.id,
    og.restaurant_id,
    og.creator_id,
    og.area,
    og.time_slot,
    og.max_members,
    og.discount_percentage,
    og.final_discount_percentage,
    og.status,
    og.is_active,
    og.expires_at,
    og.scheduled_at,
    COALESCE(og.lock_at, og.expires_at) AS lock_at,
    COALESCE(count(gmo.id), 0)::integer AS member_count,
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'cuisine_type', r.cuisine_type,
      'image_url', r.image_url,
      'city', r.city
    ) AS restaurant
  FROM public.order_groups og
  JOIN public.restaurants r ON r.id = og.restaurant_id
  LEFT JOIN public.group_member_orders gmo
    ON gmo.group_id = og.id
    AND gmo.status IN ('joined', 'locked', 'payment_pending', 'paid')
    AND gmo.payment_status IN ('authorized', 'captured')
  WHERE og.is_active = true
    AND og.status = 'open'
    AND COALESCE(og.lock_at, og.expires_at) > now()
    AND r.is_active IS TRUE
    AND r.is_demo IS FALSE
  GROUP BY og.id, r.id
  ORDER BY COALESCE(og.lock_at, og.expires_at) ASC
$$;

CREATE OR REPLACE FUNCTION public.resolve_google_booking_slug(p_booking_slug text)
RETURNS TABLE(
  restaurant_id uuid,
  restaurant_name text,
  city text,
  slug text,
  booking_slug text,
  is_active boolean,
  status text,
  supports_reservation boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    r.id,
    r.name,
    r.city,
    r.slug,
    s.booking_slug,
    r.is_active,
    r.status,
    r.supports_reservation
  FROM public.restaurant_google_booking_setup s
  JOIN public.restaurants r ON r.id = s.restaurant_id
  WHERE s.booking_slug = public.tok_slugify(p_booking_slug)
    AND r.is_active IS TRUE
    AND r.is_demo IS FALSE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.admin_list_google_booking_setups(
  p_status text DEFAULT NULL,
  p_help_only boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  city text,
  google_business_url text,
  booking_slug text,
  tok_booking_url text,
  previous_booking_provider text,
  google_booking_status text,
  needs_google_help boolean,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  admin_notes text,
  last_admin_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  link_clicks bigint,
  reservation_starts bigint,
  reservation_completions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acces admin requis.';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('not_configured', 'link_copied', 'in_progress', 'configured', 'problem') THEN
    RAISE EXCEPTION 'Statut Google Business invalide: %', p_status;
  END IF;

  RETURN QUERY
  WITH scoped_restaurants AS (
    SELECT r.id
    FROM public.restaurants r
    WHERE r.is_demo IS FALSE
      AND (
        NULLIF(trim(COALESCE(p_search, '')), '') IS NULL
        OR r.name ILIKE '%' || trim(p_search) || '%'
        OR r.city ILIKE '%' || trim(p_search) || '%'
      )
    ORDER BY r.name ASC, r.id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    s.id,
    r.id,
    r.name,
    r.city,
    s.google_business_url,
    s.booking_slug,
    s.tok_booking_url,
    s.previous_booking_provider,
    s.google_booking_status,
    s.needs_google_help,
    s.copied_at,
    s.preferred_link_confirmed_at,
    s.confirmation_screenshot_url,
    s.admin_notes,
    s.last_admin_contact_at,
    s.created_at,
    s.updated_at,
    COALESCE(metrics.link_clicks, 0)::bigint,
    COALESCE(metrics.reservation_starts, 0)::bigint,
    COALESCE(metrics.reservation_completions, 0)::bigint
  FROM scoped_restaurants sr
  JOIN public.restaurants r ON r.id = sr.id
  JOIN LATERAL public.ensure_restaurant_google_booking_setup(r.id) s ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_link_clicked') AS link_clicks,
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_reservation_started') AS reservation_starts,
      COUNT(*) FILTER (WHERE e.event_type = 'google_booking_reservation_completed') AS reservation_completions
    FROM public.restaurant_google_booking_events e
    WHERE e.restaurant_id = r.id
  ) metrics ON true
  WHERE (p_status IS NULL OR s.google_booking_status = p_status)
    AND (COALESCE(p_help_only, false) = false OR s.needs_google_help = true)
  ORDER BY
    s.needs_google_help DESC,
    CASE s.google_booking_status
      WHEN 'problem' THEN 1
      WHEN 'not_configured' THEN 2
      WHEN 'in_progress' THEN 3
      WHEN 'link_copied' THEN 4
      WHEN 'configured' THEN 5
      ELSE 6
    END,
    r.name ASC;
END
$$;

CREATE OR REPLACE FUNCTION public.restaurant_update_google_booking_setup(
  p_restaurant_id uuid,
  p_google_business_url text DEFAULT NULL,
  p_previous_booking_provider text DEFAULT NULL,
  p_needs_google_help boolean DEFAULT NULL,
  p_confirmation_screenshot_url text DEFAULT NULL,
  p_action text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  restaurant_id uuid,
  restaurant_name text,
  city text,
  google_place_id text,
  google_business_url text,
  booking_slug text,
  tok_booking_url text,
  previous_booking_provider text,
  google_booking_status text,
  needs_google_help boolean,
  copied_at timestamptz,
  preferred_link_confirmed_at timestamptz,
  confirmation_screenshot_url text,
  created_at timestamptz,
  updated_at timestamptz,
  link_clicks bigint,
  reservation_starts bigint,
  reservation_completions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_setup public.restaurant_google_booking_setup%ROWTYPE;
  v_google_url text := NULLIF(trim(COALESCE(p_google_business_url, '')), '');
  v_screenshot_url text := NULLIF(trim(COALESCE(p_confirmation_screenshot_url, '')), '');
  v_provider text := NULLIF(trim(COALESCE(p_previous_booking_provider, '')), '');
  v_event_type text;
  v_is_demo boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  SELECT r.is_demo
  INTO v_is_demo
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id
    AND r.owner_id = v_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acces refuse.';
  END IF;

  IF p_action IS NOT NULL AND p_action NOT IN ('copy', 'help', 'configured', 'problem', 'save') THEN
    RAISE EXCEPTION 'Action Google Business invalide: %', p_action;
  END IF;

  IF v_google_url IS NOT NULL AND v_google_url !~* '^https://' THEN
    RAISE EXCEPTION 'URL Google Business invalide.';
  END IF;

  IF v_screenshot_url IS NOT NULL AND v_screenshot_url !~* '^https://' THEN
    RAISE EXCEPTION 'URL de preuve invalide.';
  END IF;

  IF v_provider IS NOT NULL AND v_provider NOT IN ('thefork', 'other', 'none', 'unknown') THEN
    RAISE EXCEPTION 'Ancien fournisseur invalide.';
  END IF;

  v_setup := public.ensure_restaurant_google_booking_setup(p_restaurant_id);

  UPDATE public.restaurant_google_booking_setup s
  SET
    google_business_url = CASE WHEN p_google_business_url IS NULL THEN s.google_business_url ELSE v_google_url END,
    previous_booking_provider = CASE WHEN p_previous_booking_provider IS NULL THEN s.previous_booking_provider ELSE v_provider END,
    needs_google_help = CASE
      WHEN p_action = 'help' THEN true
      WHEN p_action = 'configured' THEN false
      WHEN p_needs_google_help IS NULL THEN s.needs_google_help
      ELSE p_needs_google_help
    END,
    confirmation_screenshot_url = CASE
      WHEN p_confirmation_screenshot_url IS NULL THEN s.confirmation_screenshot_url
      ELSE v_screenshot_url
    END,
    google_booking_status = CASE
      WHEN p_action = 'copy' AND s.google_booking_status <> 'configured' THEN 'link_copied'
      WHEN p_action = 'help' AND s.google_booking_status <> 'configured' THEN 'in_progress'
      WHEN p_action = 'configured' THEN 'configured'
      WHEN p_action = 'problem' THEN 'problem'
      ELSE s.google_booking_status
    END,
    copied_at = CASE WHEN p_action = 'copy' THEN now() ELSE s.copied_at END,
    preferred_link_confirmed_at = CASE WHEN p_action = 'configured' THEN now() ELSE s.preferred_link_confirmed_at END
  WHERE s.restaurant_id = p_restaurant_id
  RETURNING * INTO v_setup;

  v_event_type := CASE p_action
    WHEN 'copy' THEN 'google_booking_link_copied'
    WHEN 'help' THEN 'google_booking_help_requested'
    WHEN 'configured' THEN 'google_booking_configured_confirmed'
    ELSE NULL
  END;

  -- Demo settings stay local and functional, but never create the operational
  -- events consumed by real admin/partner workflows.
  IF v_event_type IS NOT NULL AND NOT v_is_demo THEN
    INSERT INTO public.restaurant_google_booking_events (
      restaurant_id,
      setup_id,
      user_id,
      event_type,
      metadata
    )
    VALUES (
      p_restaurant_id,
      v_setup.id,
      v_actor_id,
      v_event_type,
      jsonb_build_object('source', 'restaurant_dashboard')
    );
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.restaurant_get_google_booking_setup(p_restaurant_id);
END
$$;

CREATE OR REPLACE FUNCTION public.track_google_booking_event(
  p_restaurant_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_setup public.restaurant_google_booking_setup%ROWTYPE;
  v_event_id uuid;
BEGIN
  IF p_event_type NOT IN (
    'google_booking_link_copied',
    'google_booking_help_requested',
    'google_booking_configured_confirmed',
    'google_booking_link_clicked',
    'google_booking_reservation_started',
    'google_booking_reservation_completed'
  ) THEN
    RAISE EXCEPTION 'Type evenement Google Business invalide: %', p_event_type;
  END IF;

  IF v_actor_id IS NULL AND p_event_type NOT IN ('google_booking_link_clicked', 'google_booking_reservation_started') THEN
    RAISE EXCEPTION 'Connexion requise.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.is_active IS TRUE
      AND r.is_demo IS FALSE
  ) THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  v_setup := public.ensure_restaurant_google_booking_setup(p_restaurant_id);

  INSERT INTO public.restaurant_google_booking_events (
    restaurant_id,
    setup_id,
    user_id,
    event_type,
    metadata
  )
  VALUES (
    p_restaurant_id,
    v_setup.id,
    v_actor_id,
    p_event_type,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END
$$;

CREATE OR REPLACE FUNCTION public.provision_commercial_demo_account(
  p_user_id uuid,
  p_full_name text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_restaurant_id uuid;
  v_branch_id uuid;
  v_slug text;
  v_display_name text := left(trim(COALESCE(p_full_name, '')), 120);
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_created_by uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL OR v_created_by IS NULL THEN
    RAISE EXCEPTION 'Missing account or administrator identifier' USING ERRCODE = '22023';
  END IF;

  IF length(v_display_name) < 2 OR length(v_email) < 5 THEN
    RAISE EXCEPTION 'Invalid commercial identity' USING ERRCODE = '22023';
  END IF;

  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Auth user not found' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.owner_id = p_user_id
      AND NOT r.is_demo
  ) THEN
    RAISE EXCEPTION 'An existing real restaurant owner cannot be converted into a managed commercial demo account'
      USING ERRCODE = '23514';
  END IF;

  -- Serialise retries for the same Auth identity so the seed remains truly
  -- idempotent even if an administrator double-submits the request.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (p_user_id, v_display_name)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  SELECT p_user_id, role_name::public.app_role
  FROM unnest(ARRAY['client', 'restaurateur']) AS role_name
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.sales_representatives
  SET full_name = v_display_name,
      email = v_email,
      status = 'active',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('managed_commercial_demo', true),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.sales_representatives (
      user_id, full_name, email, status, zone, metadata
    ) VALUES (
      p_user_id,
      v_display_name,
      v_email,
      'active',
      'Genève',
      jsonb_build_object('managed_commercial_demo', true)
    );
  END IF;

  INSERT INTO public.commercial_compensation_profiles (
    user_id, status, sprint_started_at, employment_active, notes
  ) VALUES (
    p_user_id,
    'sprint',
    current_date,
    false,
    'Compte commercial administré avec environnement restaurateur de démonstration.'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET notes = EXCLUDED.notes,
      updated_at = now();

  SELECT account.demo_restaurant_id
  INTO v_restaurant_id
  FROM public.commercial_demo_accounts account
  WHERE account.user_id = p_user_id;

  IF v_restaurant_id IS NULL THEN
    v_slug := 'demo-commercial-' || replace(p_user_id::text, '-', '');

    INSERT INTO public.restaurants (
      owner_id,
      name,
      legal_name,
      slug,
      description,
      cuisine_type,
      address,
      city,
      phone,
      image_url,
      rating,
      review_count,
      avg_rating,
      rating_count,
      price_range,
      is_active,
      is_featured,
      is_demo,
      status,
      delivery_available,
      delivery_fee,
      min_order_amount,
      supports_pickup,
      supports_dinein,
      supports_reservation,
      supports_group_orders,
      supports_scheduled,
      supports_scheduled_orders,
      disabled_dashboard_features,
      opening_hours
    ) VALUES (
      p_user_id,
      'Restaurant Démo TOK — ' || v_display_name,
      'Restaurant de démonstration TOK',
      v_slug,
      'Espace entièrement simulé pour présenter les outils TOK. Aucune donnée client, transaction ou publication réelle.',
      'Cuisine suisse & méditerranéenne',
      'Adresse de démonstration',
      'Genève',
      '+41 22 000 00 00',
      '/images/filets de perche.jpg',
      4.8,
      128,
      4.8,
      128,
      2,
      false,
      false,
      true,
      'demo',
      true,
      0,
      0,
      true,
      true,
      true,
      true,
      true,
      true,
      ARRAY[]::text[],
      jsonb_build_object(
        'timezone', 'Europe/Zurich',
        'lundi', jsonb_build_object('open', '10:30', 'close', '22:30', 'closed', false),
        'mardi', jsonb_build_object('open', '10:30', 'close', '22:30', 'closed', false),
        'mercredi', jsonb_build_object('open', '10:30', 'close', '22:30', 'closed', false),
        'jeudi', jsonb_build_object('open', '10:30', 'close', '22:30', 'closed', false),
        'vendredi', jsonb_build_object('open', '10:30', 'close', '23:00', 'closed', false),
        'samedi', jsonb_build_object('open', '11:00', 'close', '23:00', 'closed', false),
        'dimanche', jsonb_build_object('open', '11:30', 'close', '21:30', 'closed', false),
        'service_settings', jsonb_build_object(
          'lunch', jsonb_build_object(
            'start_time', '11:30', 'end_time', '14:30', 'last_reservation_time', '14:00',
            'slot_interval_minutes', 30, 'max_covers', 48, 'min_party_size', 1,
            'max_party_size', 12, 'online_booking_enabled', true, 'online_ordering_enabled', true
          ),
          'dinner', jsonb_build_object(
            'start_time', '18:30', 'end_time', '22:30', 'last_reservation_time', '21:45',
            'slot_interval_minutes', 30, 'max_covers', 60, 'min_party_size', 1,
            'max_party_size', 12, 'online_booking_enabled', true, 'online_ordering_enabled', true
          )
        )
      )
    )
    RETURNING id INTO v_restaurant_id;

    INSERT INTO public.commercial_demo_accounts (
      user_id, demo_restaurant_id, created_by
    ) VALUES (
      p_user_id, v_restaurant_id, v_created_by
    );
  ELSE
    UPDATE public.restaurants
    SET owner_id = p_user_id,
        is_demo = true,
        is_active = false,
        is_featured = false,
        status = 'demo',
        stripe_account_id = NULL,
        stripe_connect_details_submitted = false,
        stripe_connect_charges_enabled = false,
        stripe_connect_payouts_enabled = false,
        disabled_dashboard_features = ARRAY[]::text[]
    WHERE id = v_restaurant_id;

    UPDATE public.commercial_demo_accounts
    SET is_active = true,
        created_by = COALESCE(created_by, v_created_by),
        template_version = 1,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- The authoritative mapping exists before the privileged role is assigned,
  -- so generic role-management RPCs cannot create unisolated commercials.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'commercial'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT b.id
  INTO v_branch_id
  FROM public.restaurant_branches b
  WHERE b.restaurant_id = v_restaurant_id
  ORDER BY b.created_at ASC
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO public.restaurant_branches (
      restaurant_id, name, address, city, postal_code, country,
      latitude, longitude, phone_number, is_active
    ) VALUES (
      v_restaurant_id,
      'Restaurant principal — Démo',
      'Adresse de démonstration',
      'Genève',
      '1204',
      'CH',
      46.2044,
      6.1432,
      '+41 22 000 00 00',
      true
    ) RETURNING id INTO v_branch_id;
  END IF;

  INSERT INTO public.restaurant_hours (branch_id, day_of_week, open_time, close_time, is_closed)
  SELECT v_branch_id, day_number, '10:30'::time, '22:30'::time, false
  FROM generate_series(0, 6) AS day_number
  WHERE NOT EXISTS (
    SELECT 1 FROM public.restaurant_hours h
    WHERE h.branch_id = v_branch_id AND h.day_of_week = day_number
  );

  INSERT INTO public.reservation_tables (branch_id, table_number, capacity, sector, layout)
  SELECT v_branch_id, seed.table_number, seed.capacity, seed.sector, seed.layout
  FROM (VALUES
    ('T1', 2, 'Salle principale', '{"x":52,"y":72,"w":132,"h":92,"shape":"round","rotation":0,"seat_labels":[2]}'::jsonb),
    ('T2', 4, 'Salle principale', '{"x":218,"y":76,"w":156,"h":104,"shape":"rect","rotation":0,"seat_labels":[2,2]}'::jsonb),
    ('T3', 4, 'Salle principale', '{"x":420,"y":78,"w":156,"h":104,"shape":"rect","rotation":0,"seat_labels":[2,2]}'::jsonb),
    ('T4', 6, 'Vitrine', '{"x":80,"y":250,"w":190,"h":112,"shape":"rect","rotation":0,"seat_labels":[3,3]}'::jsonb),
    ('T5', 8, 'Salon', '{"x":340,"y":248,"w":220,"h":126,"shape":"rect","rotation":0,"seat_labels":[4,4]}'::jsonb)
  ) AS seed(table_number, capacity, sector, layout)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.reservation_tables t
    WHERE t.branch_id = v_branch_id AND t.table_number = seed.table_number
  );

  INSERT INTO public.menu_items (
    restaurant_id, name, description, price, category, image_url, is_available
  )
  SELECT v_restaurant_id, seed.name, seed.description, seed.price, seed.category, seed.image_url, true
  FROM (VALUES
    ('Filets de perche du Léman', 'Sauce citron, pommes grenailles et légumes de saison.', 32.00::numeric, 'Plats', '/images/filets de perche.jpg'),
    ('Fondue moitié-moitié', 'Fromages suisses, pain artisanal et condiments.', 28.00::numeric, 'Suggestions', '/images/fondue-moitie-moitie.jpg'),
    ('Salade du marché', 'Légumes croquants, graines et vinaigrette maison.', 18.00::numeric, 'Entrées', '/images/salade-du-marche.jpg'),
    ('Tarte aux noix', 'Dessert maison et caramel léger.', 10.00::numeric, 'Desserts', '/images/tarte aux noix.webp')
  ) AS seed(name, description, price, category, image_url)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.menu_items item
    WHERE item.restaurant_id = v_restaurant_id AND item.name = seed.name
  );

  INSERT INTO public.restaurant_settings (
    restaurant_id, auto_accept_orders, print_orders_automatically, pos_integration_provider
  ) VALUES (
    v_restaurant_id, false, false, NULL
  )
  ON CONFLICT (restaurant_id) DO NOTHING;

  INSERT INTO public.restaurant_staff (restaurant_id, user_id, role)
  SELECT v_restaurant_id, p_user_id, 'owner'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.restaurant_staff staff
    WHERE staff.restaurant_id = v_restaurant_id AND staff.user_id = p_user_id
  );

  INSERT INTO public.audit_log (
    user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_created_by,
    'commercial_demo_account_provisioned',
    'commercial_demo_account',
    p_user_id,
    jsonb_build_object(
      'demo_restaurant_id', v_restaurant_id,
      'roles', jsonb_build_array('client', 'commercial', 'restaurateur'),
      'template_version', 1
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'restaurant_id', v_restaurant_id,
    'restaurant_name', 'Restaurant Démo TOK — ' || v_display_name,
    'roles', jsonb_build_array('client', 'commercial', 'restaurateur')
  );
END
$$;

REVOKE ALL ON FUNCTION public.provision_commercial_demo_account(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_commercial_demo_account(uuid, text, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.provision_commercial_demo_account(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
