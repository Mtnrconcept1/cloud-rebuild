-- Migration: Restaurant & Catalog
-- Adds comprehensive restaurant operational models and deep catalog structures.

-- 1. Alter existing 'restaurants' table via ADD COLUMN IF NOT EXISTS logic
-- Since PostgreSQL doesn't have an easy IF NOT EXISTS for multiple columns out of the box until v13+, we'll do them individually or safely.
DO $$
BEGIN
    BEGIN ALTER TABLE public.restaurants ADD COLUMN legal_name TEXT; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN status TEXT DEFAULT 'active'; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN avg_rating NUMERIC(3, 2) DEFAULT 0.0; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN rating_count INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN min_order_amount NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN base_delivery_fee NUMERIC(10, 2) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN avg_prep_time_min INTEGER; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN avg_delivery_time_min INTEGER; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN is_featured BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN supports_pickup BOOLEAN DEFAULT true; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN supports_dinein BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN supports_reservation BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN supports_scheduled_orders BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN END;
    BEGIN ALTER TABLE public.restaurants ADD COLUMN supports_group_orders BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- 2. Restaurant Operational Tables
CREATE TABLE IF NOT EXISTS public.restaurant_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    phone_number TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.restaurant_service_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    polygon_geojson JSONB NOT NULL,
    max_delivery_radius_km NUMERIC(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_delivery_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    min_distance_km NUMERIC(5, 2),
    max_distance_km NUMERIC(5, 2),
    fee_amount NUMERIC(10, 2) NOT NULL,
    free_delivery_threshold NUMERIC(10, 2)
);

CREATE TABLE IF NOT EXISTS public.restaurant_payout_settings (
    restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    stripe_account_id TEXT,
    payout_schedule TEXT DEFAULT 'weekly',
    commission_rate NUMERIC(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- 'kbis', 'id_card', 'hygiene_certificate'
    file_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- assuming staff are users too
    role TEXT NOT NULL, -- 'owner', 'manager', 'chef'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
    restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    auto_accept_orders BOOLEAN DEFAULT false,
    print_orders_automatically BOOLEAN DEFAULT false,
    pos_integration_provider TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Catalog & Menu Tables
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

-- Note: the system might already have 'menu_items'. We define 'dishes' as the modern replacement mapping
CREATE TABLE IF NOT EXISTS public.dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT true,
    is_popular BOOLEAN DEFAULT false,
    preparation_time_min INTEGER,
    calories INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dish_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Small', 'Large'
    price NUMERIC(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.dish_modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Choose your sauce'
    is_required BOOLEAN DEFAULT false,
    min_selections INTEGER DEFAULT 0,
    max_selections INTEGER,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.dish_modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.dish_modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_adjustment NUMERIC(10, 2) DEFAULT 0.00,
    is_available BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.dish_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.dish_tags (
    dish_id UUID REFERENCES public.dishes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL, -- e.g., 'spicy', 'vegan', 'halal'
    PRIMARY KEY(dish_id, tag)
);

CREATE TABLE IF NOT EXISTS public.allergens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    icon_url TEXT
);

CREATE TABLE IF NOT EXISTS public.dish_allergens (
    dish_id UUID REFERENCES public.dishes(id) ON DELETE CASCADE,
    allergen_id UUID REFERENCES public.allergens(id) ON DELETE CASCADE,
    PRIMARY KEY(dish_id, allergen_id)
);

CREATE TABLE IF NOT EXISTS public.dish_availability_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
    dish_id UUID REFERENCES public.dishes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    is_managed BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    quantity_change INTEGER NOT NULL,
    reason TEXT NOT NULL, -- 'sale', 'restock', 'waste'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_restaurant_branches_restaurant_id ON public.restaurant_branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_branch_id ON public.menu_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_dishes_menu_category_id ON public.dishes(menu_category_id);
CREATE INDEX IF NOT EXISTS idx_dish_modifier_groups_dish_id ON public.dish_modifier_groups(dish_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch_id ON public.inventory_items(branch_id);
