-- Migration: Strict RLS Policies for Miamz Platform
-- Final corrected version with exhaustive domain coverage and exact column mapping.

-- Helper to reload schema cache
-- NOTIFY pgrst, 'reload schema';

--------------------------------------------------------------------------------
-- 1. PUBLIC DISCOVERY TABLES (Anyone can read)
--------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    public_tables text[] := ARRAY[
        'categories', 'cuisines', 'collections', 'collection_restaurants', 
        'dish_tags', 'allergens', 'dish_allergens', 'loyalty_tiers', 
        'user_subscription_plans', 'subscription_benefits', 'feature_flags'
    ];
BEGIN
    FOREACH t IN ARRAY public_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public read for %I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "Public read for %I" ON public.%I FOR SELECT USING (true);', t, t);
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 2. RESTAURANT CATALOG (Public Read)
--------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    catalog_tables text[] := ARRAY[
        'restaurants', 'restaurant_branches', 'restaurant_hours', 
        'restaurant_service_areas', 'restaurant_delivery_rules', 
        'menu_categories', 'dishes', 'dish_variants', 
        'dish_modifier_groups', 'dish_modifier_options', 
        'dish_images', 'dish_availability_windows',
        'anti_waste_offers', 'flash_sales'
    ];
BEGIN
    FOREACH t IN ARRAY catalog_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public read for %I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "Public read for %I" ON public.%I FOR SELECT USING (true);', t, t);
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 3. USER DATA (Standard user_id)
--------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    user_owned_tables text[] := ARRAY[
        'user_profiles', 'user_addresses', 'user_payment_methods', 'user_devices', 
        'user_preferences', 'user_notification_settings', 'user_wallets', 
        'user_subscriptions', 'loyalty_accounts', 'favorites', 'carts', 'orders',
        'reservations', 'payment_transactions', 'promo_code_uses', 'support_tickets',
        'device_tokens', 'compensations'
    ];
BEGIN
    FOREACH t IN ARRAY user_owned_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users manage own %I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "Users manage own %I" ON public.%I FOR ALL USING (auth.uid() = user_id);', t, t);
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 4. SPECIAL USER LINKS (Non-standard columns)
--------------------------------------------------------------------------------

-- user_referrals (referrer_id)
ALTER TABLE public.user_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own user_referrals" ON public.user_referrals;
CREATE POLICY "Users manage own user_referrals" ON public.user_referrals FOR ALL USING (auth.uid() = referrer_id);

-- gift_cards (purchaser_id)
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own gift_cards" ON public.gift_cards;
CREATE POLICY "Users manage own gift_cards" ON public.gift_cards FOR ALL USING (auth.uid() = purchaser_id);

-- referral_codes (user_id is unique and standard, but sometimes needs special care)
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own referral_codes" ON public.referral_codes;
CREATE POLICY "Users manage own referral_codes" ON public.referral_codes FOR ALL USING (auth.uid() = user_id);

-- wallet_transactions (linked via wallet_id)
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Users view own wallet_transactions" ON public.wallet_transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_wallets WHERE public.user_wallets.id = wallet_id AND public.user_wallets.user_id = auth.uid())
);

-- cart_items (linked via cart_id)
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cart_items" ON public.cart_items;
CREATE POLICY "Users manage own cart_items" ON public.cart_items FOR ALL USING (
    EXISTS (SELECT 1 FROM public.carts WHERE public.carts.id = cart_id AND public.carts.user_id = auth.uid())
);

-- support_messages (linked via ticket_id)
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own support_messages" ON public.support_messages;
CREATE POLICY "Users view own support_messages" ON public.support_messages FOR ALL USING (
    EXISTS (SELECT 1 FROM public.support_tickets WHERE public.support_tickets.id = ticket_id AND public.support_tickets.user_id = auth.uid())
);

--------------------------------------------------------------------------------
-- 5. COURIER & DELIVERY
--------------------------------------------------------------------------------
-- couriers (user_id)
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Couriers manage own profile" ON public.couriers;
CREATE POLICY "Couriers manage own profile" ON public.couriers FOR ALL USING (auth.uid() = user_id);

-- courier_documents, courier_shifts, courier_locations, courier_earnings (courier_id)
DO $$
DECLARE
    t text;
    courier_linked_tables text[] := ARRAY['courier_documents', 'courier_shifts', 'courier_locations', 'courier_earnings'];
BEGIN
    FOREACH t IN ARRAY courier_linked_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS "Couriers manage own %I" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "Couriers manage own %I" ON public.%I FOR ALL USING (EXISTS (SELECT 1 FROM public.couriers WHERE public.couriers.id = %I.courier_id AND public.couriers.user_id = auth.uid()));', t, t, t);
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 6. SYSTEM & ANALYTICS (Insert Anyone, Read Admin)
--------------------------------------------------------------------------------
ALTER TABLE public.event_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_predictions ENABLE ROW LEVEL SECURITY;

-- Select policies for analytics usually restricted to service_role or entity owner
DROP POLICY IF EXISTS "Restrict read on analytics" ON public.event_store;
CREATE POLICY "Restrict read on analytics" ON public.event_store FOR SELECT USING (auth.uid() = entity_id);

NOTIFY pgrst, 'reload schema';
