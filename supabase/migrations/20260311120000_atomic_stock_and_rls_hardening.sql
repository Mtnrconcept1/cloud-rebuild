-- Migration: Atomic stock decrement RPC + RLS hardening for remaining tables
-- Date: 2026-03-11

--------------------------------------------------------------------------------
-- 1. ATOMIC STOCK DECREMENT FUNCTION
-- Prevents overselling via concurrent requests (race condition fix)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrement_stock(
    p_table text,
    p_id uuid,
    p_qty integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_affected integer;
BEGIN
    IF p_qty <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    IF p_table = 'anti_waste_offers' THEN
        UPDATE public.anti_waste_offers
        SET quantity_available = quantity_available - p_qty
        WHERE id = p_id
          AND is_active = true
          AND quantity_available >= p_qty;
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
    ELSIF p_table = 'flash_sales' THEN
        UPDATE public.flash_sales
        SET quantity_available = quantity_available - p_qty
        WHERE id = p_id
          AND is_active = true
          AND quantity_available >= p_qty;
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'Unknown table: %', p_table;
    END IF;

    RETURN rows_affected > 0;
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) TO service_role;

--------------------------------------------------------------------------------
-- 2. RLS HARDENING: Tables missing from previous migrations
--------------------------------------------------------------------------------

-- menu_items: Public read, owner write
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view menu_items" ON public.menu_items;
CREATE POLICY "menu_items_public_select" ON public.menu_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners manage menu_items" ON public.menu_items;
CREATE POLICY "menu_items_owner_all" ON public.menu_items FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid())
);

-- reviews: Public read, owner write own reviews
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "reviews_public_select" ON public.reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage own reviews" ON public.reviews;
CREATE POLICY "reviews_user_all" ON public.reviews FOR ALL TO authenticated USING (auth.uid() = user_id);

-- review_replies: Public read, restaurant owners write
ALTER TABLE public.review_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Require auth for review_replies" ON public.review_replies;
CREATE POLICY "review_replies_public_select" ON public.review_replies FOR SELECT USING (true);
CREATE POLICY "review_replies_owner_insert" ON public.review_replies FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.reviews rv
        JOIN public.restaurants r ON r.id = rv.restaurant_id
        WHERE rv.id = review_replies.review_id AND r.owner_id = auth.uid()
    )
);

-- notification_subscriptions: user owns their own
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_subscriptions') THEN
        EXECUTE 'ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Users manage own notification_subscriptions" ON public.notification_subscriptions';
        EXECUTE 'DROP POLICY IF EXISTS "notification_subscriptions_self" ON public.notification_subscriptions';
        EXECUTE 'CREATE POLICY "notification_subscriptions_self" ON public.notification_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id)';
    END IF;
END $$;

-- dispatch_jobs: Courier can only see/update their assigned jobs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dispatch_jobs') THEN
        EXECUTE 'ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Couriers manage own dispatch_jobs" ON public.dispatch_jobs';
        EXECUTE 'DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs';
        EXECUTE 'DROP POLICY IF EXISTS "dispatch_jobs_courier_update" ON public.dispatch_jobs';
        EXECUTE 'CREATE POLICY "dispatch_jobs_courier_select" ON public.dispatch_jobs FOR SELECT TO authenticated USING (
            EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())
            OR EXISTS (SELECT 1 FROM public.orders o JOIN public.restaurants r ON r.id = o.restaurant_id WHERE o.id = dispatch_jobs.order_id AND r.owner_id = auth.uid())
        )';
        EXECUTE 'CREATE POLICY "dispatch_jobs_courier_update" ON public.dispatch_jobs FOR UPDATE TO authenticated USING (
            EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())
        )';
    END IF;
END $$;

-- group_orders & group_members: participants only
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_orders') THEN
        EXECUTE 'ALTER TABLE public.group_orders ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "group_orders_participant" ON public.group_orders';
        EXECUTE 'CREATE POLICY "group_orders_participant" ON public.group_orders FOR ALL TO authenticated USING (auth.uid() = host_user_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_members') THEN
        EXECUTE 'ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "group_members_self" ON public.group_members';
        EXECUTE 'CREATE POLICY "group_members_self" ON public.group_members FOR ALL TO authenticated USING (auth.uid() = user_id)';
    END IF;
END $$;

-- email_queue: service_role only (no client access)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_queue') THEN
        EXECUTE 'ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY';
        -- No policies = only service_role can access
    END IF;
END $$;

-- ad_campaigns: Public read for active, owner write
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ad_campaigns_public_read" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_public_select" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns_public_select" ON public.ad_campaigns FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS "ad_campaigns_owner_all" ON public.ad_campaigns;
CREATE POLICY "ad_campaigns_owner_all" ON public.ad_campaigns FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = ad_campaigns.restaurant_id AND r.owner_id = auth.uid())
);

-- promo_codes: Public read for active promos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'promo_codes') THEN
        EXECUTE 'ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "promo_codes_active_select" ON public.promo_codes';
        EXECUTE 'CREATE POLICY "promo_codes_active_select" ON public.promo_codes FOR SELECT USING (is_active = true)';
    END IF;
END $$;

-- feature_flags: Public read
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feature_flags') THEN
        EXECUTE 'ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Public read for feature_flags" ON public.feature_flags';
        EXECUTE 'DROP POLICY IF EXISTS "feature_flags_public_select" ON public.feature_flags';
        EXECUTE 'CREATE POLICY "feature_flags_public_select" ON public.feature_flags FOR SELECT USING (true)';
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 3. FORCE SCHEMA RELOAD
--------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
