
-- Step 9: Add columns to orders
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
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_transactions_order ON public.payment_transactions (order_id);

-- Step 11: Create user_wallets table
CREATE TABLE public.user_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'chf',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 12: Conversations & messages
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id),
  type text NOT NULL DEFAULT 'order',
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_order ON public.conversations (order_id);

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at);

-- Step 13: Promo codes
CREATE TABLE public.promo_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  type text NOT NULL,
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

-- Step 14: Referral codes
CREATE TABLE public.referral_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  reward_referrer integer DEFAULT 500,
  reward_referee integer DEFAULT 300,
  total_referrals integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 15: Support tickets
CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  subject text NOT NULL,
  description text,
  assigned_to uuid,
  resolution_type text,
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

-- Step 16: Add columns to restaurants
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0.15;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS avg_prep_time_min integer DEFAULT 20;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS supports_scheduled boolean DEFAULT false;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS supports_pickup boolean DEFAULT false;

-- Step 17: Full-text search
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS idx_restaurants_search ON public.restaurants USING GIN(search_vector);

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

UPDATE public.restaurants SET search_vector = to_tsvector('french',
  coalesce(name, '') || ' ' || coalesce(description, '') || ' ' ||
  coalesce(cuisine_type, '') || ' ' || coalesce(city, '') || ' ' || coalesce(address, '')
);
