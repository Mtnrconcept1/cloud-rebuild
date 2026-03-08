
-- Step 1: Create enums
CREATE TYPE public.app_role AS ENUM ('client', 'restaurateur', 'admin');
CREATE TYPE public.loyalty_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- Step 2: Create profiles table (referenced by orders)
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name text,
  avatar_url text,
  phone text,
  address text,
  city text,
  loyalty_points integer DEFAULT 0,
  current_tier loyalty_tier DEFAULT 'bronze',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 3: Create user_roles table
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'client',
  UNIQUE(user_id, role)
);

-- Step 4: Create restaurants table
CREATE TABLE public.restaurants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  cuisine_type text,
  address text NOT NULL,
  city text NOT NULL,
  phone text,
  image_url text,
  rating numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  price_range integer DEFAULT 2,
  is_active boolean DEFAULT true,
  opening_hours jsonb,
  delivery_available boolean DEFAULT false,
  delivery_fee numeric DEFAULT 0,
  min_order_amount numeric DEFAULT 0,
  latitude double precision,
  longitude double precision,
  points_multiplier numeric DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 5: Create menu_items table
CREATE TABLE public.menu_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  category text,
  image_url text,
  is_available boolean DEFAULT true,
  is_exclusive boolean DEFAULT false,
  exclusive_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 6: Create orders table
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  delivery_address text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  original_total numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  delivery_fee numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  order_number text,
  checkout_id uuid,
  donate_earned_xp boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK from orders.user_id to profiles.user_id
ALTER TABLE public.orders ADD CONSTRAINT orders_user_id_fkey_profiles 
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);

-- Step 7: Create order_items table
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id),
  restaurant_id uuid REFERENCES public.restaurants(id),
  anti_waste_offer_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);
