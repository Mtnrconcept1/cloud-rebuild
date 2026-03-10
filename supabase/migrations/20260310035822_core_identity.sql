-- Migration: Core Identity & Users
-- This migration sets up the fundamental identity and user-related tables for the Miamz architecture.

-- 1. user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT,
    avatar_url TEXT,
    date_of_birth DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. user_addresses
CREATE TABLE IF NOT EXISTS public.user_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    label TEXT, -- e.g., 'Home', 'Work'
    address_line_1 TEXT NOT NULL,
    address_line_2 TEXT,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    delivery_instructions TEXT,
    access_code TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. user_payment_methods
CREATE TABLE IF NOT EXISTS public.user_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- e.g., 'stripe', 'paypal', 'twint'
    provider_payment_method_id TEXT NOT NULL,
    card_brand TEXT,
    card_last4 TEXT,
    expiry_month INTEGER,
    expiry_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: user_devices mapping for mobile tokens and sessions
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_type TEXT, -- 'ios', 'android', 'web'
    os_version TEXT,
    app_version TEXT,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, device_id)
);

-- 4. user_preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    dietary_requirements TEXT[], -- ['vegan', 'halal']
    favorite_cuisines TEXT[],
    max_delivery_fee NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. user_notification_settings
CREATE TABLE IF NOT EXISTS public.user_notification_settings (
    user_id UUID PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    order_updates_push BOOLEAN DEFAULT true,
    order_updates_sms BOOLEAN DEFAULT false,
    promotional_emails BOOLEAN DEFAULT true,
    promotional_push BOOLEAN DEFAULT true,
    newsletter BOOLEAN DEFAULT true,
    flash_sales_alerts BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. user_wallets
CREATE TABLE IF NOT EXISTS public.user_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    balance NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    type TEXT NOT NULL, -- 'credit', 'debit'
    description TEXT,
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. user_referrals
CREATE TABLE IF NOT EXISTS public.user_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    referred_id UUID UNIQUE REFERENCES public.user_profiles(user_id) ON DELETE SET NULL,
    referral_code TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed'
    reward_amount NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 8. user_subscription_plans
CREATE TABLE IF NOT EXISTS public.user_subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g., 'Miamz+'
    description TEXT,
    price_monthly NUMERIC(10, 2) NOT NULL,
    price_yearly NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    free_delivery_min_order NUMERIC(10, 2),
    status TEXT DEFAULT 'active', -- 'active', 'archived'
    stripe_product_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. user_subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.user_subscription_plans(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' NOT NULL, -- 'active', 'canceled', 'past_due'
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT false,
    stripe_subscription_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON public.user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id ON public.user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer_id ON public.user_referrals(referrer_id);
