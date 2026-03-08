
-- Remaining tables batch 3

CREATE TABLE public.chef_table_drops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES public.restaurants(id),
  dish_name text NOT NULL,
  chef_name text NOT NULL,
  description text,
  image_url text,
  price numeric NOT NULL,
  original_price numeric,
  total_portions integer NOT NULL,
  remaining_portions integer NOT NULL,
  drop_time timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.gift_points (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  recipient_email text NOT NULL,
  recipient_id uuid,
  points_amount integer NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  claim_code text DEFAULT encode(gen_random_bytes(6), 'hex'),
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  creator_id uuid NOT NULL,
  area text NOT NULL,
  time_slot text NOT NULL,
  max_members integer DEFAULT 6,
  discount_percentage numeric DEFAULT 25.0,
  is_active boolean DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.order_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  transaction_type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.meal_formulas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  formula_key text NOT NULL,
  discount_percent integer NOT NULL,
  applies_to text NOT NULL,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.meal_formula_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  formula_id uuid NOT NULL REFERENCES public.meal_formulas(id) ON DELETE CASCADE,
  category text NOT NULL,
  course_order integer NOT NULL DEFAULT 1
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  category text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  channels jsonb NOT NULL DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  target_roles text[] NOT NULL DEFAULT '{}',
  target_cities text[] NOT NULL DEFAULT '{}',
  image_url text,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  target text,
  provider text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL PRIMARY KEY,
  channels jsonb NOT NULL DEFAULT '{"push": true, "email": true, "in_app": true}'::jsonb,
  categories jsonb NOT NULL DEFAULT '{"system": true, "product": true, "marketing": false, "transactional": true}'::jsonb,
  quiet_hours jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  topic text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.solidarity_donations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  points_amount integer NOT NULL,
  meals_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id),
  city text,
  cuisine_type text,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  dietary_tags text[],
  max_budget numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id),
  menu_item_id uuid REFERENCES public.menu_items(id),
  day_of_week text NOT NULL,
  preferred_time text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ad_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  image_url text,
  status text DEFAULT 'draft',
  target_pages jsonb DEFAULT '[]'::jsonb,
  target_criteria jsonb DEFAULT '{}'::jsonb,
  channels jsonb DEFAULT '{}'::jsonb,
  budget_daily numeric DEFAULT 0,
  total_budget numeric DEFAULT 0,
  spent numeric DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  scheduled_at timestamptz,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.restaurant_daily_kpis (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  kpi_date date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  reservations_count integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  avg_ticket numeric NOT NULL DEFAULT 0,
  cancel_rate numeric NOT NULL DEFAULT 0,
  reviews_count integer NOT NULL DEFAULT 0,
  satisfaction_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, kpi_date)
);

CREATE TABLE public.restaurant_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_ht numeric NOT NULL DEFAULT 0,
  amount_tva numeric NOT NULL DEFAULT 0,
  amount_ttc numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  pdf_url text,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_media (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'photo',
  alt_text text,
  is_cover boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_promotions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  promotion_type text NOT NULL,
  promotion_value numeric NOT NULL,
  target text NOT NULL DEFAULT 'all',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  recommendation_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'pending',
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
