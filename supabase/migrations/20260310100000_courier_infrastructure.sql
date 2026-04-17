-- =============================================================
-- PHASE 1: Courier Infrastructure
-- Adds courier system tables, dispatch, earnings, and RLS
-- =============================================================

-- Step 1: Extend app_role enum with 'courier'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'courier';

-- Step 2: Create couriers table
CREATE TABLE IF NOT EXISTS public.couriers (
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
CREATE TABLE IF NOT EXISTS public.courier_documents (
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
CREATE TABLE IF NOT EXISTS public.courier_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  zone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 5: Create courier_locations table (high-frequency GPS tracking)
CREATE TABLE IF NOT EXISTS public.courier_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  speed double precision,
  accuracy double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_locations_recent
  ON public.courier_locations (courier_id, recorded_at DESC);

-- Step 6: Create dispatch_jobs table
CREATE TABLE IF NOT EXISTS public.dispatch_jobs (
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

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_order ON public.dispatch_jobs (order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_courier ON public.dispatch_jobs (courier_id, status);

-- Step 7: Create dispatch_attempts table
CREATE TABLE IF NOT EXISTS public.dispatch_attempts (
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

CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_job ON public.dispatch_attempts (dispatch_job_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_attempts_courier ON public.dispatch_attempts (courier_id, status);

-- Step 8: Create courier_earnings table
CREATE TABLE IF NOT EXISTS public.courier_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL
    CHECK (type IN ('delivery', 'tip', 'bonus', 'payout', 'adjustment', 'penalty')),
  description text,
  dispatch_job_id uuid REFERENCES public.dispatch_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_earnings_courier ON public.courier_earnings (courier_id, created_at DESC);

-- Step 9: Add courier_id and scheduled_at to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.couriers(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Step 10: Create payment_transactions table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
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

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON public.payment_transactions (order_id);

-- Step 11: Create user_wallets table
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'chf',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 12: Create conversations & messages tables
CREATE TABLE IF NOT EXISTS public.conversations (
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

CREATE INDEX IF NOT EXISTS idx_conversations_order ON public.conversations (order_id);

CREATE TABLE IF NOT EXISTS public.messages (
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

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id, created_at);

-- Step 13: Create promo_codes tables
CREATE TABLE IF NOT EXISTS public.promo_codes (
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

CREATE TABLE IF NOT EXISTS public.promo_code_uses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  discount_applied numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 14: Create referral_codes table
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  reward_referrer integer DEFAULT 500,
  reward_referee integer DEFAULT 300,
  total_referrals integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 15: Create support_tickets tables
CREATE TABLE IF NOT EXISTS public.support_tickets (
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

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_internal boolean DEFAULT false,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages (ticket_id, created_at);

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

DROP TRIGGER IF EXISTS trg_restaurants_search_vector ON public.restaurants;

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

DROP POLICY IF EXISTS "couriers_own_profile_select" ON public.couriers;
CREATE POLICY "couriers_own_profile_select" ON public.couriers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "couriers_own_profile_insert" ON public.couriers;
CREATE POLICY "couriers_own_profile_insert" ON public.couriers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "couriers_own_profile_update" ON public.couriers;
CREATE POLICY "couriers_own_profile_update" ON public.couriers
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "couriers_admin_all" ON public.couriers;
CREATE POLICY "couriers_admin_all" ON public.couriers
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
-- Clients can see courier basic info for their active orders
DROP POLICY IF EXISTS "couriers_client_active_order" ON public.couriers;
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

DROP POLICY IF EXISTS "courier_docs_own" ON public.courier_documents;
CREATE POLICY "courier_docs_own" ON public.courier_documents
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_documents.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "courier_docs_admin" ON public.courier_documents;
CREATE POLICY "courier_docs_admin" ON public.courier_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier shifts
ALTER TABLE public.courier_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_shifts_own" ON public.courier_shifts;
CREATE POLICY "courier_shifts_own" ON public.courier_shifts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_shifts.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "courier_shifts_admin" ON public.courier_shifts;
CREATE POLICY "courier_shifts_admin" ON public.courier_shifts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier locations
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_locations_own_insert" ON public.courier_locations;
CREATE POLICY "courier_locations_own_insert" ON public.courier_locations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_locations.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "courier_locations_own_select" ON public.courier_locations;
CREATE POLICY "courier_locations_own_select" ON public.courier_locations
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_locations.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "courier_locations_client_active" ON public.courier_locations;
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
DROP POLICY IF EXISTS "courier_locations_admin" ON public.courier_locations;
CREATE POLICY "courier_locations_admin" ON public.courier_locations
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch jobs
ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_jobs_courier_select" ON public.dispatch_jobs;
CREATE POLICY "dispatch_jobs_courier_select" ON public.dispatch_jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "dispatch_jobs_courier_update" ON public.dispatch_jobs;
CREATE POLICY "dispatch_jobs_courier_update" ON public.dispatch_jobs
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "dispatch_jobs_client_select" ON public.dispatch_jobs;
CREATE POLICY "dispatch_jobs_client_select" ON public.dispatch_jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = dispatch_jobs.order_id AND o.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "dispatch_jobs_admin" ON public.dispatch_jobs;
CREATE POLICY "dispatch_jobs_admin" ON public.dispatch_jobs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch attempts
ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_attempts_courier" ON public.dispatch_attempts;
CREATE POLICY "dispatch_attempts_courier" ON public.dispatch_attempts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_attempts.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "dispatch_attempts_admin" ON public.dispatch_attempts;
CREATE POLICY "dispatch_attempts_admin" ON public.dispatch_attempts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier earnings
ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_earnings_own" ON public.courier_earnings;
CREATE POLICY "courier_earnings_own" ON public.courier_earnings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_earnings.courier_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "courier_earnings_admin" ON public.courier_earnings;
CREATE POLICY "courier_earnings_admin" ON public.courier_earnings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Payment transactions
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_transactions_own" ON public.payment_transactions;
CREATE POLICY "payment_transactions_own" ON public.payment_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "payment_transactions_admin" ON public.payment_transactions;
CREATE POLICY "payment_transactions_admin" ON public.payment_transactions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User wallets
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_own" ON public.user_wallets;
CREATE POLICY "wallets_own" ON public.user_wallets
  FOR ALL TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "wallets_admin" ON public.user_wallets;
CREATE POLICY "wallets_admin" ON public.user_wallets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_participant" ON public.conversations;
CREATE POLICY "conversations_participant" ON public.conversations
  FOR ALL TO authenticated USING (auth.uid() = ANY(participant_ids));
DROP POLICY IF EXISTS "conversations_admin" ON public.conversations;
CREATE POLICY "conversations_admin" ON public.conversations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_participant" ON public.messages;
CREATE POLICY "messages_participant" ON public.messages
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND auth.uid() = ANY(c.participant_ids)
    )
  );
DROP POLICY IF EXISTS "messages_admin" ON public.messages;
CREATE POLICY "messages_admin" ON public.messages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Promo codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_codes_public_read" ON public.promo_codes;
CREATE POLICY "promo_codes_public_read" ON public.promo_codes
  FOR SELECT TO authenticated USING (is_active = true);
DROP POLICY IF EXISTS "promo_codes_admin" ON public.promo_codes;
CREATE POLICY "promo_codes_admin" ON public.promo_codes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "promo_codes_restaurant" ON public.promo_codes;
CREATE POLICY "promo_codes_restaurant" ON public.promo_codes
  FOR ALL TO authenticated USING (
    restaurant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurants r WHERE r.id = promo_codes.restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- Promo code uses
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_uses_own" ON public.promo_code_uses;
CREATE POLICY "promo_uses_own" ON public.promo_code_uses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "promo_uses_admin" ON public.promo_code_uses;
CREATE POLICY "promo_uses_admin" ON public.promo_code_uses
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Referral codes
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_own" ON public.referral_codes;
CREATE POLICY "referral_own" ON public.referral_codes
  FOR ALL TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "referral_public_read" ON public.referral_codes;
CREATE POLICY "referral_public_read" ON public.referral_codes
  FOR SELECT TO authenticated USING (true);

-- Support tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_own" ON public.support_tickets;
CREATE POLICY "support_tickets_own" ON public.support_tickets
  FOR ALL TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "support_tickets_admin" ON public.support_tickets;
CREATE POLICY "support_tickets_admin" ON public.support_tickets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Support messages
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_messages_own" ON public.support_messages;
CREATE POLICY "support_messages_own" ON public.support_messages
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "support_messages_admin" ON public.support_messages;
CREATE POLICY "support_messages_admin" ON public.support_messages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- ENABLE REALTIME on critical tables
-- =============================================================
DO $$
DECLARE
  realtime_table text;
BEGIN
  FOREACH realtime_table IN ARRAY ARRAY[
    'orders',
    'delivery_tracking',
    'dispatch_jobs',
    'dispatch_attempts',
    'messages',
    'notifications'
  ]
  LOOP
    IF to_regclass(format('public.%s', realtime_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = realtime_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
    END IF;
  END LOOP;
END
$$;
