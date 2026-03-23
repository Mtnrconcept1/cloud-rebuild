-- === 20260310051648_strict_rls_policies.sql ===
-- Migration: Strict RLS Policies for Tok Platform
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

-- === 20260310064000_rls_emergency_fix.sql ===
-- EMERGENCY FIX: Restore RLS Transparency for core navigation and catalog
-- This migration ensures that role checks and public catalog viewing are unblocked.

--------------------------------------------------------------------------------
-- 1. AUTH & ROLES (Unblock Dashboard)
--------------------------------------------------------------------------------
-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "public_read_user_roles" ON public.user_roles;
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- profiles & user_profiles (Universal access for self)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
CREATE POLICY "profiles_self_all" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own user_profiles" ON public.user_profiles;
CREATE POLICY "user_profiles_self_all" ON public.user_profiles FOR ALL TO authenticated USING (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 2. RESTAURANTS & STAFF (Unblock Dashboard + Discovery)
--------------------------------------------------------------------------------
-- restaurants
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Anyone can view active restaurants" ON public.restaurants;
-- Public select
CREATE POLICY "restaurants_public_select" ON public.restaurants FOR SELECT USING (true);
-- Owner management
DROP POLICY IF EXISTS "owners_manage_restaurants" ON public.restaurants;
CREATE POLICY "restaurants_owner_all" ON public.restaurants FOR ALL TO authenticated USING (auth.uid() = owner_id);

-- restaurant_staff
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can see their own entry" ON public.restaurant_staff;
DROP POLICY IF EXISTS "restaurant_staff_manage" ON public.restaurant_staff;
CREATE POLICY "restaurant_staff_all" ON public.restaurant_staff FOR ALL TO authenticated USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
);

--------------------------------------------------------------------------------
-- 3. ADDITIONAL DISCOVERY (Ensure Discovery is clear)
--------------------------------------------------------------------------------
-- categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for categories" ON public.categories;
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT USING (true);

-- cuisines
ALTER TABLE public.cuisines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for cuisines" ON public.cuisines;
CREATE POLICY "cuisines_public_select" ON public.cuisines FOR SELECT USING (true);

--------------------------------------------------------------------------------
-- 4. REALTIME & CACHE
--------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- === 20260310100000_courier_infrastructure.sql ===
-- =============================================================
-- PHASE 1: Courier Infrastructure
-- Adds courier system tables, dispatch, earnings, and RLS
-- =============================================================

-- Step 1: Extend app_role enum with 'courier'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'courier';

-- Step 2: Create couriers table
CREATE TABLE public.couriers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  first_name text,
  last_name text,
  phone text,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'suspended', 'rejected')),
  vehicle_type text NOT NULL DEFAULT 'bicycle'
    CHECK (vehicle_type IN ('bicycle', 'scooter', 'car', 'walk')),
  license_plate text,
  iban text,
  is_online boolean DEFAULT false,
  current_lat double precision,
  current_lng double precision,
  last_location_at timestamptz,
  rating numeric DEFAULT 5.0,
  total_deliveries integer DEFAULT 0,
  acceptance_rate numeric DEFAULT 100.0,
  completion_rate numeric DEFAULT 100.0,
  avg_delivery_time_min integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 3: Create courier_documents table
CREATE TABLE public.courier_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN ('id_card', 'permit', 'insurance', 'vehicle_registration', 'photo')),
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 4: Create courier_shifts table
CREATE TABLE public.courier_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  zone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 5: Create courier_locations table (high-frequency GPS tracking)
CREATE TABLE public.courier_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  speed double precision,
  accuracy double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courier_locations_recent
  ON public.courier_locations (courier_id, recorded_at DESC);

-- Step 6: Create dispatch_jobs table
CREATE TABLE public.dispatch_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  courier_id uuid REFERENCES public.couriers(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'searching', 'assigned', 'accepted', 'arriving_pickup',
                      'picked_up', 'arriving_dropoff', 'delivered', 'cancelled', 'expired',
                      'no_courier')),
  assigned_at timestamptz,
  accepted_at timestamptz,
  arrived_pickup_at timestamptz,
  picked_up_at timestamptz,
  arrived_dropoff_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  earnings_base numeric DEFAULT 0,
  earnings_tip numeric DEFAULT 0,
  earnings_bonus numeric DEFAULT 0,
  distance_meters integer,
  estimated_duration_minutes integer,
  actual_duration_minutes integer,
  proof_photo_url text,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_lat double precision,
  dropoff_lng double precision,
  route_geometry jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dispatch_jobs_order ON public.dispatch_jobs (order_id);
CREATE INDEX idx_dispatch_jobs_courier ON public.dispatch_jobs (courier_id, status);

-- Step 7: Create dispatch_attempts table
CREATE TABLE public.dispatch_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  timeout_seconds integer DEFAULT 45,
  distance_to_pickup_meters integer,
  estimated_earnings numeric
);

CREATE INDEX idx_dispatch_attempts_job ON public.dispatch_attempts (dispatch_job_id);
CREATE INDEX idx_dispatch_attempts_courier ON public.dispatch_attempts (courier_id, status);

-- Step 8: Create courier_earnings table
CREATE TABLE public.courier_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL
    CHECK (type IN ('delivery', 'tip', 'bonus', 'payout', 'adjustment', 'penalty')),
  description text,
  dispatch_job_id uuid REFERENCES public.dispatch_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courier_earnings_courier ON public.courier_earnings (courier_id, created_at DESC);

-- Step 9: Add courier_id and scheduled_at to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.couriers(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Step 10: Create payment_transactions table
CREATE TABLE public.payment_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id),
  user_id uuid,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'chf',
  type text NOT NULL
    CHECK (type IN ('charge', 'refund', 'transfer', 'payout', 'credit', 'subscription')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_transactions_order ON public.payment_transactions (order_id);

-- Step 11: Create user_wallets table
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'chf',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 12: Create conversations & messages tables
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id),
  type text NOT NULL DEFAULT 'order'
    CHECK (type IN ('order', 'support', 'restaurant')),
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_order ON public.conversations (order_id);

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'system', 'location', 'action')),
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at);

-- Step 13: Create promo_codes tables
CREATE TABLE public.promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('percentage', 'fixed', 'free_delivery')),
  value numeric NOT NULL,
  min_order_amount numeric DEFAULT 0,
  max_discount numeric,
  max_uses integer,
  current_uses integer DEFAULT 0,
  per_user_limit integer DEFAULT 1,
  restaurant_id uuid REFERENCES public.restaurants(id),
  is_first_order_only boolean DEFAULT false,
  is_stackable boolean DEFAULT false,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promo_code_uses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  discount_applied numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 14: Create referral_codes table
CREATE TABLE public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  reward_referrer integer DEFAULT 500,
  reward_referee integer DEFAULT 300,
  total_referrals integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 15: Create support_tickets tables
CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  category text NOT NULL
    CHECK (category IN ('late_delivery', 'missing_items', 'wrong_order', 'cold_food',
                         'payment', 'quality', 'courier', 'restaurant', 'other')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  subject text NOT NULL,
  description text,
  assigned_to uuid,
  resolution_type text
    CHECK (resolution_type IS NULL OR resolution_type IN ('refund', 'credit', 'reorder', 'apology', 'none')),
  compensation_amount numeric DEFAULT 0,
  sla_deadline timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_internal boolean DEFAULT false,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX idx_support_messages_ticket ON public.support_messages (ticket_id, created_at);

-- Step 16: Add stripe_account_id and commission to restaurants
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0.15;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS avg_prep_time_min integer DEFAULT 20;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS supports_scheduled boolean DEFAULT false;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS supports_pickup boolean DEFAULT false;

-- Step 17: Add search_vector for full-text search
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_restaurants_search
  ON public.restaurants USING GIN(search_vector);

-- Trigger to auto-update search_vector
CREATE OR REPLACE FUNCTION public.update_restaurant_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('french',
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.cuisine_type, '') || ' ' ||
    coalesce(NEW.city, '') || ' ' ||
    coalesce(NEW.address, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurants_search_vector
  BEFORE INSERT OR UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.update_restaurant_search_vector();

-- Update existing rows
UPDATE public.restaurants SET search_vector = to_tsvector('french',
  coalesce(name, '') || ' ' || coalesce(description, '') || ' ' ||
  coalesce(cuisine_type, '') || ' ' || coalesce(city, '') || ' ' || coalesce(address, '')
);

-- Step 18: Geospatial search function
CREATE OR REPLACE FUNCTION public.search_restaurants_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5.0,
  p_cuisine text DEFAULT NULL,
  p_min_rating numeric DEFAULT 0,
  p_max_price_range integer DEFAULT 4,
  p_search_text text DEFAULT NULL,
  p_delivery_only boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, description text, cuisine_type text, rating numeric,
  review_count integer, price_range integer, delivery_fee numeric,
  image_url text, address text, city text,
  latitude double precision, longitude double precision,
  distance_km double precision, avg_prep_time_min integer
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id, r.name, r.description, r.cuisine_type, r.rating,
    r.review_count, r.price_range, r.delivery_fee,
    r.image_url, r.address, r.city,
    r.latitude, r.longitude,
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(r.latitude)) *
      cos(radians(r.longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.latitude))
    )) AS distance_km,
    r.avg_prep_time_min
  FROM public.restaurants r
  WHERE r.is_active = true
    AND r.latitude IS NOT NULL
    AND r.longitude IS NOT NULL
    AND (6371 * acos(
      cos(radians(p_lat)) * cos(radians(r.latitude)) *
      cos(radians(r.longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.latitude))
    )) <= p_radius_km
    AND (p_cuisine IS NULL OR r.cuisine_type ILIKE '%' || p_cuisine || '%')
    AND r.rating >= p_min_rating
    AND r.price_range <= p_max_price_range
    AND (NOT p_delivery_only OR r.delivery_available = true)
    AND (p_search_text IS NULL OR r.search_vector @@ plainto_tsquery('french', p_search_text))
  ORDER BY distance_km ASC
  LIMIT p_limit OFFSET p_offset;
$$;

-- Step 19: Function to find nearby available couriers
CREATE OR REPLACE FUNCTION public.find_nearby_couriers(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5.0,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  courier_id uuid, user_id uuid, distance_km double precision,
  rating numeric, acceptance_rate numeric, vehicle_type text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id AS courier_id, c.user_id,
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(c.current_lat)) *
      cos(radians(c.current_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.current_lat))
    )) AS distance_km,
    c.rating, c.acceptance_rate, c.vehicle_type
  FROM public.couriers c
  WHERE c.is_online = true
    AND c.status = 'approved'
    AND c.current_lat IS NOT NULL
    AND c.current_lng IS NOT NULL
    AND (6371 * acos(
      cos(radians(p_lat)) * cos(radians(c.current_lat)) *
      cos(radians(c.current_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.current_lat))
    )) <= p_radius_km
    -- Exclude couriers with active deliveries
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_jobs dj
      WHERE dj.courier_id = c.id
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    )
  ORDER BY
    (1.0 / GREATEST((6371 * acos(
      cos(radians(p_lat)) * cos(radians(c.current_lat)) *
      cos(radians(c.current_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.current_lat))
    )), 0.1)) * c.rating * (c.acceptance_rate / 100.0) DESC
  LIMIT p_limit;
$$;

-- =============================================================
-- RLS POLICIES
-- =============================================================

-- Couriers
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "couriers_own_profile_select" ON public.couriers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "couriers_own_profile_insert" ON public.couriers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "couriers_own_profile_update" ON public.couriers
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "couriers_admin_all" ON public.couriers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- Clients can see courier basic info for their active orders
CREATE POLICY "couriers_client_active_order" ON public.couriers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      WHERE dj.courier_id = couriers.id
        AND o.user_id = auth.uid()
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    )
  );

-- Courier documents
ALTER TABLE public.courier_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier_docs_own" ON public.courier_documents
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_documents.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "courier_docs_admin" ON public.courier_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier shifts
ALTER TABLE public.courier_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier_shifts_own" ON public.courier_shifts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_shifts.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "courier_shifts_admin" ON public.courier_shifts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier locations
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier_locations_own_insert" ON public.courier_locations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_locations.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "courier_locations_own_select" ON public.courier_locations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_locations.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "courier_locations_client_active" ON public.courier_locations
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      WHERE dj.courier_id = courier_locations.courier_id
        AND o.user_id = auth.uid()
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    )
  );
CREATE POLICY "courier_locations_admin" ON public.courier_locations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch jobs
ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_jobs_courier_select" ON public.dispatch_jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "dispatch_jobs_courier_update" ON public.dispatch_jobs
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "dispatch_jobs_client_select" ON public.dispatch_jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = dispatch_jobs.order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "dispatch_jobs_admin" ON public.dispatch_jobs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch attempts
ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_attempts_courier" ON public.dispatch_attempts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_attempts.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "dispatch_attempts_admin" ON public.dispatch_attempts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier earnings
ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier_earnings_own" ON public.courier_earnings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_earnings.courier_id AND c.user_id = auth.uid())
  );
CREATE POLICY "courier_earnings_admin" ON public.courier_earnings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Payment transactions
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_transactions_own" ON public.payment_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "payment_transactions_admin" ON public.payment_transactions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User wallets
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_own" ON public.user_wallets
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wallets_admin" ON public.user_wallets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_participant" ON public.conversations
  FOR ALL TO authenticated USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "conversations_admin" ON public.conversations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_participant" ON public.messages
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND auth.uid() = ANY(c.participant_ids)
    )
  );
CREATE POLICY "messages_admin" ON public.messages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Promo codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes_public_read" ON public.promo_codes
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "promo_codes_admin" ON public.promo_codes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "promo_codes_restaurant" ON public.promo_codes
  FOR ALL TO authenticated USING (
    restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants r WHERE r.id = promo_codes.restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- Promo code uses
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_uses_own" ON public.promo_code_uses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "promo_uses_admin" ON public.promo_code_uses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Referral codes
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_own" ON public.referral_codes
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "referral_public_read" ON public.referral_codes
  FOR SELECT TO authenticated USING (true);

-- Support tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_own" ON public.support_tickets
  FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "support_tickets_admin" ON public.support_tickets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Support messages
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_messages_own" ON public.support_messages
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "support_messages_admin" ON public.support_messages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- ENABLE REALTIME on critical tables
-- =============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- === 20260310100100_delivery_logistics.sql ===
-- Migration: Advanced Delivery & Finance
-- Adds delivery batching, routing optimization history, and deep financial tracking (invoices, payouts).

-- 1. Advanced Logistics (Batching & Routing)
CREATE TABLE IF NOT EXISTS public.delivery_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT DEFAULT 'formed', -- 'formed', 'assigned', 'in_progress', 'completed'
    courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    estimated_total_distance_meters INTEGER,
    estimated_total_duration_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.delivery_batches(id) ON DELETE CASCADE,
    dispatch_job_id UUID NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
    stop_sequence INTEGER NOT NULL,
    stop_type TEXT NOT NULL, -- 'pickup', 'dropoff'
    location_lat DOUBLE PRECISION NOT NULL,
    location_lng DOUBLE PRECISION NOT NULL,
    estimated_arrival_at TIMESTAMP WITH TIME ZONE,
    actual_arrival_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.proof_of_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_job_id UUID NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
    courier_id UUID NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
    photo_urls TEXT[],
    signature_url TEXT,
    notes TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Advanced Finance & Payouts
CREATE TABLE IF NOT EXISTS public.payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    provider_intent_id TEXT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    status TEXT DEFAULT 'requires_payment_method',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    payout_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'paid', 'failed'
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.payout_batches(id) ON DELETE SET NULL,
    recipient_type TEXT NOT NULL, -- 'restaurant', 'courier'
    recipient_id UUID NOT NULL, -- UUID of the restaurant or courier
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    provider_transfer_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    recipient_type TEXT NOT NULL, -- 'user', 'restaurant', 'courier'
    recipient_id UUID NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    tax_total NUMERIC(10, 2) NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    file_url TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number TEXT NOT NULL UNIQUE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_routes_batch_id ON public.delivery_routes(batch_id);
CREATE INDEX IF NOT EXISTS idx_payouts_recipient_id ON public.payouts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);

-- === 20260310100200_loyalty_reviews_data.sql ===
-- Migration: Loyalty, Reviews, Reservations & AI Data
-- Adds deep user retention mechanisms, dining-in logic, and ML stores for personalization.

-- 1. Loyalty & Rewards (Enhanced)
CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- 'bronze', 'silver', 'gold', 'platinum'
    min_points INTEGER NOT NULL,
    benefits JSONB,
    multiplier NUMERIC(3, 2) DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
    user_id UUID PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    tier_id UUID REFERENCES public.loyalty_tiers(id) ON DELETE SET NULL,
    current_points INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- loyalty_transactions might exist based on our scan, so we use IF NOT EXISTS
ALTER TABLE public.loyalty_transactions
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.subscription_benefits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.user_subscription_plans(id) ON DELETE CASCADE,
    benefit_type TEXT NOT NULL, -- 'free_delivery', 'discount_percentage', 'priority_support'
    value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: gift_points exists, let's also create gift_cards if needed, or rely on gift_points
CREATE TABLE IF NOT EXISTS public.gift_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    initial_balance NUMERIC(10, 2) NOT NULL,
    current_balance NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    purchaser_id UUID REFERENCES public.user_profiles(user_id) ON DELETE SET NULL,
    recipient_email TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Reviews & Feedback
