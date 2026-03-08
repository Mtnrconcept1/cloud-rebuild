
-- Remaining tables batch 2

CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  quality_rating integer NOT NULL,
  service_rating integer NOT NULL,
  speed_rating integer NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, restaurant_id)
);

CREATE TABLE public.reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  date date NOT NULL,
  time time NOT NULL,
  party_size integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  feature text NOT NULL DEFAULT 'standard',
  preorder_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  order_reference text,
  checkout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) UNIQUE,
  status text NOT NULL DEFAULT 'preparing',
  driver_name text,
  driver_phone text,
  restaurant_lat double precision,
  restaurant_lng double precision,
  delivery_lat double precision,
  delivery_lng double precision,
  current_lat double precision,
  current_lng double precision,
  estimated_arrival timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  enabled boolean NOT NULL DEFAULT true,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

CREATE TABLE public.feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.anti_waste_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  offer_type text NOT NULL DEFAULT 'regular',
  original_price numeric NOT NULL,
  discounted_price numeric NOT NULL,
  quantity_available integer NOT NULL DEFAULT 1,
  pickup_start time NOT NULL,
  pickup_end time NOT NULL,
  available_date date NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.flash_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  original_price numeric NOT NULL,
  discounted_price numeric NOT NULL,
  quantity_available integer NOT NULL DEFAULT 1,
  sale_date date NOT NULL,
  sale_start time NOT NULL,
  sale_end time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  delivery_available boolean NOT NULL DEFAULT true,
  takeaway_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK for order_items.anti_waste_offer_id
ALTER TABLE public.order_items 
  ADD CONSTRAINT order_items_anti_waste_offer_id_fkey 
  FOREIGN KEY (anti_waste_offer_id) REFERENCES public.anti_waste_offers(id);
