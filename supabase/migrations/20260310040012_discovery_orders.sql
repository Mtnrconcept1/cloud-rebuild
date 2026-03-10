-- Migration: Discovery & Orders
-- Adds structures for restaurant discovery, search logs, and an exhaustive order state machine.

-- 1. Discovery & Search Tables
CREATE TABLE IF NOT EXISTS public.cuisines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    icon_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_cuisines (
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    cuisine_id UUID REFERENCES public.cuisines(id) ON DELETE CASCADE,
    PRIMARY KEY(restaurant_id, cuisine_id)
);

CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.collection_restaurants (
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY(collection_id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    search_query TEXT NOT NULL,
    location_lat DOUBLE PRECISION,
    location_lng DOUBLE PRECISION,
    results_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- 'restaurant', 'dish', 'collection', 'ad'
    entity_id UUID NOT NULL,
    source TEXT, -- 'search', 'home', 'category'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    impression_id UUID REFERENCES public.impressions(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: 'favorites' table exists from our analysis.

-- 2. Cart & Checkout
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
    session_id TEXT, -- For guest checkouts before login
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.restaurant_branches(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active', -- 'active', 'abandoned', 'converted'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cart_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_item_id UUID NOT NULL REFERENCES public.cart_items(id) ON DELETE CASCADE,
    modifier_option_id UUID NOT NULL REFERENCES public.dish_modifier_options(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL
);

-- 3. Enhance existing orders table
DO $$
BEGIN
    BEGIN ALTER TABLE public.orders ADD COLUMN branch_id UUID REFERENCES public.restaurant_branches(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN type TEXT DEFAULT 'delivery'; EXCEPTION WHEN duplicate_column THEN END; -- 'delivery', 'pickup', 'dinein'
    BEGIN ALTER TABLE public.orders ADD COLUMN source TEXT DEFAULT 'app'; EXCEPTION WHEN duplicate_column THEN END; -- 'app', 'web', 'admin', 'pos'
    BEGIN ALTER TABLE public.orders ADD COLUMN scheduled_for TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN subtotal_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN discount_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN delivery_fee_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN service_fee_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN tax_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN tip_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN currency TEXT DEFAULT 'EUR'; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN payment_status TEXT DEFAULT 'pending'; EXCEPTION WHEN duplicate_column THEN END; -- 'pending', 'authorized', 'captured', 'failed', 'refunded'
    BEGIN ALTER TABLE public.orders ADD COLUMN fulfillment_status TEXT DEFAULT 'pending'; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN cancellation_reason TEXT; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN ready_at TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN picked_up_at TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.orders ADD COLUMN delivered_at TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- 4. Order Details Tables
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    dish_id UUID REFERENCES public.dishes(id) ON DELETE SET NULL,
    name TEXT NOT NULL, -- snapshot of dish name
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    special_instructions TEXT
);

CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    modifier_option_id UUID REFERENCES public.dish_modifier_options(id) ON DELETE SET NULL,
    name TEXT NOT NULL, -- snapshot of modifier name
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'pickup', 'delivery'
    address_line_1 TEXT NOT NULL,
    address_line_2 TEXT,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    delivery_instructions TEXT,
    access_code TEXT
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Order fees breakdown mapping
CREATE TABLE IF NOT EXISTS public.order_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    fee_type TEXT NOT NULL, -- 'small_order', 'surge', 'service'
    amount NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_taxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    tax_name TEXT NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author_type TEXT NOT NULL, -- 'user', 'restaurant', 'courier', 'support'
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Event Sourcing / Hooks logging for core domain
CREATE TABLE IF NOT EXISTS public.order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g., 'payment_authorized', 'courier_assigned'
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reporter_type TEXT NOT NULL,
    issue_type TEXT NOT NULL, -- 'missing_item', 'late_delivery', 'damaged'
    description TEXT,
    status TEXT DEFAULT 'open', -- 'open', 'resolved', 'closed'
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES public.order_issues(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_search_logs_user_id ON public.search_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON public.order_events(order_id);