ALTER TABLE public.reviews
    ADD COLUMN IF NOT EXISTS order_id UUID UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS restaurant_rating INTEGER CHECK (restaurant_rating BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS courier_rating INTEGER CHECK (courier_rating BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS food_rating INTEGER CHECK (food_rating BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS tags TEXT[],
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';

CREATE TABLE IF NOT EXISTS public.review_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL UNIQUE REFERENCES public.reviews(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL, -- 'restaurant_staff', 'admin'
    reply_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Incident Management additions
CREATE TABLE IF NOT EXISTS public.incident_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reporter_role TEXT NOT NULL, -- 'user', 'courier', 'restaurant'
    target_role TEXT,
    target_id UUID,
    incident_type TEXT NOT NULL, -- 'safety', 'harassment', 'fraud'
    description TEXT NOT NULL,
    status TEXT DEFAULT 'investigating',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.compensations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    ticket_id UUID, -- reference to support_tickets if required, leaving dynamic
    amount NUMERIC(10, 2) NOT NULL,
    type TEXT NOT NULL, -- 'wallet_credit', 'refund', 'promo_code'
    reason TEXT NOT NULL,
    issued_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Reservations & Dine-in
ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS reservation_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS special_requests TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

CREATE TABLE IF NOT EXISTS public.reservation_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.reservation_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES public.reservation_tables(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.reservation_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. AI & Data ML Platforms
CREATE TABLE IF NOT EXISTS public.event_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    event_name TEXT NOT NULL,
    payload JSONB,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.feature_store (
    entity_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    feature_name TEXT NOT NULL,
    feature_value DOUBLE PRECISION NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY(entity_id, feature_name)
);

CREATE TABLE IF NOT EXISTS public.recommendation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    recommended_items UUID[] NOT NULL,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ml_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_type TEXT NOT NULL, -- 'eta', 'prep_time', 'churn'
    entity_id UUID NOT NULL,
    predicted_value DOUBLE PRECISION NOT NULL,
    confidence_score DOUBLE PRECISION,
    actual_value DOUBLE PRECISION, -- populated later
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fraud_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    signal_type TEXT NOT NULL, -- 'high_velocity', 'ip_mismatch', 'impossible_travel'
    risk_score DOUBLE PRECISION NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_id ON public.reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_branch_id ON public.reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_event_store_entity ON public.event_store(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user_id ON public.fraud_signals(user_id);

-- === 20260310110000_allow_anon_tracking_inserts.sql ===
-- Allow anonymous users to insert tracking data
-- This is necessary for analytics to work for non-logged in users.

-- 1. Grant INSERT permissions to anon role
GRANT INSERT ON public.search_logs TO anon;
GRANT INSERT ON public.impressions TO anon;
GRANT INSERT ON public.clicks TO anon;
GRANT INSERT ON public.event_store TO anon;

-- 2. Update RLS policies to allow anonymous inserts

-- search_logs
DROP POLICY IF EXISTS "Require auth for search_logs" ON public.search_logs;
CREATE POLICY "Allow anyone to insert search_logs" ON public.search_logs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own search_logs" ON public.search_logs
    FOR SELECT USING (auth.uid() = user_id);

-- impressions
DROP POLICY IF EXISTS "Require auth for impressions" ON public.impressions;
CREATE POLICY "Allow anyone to insert impressions" ON public.impressions
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own impressions" ON public.impressions
    FOR SELECT USING (auth.uid() = user_id);

-- clicks
DROP POLICY IF EXISTS "Require auth for clicks" ON public.clicks;
CREATE POLICY "Allow anyone to insert clicks" ON public.clicks
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own clicks" ON public.clicks
    FOR SELECT USING (auth.uid() = user_id);

-- event_store
DROP POLICY IF EXISTS "Require auth for event_store" ON public.event_store;
CREATE POLICY "Allow anyone to insert event_store" ON public.event_store
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own event_store" ON public.event_store
    FOR SELECT USING (
        auth.uid() = entity_id OR 
        (payload->>'user_id')::uuid = auth.uid()
    );

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- === 20260310110000_allow_anon_tracking_inserts.sql ===
-- Allow anonymous users to insert tracking data
-- This is necessary for analytics to work for non-logged in users.

-- 1. Grant INSERT permissions to anon role
GRANT INSERT ON public.search_logs TO anon;
GRANT INSERT ON public.impressions TO anon;
GRANT INSERT ON public.clicks TO anon;
GRANT INSERT ON public.event_store TO anon;

-- 2. Update RLS policies to allow anonymous inserts

-- search_logs
DROP POLICY IF EXISTS "Require auth for search_logs" ON public.search_logs;
CREATE POLICY "Allow anyone to insert search_logs" ON public.search_logs
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own search_logs" ON public.search_logs
    FOR SELECT USING (auth.uid() = user_id);

-- impressions
DROP POLICY IF EXISTS "Require auth for impressions" ON public.impressions;
CREATE POLICY "Allow anyone to insert impressions" ON public.impressions
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own impressions" ON public.impressions
    FOR SELECT USING (auth.uid() = user_id);

-- clicks
DROP POLICY IF EXISTS "Require auth for clicks" ON public.clicks;
CREATE POLICY "Allow anyone to insert clicks" ON public.clicks
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own clicks" ON public.clicks
    FOR SELECT USING (auth.uid() = user_id);

-- event_store
DROP POLICY IF EXISTS "Require auth for event_store" ON public.event_store;
CREATE POLICY "Allow anyone to insert event_store" ON public.event_store
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own event_store" ON public.event_store
    FOR SELECT USING (
        auth.uid() = entity_id OR 
        (payload->>'user_id')::uuid = auth.uid()
    );

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- === 20260311120000_atomic_stock_and_rls_hardening.sql ===
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

-- === 20260311140000_seed_feature_flags.sql ===
-- Seed default feature flags (idempotent via ON CONFLICT)
INSERT INTO public.feature_flags (name, label, description, is_active) VALUES
  ('creneaux-garantis', 'Créneaux garantis', 'Livraison ponctuelle ou remboursé', true),
  ('flex-prix-bas', 'Offres', 'Fenêtre flexible, prix réduit', true),
  ('match-groupes', 'Match groupes', 'Commandez ensemble, payez moins', true),
  ('multi-stop', 'Multi-stop', 'Un trajet, plusieurs adresses', true),
  ('multi-restaurant', 'Multi-restos', 'Plats de différents restos', true),
  ('chefs-table', 'Chef''s Table', 'Plats off-menu exclusifs', true),
  ('zero-attente', 'Zéro attente', 'Précommande synchronisée', true),
  ('garantie-qualite', 'Garantie qualité', 'Chaud garanti ou remboursé', true),
  ('budget-auto', 'Budget auto', 'Menus optimisés par objectifs', true),
  ('abonnement', 'Abonnement', 'Repas récurrents planifiés', true)
ON CONFLICT (name) DO NOTHING;

-- === 20260311150000_seed_geneva_restaurants.sql ===
-- Seed Geneva restaurants and their menu items
-- Use a single owner_id: pick the first restaurateur, or fallback to any user
DO $$
DECLARE
  v_owner uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
  r6 uuid; r7 uuid; r8 uuid; r9 uuid; r10 uuid;
  r11 uuid; r12 uuid; r13 uuid; r14 uuid; r15 uuid;
BEGIN
  -- Get a restaurateur owner
  SELECT user_id INTO v_owner FROM public.user_roles WHERE role = 'restaurateur' LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM auth.users LIMIT 1;
  END IF;

  -- ========== RESTAURANTS ==========

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Le Comptoir Genevois', 'Cuisine traditionnelle suisse et genevoise au cœur de la vieille ville. Spécialités de fondue, raclette et longeole.', 'Suisse', 'Rue du Rhône 42', 'Genève', '+41 22 310 55 60', 4.6, 234, 3, true, true, 5.90, 25, 46.2044, 6.1432, 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800')
  RETURNING id INTO r1;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Sakura Genève', 'Restaurant japonais authentique. Sushis frais préparés par notre chef Takeshi, ramens maison et spécialités izakaya.', 'Japonais', 'Rue de Lausanne 18', 'Genève', '+41 22 731 88 90', 4.7, 312, 3, true, true, 4.90, 30, 46.2087, 6.1440, 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800')
  RETURNING id INTO r2;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Pizzeria Da Luigi', 'Pizzas napolitaines cuites au feu de bois. Pâte fermentée 72h, mozzarella di bufala importée et ingrédients frais.', 'Italien', 'Boulevard Carl-Vogt 65', 'Genève', '+41 22 320 44 12', 4.5, 456, 2, true, true, 3.90, 20, 46.1983, 6.1380, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800')
  RETURNING id INTO r3;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Le Bosphore', 'Saveurs turques et méditerranéennes. Kebabs artisanaux, mezze variés et baklava maison.', 'Turc', 'Rue de Carouge 28', 'Genève', '+41 22 342 11 55', 4.3, 187, 2, true, true, 3.50, 18, 46.1935, 6.1420, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800')
  RETURNING id INTO r4;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Tandoori Palace', 'Restaurant indien haut de gamme. Tandoori, biryanis, currys épicés et naans fraîchement cuits au four.', 'Indien', 'Rue de Berne 12', 'Genève', '+41 22 738 22 30', 4.4, 198, 2, true, true, 4.50, 22, 46.2095, 6.1470, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800')
  RETURNING id INTO r5;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Chez Mamie Thaï', 'Street food thaïlandaise authentique. Pad thaï, curry vert, som tam et bubble tea maison.', 'Thaïlandais', 'Rue de la Servette 45', 'Genève', '+41 22 733 99 10', 4.5, 267, 1, true, true, 3.90, 15, 46.2120, 6.1350, 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=800')
  RETURNING id INTO r6;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Burger Brothers GVA', 'Burgers gourmets 100% artisanaux. Viande suisse, buns briochés maison, frites fraîches et milkshakes.', 'Burger', 'Rue du Mont-Blanc 22', 'Genève', '+41 22 732 60 70', 4.6, 389, 2, true, true, 3.90, 20, 46.2078, 6.1460, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800')
  RETURNING id INTO r7;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Maison du Dragon', 'Cuisine chinoise cantonaise et sichuanaise. Dim sum vapeur, canard laqué et nouilles sautées au wok.', 'Chinois', 'Avenue de France 15', 'Genève', '+41 22 734 55 80', 4.2, 156, 2, true, true, 4.50, 25, 46.2100, 6.1420, 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800')
  RETURNING id INTO r8;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'La Table Libanaise', 'Mezze, grillades et spécialités libanaises familiales. Houmous crémeux, falafels croustillants et shawarma juteux.', 'Libanais', 'Rue de Zurich 8', 'Genève', '+41 22 741 33 20', 4.7, 278, 2, true, true, 4.50, 20, 46.2060, 6.1500, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800')
  RETURNING id INTO r9;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Poke Bowl Factory', 'Poke bowls frais et healthy. Base riz ou quinoa, poisson cru, avocat, edamame et sauces signature.', 'Healthy', 'Rue du Cendrier 10', 'Genève', '+41 22 310 77 40', 4.4, 203, 2, true, true, 3.50, 18, 46.2070, 6.1450, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800')
  RETURNING id INTO r10;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Café des Bains', 'Brunch, salades et plats du jour à deux pas du MAMCO. Cuisine de marché fraîche et locale.', 'Français', 'Rue des Bains 26', 'Genève', '+41 22 321 10 05', 4.5, 145, 2, true, true, 4.90, 22, 46.1990, 6.1410, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800')
  RETURNING id INTO r11;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Tacos El Padrino', 'Tacos mexicains authentiques, burritos géants, nachos et guacamole frais. Ambiance festive !', 'Mexicain', 'Rue de Monthoux 34', 'Genève', '+41 22 738 44 55', 4.3, 210, 1, true, true, 3.50, 15, 46.2090, 6.1480, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800')
  RETURNING id INTO r12;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Seoul Kitchen', 'Cuisine coréenne moderne. Bibimbap, kimchi jjigae, poulet frit coréen et barbecue à table.', 'Coréen', 'Rue Voltaire 7', 'Genève', '+41 22 740 88 15', 4.6, 175, 2, true, true, 4.90, 25, 46.2010, 6.1440, 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800')
  RETURNING id INTO r13;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Dar Marrakech', 'Couscous royal, tajines mijotés et pastilla traditionnelle. La cuisine marocaine dans toute sa splendeur.', 'Marocain', 'Rue de Chantepoulet 16', 'Genève', '+41 22 731 22 45', 4.5, 192, 2, true, true, 4.50, 22, 46.2085, 6.1455, 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800')
  RETURNING id INTO r14;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Le Petit Grec', 'Gyros, souvlaki, salade grecque et tzatziki maison. Voyage culinaire direct à Athènes.', 'Grec', 'Place du Cirque 3', 'Genève', '+41 22 328 77 90', 4.4, 163, 1, true, true, 3.50, 15, 46.2000, 6.1400, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800')
  RETURNING id INTO r15;

  -- ========== MENU ITEMS ==========

  -- R1: Le Comptoir Genevois (Suisse)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r1, 'Fondue moitié-moitié', 'Gruyère AOP et Vacherin fribourgeois, pain artisanal', 28.50, 'Plats principaux', true, 'https://images.unsplash.com/photo-1530016555861-2d4da7e45a4d?w=400'),
    (r1, 'Raclette du Valais', 'Fromage raclette fondu, pommes de terre, cornichons et oignons', 26.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1510431198580-7727c9fa1e3a?w=400'),
    (r1, 'Longeole IGP', 'Saucisse genevoise traditionnelle aux graines de fenouil, gratin dauphinois', 24.00, 'Plats principaux', true, NULL),
    (r1, 'Rösti bernois', 'Rösti croustillant garni de lard, œuf au plat et fromage', 22.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1432139509613-5c4255a1d197?w=400'),
    (r1, 'Filets de perche', 'Perche du Léman, sauce tartare maison, frites allumettes', 32.00, 'Plats principaux', true, NULL),
    (r1, 'Salade du marché', 'Mesclun, noix, gruyère et vinaigrette moutarde', 14.50, 'Entrées', true, NULL),
    (r1, 'Tarte aux noix', 'Spécialité des Grisons, servie tiède avec crème double', 9.50, 'Desserts', true, NULL),
    (r1, 'Meringues à la double crème', 'Meringues craquantes et crème de la Gruyère', 10.00, 'Desserts', true, NULL);

  -- R2: Sakura Genève (Japonais)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r2, 'Assortiment sashimi', '12 pièces : saumon, thon, daurade', 28.00, 'Sashimi', true, 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'),
    (r2, 'Plateau sushi mixte', '18 pièces nigiri et maki assortis', 34.00, 'Sushi', true, 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400'),
    (r2, 'California roll', '8 pièces avocat, concombre, surimi', 14.50, 'Maki', true, NULL),
    (r2, 'Salmon roll spécial', '8 pièces saumon flambé, cream cheese, ciboulette', 16.50, 'Maki', true, NULL),
    (r2, 'Ramen tonkotsu', 'Bouillon porc 12h, chashu, œuf mollet, nouilles fraîches', 22.00, 'Ramen', true, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400'),
    (r2, 'Ramen miso', 'Bouillon miso, poulet grillé, maïs, beurre', 20.00, 'Ramen', true, NULL),
    (r2, 'Gyoza porc', '6 raviolis japonais grillés, sauce ponzu', 12.00, 'Entrées', true, NULL),
    (r2, 'Edamame', 'Fèves de soja salées', 7.50, 'Entrées', true, NULL),
    (r2, 'Tempura crevettes', '5 crevettes tempura, sauce tentsuyu', 16.00, 'Entrées', true, NULL),
    (r2, 'Mochi glacé (3 pcs)', 'Matcha, mangue, fraise', 8.50, 'Desserts', true, NULL);

  -- R3: Pizzeria Da Luigi (Italien)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r3, 'Margherita', 'San Marzano, mozzarella fior di latte, basilic frais', 16.00, 'Pizzas', true, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400'),
    (r3, 'Quattro Formaggi', 'Mozzarella, gorgonzola, parmesan, taleggio', 19.50, 'Pizzas', true, NULL),
    (r3, 'Diavola', 'Salame piccante, mozzarella, piment calabrais', 18.50, 'Pizzas', true, NULL),
    (r3, 'Prosciutto e Rucola', 'Jambon de Parme 24 mois, roquette, copeaux de parmesan', 21.00, 'Pizzas', true, NULL),
    (r3, 'Truffe Nera', 'Crème de truffe, mozzarella di bufala, champignons', 24.00, 'Pizzas', true, NULL),
    (r3, 'Calzone', 'Jambon, mozzarella, champignons, sauce tomate', 19.00, 'Pizzas', true, NULL),
    (r3, 'Bruschetta classique', 'Tomates cerises, ail, basilic, huile d''olive', 10.50, 'Entrées', true, NULL),
    (r3, 'Tiramisu', 'Recette traditionnelle au mascarpone et café', 9.50, 'Desserts', true, NULL),
    (r3, 'Panna cotta', 'Vanille bourbon et coulis de fruits rouges', 8.50, 'Desserts', true, NULL);

  -- R4: Le Bosphore (Turc)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r4, 'Kebab mixte assiette', 'Agneau et poulet grillés, riz, salade, sauce yaourt', 22.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400'),
    (r4, 'Döner sandwich', 'Viande tournante, crudités, sauce blanche, pain turc', 12.50, 'Sandwichs', true, NULL),
    (r4, 'Lahmacun', 'Pizza turque fine à la viande hachée et herbes', 10.00, 'Entrées', true, NULL),
    (r4, 'Mezze variés', 'Houmous, baba ganoush, muhammara, pain pita', 15.00, 'Entrées', true, NULL),
    (r4, 'Adana kebab', 'Brochette d''agneau épicée, boulgour et salade', 20.00, 'Plats principaux', true, NULL),
    (r4, 'Falafel assiette', 'Boulettes de pois chiches, houmous, salade taboulé', 16.00, 'Plats principaux', true, NULL),
    (r4, 'Baklava pistache', 'Pâte filo, miel et pistaches (4 pièces)', 8.00, 'Desserts', true, NULL),
    (r4, 'Thé turc', 'Thé noir traditionnel servi en verre tulipe', 3.50, 'Boissons', true, NULL);

  -- R5: Tandoori Palace (Indien)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r5, 'Butter Chicken', 'Poulet tandoori dans une sauce tomate crémeuse au beurre', 23.00, 'Curries', true, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400'),
    (r5, 'Tikka Masala', 'Poulet mariné grillé, sauce masala onctueuse', 22.00, 'Curries', true, NULL),
    (r5, 'Biryani agneau', 'Riz basmati épicé, agneau mijoté, raïta', 24.00, 'Biryani', true, NULL),
    (r5, 'Palak Paneer', 'Épinards frais et fromage indien, épices douces', 18.00, 'Végétarien', true, NULL),
    (r5, 'Naan au fromage', 'Pain indien au four tandoor, farci au fromage', 6.50, 'Accompagnements', true, NULL),
    (r5, 'Naan nature', 'Pain indien traditionnel', 4.00, 'Accompagnements', true, NULL),
    (r5, 'Samosa (3 pcs)', 'Beignets croustillants farcis aux légumes épicés', 8.50, 'Entrées', true, NULL),
    (r5, 'Raïta concombre', 'Yaourt frais, concombre et menthe', 5.00, 'Accompagnements', true, NULL),
    (r5, 'Mango Lassi', 'Boisson onctueuse à la mangue et yaourt', 6.50, 'Boissons', true, NULL),
    (r5, 'Gulab Jamun', 'Beignets de lait en sirop de cardamome et rose', 7.50, 'Desserts', true, NULL);

  -- R6: Chez Mamie Thaï (Thaïlandais)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r6, 'Pad Thaï crevettes', 'Nouilles de riz sautées, crevettes, cacahuètes, citron vert', 19.50, 'Plats principaux', true, 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400'),
    (r6, 'Curry vert poulet', 'Lait de coco, basilic thaï, aubergines, bambou', 18.00, 'Curries', true, NULL),
    (r6, 'Curry rouge bœuf', 'Lait de coco, bœuf mijoté, haricots verts, kaffir', 19.00, 'Curries', true, NULL),
    (r6, 'Som Tam', 'Salade de papaye verte épicée, cacahuètes, crevettes séchées', 13.00, 'Entrées', true, NULL),
    (r6, 'Rouleaux de printemps', '4 rouleaux frais aux crevettes, sauce sweet chili', 11.00, 'Entrées', true, NULL),
    (r6, 'Tom Yum Kung', 'Soupe épicée aux crevettes, citronnelle et galanga', 14.00, 'Soupes', true, NULL),
    (r6, 'Riz gluant mangue', 'Riz gluant au lait de coco et mangue fraîche', 9.00, 'Desserts', true, NULL),
    (r6, 'Bubble Tea taro', 'Thé au lait de taro, perles de tapioca', 7.50, 'Boissons', true, NULL);

  -- R7: Burger Brothers GVA (Burger)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r7, 'Classic Smash', 'Double smash patty, cheddar, pickles, sauce secrète', 16.50, 'Burgers', true, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400'),
    (r7, 'BBQ Bacon', 'Bacon croustillant, oignons frits, sauce BBQ fumée, cheddar', 18.50, 'Burgers', true, NULL),
    (r7, 'Truffle Burger', 'Emmental, champignons, mayo truffée, roquette', 20.00, 'Burgers', true, NULL),
    (r7, 'Veggie Burger', 'Steak Beyond Meat, avocat, tomate, sauce vegan', 17.50, 'Burgers', true, NULL),
    (r7, 'Chicken Crispy', 'Poulet pané croustillant, coleslaw, sauce sriracha mayo', 17.00, 'Burgers', true, NULL),
    (r7, 'Frites maison', 'Frites fraîches coupées, sel marin', 6.50, 'Sides', true, NULL),
    (r7, 'Sweet potato fries', 'Frites de patate douce, sauce chipotle', 7.50, 'Sides', true, NULL),
    (r7, 'Onion Rings', 'Oignons panés croustillants, dip ranch', 8.00, 'Sides', true, NULL),
    (r7, 'Milkshake vanille', 'Crème glacée artisanale, lait frais', 8.50, 'Boissons', true, NULL),
    (r7, 'Milkshake Oreo', 'Crème glacée, Oreo concassés, chantilly', 9.50, 'Boissons', true, NULL);

  -- R8: Maison du Dragon (Chinois)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r8, 'Canard laqué', 'Canard rôti caramélisé, crêpes mandarin, ciboule', 32.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400'),
    (r8, 'Dim Sum vapeur (6 pcs)', 'Assortiment ha gow et siu mai', 14.00, 'Dim Sum', true, NULL),
    (r8, 'Bao porc caramélisé', '3 brioches vapeur, porc effiloché, pickles', 13.00, 'Dim Sum', true, NULL),
    (r8, 'Poulet Kung Pao', 'Poulet sauté, cacahuètes, piments séchés, poivrons', 20.00, 'Plats principaux', true, NULL),
    (r8, 'Nouilles sautées bœuf', 'Nouilles fraîches au wok, bœuf, légumes croquants', 18.00, 'Plats principaux', true, NULL),
    (r8, 'Riz cantonais', 'Riz sauté, œuf, crevettes, petits pois, char siu', 15.00, 'Accompagnements', true, NULL),
    (r8, 'Soupe wonton', 'Raviolis de porc dans un bouillon clair parfumé', 11.00, 'Soupes', true, NULL),
    (r8, 'Perles de coco', 'Boules de riz gluant à la noix de coco', 7.00, 'Desserts', true, NULL);

  -- R9: La Table Libanaise (Libanais)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r9, 'Shawarma poulet', 'Poulet mariné, ail, pickles, sauce toum, pain saj', 15.00, 'Sandwichs', true, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400'),
    (r9, 'Assiette mixte grillades', 'Kafta, taouk, agneau, riz, salade fattouch', 26.00, 'Plats principaux', true, NULL),
    (r9, 'Houmous libanais', 'Pois chiches, tahini, citron, huile d''olive, pain', 10.00, 'Mezze', true, NULL),
    (r9, 'Falafel wrap', 'Falafels croustillants, houmous, crudités, sauce tahini', 13.00, 'Sandwichs', true, NULL),
    (r9, 'Taboulé libanais', 'Persil, menthe, boulgour fin, tomates, citron', 11.00, 'Mezze', true, NULL),
    (r9, 'Fattouch', 'Salade croquante au pain grillé et sumac', 12.00, 'Mezze', true, NULL),
    (r9, 'Kebbé frit (4 pcs)', 'Croquettes de viande et boulgour, pignons', 12.00, 'Mezze', true, NULL),
    (r9, 'Baklawa assortie', 'Pistache, noix, fleur d''oranger (6 pièces)', 9.00, 'Desserts', true, NULL),
    (r9, 'Limonade à la menthe', 'Citron frais, menthe, eau de fleur d''oranger', 5.50, 'Boissons', true, NULL);

  -- R10: Poke Bowl Factory (Healthy)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r10, 'Salmon Lover', 'Saumon frais, avocat, mangue, edamame, riz vinaigré, sauce soja sésame', 19.50, 'Poke Bowls', true, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'),
    (r10, 'Tuna Spicy', 'Thon épicé, concombre, carotte, wakame, riz, sauce sriracha mayo', 20.50, 'Poke Bowls', true, NULL),
    (r10, 'Veggie Green', 'Tofu grillé, avocat, edamame, kale, quinoa, sauce miso gingembre', 17.50, 'Poke Bowls', true, NULL),
    (r10, 'Chicken Teriyaki', 'Poulet teriyaki, ananas, chou rouge, riz, sauce teriyaki', 18.00, 'Poke Bowls', true, NULL),
    (r10, 'Açaí Bowl', 'Açaí, banane, granola, fruits frais, miel', 14.00, 'Bowls sucrés', true, NULL),
    (r10, 'Smoothie vert', 'Épinards, banane, mangue, lait d''amande', 8.50, 'Boissons', true, NULL),
    (r10, 'Kombucha maison', 'Gingembre-citron, fermentation artisanale', 6.50, 'Boissons', true, NULL);

  -- R11: Café des Bains (Français)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r11, 'Tartare de bœuf', 'Bœuf suisse haché au couteau, câpres, échalotes, frites', 28.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400'),
    (r11, 'Salade niçoise', 'Thon, œuf, haricots verts, olives, anchois', 18.00, 'Salades', true, NULL),
    (r11, 'Croque-monsieur', 'Jambon, gruyère, béchamel gratinée, salade verte', 15.00, 'Plats principaux', true, NULL),
    (r11, 'Quiche du jour', 'Pâte brisée maison, garniture de saison, salade', 16.00, 'Plats principaux', true, NULL),
    (r11, 'Planche apéro', 'Charcuterie, fromages suisses, cornichons, pain', 22.00, 'Entrées', true, NULL),
    (r11, 'Crème brûlée', 'Vanille de Madagascar, caramel craquant', 9.00, 'Desserts', true, NULL),
    (r11, 'Fondant au chocolat', 'Cœur coulant, glace vanille', 10.00, 'Desserts', true, NULL);

  -- R12: Tacos El Padrino (Mexicain)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r12, 'Tacos al Pastor (3)', 'Porc mariné achiote, ananas, coriandre, oignon', 14.50, 'Tacos', true, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400'),
    (r12, 'Tacos Carnitas (3)', 'Porc effiloché confit, salsa verde, oignon', 14.50, 'Tacos', true, NULL),
    (r12, 'Burrito poulet', 'Poulet grillé, riz, haricots noirs, guacamole, crème', 16.00, 'Burritos', true, NULL),
    (r12, 'Burrito bœuf', 'Bœuf épicé, riz, pico de gallo, cheddar, crème', 17.00, 'Burritos', true, NULL),
    (r12, 'Nachos supremos', 'Tortilla chips, fromage fondu, jalapeños, guacamole, crème', 13.00, 'Entrées', true, NULL),
    (r12, 'Guacamole frais', 'Avocat, citron vert, coriandre, tortilla chips', 10.00, 'Entrées', true, NULL),
    (r12, 'Quesadilla fromage', 'Tortilla grillée, mélange de fromages, pico de gallo', 12.00, 'Entrées', true, NULL),
    (r12, 'Churros (6 pcs)', 'Beignets cannelle, sauce chocolat', 8.00, 'Desserts', true, NULL);

  -- R13: Seoul Kitchen (Coréen)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r13, 'Bibimbap bœuf', 'Riz, bœuf bulgogi, légumes, œuf, sauce gochujang', 20.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=400'),
    (r13, 'Korean Fried Chicken', 'Poulet frit croustillant, sauce yangnyeom épicée', 18.00, 'Plats principaux', true, NULL),
    (r13, 'Kimchi Jjigae', 'Ragoût de kimchi, tofu, porc, riz', 17.00, 'Soupes', true, NULL),
    (r13, 'Japchae', 'Nouilles de patate douce sautées, légumes, sésame', 16.00, 'Plats principaux', true, NULL),
    (r13, 'Kimbap (8 pcs)', 'Rouleau de riz coréen, bœuf, légumes, œuf', 13.00, 'Entrées', true, NULL),
    (r13, 'Mandu (6 pcs)', 'Raviolis coréens grillés au porc et chou', 11.00, 'Entrées', true, NULL),
    (r13, 'Tteokbokki', 'Gâteaux de riz épicés à la sauce gochujang', 12.00, 'Entrées', true, NULL),
    (r13, 'Soju original', 'Alcool de riz coréen (360ml)', 9.00, 'Boissons', true, NULL);

  -- R14: Dar Marrakech (Marocain)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r14, 'Couscous royal', 'Semoule, agneau, poulet, merguez, légumes, bouillon', 26.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=400'),
    (r14, 'Tajine agneau pruneaux', 'Agneau mijoté, pruneaux, amandes, cannelle', 24.00, 'Tajines', true, NULL),
    (r14, 'Tajine poulet citron', 'Poulet fermier, citrons confits, olives vertes', 22.00, 'Tajines', true, NULL),
    (r14, 'Pastilla au poulet', 'Feuille de brick, poulet, amandes, cannelle, sucre glace', 18.00, 'Entrées', true, NULL),
    (r14, 'Briouates viande', '4 triangles croustillants farcis bœuf-oignon', 10.00, 'Entrées', true, NULL),
    (r14, 'Harira', 'Soupe traditionnelle aux lentilles, pois chiches et tomate', 9.00, 'Soupes', true, NULL),
    (r14, 'Cornes de gazelle', 'Pâte d''amande et fleur d''oranger (4 pièces)', 8.00, 'Desserts', true, NULL),
    (r14, 'Thé à la menthe', 'Thé vert gunpowder, menthe fraîche, sucré', 4.50, 'Boissons', true, NULL);

  -- R15: Le Petit Grec (Grec)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r15, 'Gyros poulet pita', 'Poulet grillé, tomate, oignon, tzatziki, frites, pain pita', 14.00, 'Sandwichs', true, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400'),
    (r15, 'Souvlaki mixte assiette', 'Brochettes poulet et porc, riz, salade grecque', 20.00, 'Plats principaux', true, NULL),
    (r15, 'Moussaka', 'Gratin d''aubergines, viande hachée, béchamel', 18.00, 'Plats principaux', true, NULL),
    (r15, 'Salade grecque', 'Tomate, concombre, feta, olives kalamata, origan', 13.00, 'Salades', true, NULL),
    (r15, 'Tzatziki', 'Yaourt grec, concombre, ail, aneth, pain pita', 8.00, 'Mezze', true, NULL),
    (r15, 'Spanakopita', 'Feuilleté épinards et feta croustillant', 10.00, 'Mezze', true, NULL),
    (r15, 'Loukoumades', 'Beignets grecs au miel et noix concassées', 8.50, 'Desserts', true, NULL),
    (r15, 'Frappé café', 'Café glacé grec fouetté', 5.50, 'Boissons', true, NULL);

END $$;

-- === 20260311153000_activate_all_admin_feature_flags.sql ===
-- Ensure all known admin-controlled feature flags exist and are active.

INSERT INTO public.feature_flags (name, label, description, is_active)
VALUES
  ('creneaux-garantis', 'Creneaux garantis', 'Livraison ponctuelle ou remboursee', true),
  ('flex-prix-bas', 'Offres', 'Fenetre flexible, prix reduit', true),
  ('match-groupes', 'Match groupes', 'Commandez ensemble, payez moins', true),
  ('multi-stop', 'Multi-stop', 'Un trajet, plusieurs adresses', true),
  ('multi-restaurant', 'Multi-restos', 'Plats de differents restos', true),
  ('chefs-table', 'Chef''s Table', 'Plats off-menu exclusifs', true),
  ('zero-attente', 'Zero attente', 'Precommande synchronisee', true),
  ('garantie-qualite', 'Garantie qualite', 'Chaud garanti ou rembourse', true),
  ('budget-auto', 'Budget auto', 'Menus optimises par objectifs', true),
  ('abonnement', 'Abonnement', 'Repas recurrents planifies', true)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = true;

-- === 20260311165000_add_formulas_availability.sql ===

-- Add availability and is_standard columns to meal_formulas
ALTER TABLE public.meal_formulas ADD COLUMN IF NOT EXISTS availability jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.meal_formulas ADD COLUMN IF NOT EXISTS is_standard boolean DEFAULT false;

-- Update existing formulas to have a default empty availability if needed
UPDATE public.meal_formulas SET availability = '{"days": [], "startTime": "00:00", "endTime": "23:59"}'::jsonb WHERE availability = '{}'::jsonb;

-- === 20260311171000_assign_restaurants_to_rbarman.sql ===
-- Assign restaurants to rbarman back-office account.
-- Business decision: in this environment, the current restaurant catalog is operated by a single demo restaurateur account
-- (rbarman@hotmail.ch) so that ownership-based back-office flows work immediately after deployment.
-- Scope chosen explicitly: only restaurants with owner_id IS NULL are assigned, to avoid overriding valid existing ownership.

DO $$
DECLARE
  v_rbarman_user_id uuid;
  v_rows_updated integer := 0;
BEGIN
  SELECT id
  INTO v_rbarman_user_id
  FROM auth.users
  WHERE email = 'rbarman@hotmail.ch'
  LIMIT 1;

  IF v_rbarman_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row found for rbarman@hotmail.ch; no restaurant ownership updated.';
    RETURN;
  END IF;

  UPDATE public.restaurants
  SET owner_id = v_rbarman_user_id
  WHERE owner_id IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RAISE NOTICE 'Assigned % restaurant(s) with NULL owner_id to rbarman@hotmail.ch (%).', v_rows_updated, v_rbarman_user_id;
END
$$;

-- Verification (run manually after migration):
-- SELECT COUNT(*) AS restaurants_assigned_to_rbarman
-- FROM public.restaurants r
-- JOIN auth.users u ON u.id = r.owner_id
-- WHERE u.email = 'rbarman@hotmail.ch';

-- === 20260311200000_add_stripe_connect.sql ===
-- Add Stripe Connect account ID to restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS stripe_account_id text;

-- Index for quick lookup during checkout
CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_account ON restaurants(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

COMMENT ON COLUMN restaurants.stripe_account_id IS 'Stripe Connected Account ID (acct_xxx) for payment routing via Stripe Connect';

-- === 20260311223000_admin_tools_functionality.sql ===
-- Harden admin tooling with explicit policies and helper RPCs.

-- Allow admins to moderate review visibility without deleting rows.
DROP POLICY IF EXISTS "Admins can update reviews" ON public.reviews;
CREATE POLICY "Admins can update reviews" ON public.reviews
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage review replies" ON public.review_replies;
CREATE POLICY "Admins can manage review replies" ON public.review_replies
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to inspect profile data from the client where needed.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all user_profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all user_profiles" ON public.user_profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin-facing user listing with aggregated roles and email access.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  city text,
  roles text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    au.id AS user_id,
    COALESCE(
      NULLIF(trim(COALESCE(p.full_name, '')), ''),
      NULLIF(trim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
      split_part(COALESCE(au.email, au.id::text), '@', 1)
    ) AS full_name,
    au.email::text AS email,
    COALESCE(p.city, NULL) AS city,
    COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.user_profiles up ON up.user_id = au.id
  LEFT JOIN LATERAL (
    SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
    FROM public.user_roles ur
    WHERE ur.user_id = au.id
  ) AS roles_map ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY COALESCE(
    NULLIF(trim(COALESCE(p.full_name, '')), ''),
    NULLIF(trim(COALESCE(up.first_name, '') || ' ' || COALESCE(up.last_name, '')), ''),
    COALESCE(au.email, au.id::text)
  );
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- Admin-facing role assignment preserving multi-role support.
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
  v_role public.app_role;
  v_roles public.app_role[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  v_roles := COALESCE(p_roles, ARRAY['client'::public.app_role]);
  IF array_length(v_roles, 1) IS NULL THEN
    v_roles := ARRAY['client'::public.app_role];
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  FOREACH v_role IN ARRAY v_roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated;

-- Queue notifications and deliveries for a campaign.
CREATE OR REPLACE FUNCTION public.admin_dispatch_notification_campaign(
  p_campaign_id uuid
)
RETURNS TABLE (
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_campaign public.notification_campaigns%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.notification_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.';
  END IF;

  WITH target_users AS (
    SELECT
      au.id AS user_id,
      au.email::text AS email,
      COALESCE(p.city, '') AS city,
      COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.user_id = au.id
    LEFT JOIN LATERAL (
      SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
      FROM public.user_roles ur
      WHERE ur.user_id = au.id
    ) AS roles_map ON true
    WHERE (
      COALESCE(array_length(v_campaign.target_roles, 1), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(roles_map.roles, ARRAY['client']::text[])) AS role_name
        WHERE role_name = ANY(v_campaign.target_roles)
      )
    )
    AND (
      COALESCE(array_length(v_campaign.target_cities, 1), 0) = 0
      OR COALESCE(p.city, '') = ANY(v_campaign.target_cities)
    )
  ),
  inserted_notifications AS (
    INSERT INTO public.notifications (user_id, title, body, type, category, data)
    SELECT
      tu.user_id,
      v_campaign.title,
      v_campaign.body,
      'campaign',
      v_campaign.category,
      jsonb_build_object('campaign_id', v_campaign.id, 'campaign_title', v_campaign.title)
    FROM target_users tu
    RETURNING id, user_id
  ),
  inserted_deliveries AS (
    INSERT INTO public.notification_deliveries (notification_id, channel, status, target, scheduled_at, sent_at)
    SELECT
      n.id,
      delivery.channel,
      delivery.status,
      delivery.target,
      CASE WHEN delivery.status = 'queued' THEN now() ELSE NULL END,
      CASE WHEN delivery.status = 'sent' THEN now() ELSE NULL END
    FROM inserted_notifications n
    JOIN auth.users au ON au.id = n.user_id
    CROSS JOIN LATERAL (
      SELECT 'in_app'::text AS channel, 'sent'::text AS status, NULL::text AS target
      WHERE COALESCE((v_campaign.channels ->> 'in_app')::boolean, true)
      UNION ALL
      SELECT 'email'::text AS channel, 'queued'::text AS status, au.email::text AS target
      WHERE COALESCE((v_campaign.channels ->> 'email')::boolean, true)
        AND au.email IS NOT NULL
      UNION ALL
      SELECT 'push'::text AS channel, 'queued'::text AS status, NULL::text AS target
      WHERE COALESCE((v_campaign.channels ->> 'push')::boolean, true)
    ) AS delivery
    RETURNING channel, status
  )
  UPDATE public.notification_campaigns
  SET status = 'sent', sent_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY
  SELECT *
  FROM public.get_campaign_stats(ARRAY[p_campaign_id]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dispatch_notification_campaign(uuid) TO authenticated;

-- Replace placeholder notification stats with actual aggregates.
CREATE OR REPLACE FUNCTION public.get_campaign_stats(campaign_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  campaign_id uuid,
  recipients integer,
  notifications_count integer,
  read_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH campaign_scope AS (
    SELECT nc.id
    FROM public.notification_campaigns nc
    WHERE campaign_ids IS NULL OR nc.id = ANY(campaign_ids)
  ),
  campaign_notifications AS (
    SELECT
      n.id,
      n.user_id,
      n.read_at,
      (n.data ->> 'campaign_id')::uuid AS campaign_id
    FROM public.notifications n
    WHERE (n.data ->> 'campaign_id') IS NOT NULL
  ),
  scoped_notifications AS (
    SELECT cn.*
    FROM campaign_notifications cn
    JOIN campaign_scope cs ON cs.id = cn.campaign_id
  ),
  scoped_deliveries AS (
    SELECT
      d.notification_id,
      d.channel,
      d.status,
      sn.campaign_id
    FROM public.notification_deliveries d
    JOIN scoped_notifications sn ON sn.id = d.notification_id
  )
  SELECT
    cs.id AS campaign_id,
    COUNT(DISTINCT sn.user_id)::integer AS recipients,
    COUNT(DISTINCT sn.id)::integer AS notifications_count,
    COUNT(DISTINCT CASE WHEN sn.read_at IS NOT NULL THEN sn.id END)::integer AS read_count,
    COUNT(sd.notification_id)::integer AS deliveries_total,
    COUNT(CASE WHEN sd.status = 'queued' THEN 1 END)::integer AS deliveries_queued,
    COUNT(CASE WHEN sd.status = 'sent' THEN 1 END)::integer AS deliveries_sent,
    COUNT(CASE WHEN sd.status = 'failed' THEN 1 END)::integer AS deliveries_failed,
    COUNT(CASE WHEN sd.channel = 'in_app' THEN 1 END)::integer AS in_app_total,
    COUNT(CASE WHEN sd.channel = 'email' THEN 1 END)::integer AS email_total,
    COUNT(CASE WHEN sd.channel = 'push' THEN 1 END)::integer AS push_total
  FROM campaign_scope cs
  LEFT JOIN scoped_notifications sn ON sn.campaign_id = cs.id
  LEFT JOIN scoped_deliveries sd ON sd.campaign_id = cs.id
  GROUP BY cs.id
  ORDER BY cs.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_stats(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- === 20260311234500_split_service_settings_for_reservations.sql ===
CREATE OR REPLACE FUNCTION public.validate_and_create_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing integer;
  v_max_covers integer;
  v_opening_hours jsonb;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_dup_count integer;
  v_reservation_id uuid;
  v_online_booking_enabled boolean;
  v_service_closed boolean;
  v_min_party_size integer;
  v_max_party_size integer;
  v_last_reservation_time time;
BEGIN
  SELECT count(*) INTO v_dup_count
  FROM reservations
  WHERE user_id = auth.uid()
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show');

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN
    v_service_key := 'lunch';
  ELSE
    v_service_key := 'dinner';
  END IF;

  SELECT opening_hours INTO v_opening_hours
  FROM restaurants
  WHERE id = p_restaurant_id;

  v_service_settings := COALESCE(
    v_opening_hours -> 'service_settings' -> v_service_key,
    v_opening_hours -> v_service_key,
    '{}'::jsonb
  );

  v_online_booking_enabled := COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true);
  v_service_closed := COALESCE((v_service_settings ->> 'service_closed')::boolean, false);
  v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
  v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
  v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
  v_last_reservation_time := COALESCE((v_service_settings ->> 'last_reservation_time')::time, p_time);

  IF NOT v_online_booking_enabled OR v_service_closed THEN
    RAISE EXCEPTION 'Les reservations sont fermees pour ce service.';
  END IF;

  IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN
    RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size;
  END IF;

  IF p_time > v_last_reservation_time THEN
    RAISE EXCEPTION 'La derniere reservation pour ce service est a %.', to_char(v_last_reservation_time, 'HH24:MI');
  END IF;

  SELECT COALESCE(sum(party_size), 0) INTO v_existing
  FROM reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'no_show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15
      ELSE EXTRACT(HOUR FROM time) >= 15
    END;

  IF v_existing + p_party_size > v_max_covers THEN
    RAISE EXCEPTION 'Capacite depassee pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing, 0);
  END IF;

  INSERT INTO reservations (user_id, restaurant_id, date, time, party_size, feature, metadata, notes)
  VALUES (auth.uid(), p_restaurant_id, p_date, p_time, p_party_size, p_feature, p_metadata, p_notes)
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

-- === 20260312000500_enable_public_restaurant_promotions.sql ===
DROP POLICY IF EXISTS "Anyone can view active promotions" ON public.restaurant_promotions;
CREATE POLICY "Anyone can view active promotions" ON public.restaurant_promotions
FOR SELECT
USING (active = true);

-- === 20260312003000_seed_restaurant_categories.sql ===
ALTER TABLE public.cuisines
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

CREATE UNIQUE INDEX IF NOT EXISTS cuisines_slug_unique_idx
  ON public.cuisines (slug)
  WHERE slug IS NOT NULL;

INSERT INTO public.cuisines (name, slug, keywords)
VALUES
  ('Italien', 'italien', ARRAY['pizza', 'pates', 'lasagne', 'risotto', 'trattoria']),
  ('Pizza', 'pizza', ARRAY['pizzeria', 'margherita', 'napolitaine', 'calzone']),
  ('Pates', 'pates', ARRAY['spaghetti', 'penne', 'tagliatelle', 'gnocchi']),
  ('Burger', 'burger', ARRAY['hamburger', 'smash burger', 'cheeseburger', 'frites']),
  ('Grillades', 'grillades', ARRAY['steak', 'barbecue', 'viande', 'bbq', 'cote de boeuf']),
  ('Francais', 'francais', ARRAY['brasserie', 'bistrot', 'traditionnel', 'terroir']),
  ('Suisse', 'suisse', ARRAY['fondue', 'raclette', 'rosti', 'brasserie suisse']),
  ('Japonais', 'japonais', ARRAY['sushi', 'ramen', 'yakitori', 'izakaya']),
  ('Sushi', 'sushi', ARRAY['maki', 'nigiri', 'sashimi', 'chirashi']),
  ('Ramen', 'ramen', ARRAY['udon', 'bouillon', 'nouilles japonaises']),
  ('Chinois', 'chinois', ARRAY['dim sum', 'wok', 'canard laque', 'nouilles']),
  ('Thai', 'thai', ARRAY['pad thai', 'curry thai', 'tom yum', 'thai street food']),
  ('Indien', 'indien', ARRAY['curry', 'tandoori', 'naan', 'biryani']),
  ('Pakistanais', 'pakistanais', ARRAY['karahi', 'biryani', 'grill pakistanais']),
  ('Libanais', 'libanais', ARRAY['mezze', 'shawarma', 'falafel', 'manouche']),
  ('Turc', 'turc', ARRAY['kebab', 'doner', 'lahmacun', 'grill turc']),
  ('Kebab', 'kebab', ARRAY['doner', 'durum', 'galette', 'sandwich kebab']),
  ('Tacos', 'tacos', ARRAY['tacos gratine', 'french tacos', 'double viande']),
  ('Mexicain', 'mexicain', ARRAY['burrito', 'quesadilla', 'nachos', 'guacamole']),
  ('Mediterraneen', 'mediterraneen', ARRAY['mezze', 'grillades', 'huile d olive', 'soleil']),
  ('Marocain', 'marocain', ARRAY['couscous', 'tajine', 'pastilla', 'maroc']),
  ('Africain', 'africain', ARRAY['maf', 'yassa', 'alloco', 'thieb']),
  ('Creole', 'creole', ARRAY['accras', 'colombo', 'bokit', 'antillais']),
  ('Americain', 'americain', ARRAY['fried chicken', 'bbq', 'ribs', 'diner']),
  ('Halal', 'halal', ARRAY['halal food', 'viande halal', 'grill halal']),
  ('Vegetarien', 'vegetarien', ARRAY['veggie', 'sans viande', 'vegetal']),
  ('Vegan', 'vegan', ARRAY['plant based', '100 vegetal', 'sans produit animal']),
  ('Healthy', 'healthy', ARRAY['equilibre', 'fit', 'light', 'bien etre']),
  ('Salades', 'salades', ARRAY['bowl', 'fraicheur', 'caesar', 'crudites']),
  ('Poke', 'poke', ARRAY['poke bowl', 'saumon', 'avocat', 'hawaiien']),
  ('Brunch', 'brunch', ARRAY['petit dejeuner', 'oeufs benedict', 'pancakes']),
  ('Petit-dejeuner', 'petit-dejeuner', ARRAY['cafe', 'croissant', 'tartine', 'matin']),
  ('Boulangerie', 'boulangerie', ARRAY['pain', 'viennoiserie', 'sandwich', 'artisan']),
  ('Patisserie', 'patisserie', ARRAY['gateau', 'dessert', 'tarte', 'eclair']),
  ('Desserts', 'desserts', ARRAY['glace', 'crepe', 'gaufre', 'sucre']),
  ('Cafe', 'cafe', ARRAY['coffee shop', 'espresso', 'latte', 'cappuccino']),
  ('Sandwich', 'sandwich', ARRAY['panini', 'club sandwich', 'bagel', 'wrap']),
  ('Street Food', 'street-food', ARRAY['snacking', 'street', 'finger food', 'sur le pouce'])
ON CONFLICT (name) DO UPDATE
SET
  slug = EXCLUDED.slug,
  keywords = EXCLUDED.keywords;

INSERT INTO public.restaurant_cuisines (restaurant_id, cuisine_id)
SELECT DISTINCT r.id, c.id
FROM public.restaurants r
JOIN public.cuisines c
  ON lower(coalesce(r.cuisine_type, '')) LIKE '%' || lower(c.name) || '%'
  OR EXISTS (
    SELECT 1
    FROM unnest(coalesce(c.keywords, '{}'::text[])) AS keyword
    WHERE lower(coalesce(r.cuisine_type, '')) LIKE '%' || lower(keyword) || '%'
  )
ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING;

-- === 20260312113000_ad_campaign_payments.sql ===
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_campaigns_payment_status_check'
  ) THEN
    ALTER TABLE public.ad_campaigns
      ADD CONSTRAINT ad_campaigns_payment_status_check
      CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'cancelled'));
  END IF;
END $$;

UPDATE public.ad_campaigns
SET
  payment_status = CASE
    WHEN COALESCE(total_budget, 0) <= 0 THEN 'unpaid'
    WHEN status = 'active' THEN 'paid'
    ELSE COALESCE(payment_status, 'unpaid')
  END,
  paid_amount = CASE
    WHEN status = 'active' AND COALESCE(paid_amount, 0) = 0 THEN COALESCE(total_budget, 0)
    ELSE COALESCE(paid_amount, 0)
  END,
  activated_at = CASE
    WHEN status = 'active' AND activated_at IS NULL THEN now()
    ELSE activated_at
  END
WHERE true;

-- === 20260312143000_secure_order_rpc_and_sponsored_tracking.sql ===
-- Harden order creation totals and move sponsored campaign metrics to
-- an append-only server-controlled event flow.

CREATE TABLE IF NOT EXISTS public.ad_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'conversion')),
  conversion_type text CHECK (conversion_type IS NULL OR conversion_type IN ('order', 'reservation', 'zero-attente')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL,
  source text,
  page text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, event_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_events_restaurant_type_time
  ON public.ad_campaign_events(restaurant_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_events_campaign_type_time
  ON public.ad_campaign_events(campaign_id, event_type, occurred_at DESC);

ALTER TABLE public.ad_campaign_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_campaign_events_owner_select" ON public.ad_campaign_events;
CREATE POLICY "ad_campaign_events_owner_select"
  ON public.ad_campaign_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaign_events.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

GRANT SELECT ON public.ad_campaign_events TO authenticated;

CREATE OR REPLACE FUNCTION public.record_ad_campaign_event(
  p_campaign_id uuid,
  p_restaurant_id uuid,
  p_event_type text,
  p_dedupe_key text,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_page text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_conversion_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rows integer := 0;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NOT NULL AND p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
  END IF;

  INSERT INTO public.ad_campaign_events (
    campaign_id,
    restaurant_id,
    event_type,
    conversion_type,
    user_id,
    dedupe_key,
    source,
    page,
    payload
  )
  VALUES (
    p_campaign_id,
    p_restaurant_id,
    p_event_type,
    p_conversion_type,
    p_user_id,
    p_dedupe_key,
    p_source,
    p_page,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ad_campaign_metric(uuid, text) FROM service_role;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  restaurant_id_param uuid,
  delivery_address_param text,
  total_amount_param numeric,
  delivery_fee_param numeric DEFAULT 0,
  notes_param text DEFAULT NULL::text,
  items_param json DEFAULT NULL::json,
  metadata_param json DEFAULT NULL::json,
  checkout_id_param uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_order_id uuid;
  item jsonb;
  v_real_price numeric;
  v_is_available boolean;
  v_verified_total numeric := 0;
  v_idempotency text;
  v_menu_item_id uuid;
  v_quantity integer;
  v_delivery_fee numeric := GREATEST(COALESCE(delivery_fee_param, 0), 0);
  v_quality_fee numeric := 0;
  v_original_total numeric := 0;
  v_metadata jsonb := COALESCE(metadata_param::jsonb, '{}'::jsonb);
  v_validated_items jsonb := '[]'::jsonb;
  v_item_metadata jsonb;
  v_original_item_id text;
  v_has_quality_fee boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_idempotency := COALESCE(checkout_id_param::text, gen_random_uuid()::text);

  SELECT id INTO new_order_id FROM orders WHERE idempotency_key = v_idempotency;
  IF FOUND THEN
    RETURN new_order_id;
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(items_param::jsonb, '[]'::jsonb))
  LOOP
    v_quantity := GREATEST(COALESCE((item->>'quantity')::integer, 1), 1);
    v_item_metadata := COALESCE(item->'metadata', '{}'::jsonb);
    v_original_item_id := COALESCE(item->>'menu_item_id', '');

    IF v_original_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := v_original_item_id::uuid;

      SELECT price, is_available
      INTO v_real_price, v_is_available
      FROM public.menu_items
      WHERE id = v_menu_item_id
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Article introuvable : %', v_original_item_id;
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Article indisponible : %', v_original_item_id;
      END IF;
    ELSIF COALESCE(v_item_metadata->>'anti_waste_offer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;

      SELECT discounted_price, is_active
      INTO v_real_price, v_is_available
      FROM public.anti_waste_offers
      WHERE id = (v_item_metadata->>'anti_waste_offer_id')::uuid
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Offre anti-gaspi introuvable : %', v_item_metadata->>'anti_waste_offer_id';
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Offre anti-gaspi indisponible : %', v_item_metadata->>'anti_waste_offer_id';
      END IF;
    ELSIF COALESCE(v_item_metadata->>'flash_sale_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;

      SELECT discounted_price, is_active
      INTO v_real_price, v_is_available
      FROM public.flash_sales
      WHERE id = (v_item_metadata->>'flash_sale_id')::uuid
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Vente flash introuvable : %', v_item_metadata->>'flash_sale_id';
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Vente flash indisponible : %', v_item_metadata->>'flash_sale_id';
      END IF;
    ELSIF v_original_item_id = 'garantie-qualite-fee' THEN
      v_has_quality_fee := true;
      CONTINUE;
    ELSE
      RAISE EXCEPTION 'Article invalide detecte : %', v_original_item_id;
    END IF;

    v_real_price := ROUND(COALESCE(v_real_price, 0)::numeric, 2);
    v_verified_total := v_verified_total + (v_real_price * v_quantity);
    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_menu_item_id,
        'restaurant_id', restaurant_id_param,
        'quantity', v_quantity,
        'unit_price', v_real_price,
        'total_price', ROUND((v_real_price * v_quantity)::numeric, 2),
        'metadata', v_item_metadata || jsonb_build_object('original_item_id', v_original_item_id)
      )
    );
  END LOOP;

  IF v_has_quality_fee OR lower(COALESCE(v_metadata->>'quality_guarantee', 'false')) IN ('true', '1', 'yes') THEN
    v_quality_fee := 1.50;
  END IF;

  v_original_total := ROUND((v_verified_total + v_delivery_fee + v_quality_fee)::numeric, 2);

  INSERT INTO public.orders (
    user_id,
    restaurant_id,
    delivery_address,
    total_amount,
    delivery_fee,
    notes,
    metadata,
    checkout_id,
    idempotency_key,
    original_total,
    discount_amount
  )
  VALUES (
    auth.uid(),
    restaurant_id_param,
    delivery_address_param,
    v_original_total,
    v_delivery_fee,
    notes_param,
    v_metadata,
    checkout_id_param,
    v_idempotency,
    v_original_total,
    0
  )
  RETURNING id INTO new_order_id;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      restaurant_id,
      quantity,
      unit_price,
      total_price,
      metadata
    )
    VALUES (
      new_order_id,
      NULLIF(item->>'menu_item_id', '')::uuid,
      (item->>'restaurant_id')::uuid,
      COALESCE((item->>'quantity')::integer, 1),
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'total_price')::numeric, 0),
      COALESCE(item->'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN new_order_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- === 20260312160000_search_audience_and_edge_audit.sql ===
CREATE OR REPLACE FUNCTION public.normalize_search_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT trim(
    regexp_replace(
      translate(
        lower(COALESCE(p_text, '')),
        'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      '[^a-z0-9\s-]+',
      ' ',
      'g'
    )
  );
$function$;

CREATE TABLE IF NOT EXISTS public.edge_function_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  action text NOT NULL DEFAULT 'invoke',
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_roles text[] NOT NULL DEFAULT '{}'::text[],
  is_service_role boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('success', 'failure')),
  target_entity_type text,
  target_entity_id text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_function_created
  ON public.edge_function_audit_logs(function_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_edge_function_audit_logs_actor_created
  ON public.edge_function_audit_logs(actor_user_id, created_at DESC);

ALTER TABLE public.edge_function_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edge_function_audit_logs_admin_select" ON public.edge_function_audit_logs;
CREATE POLICY "edge_function_audit_logs_admin_select"
  ON public.edge_function_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.edge_function_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.search_restaurants_catalog(
  p_query text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_cuisine text DEFAULT NULL,
  p_price_range integer DEFAULT NULL,
  p_delivery_only boolean DEFAULT false,
  p_min_rating numeric DEFAULT 0,
  p_sort_by text DEFAULT 'pertinence',
  p_sort_direction text DEFAULT NULL,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  cuisine_type text,
  rating numeric,
  review_count integer,
  price_range integer,
  delivery_fee numeric,
  image_url text,
  address text,
  city text,
  delivery_available boolean,
  created_at timestamptz,
  category_names text[],
  category_slugs text[],
  matched_via_menu boolean,
  monthly_reservations integer,
  monthly_orders integer,
  promotion_score numeric,
  relevance_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_query text := public.normalize_search_text(p_query);
  v_city text := public.normalize_search_text(p_city);
  v_cuisine text := public.normalize_search_text(p_cuisine);
  v_sort_by text := CASE
    WHEN public.normalize_search_text(p_sort_by) IN (
      'pertinence', 'note', 'promotion', 'prix',
      'popularite', 'nouveaux', 'mieux_notes_mois', 'plus_reserves_mois'
    ) THEN public.normalize_search_text(p_sort_by)
    ELSE 'pertinence'
  END;
  v_sort_direction text := CASE
    WHEN lower(COALESCE(p_sort_direction, '')) IN ('asc', 'desc') THEN lower(p_sort_direction)
    WHEN public.normalize_search_text(p_sort_by) = 'prix' THEN 'asc'
    ELSE 'desc'
  END;
BEGIN
  RETURN QUERY
  WITH restaurant_categories AS (
    SELECT
      rc.restaurant_id,
      array_remove(array_agg(DISTINCT c.name), NULL) AS category_names,
      array_remove(array_agg(DISTINCT COALESCE(c.slug, public.normalize_search_text(c.name))), NULL) AS category_slugs,
      public.normalize_search_text(
        COALESCE(string_agg(DISTINCT c.name, ' '), '') || ' ' ||
        COALESCE(string_agg(DISTINCT c.slug, ' '), '') || ' ' ||
        COALESCE(string_agg(DISTINCT array_to_string(c.keywords, ' '), ' '), '')
      ) AS category_blob
    FROM public.restaurant_cuisines rc
    JOIN public.cuisines c ON c.id = rc.cuisine_id
    GROUP BY rc.restaurant_id
  ),
  monthly_reservation_counts AS (
    SELECT
      r.restaurant_id,
      COUNT(*)::integer AS monthly_reservations
    FROM public.reservations r
    WHERE r.date >= date_trunc('month', now())::date
      AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'refused')
    GROUP BY r.restaurant_id
  ),
  monthly_order_counts AS (
    SELECT
      o.restaurant_id,
      COUNT(*)::integer AS monthly_orders
    FROM public.orders o
    WHERE o.created_at >= date_trunc('month', now())
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    GROUP BY o.restaurant_id
  ),
  anti_waste_scores AS (
    SELECT
      awo.restaurant_id,
      MAX(
        CASE
          WHEN COALESCE(awo.original_price, 0) > 0
            THEN ROUND((((awo.original_price - COALESCE(awo.discounted_price, 0)) / awo.original_price) * 100)::numeric, 2)
          ELSE 0
        END
      ) AS score
    FROM public.anti_waste_offers awo
    WHERE awo.is_active = true
      AND awo.available_date >= current_date
    GROUP BY awo.restaurant_id
  ),
  formula_scores AS (
    SELECT
      mf.restaurant_id,
      MAX(COALESCE(mf.discount_percent, 0)::numeric) AS score
    FROM public.meal_formulas mf
    WHERE mf.is_active = true
    GROUP BY mf.restaurant_id
  ),
  promotion_scores AS (
    SELECT
      scores.restaurant_id,
      MAX(scores.score) AS promotion_score
    FROM (
      SELECT * FROM anti_waste_scores
      UNION ALL
      SELECT * FROM formula_scores
    ) scores
    GROUP BY scores.restaurant_id
  ),
  menu_matches AS (
    SELECT
      mi.restaurant_id,
      true AS matched_via_menu
    FROM public.menu_items mi
    WHERE mi.is_available = true
      AND v_query <> ''
      AND (
        public.normalize_search_text(mi.name) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(mi.description) LIKE '%' || v_query || '%'
        OR public.normalize_search_text(mi.category) LIKE '%' || v_query || '%'
      )
    GROUP BY mi.restaurant_id
  ),
  base AS (
    SELECT
      r.id,
      r.name,
      r.description,
      r.cuisine_type,
      COALESCE(r.rating, 0) AS rating,
      COALESCE(r.review_count, 0) AS review_count,
      COALESCE(r.price_range, 2) AS price_range,
      COALESCE(r.delivery_fee, 0) AS delivery_fee,
      r.image_url,
      r.address,
      r.city,
      COALESCE(r.delivery_available, false) AS delivery_available,
      r.created_at,
      COALESCE(rc.category_names, ARRAY[]::text[]) AS category_names,
      COALESCE(rc.category_slugs, ARRAY[]::text[]) AS category_slugs,
      COALESCE(mm.matched_via_menu, false) AS matched_via_menu,
      COALESCE(mrc.monthly_reservations, 0) AS monthly_reservations,
      COALESCE(moc.monthly_orders, 0) AS monthly_orders,
      COALESCE(ps.promotion_score, 0) AS promotion_score,
      public.normalize_search_text(r.name) AS normalized_name,
      public.normalize_search_text(r.description) AS normalized_description,
      public.normalize_search_text(r.cuisine_type) AS normalized_cuisine,
      public.normalize_search_text(r.city) AS normalized_city,
      COALESCE(rc.category_blob, '') AS category_blob
    FROM public.restaurants r
    LEFT JOIN restaurant_categories rc ON rc.restaurant_id = r.id
    LEFT JOIN monthly_reservation_counts mrc ON mrc.restaurant_id = r.id
    LEFT JOIN monthly_order_counts moc ON moc.restaurant_id = r.id
    LEFT JOIN promotion_scores ps ON ps.restaurant_id = r.id
    LEFT JOIN menu_matches mm ON mm.restaurant_id = r.id
    WHERE r.is_active = true
      AND (v_city = '' OR public.normalize_search_text(r.city) LIKE '%' || v_city || '%')
      AND (COALESCE(p_price_range, 0) <= 0 OR r.price_range = p_price_range)
      AND (COALESCE(p_delivery_only, false) = false OR COALESCE(r.delivery_available, false) = true)
      AND COALESCE(r.rating, 0) >= GREATEST(COALESCE(p_min_rating, 0), 0)
  ),
  filtered AS (
    SELECT
      base.*,
      (
        CASE
          WHEN v_query = '' THEN 0
          WHEN base.normalized_name = v_query THEN 220
          WHEN base.normalized_name LIKE v_query || '%' THEN 170
          WHEN base.normalized_name LIKE '%' || v_query || '%' THEN 120
          ELSE 0
        END
        + CASE WHEN v_query <> '' AND base.normalized_cuisine LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.category_blob LIKE '%' || v_query || '%' THEN 80 ELSE 0 END
        + CASE WHEN v_query <> '' AND base.normalized_city LIKE '%' || v_query || '%' THEN 40 ELSE 0 END
        + CASE WHEN base.matched_via_menu THEN 60 ELSE 0 END
        + CASE WHEN v_query = '' THEN (base.rating * 18) + (base.review_count * 0.9) ELSE 0 END
        + (base.monthly_reservations * 4)
        + (base.monthly_orders * 3)
        + (base.promotion_score * 1.4)
        + CASE WHEN base.delivery_available THEN 6 ELSE 0 END
      )::numeric AS relevance_score,
      (
        base.review_count
        + (base.monthly_reservations * 4)
        + (base.monthly_orders * 3)
      )::numeric AS popularity_score
    FROM base
    WHERE (v_cuisine = '' OR base.normalized_cuisine LIKE '%' || v_cuisine || '%' OR base.category_blob LIKE '%' || v_cuisine || '%')
      AND (
        v_query = ''
        OR base.normalized_name LIKE '%' || v_query || '%'
        OR base.normalized_description LIKE '%' || v_query || '%'
        OR base.normalized_cuisine LIKE '%' || v_query || '%'
        OR base.category_blob LIKE '%' || v_query || '%'
        OR base.matched_via_menu
      )
  )
  SELECT
    filtered.id,
    filtered.name,
    filtered.description,
    filtered.cuisine_type,
    filtered.rating,
    filtered.review_count,
    filtered.price_range,
    filtered.delivery_fee,
    filtered.image_url,
    filtered.address,
    filtered.city,
    filtered.delivery_available,
    filtered.created_at,
    filtered.category_names,
    filtered.category_slugs,
    filtered.matched_via_menu,
    filtered.monthly_reservations,
    filtered.monthly_orders,
    filtered.promotion_score,
    filtered.relevance_score
  FROM filtered
  ORDER BY
    CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
    CASE WHEN v_sort_by = 'note' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,

    CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'desc' THEN filtered.promotion_score END DESC,
    CASE WHEN v_sort_by = 'promotion' AND v_sort_direction = 'asc' THEN filtered.promotion_score END ASC,

    CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'asc' THEN filtered.price_range END ASC,
    CASE WHEN v_sort_by = 'prix' AND v_sort_direction = 'desc' THEN filtered.price_range END DESC,

    CASE WHEN v_sort_by = 'popularite' AND v_sort_direction = 'desc' THEN filtered.popularity_score END DESC,
    CASE WHEN v_sort_by = 'popularite' AND v_sort_direction = 'asc' THEN filtered.popularity_score END ASC,

    CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'desc' THEN filtered.created_at END DESC,
    CASE WHEN v_sort_by = 'nouveaux' AND v_sort_direction = 'asc' THEN filtered.created_at END ASC,

    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN CASE WHEN filtered.monthly_reservations > 0 THEN 1 ELSE 0 END END DESC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN CASE WHEN filtered.monthly_reservations > 0 THEN 1 ELSE 0 END END ASC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN filtered.rating END DESC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN filtered.rating END ASC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'desc' THEN filtered.monthly_reservations END DESC,
    CASE WHEN v_sort_by = 'mieux_notes_mois' AND v_sort_direction = 'asc' THEN filtered.monthly_reservations END ASC,

    CASE WHEN v_sort_by = 'plus_reserves_mois' AND v_sort_direction = 'desc' THEN filtered.monthly_reservations END DESC,
    CASE WHEN v_sort_by = 'plus_reserves_mois' AND v_sort_direction = 'asc' THEN filtered.monthly_reservations END ASC,

    CASE WHEN v_sort_by = 'pertinence' AND v_sort_direction = 'desc' THEN filtered.relevance_score END DESC,
    CASE WHEN v_sort_by = 'pertinence' AND v_sort_direction = 'asc' THEN filtered.relevance_score END ASC,

    filtered.rating DESC,
    filtered.review_count DESC,
    filtered.name ASC
  LIMIT GREATEST(COALESCE(p_limit, 60), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog(text, text, text, integer, boolean, numeric, text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_restaurants_catalog(text, text, text, integer, boolean, numeric, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.estimate_campaign_audience(
  p_restaurant_id uuid,
  p_criteria jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_owner boolean := false;
  v_result integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT public.has_role(v_actor_id, 'admin') INTO v_is_admin;
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = v_actor_id
  ) INTO v_is_owner;

  IF NOT v_is_admin AND NOT v_is_owner THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH criteria AS (
    SELECT
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'cities', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS cities,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'cuisines', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS cuisines,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'journeyTypes', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS journey_types,
      COALESCE((
        SELECT array_agg(public.normalize_search_text(value))
        FROM jsonb_array_elements_text(COALESCE(p_criteria->'serviceMoments', '[]'::jsonb)) value
      ), ARRAY[]::text[]) AS service_moments,
      GREATEST(COALESCE((p_criteria->>'minOrders')::integer, 0), 0) AS min_orders,
      GREATEST(COALESCE((p_criteria->>'maxDaysSinceOrder')::integer, 365), 1) AS max_days_since_order,
      GREATEST(COALESCE((p_criteria->>'minAvgBasket')::numeric, 0), 0) AS min_avg_basket,
      COALESCE((p_criteria->>'favoritesOnly')::boolean, false) AS favorites_only,
      CASE
        WHEN public.normalize_search_text(p_criteria->>'customerSegment') IN ('new', 'returning', 'loyal', 'inactive')
          THEN public.normalize_search_text(p_criteria->>'customerSegment')
        ELSE 'all'
      END AS customer_segment
  ),
  valid_orders AS (
    SELECT
      o.user_id,
      o.restaurant_id,
      o.total_amount,
      o.created_at,
      CASE
        WHEN COALESCE(trim(o.delivery_address), '') <> '' THEN 'delivery'
        ELSE 'takeaway'
      END AS journey_type
    FROM public.orders o
    WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
  ),
  valid_reservations AS (
    SELECT
      r.user_id,
      r.restaurant_id,
      COALESCE(
        (((r.date)::timestamp + COALESCE(r.time::time, time '12:00')) AT TIME ZONE 'UTC'),
        r.created_at
      ) AS activity_at,
      CASE
        WHEN public.normalize_search_text(COALESCE(r.feature, r.metadata->>'feature')) IN ('zero attente', 'zero_attente', 'zero-attente')
          THEN 'zero_attente'
        ELSE 'reservation'
      END AS journey_type,
      CASE
        WHEN public.normalize_search_text(r.metadata->>'service') IN ('lunch', 'midi') THEN 'lunch'
        WHEN public.normalize_search_text(r.metadata->>'service') IN ('dinner', 'soir') THEN 'dinner'
        WHEN COALESCE(NULLIF(split_part(COALESCE(r.time, '12:00'), ':', 1), ''), '12')::integer < 15 THEN 'lunch'
        ELSE 'dinner'
      END AS service_moment
    FROM public.reservations r
    WHERE lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'refused')
  ),
  favorite_stats AS (
    SELECT
      f.user_id,
      array_remove(array_agg(DISTINCT f.restaurant_id::text), NULL) AS favorite_restaurant_ids
    FROM public.favorites f
    GROUP BY f.user_id
  ),
  order_stats AS (
    SELECT
      vo.user_id,
      COUNT(*)::integer AS order_count,
      AVG(COALESCE(vo.total_amount, 0))::numeric AS avg_basket,
      MAX(vo.created_at) AS last_order_at,
      BOOL_OR(EXTRACT(DOW FROM vo.created_at) IN (0, 6)) AS weekend_order,
      array_remove(array_agg(DISTINCT vo.journey_type), NULL) AS journey_types
    FROM valid_orders vo
    GROUP BY vo.user_id
  ),
  reservation_stats AS (
    SELECT
      vr.user_id,
      COUNT(*)::integer AS reservation_count,
      MAX(vr.activity_at) AS last_reservation_at,
      BOOL_OR(EXTRACT(DOW FROM vr.activity_at) IN (0, 6)) AS weekend_reservation,
      BOOL_OR(vr.service_moment = 'lunch') AS lunch_reservation,
      BOOL_OR(vr.service_moment = 'dinner') AS dinner_reservation,
      array_remove(array_agg(DISTINCT vr.journey_type), NULL) AS journey_types
    FROM valid_reservations vr
    GROUP BY vr.user_id
  ),
  interacted_restaurants AS (
    SELECT vo.user_id, vo.restaurant_id FROM valid_orders vo
    UNION
    SELECT vr.user_id, vr.restaurant_id FROM valid_reservations vr
    UNION
    SELECT f.user_id, f.restaurant_id FROM public.favorites f
  ),
  cuisine_signals AS (
    SELECT
      ir.user_id,
      array_remove(array_agg(DISTINCT signal.token), NULL) AS cuisine_tokens
    FROM interacted_restaurants ir
    JOIN public.restaurants r ON r.id = ir.restaurant_id
    LEFT JOIN public.restaurant_cuisines rc ON rc.restaurant_id = ir.restaurant_id
    LEFT JOIN public.cuisines c ON c.id = rc.cuisine_id
    LEFT JOIN LATERAL (
      SELECT public.normalize_search_text(token_value) AS token
      FROM unnest(ARRAY[
        c.name,
        c.slug,
        r.cuisine_type
      ]::text[]) AS token_values(token_value)
      UNION ALL
      SELECT public.normalize_search_text(keyword_value)
      FROM unnest(COALESCE(c.keywords, ARRAY[]::text[])) AS keyword_values(keyword_value)
    ) signal ON true
    GROUP BY ir.user_id
  ),
  snapshots AS (
    SELECT
      p.user_id,
      public.normalize_search_text(p.city) AS city,
      COALESCE(fs.favorite_restaurant_ids, ARRAY[]::text[]) AS favorite_restaurant_ids,
      (COALESCE(os.order_count, 0) + COALESCE(rs.reservation_count, 0))::integer AS interaction_count,
      COALESCE(os.avg_basket, 0)::numeric AS avg_basket,
      CASE
        WHEN GREATEST(
          COALESCE(os.last_order_at, 'epoch'::timestamptz),
          COALESCE(rs.last_reservation_at, 'epoch'::timestamptz)
        ) = 'epoch'::timestamptz THEN NULL
        ELSE FLOOR(
          EXTRACT(
            EPOCH FROM (
              now() - GREATEST(
                COALESCE(os.last_order_at, 'epoch'::timestamptz),
                COALESCE(rs.last_reservation_at, 'epoch'::timestamptz)
              )
            )
          ) / 86400
        )::integer
      END AS days_since_last_activity,
      COALESCE(cs.cuisine_tokens, ARRAY[]::text[]) AS cuisine_tokens,
      array_remove(ARRAY(
        SELECT DISTINCT journey_type
        FROM unnest(COALESCE(os.journey_types, ARRAY[]::text[]) || COALESCE(rs.journey_types, ARRAY[]::text[])) AS journey_values(journey_type)
      ), NULL) AS journey_types,
      array_remove(ARRAY[
        CASE WHEN COALESCE(rs.lunch_reservation, false) THEN 'lunch' ELSE NULL END,
        CASE WHEN COALESCE(rs.dinner_reservation, false) THEN 'dinner' ELSE NULL END,
        CASE WHEN COALESCE(os.weekend_order, false) OR COALESCE(rs.weekend_reservation, false) THEN 'weekend' ELSE NULL END
      ], NULL) AS service_moments
    FROM public.profiles p
    LEFT JOIN favorite_stats fs ON fs.user_id = p.user_id
    LEFT JOIN order_stats os ON os.user_id = p.user_id
    LEFT JOIN reservation_stats rs ON rs.user_id = p.user_id
    LEFT JOIN cuisine_signals cs ON cs.user_id = p.user_id
  )
  SELECT COUNT(*)::integer
  INTO v_result
  FROM snapshots s
  CROSS JOIN criteria c
  WHERE (
      array_length(c.cities, 1) IS NULL
      OR array_length(c.cities, 1) = 0
      OR s.city = ANY(c.cities)
    )
    AND (
      array_length(c.cuisines, 1) IS NULL
      OR array_length(c.cuisines, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.cuisine_tokens) AS token_values(token)
        JOIN unnest(c.cuisines) AS wanted_values(wanted) ON token_values.token LIKE '%' || wanted_values.wanted || '%'
      )
    )
    AND (
      c.favorites_only = false
      OR p_restaurant_id::text = ANY(s.favorite_restaurant_ids)
    )
    AND s.interaction_count >= c.min_orders
    AND s.avg_basket >= c.min_avg_basket
    AND (
      c.customer_segment = 'new'
      OR c.max_days_since_order >= 365
      OR (
        s.days_since_last_activity IS NOT NULL
        AND s.days_since_last_activity <= c.max_days_since_order
      )
    )
    AND (
      array_length(c.journey_types, 1) IS NULL
      OR array_length(c.journey_types, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.journey_types) AS journey_values(journey_type)
        WHERE journey_values.journey_type = ANY(c.journey_types)
      )
    )
    AND (
      array_length(c.service_moments, 1) IS NULL
      OR array_length(c.service_moments, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(s.service_moments) AS service_values(service_moment)
        WHERE service_values.service_moment = ANY(c.service_moments)
      )
    )
    AND CASE c.customer_segment
      WHEN 'new' THEN s.interaction_count = 0
      WHEN 'returning' THEN s.interaction_count > 0
      WHEN 'loyal' THEN s.interaction_count >= 5 OR p_restaurant_id::text = ANY(s.favorite_restaurant_ids)
      WHEN 'inactive' THEN s.interaction_count > 0 AND COALESCE(s.days_since_last_activity, 0) >= 45
      ELSE true
    END;

  RETURN COALESCE(v_result, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.estimate_campaign_audience(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- === 20260312183000_courier_dashboard_completion.sql ===
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dispatch_jobs'
  ) THEN
    EXECUTE 'ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs';
    EXECUTE '' ||
      'CREATE POLICY "dispatch_jobs_courier_select" ON public.dispatch_jobs ' ||
      'FOR SELECT TO authenticated USING (' ||
      '  EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_attempts da ' ||
      '    JOIN public.couriers c ON c.id = da.courier_id ' ||
      '    WHERE da.dispatch_job_id = dispatch_jobs.id AND c.user_id = auth.uid()' ||
      '  )' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.orders o ' ||
      '    JOIN public.restaurants r ON r.id = o.restaurant_id ' ||
      '    WHERE o.id = dispatch_jobs.order_id AND r.owner_id = auth.uid()' ||
      '  )' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.orders o ' ||
      '    WHERE o.id = dispatch_jobs.order_id AND o.user_id = auth.uid()' ||
      '  )' ||
      ')';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    EXECUTE 'ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "orders_courier_select" ON public.orders';
    EXECUTE '' ||
      'CREATE POLICY "orders_courier_select" ON public.orders ' ||
      'FOR SELECT TO authenticated USING (' ||
      '  EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_jobs dj ' ||
      '    JOIN public.couriers c ON c.id = dj.courier_id ' ||
      '    WHERE dj.order_id = orders.id AND c.user_id = auth.uid()' ||
      '  )' ||
      '  OR EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_attempts da ' ||
      '    JOIN public.dispatch_jobs dj ON dj.id = da.dispatch_job_id ' ||
      '    JOIN public.couriers c ON c.id = da.courier_id ' ||
      '    WHERE dj.order_id = orders.id AND c.user_id = auth.uid()' ||
      '  )' ||
      ')';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery_tracking'
  ) THEN
    EXECUTE 'ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "delivery_tracking_courier_select" ON public.delivery_tracking';
    EXECUTE '' ||
      'CREATE POLICY "delivery_tracking_courier_select" ON public.delivery_tracking ' ||
      'FOR SELECT TO authenticated USING (' ||
      '  EXISTS (' ||
      '    SELECT 1 FROM public.dispatch_jobs dj ' ||
      '    JOIN public.couriers c ON c.id = dj.courier_id ' ||
      '    WHERE dj.order_id = delivery_tracking.order_id AND c.user_id = auth.uid()' ||
      '  )' ||
      ')';
  END IF;
END $$;

-- === 20260312200000_delivery_proof_qr_dispatch.sql ===
ALTER TABLE public.proof_of_delivery
  ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'manual_code',
  ADD COLUMN IF NOT EXISTS verification_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proof_of_delivery_verification_method_check'
  ) THEN
    ALTER TABLE public.proof_of_delivery
      ADD CONSTRAINT proof_of_delivery_verification_method_check
      CHECK (verification_method IN ('qr', 'manual_code'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_of_delivery_dispatch_job_unique
  ON public.proof_of_delivery(dispatch_job_id);

ALTER TABLE public.proof_of_delivery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Require auth for proof_of_delivery" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_insert" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_courier_update" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_client_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_restaurant_select" ON public.proof_of_delivery;
DROP POLICY IF EXISTS "proof_of_delivery_admin_all" ON public.proof_of_delivery;

CREATE POLICY "proof_of_delivery_courier_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_courier_insert"
  ON public.proof_of_delivery
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_courier_update"
  ON public.proof_of_delivery
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = proof_of_delivery.courier_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_client_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      WHERE dj.id = proof_of_delivery.dispatch_job_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_restaurant_select"
  ON public.proof_of_delivery
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.id = proof_of_delivery.dispatch_job_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "proof_of_delivery_admin_all"
  ON public.proof_of_delivery
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';

-- === 20260312213000_fix_courier_rls_and_order_tabs.sql ===
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.has_role(auth.uid(), 'admin'), false);
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_restaurant(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = p_restaurant_id
      AND r.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_courier(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.couriers c
    WHERE c.id = p_courier_id
      AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_order_delivery(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = p_order_id
        AND o.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = p_order_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_attempts da
      JOIN public.dispatch_jobs dj ON dj.id = da.dispatch_job_id
      JOIN public.couriers c ON c.id = da.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_order_delivery(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = p_order_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.order_id = p_order_id
        AND c.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_courier(p_courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = p_courier_id
        AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.courier_id = p_courier_id
        AND (
          o.user_id = auth.uid()
          OR r.owner_id = auth.uid()
        )
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_dispatch_job(p_dispatch_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      WHERE dj.id = p_dispatch_job_id
        AND public.auth_can_view_order_delivery(dj.order_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_manage_dispatch_job(p_dispatch_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.orders o ON o.id = dj.order_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE dj.id = p_dispatch_job_id
        AND r.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.dispatch_jobs dj
      JOIN public.couriers c ON c.id = dj.courier_id
      WHERE dj.id = p_dispatch_job_id
        AND c.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.auth_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_owns_restaurant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_owns_courier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_courier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_dispatch_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_manage_dispatch_job(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owns_restaurant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_owns_courier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_courier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_dispatch_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_dispatch_job(uuid) TO authenticated;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Couriers manage own profile" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_select" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_insert" ON public.couriers;
DROP POLICY IF EXISTS "couriers_own_profile_update" ON public.couriers;
DROP POLICY IF EXISTS "couriers_admin_all" ON public.couriers;
DROP POLICY IF EXISTS "couriers_client_active_order" ON public.couriers;

CREATE POLICY "couriers_select_safe" ON public.couriers
  FOR SELECT TO authenticated
  USING (public.auth_can_view_courier(id));

CREATE POLICY "couriers_insert_self" ON public.couriers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.auth_is_admin());

CREATE POLICY "couriers_update_self" ON public.couriers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.auth_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.auth_is_admin());

ALTER TABLE public.courier_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_shifts_own" ON public.courier_shifts;
DROP POLICY IF EXISTS "courier_shifts_admin" ON public.courier_shifts;
DROP POLICY IF EXISTS "Couriers manage own courier_shifts" ON public.courier_shifts;

CREATE POLICY "courier_shifts_select_safe" ON public.courier_shifts
  FOR SELECT TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

CREATE POLICY "courier_shifts_write_safe" ON public.courier_shifts
  FOR ALL TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_locations_own_insert" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_own_select" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_client_active" ON public.courier_locations;
DROP POLICY IF EXISTS "courier_locations_admin" ON public.courier_locations;
DROP POLICY IF EXISTS "Couriers manage own courier_locations" ON public.courier_locations;

CREATE POLICY "courier_locations_select_safe" ON public.courier_locations
  FOR SELECT TO authenticated
  USING (public.auth_can_view_courier(courier_id));

CREATE POLICY "courier_locations_insert_safe" ON public.courier_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_courier_update" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_client_select" ON public.dispatch_jobs;
DROP POLICY IF EXISTS "dispatch_jobs_admin" ON public.dispatch_jobs;

CREATE POLICY "dispatch_jobs_select_safe" ON public.dispatch_jobs
  FOR SELECT TO authenticated
  USING (public.auth_can_view_dispatch_job(id));

CREATE POLICY "dispatch_jobs_update_safe" ON public.dispatch_jobs
  FOR UPDATE TO authenticated
  USING (public.auth_can_manage_dispatch_job(id))
  WITH CHECK (public.auth_can_manage_dispatch_job(id));

CREATE POLICY "dispatch_jobs_admin_safe" ON public.dispatch_jobs
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatch_attempts_courier" ON public.dispatch_attempts;
DROP POLICY IF EXISTS "dispatch_attempts_admin" ON public.dispatch_attempts;

CREATE POLICY "dispatch_attempts_courier_safe" ON public.dispatch_attempts
  FOR ALL TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin())
  WITH CHECK (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_earnings_own" ON public.courier_earnings;
DROP POLICY IF EXISTS "courier_earnings_admin" ON public.courier_earnings;
DROP POLICY IF EXISTS "Couriers manage own courier_earnings" ON public.courier_earnings;

CREATE POLICY "courier_earnings_select_safe" ON public.courier_earnings
  FOR SELECT TO authenticated
  USING (public.auth_owns_courier(courier_id) OR public.auth_is_admin());

CREATE POLICY "courier_earnings_admin_safe" ON public.courier_earnings
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their delivery tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "Restaurant owners can manage delivery tracking" ON public.delivery_tracking;
DROP POLICY IF EXISTS "delivery_tracking_courier_select" ON public.delivery_tracking;

CREATE POLICY "delivery_tracking_select_safe" ON public.delivery_tracking
  FOR SELECT TO authenticated
  USING (public.auth_can_view_order_delivery(order_id));

CREATE POLICY "delivery_tracking_manage_safe" ON public.delivery_tracking
  FOR ALL TO authenticated
  USING (public.auth_can_manage_order_delivery(order_id))
  WITH CHECK (public.auth_can_manage_order_delivery(order_id));

CREATE OR REPLACE FUNCTION public.get_customer_orders_dashboard()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  restaurant jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'address', r.address,
      'city', r.city
    ) AS restaurant,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_orders_dashboard(p_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  customer jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Acces refuse au restaurant %', p_restaurant_id;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'full_name', p.full_name,
      'phone', p.phone
    ) AS customer,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE o.restaurant_id = p_restaurant_id
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_orders_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_restaurant_orders_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_orders_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_orders_dashboard(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- === 20260312223000_delivery_scheduling_indexes.sql ===
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_delivery_dispatch
ON public.orders (scheduled_at)
WHERE scheduled_at IS NOT NULL AND delivery_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_order_status
ON public.dispatch_jobs (order_id, status);

-- === 20260312223100_notification_system_completion.sql ===
-- Complete the notification pipeline with centralized delivery queueing
-- and missing business alerts.

CREATE OR REPLACE FUNCTION public.queue_notification_deliveries(
  p_notification_id uuid,
  p_user_id uuid,
  p_category text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_channels jsonb := '{"push": true, "email": true, "in_app": true}'::jsonb;
  v_categories jsonb := '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb;
  v_requested jsonb := '{"in_app": true, "push": true, "email": false}'::jsonb;
  v_email text;
  v_count integer := 0;
BEGIN
  SELECT channels, categories
  INTO v_channels, v_categories
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  v_channels := COALESCE(v_channels, '{"push": true, "email": true, "in_app": true}'::jsonb);
  v_categories := COALESCE(v_categories, '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb);

  IF COALESCE((v_categories ->> p_category)::boolean, true) IS DISTINCT FROM true THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(COALESCE(p_data, '{}'::jsonb) -> 'requested_channels') = 'object' THEN
    v_requested := COALESCE(p_data, '{}'::jsonb) -> 'requested_channels';
  END IF;

  IF COALESCE((v_requested ->> 'in_app')::boolean, true)
    AND COALESCE((v_channels ->> 'in_app')::boolean, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries
      WHERE notification_id = p_notification_id
        AND channel = 'in_app'
    ) THEN
    INSERT INTO public.notification_deliveries (
      notification_id,
      channel,
      status,
      scheduled_at,
      sent_at
    )
    VALUES (
      p_notification_id,
      'in_app',
      'sent',
      now(),
      now()
    );
    v_count := v_count + 1;
  END IF;

  IF COALESCE((v_requested ->> 'push')::boolean, true)
    AND COALESCE((v_channels ->> 'push')::boolean, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries
      WHERE notification_id = p_notification_id
        AND channel = 'push'
    ) THEN
    INSERT INTO public.notification_deliveries (
      notification_id,
      channel,
      status,
      scheduled_at
    )
    VALUES (
      p_notification_id,
      'push',
      'queued',
      now()
    );
    v_count := v_count + 1;
  END IF;

  IF COALESCE((v_requested ->> 'email')::boolean, false)
    AND COALESCE((v_channels ->> 'email')::boolean, true)
    AND NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries
      WHERE notification_id = p_notification_id
        AND channel = 'email'
    ) THEN
    SELECT au.email::text
    INTO v_email
    FROM auth.users au
    WHERE au.id = p_user_id;

    IF v_email IS NOT NULL THEN
      INSERT INTO public.notification_deliveries (
        notification_id,
        channel,
        status,
        target,
        scheduled_at
      )
      VALUES (
        p_notification_id,
        'email',
        'queued',
        v_email,
        now()
      );
      v_count := v_count + 1;
    END IF;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_category text,
  p_data json DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid uuid;
  v_data jsonb := COALESCE(p_data::jsonb, '{}'::jsonb);
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, category, data)
  VALUES (p_user_id, p_title, p_body, p_type, p_category, v_data)
  RETURNING id INTO nid;

  PERFORM public.queue_notification_deliveries(
    nid,
    p_user_id,
    p_category,
    v_data
  );

  RETURN nid;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_topic_notification(
  p_topic text,
  p_title text,
  p_body text,
  p_type text,
  p_category text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient record;
  v_count integer := 0;
BEGIN
  FOR v_recipient IN
    SELECT DISTINCT ns.user_id
    FROM public.notification_subscriptions ns
    WHERE ns.topic = p_topic
  LOOP
    PERFORM public.enqueue_notification(
      v_recipient.user_id,
      p_title,
      p_body,
      p_type,
      p_category,
      p_data::json
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dispatch_notification_campaign(
  p_campaign_id uuid
)
RETURNS TABLE (
  recipients integer,
  notifications_count integer,
  deliveries_total integer,
  deliveries_queued integer,
  deliveries_sent integer,
  deliveries_failed integer,
  in_app_total integer,
  email_total integer,
  push_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_campaign public.notification_campaigns%ROWTYPE;
  v_notification record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_campaign
  FROM public.notification_campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found.';
  END IF;

  FOR v_notification IN
    INSERT INTO public.notifications (user_id, title, body, type, category, data)
    SELECT
      tu.user_id,
      v_campaign.title,
      v_campaign.body,
      'campaign',
      v_campaign.category,
      jsonb_build_object(
        'campaign_id', v_campaign.id,
        'campaign_title', v_campaign.title,
        'url', '/notifications',
        'requested_channels', jsonb_build_object(
          'in_app', COALESCE((v_campaign.channels ->> 'in_app')::boolean, true),
          'email', COALESCE((v_campaign.channels ->> 'email')::boolean, true),
          'push', COALESCE((v_campaign.channels ->> 'push')::boolean, true)
        )
      )
    FROM (
      SELECT
        au.id AS user_id,
        COALESCE(p.city, '') AS city,
        COALESCE(roles_map.roles, ARRAY['client']::text[]) AS roles
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.user_id = au.id
      LEFT JOIN LATERAL (
        SELECT array_agg(ur.role::text ORDER BY ur.role::text) AS roles
        FROM public.user_roles ur
        WHERE ur.user_id = au.id
      ) AS roles_map ON true
      WHERE (
        COALESCE(array_length(v_campaign.target_roles, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(roles_map.roles, ARRAY['client']::text[])) AS role_name
          WHERE role_name = ANY(v_campaign.target_roles)
        )
      )
      AND (
        COALESCE(array_length(v_campaign.target_cities, 1), 0) = 0
        OR COALESCE(p.city, '') = ANY(v_campaign.target_cities)
      )
    ) AS tu
    RETURNING id, user_id, category, data
  LOOP
    PERFORM public.queue_notification_deliveries(
      v_notification.id,
      v_notification.user_id,
      v_notification.category,
      v_notification.data
    )
  ;
  END LOOP;

  UPDATE public.notification_campaigns
  SET status = 'sent', sent_at = now()
  WHERE id = p_campaign_id;

  RETURN QUERY
  SELECT *
  FROM public.get_campaign_stats(ARRAY[p_campaign_id]);
END;
$$;

DROP TRIGGER IF EXISTS after_order_status_update ON public.orders;

CREATE OR REPLACE FUNCTION public.trigger_order_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := CASE
    WHEN NEW.status = 'on_the_way' THEN 'delivering'
    ELSE COALESCE(NEW.status, 'pending')
  END;
  v_order_reference text := COALESCE(NEW.order_number, '#' || left(NEW.id::text, 8));
  v_title text;
  v_body text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  CASE v_status
    WHEN 'confirmed' THEN
      v_title := 'Commande confirmee';
      v_body := format('Votre commande %s est confirmee et passe en preparation.', v_order_reference);
    WHEN 'preparing' THEN
      v_title := 'Commande en preparation';
      v_body := format('Votre commande %s est en cours de preparation.', v_order_reference);
    WHEN 'delivering' THEN
      v_title := 'Commande en livraison';
      v_body := format('Votre commande %s est en route.', v_order_reference);
    WHEN 'delivered' THEN
      v_title := 'Commande livree';
      v_body := format('Votre commande %s a ete livree.', v_order_reference);
    WHEN 'cancelled' THEN
      v_title := 'Commande annulee';
      v_body := format('Votre commande %s a ete annulee.', v_order_reference);
    WHEN 'payment_failed' THEN
      v_title := 'Paiement echoue';
      v_body := format('Le paiement de votre commande %s a echoue.', v_order_reference);
    ELSE
      v_title := 'Commande mise a jour';
      v_body := format('Votre commande %s est maintenant : %s.', v_order_reference, v_status);
  END CASE;

  PERFORM public.enqueue_notification(
    NEW.user_id,
    v_title,
    v_body,
    'order_update',
    'transactional',
    jsonb_build_object(
      'order_id', NEW.id,
      'order_number', NEW.order_number,
      'status', v_status,
      'url', '/commandes'
    )::json
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER after_order_status_update
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_order_status_notification();

CREATE OR REPLACE FUNCTION public.trigger_reservation_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
  v_owner_id uuid;
  v_restaurant_name text := 'Restaurant';
  v_customer_title text;
  v_customer_body text;
  v_feature_label text := '';
  v_reference_date date;
  v_reference_time time;
BEGIN
  v_restaurant_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.restaurant_id
    ELSE COALESCE(NEW.restaurant_id, OLD.restaurant_id)
  END;
  v_reference_date := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.date
    ELSE COALESCE(NEW.date, OLD.date)
  END;
  v_reference_time := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.time
    ELSE COALESCE(NEW.time, OLD.time)
  END;

  SELECT r.owner_id, COALESCE(r.name, 'Restaurant')
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = v_restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_feature_label := CASE lower(COALESCE(NEW.feature, ''))
      WHEN 'zero-attente' THEN ' Zero Attente'
      WHEN 'chefs_table' THEN ' Chef''s Table'
      WHEN 'promo-formule' THEN ' avec formule'
      WHEN 'promo-offre' THEN ' avec offre'
      ELSE ''
    END;

    PERFORM public.enqueue_notification(
      NEW.user_id,
      'Reservation enregistree',
      format(
        'Votre reservation%s chez %s pour le %s a %s a bien ete enregistree.',
        v_feature_label,
        v_restaurant_name,
        to_char(NEW.date, 'DD/MM/YYYY'),
        to_char(NEW.time, 'HH24:MI')
      ),
      'reservation',
      'transactional',
      jsonb_build_object(
        'reservation_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'status', NEW.status,
        'url', '/reservations'
      )::json
    );

    IF v_owner_id IS NOT NULL THEN
      PERFORM public.enqueue_notification(
        v_owner_id,
        'Nouvelle reservation',
        format(
          '%s personne(s) chez %s le %s a %s.',
          COALESCE(NEW.party_size, 0),
          v_restaurant_name,
          to_char(NEW.date, 'DD/MM/YYYY'),
          to_char(NEW.time, 'HH24:MI')
        ),
        'reservation',
        'transactional',
        jsonb_build_object(
          'reservation_id', NEW.id,
          'restaurant_id', NEW.restaurant_id,
          'status', NEW.status,
          'url', '/dashboard/reservations'
        )::json
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'confirmed' THEN
        v_customer_title := 'Reservation confirmee';
        v_customer_body := format(
          'Votre reservation chez %s pour le %s a %s est confirmee.',
          v_restaurant_name,
          to_char(v_reference_date, 'DD/MM/YYYY'),
          to_char(v_reference_time, 'HH24:MI')
        );
      WHEN 'arrived' THEN
        v_customer_title := 'Reservation signalee';
        v_customer_body := format(
          'Votre arrivee a ete enregistree chez %s.',
          v_restaurant_name
        );
      WHEN 'cancelled' THEN
        v_customer_title := 'Reservation annulee';
        v_customer_body := format(
          'Votre reservation chez %s pour le %s a %s a ete annulee.',
          v_restaurant_name,
          to_char(v_reference_date, 'DD/MM/YYYY'),
          to_char(v_reference_time, 'HH24:MI')
        );
      WHEN 'no_show' THEN
        v_customer_title := 'Reservation classee no-show';
        v_customer_body := format(
          'Votre reservation chez %s a ete marquee en no-show.',
          v_restaurant_name
        );
      ELSE
        v_customer_title := 'Reservation mise a jour';
        v_customer_body := format(
          'Votre reservation chez %s est maintenant : %s.',
          v_restaurant_name,
          NEW.status
        );
    END CASE;

    PERFORM public.enqueue_notification(
      NEW.user_id,
      v_customer_title,
      v_customer_body,
      'reservation',
      'transactional',
      jsonb_build_object(
        'reservation_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'status', NEW.status,
        'url', '/reservations'
      )::json
    );

    IF v_owner_id IS NOT NULL AND NEW.status IN ('cancelled', 'no_show') THEN
      PERFORM public.enqueue_notification(
        v_owner_id,
        CASE
          WHEN NEW.status = 'cancelled' THEN 'Reservation annulee'
          ELSE 'Reservation en no-show'
        END,
        format(
          'La reservation du %s a %s chez %s est maintenant : %s.',
          to_char(v_reference_date, 'DD/MM/YYYY'),
          to_char(v_reference_time, 'HH24:MI'),
          v_restaurant_name,
          NEW.status
        ),
        'reservation',
        'transactional',
        jsonb_build_object(
          'reservation_id', NEW.id,
          'restaurant_id', NEW.restaurant_id,
          'status', NEW.status,
          'url', '/dashboard/reservations'
        )::json
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_reservation_notification ON public.reservations;

CREATE TRIGGER after_reservation_notification
AFTER INSERT OR UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_reservation_notifications();

CREATE OR REPLACE FUNCTION public.trigger_flash_sale_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false) AND COALESCE(NEW.quantity_available, 0) > 0;
  ELSE
    v_should_notify := (
      COALESCE(NEW.is_active, false) AND NOT COALESCE(OLD.is_active, false)
    ) OR (
      COALESCE(OLD.quantity_available, 0) = 0 AND COALESCE(NEW.quantity_available, 0) > 0
    );
  END IF;

  IF v_should_notify THEN
    PERFORM public.broadcast_topic_notification(
      'flash_sales',
      'Nouvelle vente flash',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.title, 'Une offre exclusive'),
        v_restaurant_name,
        to_char(COALESCE(NEW.discounted_price, 0), 'FM999999990.00')
      ),
      'flash_sale',
      'product',
      jsonb_build_object(
        'flash_sale_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/ventes-flash'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_flash_sale_subscription_alert ON public.flash_sales;

CREATE TRIGGER after_flash_sale_subscription_alert
AFTER INSERT OR UPDATE ON public.flash_sales
FOR EACH ROW
EXECUTE FUNCTION public.trigger_flash_sale_subscription_alert();

CREATE OR REPLACE FUNCTION public.trigger_anti_gaspi_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false) AND COALESCE(NEW.quantity_available, 0) > 0;
  ELSE
    v_should_notify := (
      COALESCE(NEW.is_active, false) AND NOT COALESCE(OLD.is_active, false)
    ) OR (
      COALESCE(OLD.quantity_available, 0) = 0 AND COALESCE(NEW.quantity_available, 0) > 0
    );
  END IF;

  IF v_should_notify THEN
    PERFORM public.broadcast_topic_notification(
      'anti_gaspi',
      'Nouvelle offre anti-gaspi',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.title, 'Une offre anti-gaspi'),
        v_restaurant_name,
        to_char(COALESCE(NEW.discounted_price, 0), 'FM999999990.00')
      ),
      'anti_gaspi',
      'product',
      jsonb_build_object(
        'anti_waste_offer_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/anti-gaspi'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_anti_gaspi_subscription_alert ON public.anti_waste_offers;

CREATE TRIGGER after_anti_gaspi_subscription_alert
AFTER INSERT OR UPDATE ON public.anti_waste_offers
FOR EACH ROW
EXECUTE FUNCTION public.trigger_anti_gaspi_subscription_alert();

CREATE OR REPLACE FUNCTION public.trigger_chefs_table_subscription_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text := 'Restaurant';
  v_should_notify boolean := false;
BEGIN
  SELECT COALESCE(name, 'Restaurant')
  INTO v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := COALESCE(NEW.is_active, false) AND COALESCE(NEW.remaining_portions, 0) > 0;
  ELSE
    v_should_notify := (
      COALESCE(NEW.is_active, false) AND NOT COALESCE(OLD.is_active, false)
    ) OR (
      COALESCE(OLD.remaining_portions, 0) = 0 AND COALESCE(NEW.remaining_portions, 0) > 0
    );
  END IF;

  IF v_should_notify THEN
    PERFORM public.broadcast_topic_notification(
      'chefs_table',
      'Nouveau drop Chef''s Table',
      format(
        '%s chez %s a %s CHF.',
        COALESCE(NEW.dish_name, 'Un nouveau plat signature'),
        v_restaurant_name,
        to_char(COALESCE(NEW.price, 0), 'FM999999990.00')
      ),
      'chefs_table',
      'product',
      jsonb_build_object(
        'chef_table_drop_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/chefs-table'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_chefs_table_subscription_alert ON public.chef_table_drops;

CREATE TRIGGER after_chefs_table_subscription_alert
AFTER INSERT OR UPDATE ON public.chef_table_drops
FOR EACH ROW
EXECUTE FUNCTION public.trigger_chefs_table_subscription_alert();

CREATE OR REPLACE FUNCTION public.trigger_invoice_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_restaurant_name text := 'Restaurant';
BEGIN
  SELECT owner_id, COALESCE(name, 'Restaurant')
  INTO v_owner_id, v_restaurant_name
  FROM public.restaurants
  WHERE id = NEW.restaurant_id;

  IF v_owner_id IS NOT NULL THEN
    PERFORM public.enqueue_notification(
      v_owner_id,
      'Nouvelle facture disponible',
      format(
        'La facture %s pour %s est disponible.',
        COALESCE(NEW.invoice_number, to_char(NEW.period_start, 'MM/YYYY')),
        v_restaurant_name
      ),
      'invoice',
      'transactional',
      jsonb_build_object(
        'invoice_id', NEW.id,
        'restaurant_id', NEW.restaurant_id,
        'url', '/dashboard/factures',
        'requested_channels', jsonb_build_object(
          'in_app', true,
          'push', true,
          'email', true
        )
      )::json
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_invoice_notification ON public.restaurant_invoices;

CREATE TRIGGER after_invoice_notification
AFTER INSERT ON public.restaurant_invoices
FOR EACH ROW
EXECUTE FUNCTION public.trigger_invoice_notification();

CREATE OR REPLACE FUNCTION public.trigger_review_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_user_id uuid;
  v_restaurant_name text := 'Le restaurant';
  v_author_name text;
BEGIN
  SELECT rv.user_id, COALESCE(r.name, 'Le restaurant')
  INTO v_review_user_id, v_restaurant_name
  FROM public.reviews rv
  LEFT JOIN public.restaurants r ON r.id = rv.restaurant_id
  WHERE rv.id = NEW.review_id;

  IF v_review_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_author_name := CASE
    WHEN COALESCE(NEW.author_type, '') = 'admin' THEN 'Tok'
    ELSE v_restaurant_name
  END;

  PERFORM public.enqueue_notification(
    v_review_user_id,
    'Reponse a votre avis',
    format('%s a repondu a votre avis.', v_author_name),
    'review_reply',
    'product',
    jsonb_build_object(
      'review_id', NEW.review_id,
      'reply_id', NEW.id,
      'url', '/notifications'
    )::json
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_review_reply_notification ON public.review_replies;

CREATE TRIGGER after_review_reply_notification
AFTER INSERT OR UPDATE ON public.review_replies
FOR EACH ROW
EXECUTE FUNCTION public.trigger_review_reply_notification();

NOTIFY pgrst, 'reload schema';

-- === 20260312233000_fix_dashboard_performance_consistency.sql ===
CREATE OR REPLACE FUNCTION public.get_restaurant_performance(p_restaurant_id uuid, p_from text, p_to text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_orders',
      COALESCE((
        SELECT count(*)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'avg_ticket',
      COALESCE((
        SELECT avg(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_reservations',
      COALESCE((
        SELECT count(*)
        FROM reservations
        WHERE restaurant_id = p_restaurant_id
          AND date >= p_from::date
          AND date <= p_to::date
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
      ), 0),
    'cancel_rate',
      COALESCE((
        SELECT round(
          count(*) FILTER (WHERE lower(COALESCE(status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
          / NULLIF(count(*), 0) * 100,
          1
        )
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_comparison(p_restaurant_id uuid, p_period text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  days_back integer;
BEGIN
  days_back := CASE p_period WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 30 END;

  SELECT json_build_object(
    'my_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_orders',
      COALESCE((
        SELECT count(*)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_avg_rating',
      COALESCE((SELECT avg(rating) FROM reviews WHERE restaurant_id = p_restaurant_id), 0),
    'avg_revenue',
      COALESCE((
        SELECT avg(rev)
        FROM (
          SELECT sum(total_amount) AS rev
          FROM orders
          WHERE lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
            AND created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_orders',
      COALESCE((
        SELECT avg(cnt)
        FROM (
          SELECT count(*) AS cnt
          FROM orders
          WHERE created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_rating',
      COALESCE((SELECT avg(rating) FROM reviews), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_restaurant_daily_kpis_for_date(p_restaurant_id uuid, p_day text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO restaurant_daily_kpis (
    restaurant_id,
    kpi_date,
    orders_count,
    revenue,
    avg_ticket,
    reservations_count,
    reviews_count,
    satisfaction_score,
    cancel_rate
  )
  SELECT
    p_restaurant_id,
    p_day::date,
    COALESCE(count(o.id), 0),
    COALESCE(sum(o.total_amount) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    ), 0),
    COALESCE(avg(o.total_amount) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    ), 0),
    (
      SELECT count(*)
      FROM reservations r
      WHERE r.restaurant_id = p_restaurant_id
        AND r.date = p_day::date
        AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show')
    ),
    (
      SELECT count(*)
      FROM reviews rev
      WHERE rev.restaurant_id = p_restaurant_id
        AND rev.created_at::date = p_day::date
    ),
    COALESCE((
      SELECT avg(rating)
      FROM reviews rev
      WHERE rev.restaurant_id = p_restaurant_id
        AND rev.created_at::date = p_day::date
    ), 0),
    COALESCE(round(
      count(o.id) FILTER (WHERE lower(COALESCE(o.status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
      / NULLIF(count(o.id), 0) * 100,
      1
    ), 0)
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at::date = p_day::date
  ON CONFLICT (restaurant_id, kpi_date) DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    revenue = EXCLUDED.revenue,
    avg_ticket = EXCLUDED.avg_ticket,
    reservations_count = EXCLUDED.reservations_count,
    reviews_count = EXCLUDED.reviews_count,
    satisfaction_score = EXCLUDED.satisfaction_score,
    cancel_rate = EXCLUDED.cancel_rate,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_month date;
  period_s date;
  period_e date;
  r record;
  inv_count integer := 0;
  next_num integer;
  rev numeric;
  tva_rate numeric := 0.077;
BEGIN
  target_month := COALESCE(p_month::date, (date_trunc('month', now()) - interval '1 month')::date);
  period_s := target_month;
  period_e := (target_month + interval '1 month' - interval '1 day')::date;

  FOR r IN SELECT id, name FROM restaurants WHERE is_active = true LOOP
    IF EXISTS (
      SELECT 1
      FROM restaurant_invoices
      WHERE restaurant_id = r.id
        AND period_start = period_s
        AND period_end = period_e
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(total_amount), 0) INTO rev
    FROM orders
    WHERE restaurant_id = r.id
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
      AND created_at >= period_s::timestamptz
      AND created_at < (period_e + interval '1 day')::timestamptz;

    IF rev > 0 THEN
      SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
      INTO next_num
      FROM restaurant_invoices
      WHERE restaurant_id = r.id;

      INSERT INTO restaurant_invoices (
        restaurant_id,
        period_start,
        period_end,
        amount_ht,
        amount_tva,
        amount_ttc,
        status,
        invoice_number,
        due_at
      )
      VALUES (
        r.id,
        period_s,
        period_e,
        ROUND(rev / (1 + tva_rate), 2),
        ROUND(rev - rev / (1 + tva_rate), 2),
        ROUND(rev, 2),
        'pending',
        'FAC-' || TO_CHAR(period_s, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
        (period_e + interval '30 days')::timestamptz
      );
      inv_count := inv_count + 1;
    END IF;
  END LOOP;

  RETURN inv_count;
END;
$$;

-- === 20260312235900_fix_dashboard_performance_consistency.sql ===
CREATE OR REPLACE FUNCTION public.get_restaurant_performance(p_restaurant_id uuid, p_from text, p_to text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_orders',
      COALESCE((
        SELECT count(*)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'avg_ticket',
      COALESCE((
        SELECT avg(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0),
    'total_reservations',
      COALESCE((
        SELECT count(*)
        FROM reservations
        WHERE restaurant_id = p_restaurant_id
          AND date >= p_from::date
          AND date <= p_to::date
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
      ), 0),
    'cancel_rate',
      COALESCE((
        SELECT round(
          count(*) FILTER (WHERE lower(COALESCE(status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
          / NULLIF(count(*), 0) * 100,
          1
        )
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= p_from::date::timestamptz
          AND created_at < (p_to::date + interval '1 day')::timestamptz
      ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_comparison(p_restaurant_id uuid, p_period text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  days_back integer;
BEGIN
  days_back := CASE p_period WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 ELSE 30 END;

  SELECT json_build_object(
    'my_revenue',
      COALESCE((
        SELECT sum(total_amount)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_orders',
      COALESCE((
        SELECT count(*)
        FROM orders
        WHERE restaurant_id = p_restaurant_id
          AND created_at >= now() - (days_back || ' days')::interval
      ), 0),
    'my_avg_rating',
      COALESCE((SELECT avg(rating) FROM reviews WHERE restaurant_id = p_restaurant_id), 0),
    'avg_revenue',
      COALESCE((
        SELECT avg(rev)
        FROM (
          SELECT sum(total_amount) AS rev
          FROM orders
          WHERE lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
            AND created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_orders',
      COALESCE((
        SELECT avg(cnt)
        FROM (
          SELECT count(*) AS cnt
          FROM orders
          WHERE created_at >= now() - (days_back || ' days')::interval
          GROUP BY restaurant_id
        ) t
      ), 0),
    'avg_rating',
      COALESCE((SELECT avg(rating) FROM reviews), 0)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_restaurant_daily_kpis_for_date(p_restaurant_id uuid, p_day text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO restaurant_daily_kpis (
    restaurant_id,
    kpi_date,
    orders_count,
    revenue,
    avg_ticket,
    reservations_count,
    reviews_count,
    satisfaction_score,
    cancel_rate
  )
  SELECT
    p_restaurant_id,
    p_day::date,
    COALESCE(count(o.id), 0),
    COALESCE(sum(o.total_amount) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    ), 0),
    COALESCE(avg(o.total_amount) FILTER (
      WHERE lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    ), 0),
    (
      SELECT count(*)
      FROM reservations r
      WHERE r.restaurant_id = p_restaurant_id
        AND r.date = p_day::date
        AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show')
    ),
    (
      SELECT count(*)
      FROM reviews rev
      WHERE rev.restaurant_id = p_restaurant_id
        AND rev.created_at::date = p_day::date
    ),
    COALESCE((
      SELECT avg(rating)
      FROM reviews rev
      WHERE rev.restaurant_id = p_restaurant_id
        AND rev.created_at::date = p_day::date
    ), 0),
    COALESCE(round(
      count(o.id) FILTER (WHERE lower(COALESCE(o.status, '')) IN ('cancelled', 'refused', 'payment_failed'))::numeric
      / NULLIF(count(o.id), 0) * 100,
      1
    ), 0)
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at::date = p_day::date
  ON CONFLICT (restaurant_id, kpi_date) DO UPDATE SET
    orders_count = EXCLUDED.orders_count,
    revenue = EXCLUDED.revenue,
    avg_ticket = EXCLUDED.avg_ticket,
    reservations_count = EXCLUDED.reservations_count,
    reviews_count = EXCLUDED.reviews_count,
    satisfaction_score = EXCLUDED.satisfaction_score,
    cancel_rate = EXCLUDED.cancel_rate,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_month date;
  period_s date;
  period_e date;
  r record;
  inv_count integer := 0;
  next_num integer;
  rev numeric;
  tva_rate numeric := 0.077;
BEGIN
  target_month := COALESCE(p_month::date, (date_trunc('month', now()) - interval '1 month')::date);
  period_s := target_month;
  period_e := (target_month + interval '1 month' - interval '1 day')::date;

  FOR r IN SELECT id, name FROM restaurants WHERE is_active = true LOOP
    IF EXISTS (
      SELECT 1
      FROM restaurant_invoices
      WHERE restaurant_id = r.id
        AND period_start = period_s
        AND period_end = period_e
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(total_amount), 0) INTO rev
    FROM orders
    WHERE restaurant_id = r.id
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
      AND created_at >= period_s::timestamptz
      AND created_at < (period_e + interval '1 day')::timestamptz;

    IF rev > 0 THEN
      SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
      INTO next_num
      FROM restaurant_invoices
      WHERE restaurant_id = r.id;

      INSERT INTO restaurant_invoices (
        restaurant_id,
        period_start,
        period_end,
        amount_ht,
        amount_tva,
        amount_ttc,
        status,
        invoice_number,
        due_at
      )
      VALUES (
        r.id,
        period_s,
        period_e,
        ROUND(rev / (1 + tva_rate), 2),
        ROUND(rev - rev / (1 + tva_rate), 2),
        ROUND(rev, 2),
        'pending',
        'FAC-' || TO_CHAR(period_s, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
        (period_e + interval '30 days')::timestamptz
      );
      inv_count := inv_count + 1;
    END IF;
  END LOOP;

  RETURN inv_count;
END;
$$;

-- === 20260312235930_add_route_fields_to_order_dashboards.sql ===
CREATE OR REPLACE FUNCTION public.get_customer_orders_dashboard()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  restaurant jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'address', r.address,
      'city', r.city
    ) AS restaurant,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'pickup_lat', dj.pickup_lat,
        'pickup_lng', dj.pickup_lng,
        'dropoff_lat', dj.dropoff_lat,
        'dropoff_lng', dj.dropoff_lng,
        'route_geometry', dj.route_geometry,
        'distance_meters', dj.distance_meters,
        'estimated_duration_minutes', dj.estimated_duration_minutes,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_orders_dashboard(p_restaurant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  restaurant_id uuid,
  checkout_id uuid,
  order_number text,
  created_at timestamptz,
  status text,
  total_amount numeric,
  delivery_fee numeric,
  delivery_address text,
  notes text,
  metadata jsonb,
  customer jsonb,
  order_items jsonb,
  delivery_tracking jsonb,
  dispatch_job jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_admin() AND NOT public.auth_owns_restaurant(p_restaurant_id) THEN
    RAISE EXCEPTION 'Acces refuse au restaurant %', p_restaurant_id;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.restaurant_id,
    o.checkout_id,
    o.order_number,
    o.created_at,
    o.status,
    o.total_amount,
    o.delivery_fee,
    o.delivery_address,
    o.notes,
    COALESCE(o.metadata, '{}'::jsonb) AS metadata,
    jsonb_build_object(
      'full_name', p.full_name,
      'phone', p.phone
    ) AS customer,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price,
          'name', COALESCE(mi.name, awo.title, oi.metadata->>'name', 'Article')
        )
        ORDER BY oi.id
      )
      FROM public.order_items oi
      LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN public.anti_waste_offers awo ON awo.id = oi.anti_waste_offer_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb) AS order_items,
    (
      SELECT to_jsonb(dt)
      FROM public.delivery_tracking dt
      WHERE dt.order_id = o.id
      ORDER BY dt.created_at DESC NULLS LAST, dt.id DESC
      LIMIT 1
    ) AS delivery_tracking,
    (
      SELECT jsonb_build_object(
        'id', dj.id,
        'status', dj.status,
        'courier_id', dj.courier_id,
        'pickup_lat', dj.pickup_lat,
        'pickup_lng', dj.pickup_lng,
        'dropoff_lat', dj.dropoff_lat,
        'dropoff_lng', dj.dropoff_lng,
        'route_geometry', dj.route_geometry,
        'distance_meters', dj.distance_meters,
        'estimated_duration_minutes', dj.estimated_duration_minutes,
        'accepted_at', dj.accepted_at,
        'picked_up_at', dj.picked_up_at,
        'delivered_at', dj.delivered_at,
        'updated_at', dj.updated_at
      )
      FROM public.dispatch_jobs dj
      WHERE dj.order_id = o.id
      ORDER BY dj.updated_at DESC NULLS LAST, dj.created_at DESC
      LIMIT 1
    ) AS dispatch_job
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.user_id = o.user_id
  WHERE o.restaurant_id = p_restaurant_id
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_orders_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_restaurant_orders_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_orders_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_orders_dashboard(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- === 20260313010000_security_hardening_server_authority.sql ===
-- Security hardening:
-- - close direct access to sensitive RPCs
-- - make Zero Attente reservations server-authoritative
-- - make order creation server-authoritative and atomic for stock
-- - restrict invoice and ad campaign mutations

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_max_covers integer;
  v_opening_hours jsonb;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_dup_count integer;
  v_reservation_id uuid;
  v_online_booking_enabled boolean;
  v_service_closed boolean;
  v_min_party_size integer;
  v_max_party_size integer;
  v_last_reservation_time time;
  v_is_service_role boolean := auth.role() = 'service_role';
  v_effective_user_id uuid;
  v_metadata_raw jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_metadata jsonb;
  v_checkout_session_id text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'checkout_session_id', '')), '');
  v_payment_method text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'payment_method', '')), '');
  v_total_amount numeric := GREATEST(COALESCE(NULLIF(v_metadata_raw ->> 'total_amount', '')::numeric, 0), 0);
  v_order_reference text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'order_reference', '')), '');
  v_preorder_items jsonb := CASE
    WHEN jsonb_typeof(v_metadata_raw -> 'preorder_items') = 'array' THEN v_metadata_raw -> 'preorder_items'
    WHEN jsonb_typeof(v_metadata_raw -> 'drops') = 'array' THEN v_metadata_raw -> 'drops'
    ELSE '[]'::jsonb
  END;
  v_paid boolean := COALESCE((v_metadata_raw ->> 'paid')::boolean, false);
  v_status text := 'pending';
BEGIN
  IF v_is_service_role THEN
    IF COALESCE(v_metadata_raw ->> '_internal_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Internal user id requis.';
    END IF;
    v_effective_user_id := (v_metadata_raw ->> '_internal_user_id')::uuid;
    v_metadata := v_metadata_raw - '_internal_user_id';
  ELSE
    v_effective_user_id := auth.uid();
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
    v_metadata := v_metadata_raw
      - '_internal_user_id'
      - 'paid'
      - 'card_brand'
      - 'card_last4'
      - 'checkout_session_id';
  END IF;

  IF lower(COALESCE(p_feature, '')) = 'zero-attente' THEN
    IF NOT v_is_service_role THEN
      RAISE EXCEPTION 'La reservation Zero Attente doit etre finalisee via le paiement securise.';
    END IF;

    IF NOT v_paid OR v_checkout_session_id IS NULL THEN
      RAISE EXCEPTION 'Paiement verifie requis pour Zero Attente.';
    END IF;

    SELECT id
    INTO v_reservation_id
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(feature, '')) = 'zero-attente'
      AND metadata ->> 'checkout_session_id' = v_checkout_session_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_reservation_id;
    END IF;

    v_status := 'confirmed';
  END IF;

  SELECT count(*) INTO v_dup_count
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show');

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN
    v_service_key := 'lunch';
  ELSE
    v_service_key := 'dinner';
  END IF;

  SELECT opening_hours INTO v_opening_hours
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  v_service_settings := COALESCE(
    v_opening_hours -> 'service_settings' -> v_service_key,
    v_opening_hours -> v_service_key,
    '{}'::jsonb
  );

  v_online_booking_enabled := COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true);
  v_service_closed := COALESCE((v_service_settings ->> 'service_closed')::boolean, false);
  v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
  v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
  v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
  v_last_reservation_time := COALESCE((v_service_settings ->> 'last_reservation_time')::time, p_time);

  IF NOT v_online_booking_enabled OR v_service_closed THEN
    RAISE EXCEPTION 'Les reservations sont fermees pour ce service.';
  END IF;

  IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN
    RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size;
  END IF;

  IF p_time > v_last_reservation_time THEN
    RAISE EXCEPTION 'La derniere reservation pour ce service est a %.', to_char(v_last_reservation_time, 'HH24:MI');
  END IF;

  SELECT COALESCE(sum(party_size), 0) INTO v_existing
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND date = p_date
    AND status NOT IN ('cancelled', 'no_show')
    AND CASE
      WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15
      ELSE EXTRACT(HOUR FROM time) >= 15
    END;

  IF v_existing + p_party_size > v_max_covers THEN
    RAISE EXCEPTION 'Capacite depassee pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing, 0);
  END IF;

  INSERT INTO public.reservations (
    user_id,
    restaurant_id,
    date,
    time,
    party_size,
    status,
    feature,
    preorder_items,
    metadata,
    notes,
    total_amount,
    payment_method,
    order_reference,
    updated_at
  )
  VALUES (
    v_effective_user_id,
    p_restaurant_id,
    p_date,
    p_time,
    p_party_size,
    v_status,
    p_feature,
    v_preorder_items,
    v_metadata,
    p_notes,
    v_total_amount,
    v_payment_method,
    v_order_reference,
    now()
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_create_reservation(uuid, date, time, integer, text, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  restaurant_id_param uuid,
  delivery_address_param text,
  total_amount_param numeric,
  delivery_fee_param numeric DEFAULT 0,
  notes_param text DEFAULT NULL::text,
  items_param json DEFAULT NULL::json,
  metadata_param json DEFAULT NULL::json,
  checkout_id_param uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  new_order_id uuid;
  item jsonb;
  v_real_price numeric;
  v_is_available boolean;
  v_idempotency text;
  v_menu_item_id uuid;
  v_quantity integer;
  v_delivery_fee numeric := GREATEST(COALESCE(delivery_fee_param, 0), 0);
  v_quality_fee numeric := 0;
  v_original_total numeric := 0;
  v_metadata_raw jsonb := COALESCE(metadata_param::jsonb, '{}'::jsonb);
  v_metadata jsonb := COALESCE(metadata_param::jsonb, '{}'::jsonb) - '_internal_user_id';
  v_validated_items jsonb := '[]'::jsonb;
  v_item_metadata jsonb;
  v_original_item_id text;
  v_has_quality_fee boolean := false;
  v_is_service_role boolean := auth.role() = 'service_role';
  v_effective_user_id uuid;
BEGIN
  IF v_is_service_role THEN
    IF COALESCE(v_metadata_raw ->> '_internal_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Internal user id requis.';
    END IF;
    v_effective_user_id := (v_metadata_raw ->> '_internal_user_id')::uuid;
  ELSE
    v_effective_user_id := auth.uid();
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
  END IF;

  v_idempotency := COALESCE(checkout_id_param::text, gen_random_uuid()::text);

  SELECT id INTO new_order_id
  FROM public.orders
  WHERE idempotency_key = v_idempotency;

  IF FOUND THEN
    RETURN new_order_id;
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(items_param::jsonb, '[]'::jsonb))
  LOOP
    v_quantity := GREATEST(COALESCE((item ->> 'quantity')::integer, 1), 1);
    v_item_metadata := COALESCE(item -> 'metadata', '{}'::jsonb);
    v_original_item_id := COALESCE(item ->> 'menu_item_id', '');

    IF v_original_item_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := v_original_item_id::uuid;

      SELECT price, is_available
      INTO v_real_price, v_is_available
      FROM public.menu_items
      WHERE id = v_menu_item_id
        AND restaurant_id = restaurant_id_param;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Article introuvable : %', v_original_item_id;
      END IF;
      IF v_is_available = false THEN
        RAISE EXCEPTION 'Article indisponible : %', v_original_item_id;
      END IF;
    ELSIF COALESCE(v_item_metadata ->> 'anti_waste_offer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;

      UPDATE public.anti_waste_offers
      SET quantity_available = quantity_available - v_quantity
      WHERE id = (v_item_metadata ->> 'anti_waste_offer_id')::uuid
        AND restaurant_id = restaurant_id_param
        AND is_active = true
        AND quantity_available >= v_quantity
      RETURNING discounted_price INTO v_real_price;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Stock anti-gaspi insuffisant ou offre indisponible.';
      END IF;
    ELSIF COALESCE(v_item_metadata ->> 'flash_sale_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_menu_item_id := NULL;

      UPDATE public.flash_sales
      SET quantity_available = quantity_available - v_quantity
      WHERE id = (v_item_metadata ->> 'flash_sale_id')::uuid
        AND restaurant_id = restaurant_id_param
        AND is_active = true
        AND quantity_available >= v_quantity
      RETURNING discounted_price INTO v_real_price;

      IF v_real_price IS NULL THEN
        RAISE EXCEPTION 'Stock vente flash insuffisant ou offre indisponible.';
      END IF;
    ELSIF v_original_item_id = 'garantie-qualite-fee' THEN
      v_has_quality_fee := true;
      CONTINUE;
    ELSE
      RAISE EXCEPTION 'Article invalide detecte : %', v_original_item_id;
    END IF;

    v_real_price := ROUND(COALESCE(v_real_price, 0)::numeric, 2);
    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_menu_item_id,
        'restaurant_id', restaurant_id_param,
        'quantity', v_quantity,
        'unit_price', v_real_price,
        'total_price', ROUND((v_real_price * v_quantity)::numeric, 2),
        'metadata', v_item_metadata || jsonb_build_object('original_item_id', v_original_item_id)
      )
    );
  END LOOP;

  IF v_has_quality_fee OR lower(COALESCE(v_metadata ->> 'quality_guarantee', 'false')) IN ('true', '1', 'yes') THEN
    v_quality_fee := 1.50;
  END IF;

  v_original_total := ROUND((
    COALESCE((
      SELECT SUM(COALESCE((validated_item ->> 'total_price')::numeric, 0))
      FROM jsonb_array_elements(v_validated_items) AS validated_item
    ), 0) + v_delivery_fee + v_quality_fee
  )::numeric, 2);

  INSERT INTO public.orders (
    user_id,
    restaurant_id,
    delivery_address,
    total_amount,
    delivery_fee,
    notes,
    metadata,
    checkout_id,
    idempotency_key,
    original_total,
    discount_amount
  )
  VALUES (
    v_effective_user_id,
    restaurant_id_param,
    delivery_address_param,
    v_original_total,
    v_delivery_fee,
    notes_param,
    v_metadata,
    checkout_id_param,
    v_idempotency,
    v_original_total,
    0
  )
  RETURNING id INTO new_order_id;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      restaurant_id,
      quantity,
      unit_price,
      total_price,
      metadata
    )
    VALUES (
      new_order_id,
      NULLIF(item ->> 'menu_item_id', '')::uuid,
      (item ->> 'restaurant_id')::uuid,
      COALESCE((item ->> 'quantity')::integer, 1),
      COALESCE((item ->> 'unit_price')::numeric, 0),
      COALESCE((item ->> 'total_price')::numeric, 0),
      COALESCE(item -> 'metadata', '{}'::jsonb)
    );
  END LOOP;

  RETURN new_order_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, numeric, numeric, text, json, json, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(text, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid, text, text, text, text, json) TO service_role;

REVOKE EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.queue_notification_deliveries(uuid, uuid, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_topic_notification(text, text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_monthly_invoices(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_invoices(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_invoices(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices(text) TO service_role;

DROP POLICY IF EXISTS "Restaurant owners can manage invoices" ON public.restaurant_invoices;
DROP POLICY IF EXISTS "restaurant_invoices_owner_all" ON public.restaurant_invoices;
DROP POLICY IF EXISTS "Admins can manage invoices" ON public.restaurant_invoices;
DROP POLICY IF EXISTS "restaurant_invoices_admin_all" ON public.restaurant_invoices;

CREATE POLICY "restaurant_invoices_owner_select"
  ON public.restaurant_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_invoices.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "restaurant_invoices_admin_all"
  ON public.restaurant_invoices
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Restaurant owners can manage ad campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_owner_all" ON public.ad_campaigns;
DROP POLICY IF EXISTS "Admins can manage ad campaigns" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_admin_all" ON public.ad_campaigns;

CREATE POLICY "ad_campaigns_owner_select"
  ON public.ad_campaigns
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_owner_insert"
  ON public.ad_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_owner_update"
  ON public.ad_campaigns
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_owner_delete"
  ON public.ad_campaigns
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = ad_campaigns.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "ad_campaigns_admin_all"
  ON public.ad_campaigns
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_ad_campaign_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.payment_status, 'unpaid') = 'paid' THEN
      RAISE EXCEPTION 'Le statut de paiement est gere cote serveur.';
    END IF;

    IF COALESCE(NEW.total_budget, 0) > 0 AND COALESCE(NEW.status, 'draft') = 'active' THEN
      RAISE EXCEPTION 'Une campagne payante ne peut etre activee sans paiement verifie.';
    END IF;

    NEW.spent := 0;
    NEW.impressions := 0;
    NEW.clicks := 0;
    NEW.conversions := 0;
    NEW.paid_amount := 0;
    NEW.stripe_checkout_session_id := NULL;
    NEW.stripe_payment_intent_id := NULL;
    NEW.activated_at := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
    RAISE EXCEPTION 'Le restaurant de la campagne ne peut pas etre modifie.';
  END IF;

  IF NEW.impressions IS DISTINCT FROM OLD.impressions
    OR NEW.clicks IS DISTINCT FROM OLD.clicks
    OR NEW.conversions IS DISTINCT FROM OLD.conversions
    OR NEW.spent IS DISTINCT FROM OLD.spent
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
    OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
    OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
    OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'Les indicateurs financiers et paiements sont geres cote serveur.';
  END IF;

  IF COALESCE(NEW.total_budget, 0) > 0
    AND COALESCE(NEW.payment_status, OLD.payment_status, 'unpaid') <> 'paid'
    AND COALESCE(NEW.status, 'draft') = 'active' THEN
    RAISE EXCEPTION 'Une campagne payante ne peut etre activee sans paiement verifie.';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ad_campaign_client_write ON public.ad_campaigns;
CREATE TRIGGER guard_ad_campaign_client_write
BEFORE INSERT OR UPDATE ON public.ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.guard_ad_campaign_client_write();

NOTIFY pgrst, 'reload schema';

-- === 20260321000000_fix_handle_new_user_role_assignment.sql ===
-- Fix: handle_new_user now assigns the correct role based on signup metadata.
-- Previously, all users received only the 'client' role regardless of their
-- chosen role during signup (e.g., restaurateur).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requested_role text;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Always assign client role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');

  -- If user signed up as restaurateur, also assign that role
  v_requested_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', ''));
  IF v_requested_role = 'restaurateur' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'restaurateur');
  END IF;

  RETURN NEW;
END;
$$;

-- === 20260322000000_add_disabled_payment_methods.sql ===
-- Add disabled_payment_methods column to restaurants
-- Stores an array of payment method IDs that the restaurant has disabled
-- e.g. ['twint', 'postfinance_card']
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS disabled_payment_methods text[] DEFAULT '{}';

-- === 20260322100000_campaign_pool_delivery.sql ===
-- ============================================================
-- Migration: Campaign Pool Delivery System
-- Adds CPM-based budget consumption, daily spend tracking,
-- and updates record_ad_campaign_event to debit budget atomically
-- ============================================================

-- 1. Add new columns to ad_campaigns
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS cpm_rate numeric NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS daily_spent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_spent_date date NOT NULL DEFAULT CURRENT_DATE;

COMMENT ON COLUMN public.ad_campaigns.cpm_rate IS 'Cost per 1000 impressions in CHF';
COMMENT ON COLUMN public.ad_campaigns.daily_spent IS 'Running total of spend for the current day';
COMMENT ON COLUMN public.ad_campaigns.daily_spent_date IS 'Date corresponding to daily_spent; resets when date changes';

-- 2. Update record_ad_campaign_event to debit budget on impression
CREATE OR REPLACE FUNCTION public.record_ad_campaign_event(
  p_campaign_id uuid,
  p_restaurant_id uuid,
  p_event_type text,
  p_dedupe_key text,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_page text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_conversion_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rows integer := 0;
  v_cost numeric := 0;
BEGIN
  IF p_event_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'Invalid campaign event type: %', p_event_type;
  END IF;

  IF p_event_type <> 'conversion' THEN
    p_conversion_type := NULL;
  ELSIF p_conversion_type IS NOT NULL AND p_conversion_type NOT IN ('order', 'reservation', 'zero-attente') THEN
    RAISE EXCEPTION 'Invalid conversion type: %', p_conversion_type;
  END IF;

  INSERT INTO public.ad_campaign_events (
    campaign_id,
    restaurant_id,
    event_type,
    conversion_type,
    user_id,
    dedupe_key,
    source,
    page,
    payload
  )
  VALUES (
    p_campaign_id,
    p_restaurant_id,
    p_event_type,
    p_conversion_type,
    p_user_id,
    p_dedupe_key,
    p_source,
    p_page,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (campaign_id, event_type, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  -- Compute impression cost (CPM model)
  IF p_event_type = 'impression' THEN
    SELECT ROUND(COALESCE(cpm_rate, 5.00) / 1000.0, 6)
    INTO v_cost
    FROM public.ad_campaigns
    WHERE id = p_campaign_id;
  END IF;

  UPDATE public.ad_campaigns
  SET
    impressions = COALESCE(impressions, 0) + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
    clicks = COALESCE(clicks, 0) + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
    conversions = COALESCE(conversions, 0) + CASE WHEN p_event_type = 'conversion' THEN 1 ELSE 0 END,
    spent = COALESCE(spent, 0) + v_cost,
    daily_spent = CASE
      WHEN daily_spent_date <> CURRENT_DATE THEN v_cost
      ELSE COALESCE(daily_spent, 0) + v_cost
    END,
    daily_spent_date = CURRENT_DATE,
    updated_at = now()
  WHERE id = p_campaign_id
    AND restaurant_id = p_restaurant_id;

  RETURN true;
END;
$function$;

-- Maintain existing permissions
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_event(uuid, uuid, text, text, uuid, text, text, jsonb, text) TO service_role;

-- === 20260323000000_secure_feature_flags_admin.sql ===
-- Secure feature flag management: server-side RPC with RBAC + audit trail.

-- 1. Audit trigger: log every change to feature_flags in audit_log
CREATE OR REPLACE FUNCTION public.log_feature_flag_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    auth.uid(),
    TG_OP,
    'feature_flag',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flag_audit ON public.feature_flags;
CREATE TRIGGER trg_feature_flag_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.log_feature_flag_audit();

-- 2. Server-side RPC to toggle a single feature flag (admin-only)
CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(
  p_flag_name text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag record;
BEGIN
  -- RBAC check
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  -- Upsert the flag
  UPDATE public.feature_flags
  SET is_active = p_is_active,
      updated_at = now()
  WHERE name = p_flag_name
  RETURNING id, name, is_active INTO v_flag;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feature flag "%" not found.', p_flag_name;
  END IF;

  -- Cascade: disabling "livraison" also disables "commandes"
  IF p_flag_name = 'livraison' AND NOT p_is_active THEN
    UPDATE public.feature_flags
    SET is_active = false, updated_at = now()
    WHERE name = 'commandes' AND is_active = true;
  END IF;

  RETURN jsonb_build_object(
    'id', v_flag.id,
    'name', v_flag.name,
    'is_active', v_flag.is_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean) TO authenticated;

-- 3. Server-side RPC to activate all feature flags (admin-only)
CREATE OR REPLACE FUNCTION public.admin_activate_all_feature_flags()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  UPDATE public.feature_flags
  SET is_active = true, updated_at = now()
  WHERE is_active = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_all_feature_flags() TO authenticated;

-- 4. Server-side RPC to seed missing default flags (admin-only)
CREATE OR REPLACE FUNCTION public.admin_seed_default_flags(
  p_flags jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  FOR v_flag IN SELECT * FROM jsonb_array_elements(p_flags)
  LOOP
    INSERT INTO public.feature_flags (name, label, description, is_active)
    VALUES (
      v_flag ->> 'name',
      v_flag ->> 'label',
      v_flag ->> 'description',
      COALESCE((v_flag ->> 'is_active')::boolean, true)
    )
    ON CONFLICT (name) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_seed_default_flags(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

