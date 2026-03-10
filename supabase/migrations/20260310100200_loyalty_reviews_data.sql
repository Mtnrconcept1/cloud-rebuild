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
