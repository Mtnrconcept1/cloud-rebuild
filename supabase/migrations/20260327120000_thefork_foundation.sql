-- Foundation hardening for reservation-led marketplace flows.
-- This migration:
-- - secures Stripe webhook event persistence
-- - introduces reservation v2 entities and guest CRM primitives
-- - makes review submission server-authoritative
-- - adds support ticket metadata needed by restaurant owners

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'processing',
  attempts integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.support_tickets
      ADD COLUMN restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.support_tickets
      ADD COLUMN source text NOT NULL DEFAULT 'web';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.support_messages
      ADD COLUMN sender_role text NOT NULL DEFAULT 'customer';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_restaurant_id
  ON public.support_tickets(restaurant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.service_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  service_key text NOT NULL DEFAULT 'dinner',
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  last_booking_time time NOT NULL,
  slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
  turn_time_minutes integer NOT NULL DEFAULT 120 CHECK (turn_time_minutes > 0),
  max_covers_override integer,
  online_booking_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_shifts_restaurant_day
  ON public.service_shifts(restaurant_id, day_of_week, is_active);

CREATE TABLE IF NOT EXISTS public.table_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_zones_restaurant_id
  ON public.table_zones(restaurant_id, sort_order);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'reservation_tables'
  ) THEN
    BEGIN
      ALTER TABLE public.reservation_tables
        ADD COLUMN zone_id uuid REFERENCES public.table_zones(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_column THEN NULL;
    END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.table_combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  table_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  min_capacity integer NOT NULL DEFAULT 1 CHECK (min_capacity > 0),
  max_capacity integer NOT NULL DEFAULT 1 CHECK (max_capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_combinations_restaurant_id
  ON public.table_combinations(restaurant_id, is_active);

CREATE TABLE IF NOT EXISTS public.booking_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  service_key text,
  channel text NOT NULL DEFAULT 'online',
  party_size_min integer NOT NULL DEFAULT 1 CHECK (party_size_min > 0),
  party_size_max integer,
  turn_time_minutes integer NOT NULL DEFAULT 120 CHECK (turn_time_minutes > 0),
  requires_guarantee boolean NOT NULL DEFAULT false,
  requires_deposit boolean NOT NULL DEFAULT false,
  deposit_amount numeric NOT NULL DEFAULT 0,
  no_show_fee numeric NOT NULL DEFAULT 0,
  cancellation_window_hours integer NOT NULL DEFAULT 6,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_policies_restaurant_id
  ON public.booking_policies(restaurant_id, is_active, channel);

CREATE TABLE IF NOT EXISTS public.booking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.service_shifts(id) ON DELETE CASCADE,
  rule_date date,
  rule_type text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_rules_restaurant_date
  ON public.booking_rules(restaurant_id, rule_date, is_active);

CREATE TABLE IF NOT EXISTS public.guest_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  full_name text,
  phone text,
  marketing_consent boolean NOT NULL DEFAULT false,
  total_reservations integer NOT NULL DEFAULT 0,
  total_arrivals integer NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  cancellation_count integer NOT NULL DEFAULT 0,
  average_party_size numeric NOT NULL DEFAULT 0,
  spend_total numeric NOT NULL DEFAULT 0,
  last_source_channel text,
  last_reservation_at timestamptz,
  last_arrival_at timestamptz,
  risk_level text NOT NULL DEFAULT 'low',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_profiles_restaurant_id
  ON public.guest_profiles(restaurant_id, risk_level, last_reservation_at DESC);

CREATE TABLE IF NOT EXISTS public.guest_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_profile_id uuid NOT NULL REFERENCES public.guest_profiles(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guest_profile_id, label)
);

CREATE TABLE IF NOT EXISTS public.guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_profile_id uuid NOT NULL REFERENCES public.guest_profiles(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_by uuid,
  note text NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_profile_id uuid NOT NULL UNIQUE REFERENCES public.guest_profiles(id) ON DELETE CASCADE,
  allergies text[] NOT NULL DEFAULT ARRAY[]::text[],
  seating_preferences text[] NOT NULL DEFAULT ARRAY[]::text[],
  occasions text[] NOT NULL DEFAULT ARRAY[]::text[],
  favorite_items text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guest_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_profile_id uuid NOT NULL REFERENCES public.guest_profiles(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_incidents_profile
  ON public.guest_incidents(guest_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.guest_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_profile_id uuid NOT NULL REFERENCES public.guest_profiles(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  segment_key text NOT NULL,
  source text NOT NULL DEFAULT 'system',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guest_profile_id, segment_key)
);

CREATE TABLE IF NOT EXISTS public.reservation_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.service_shifts(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  guest_profile_id uuid REFERENCES public.guest_profiles(id) ON DELETE SET NULL,
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  party_size integer NOT NULL CHECK (party_size > 0),
  turn_time_minutes integer NOT NULL DEFAULT 120 CHECK (turn_time_minutes > 0),
  source_channel text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'active',
  guarantee_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory_assignment jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_holds_active
  ON public.reservation_holds(restaurant_id, reservation_date, reservation_time, status, expires_at);

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  guest_profile_id uuid REFERENCES public.guest_profiles(id) ON DELETE SET NULL,
  reservation_date date NOT NULL,
  service_key text NOT NULL,
  preferred_time time,
  party_size integer NOT NULL CHECK (party_size > 0),
  status text NOT NULL DEFAULT 'waiting',
  notes text,
  offer_expires_at timestamptz,
  offered_slot_time time,
  hold_id uuid REFERENCES public.reservation_holds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_restaurant_date
  ON public.waitlist_entries(restaurant_id, reservation_date, status);

CREATE TABLE IF NOT EXISTS public.reservation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_profile_id uuid REFERENCES public.guest_profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_events_reservation_id
  ON public.reservation_events(reservation_id, created_at DESC);

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN shift_id uuid REFERENCES public.service_shifts(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN inventory_assignment jsonb NOT NULL DEFAULT '{}'::jsonb;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN turn_time_minutes integer;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN source_channel text NOT NULL DEFAULT 'web';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN guarantee_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN deposit_status text NOT NULL DEFAULT 'not_required';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN risk_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reservations
      ADD COLUMN guest_profile_id uuid REFERENCES public.guest_profiles(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservations_shift_date
  ON public.reservations(restaurant_id, date, time, status);

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.reviews
      ADD COLUMN reservation_id uuid UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reviews
      ADD COLUMN guest_profile_id uuid REFERENCES public.guest_profiles(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reviews
      ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified';
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reviews
      ADD COLUMN verified_visit_at timestamptz;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reviews
      ADD COLUMN confidence_score numeric NOT NULL DEFAULT 0.5;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.reviews
      ADD COLUMN fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
  EXCEPTION
    WHEN duplicate_column THEN NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_booking_policy(
  p_restaurant_id uuid,
  p_party_size integer,
  p_service_key text DEFAULT NULL,
  p_channel text DEFAULT 'online'
)
RETURNS public.booking_policies
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.booking_policies;
BEGIN
  SELECT *
  INTO v_policy
  FROM public.booking_policies
  WHERE restaurant_id = p_restaurant_id
    AND is_active = true
    AND (channel = p_channel OR channel = 'all')
    AND (service_key IS NULL OR lower(service_key) = lower(COALESCE(p_service_key, '')))
    AND party_size_min <= GREATEST(p_party_size, 1)
    AND (party_size_max IS NULL OR party_size_max >= p_party_size)
  ORDER BY
    CASE WHEN lower(COALESCE(service_key, '')) = lower(COALESCE(p_service_key, '')) THEN 0 ELSE 1 END,
    party_size_min DESC,
    created_at ASC
  LIMIT 1;

  RETURN v_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_restaurant_primary_branch_id(p_restaurant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rb.id
  FROM public.restaurant_branches rb
  WHERE rb.restaurant_id = p_restaurant_id
    AND rb.is_active = true
  ORDER BY rb.created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ensure_guest_profile(
  p_restaurant_id uuid,
  p_user_id uuid,
  p_source_channel text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_profile_id uuid;
  v_profile record;
BEGIN
  IF p_restaurant_id IS NULL OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_guest_profile_id
  FROM public.guest_profiles
  WHERE restaurant_id = p_restaurant_id
    AND user_id = p_user_id;

  IF v_guest_profile_id IS NOT NULL THEN
    IF p_source_channel IS NOT NULL THEN
      UPDATE public.guest_profiles
      SET last_source_channel = p_source_channel,
          updated_at = now()
      WHERE id = v_guest_profile_id;
    END IF;
    RETURN v_guest_profile_id;
  END IF;

  SELECT full_name, phone, COALESCE(newsletter, false) AS newsletter
  INTO v_profile
  FROM public.profiles
  WHERE user_id = p_user_id;

  INSERT INTO public.guest_profiles (
    restaurant_id,
    user_id,
    full_name,
    phone,
    marketing_consent,
    last_source_channel
  )
  VALUES (
    p_restaurant_id,
    p_user_id,
    v_profile.full_name,
    v_profile.phone,
    COALESCE(v_profile.newsletter, false),
    p_source_channel
  )
  RETURNING id INTO v_guest_profile_id;

  RETURN v_guest_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_guest_profile_metrics(
  p_restaurant_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_profile_id uuid;
BEGIN
  v_guest_profile_id := public.ensure_guest_profile(p_restaurant_id, p_user_id, NULL);

  IF v_guest_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.guest_profiles gp
  SET
    total_reservations = stats.total_reservations,
    total_arrivals = stats.total_arrivals,
    no_show_count = stats.no_show_count,
    cancellation_count = stats.cancellation_count,
    average_party_size = stats.average_party_size,
    spend_total = stats.spend_total,
    last_reservation_at = stats.last_reservation_at,
    last_arrival_at = stats.last_arrival_at,
    risk_level = stats.risk_level,
    updated_at = now()
  FROM (
    SELECT
      COUNT(*)::integer AS total_reservations,
      COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) = 'arrived')::integer AS total_arrivals,
      COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) = 'no_show')::integer AS no_show_count,
      COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) = 'cancelled')::integer AS cancellation_count,
      COALESCE(AVG(GREATEST(r.party_size, 0)), 0)::numeric AS average_party_size,
      COALESCE(SUM(CASE WHEN lower(COALESCE(r.status, '')) = 'arrived' THEN GREATEST(COALESCE(r.total_amount, 0), 0) ELSE 0 END), 0)::numeric AS spend_total,
      MAX((r.date + r.time)) AS last_reservation_at,
      MAX(CASE WHEN lower(COALESCE(r.status, '')) = 'arrived' THEN (r.date + r.time) ELSE NULL END) AS last_arrival_at,
      CASE
        WHEN COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) = 'no_show') >= 2 THEN 'high'
        WHEN COUNT(*) FILTER (WHERE lower(COALESCE(r.status, '')) IN ('no_show', 'cancelled')) >= 2 THEN 'medium'
        ELSE 'low'
      END AS risk_level
    FROM public.reservations r
    WHERE r.restaurant_id = p_restaurant_id
      AND r.user_id = p_user_id
  ) AS stats
  WHERE gp.id = v_guest_profile_id;

  RETURN v_guest_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.score_guest_risk(
  p_restaurant_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_party_size integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_policy public.booking_policies;
  v_score integer := 0;
  v_level text := 'low';
  v_requires_guarantee boolean := false;
  v_requires_deposit boolean := false;
  v_deposit_amount numeric := 0;
  v_no_show_fee numeric := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'risk_score', 0,
      'risk_level', 'low',
      'requires_guarantee', false,
      'requires_deposit', false,
      'deposit_amount', 0,
      'no_show_fee', 0
    );
  END IF;

  SELECT *
  INTO v_profile
  FROM public.guest_profiles
  WHERE restaurant_id = p_restaurant_id
    AND user_id = p_user_id;

  v_policy := public.resolve_booking_policy(
    p_restaurant_id,
    COALESCE(p_party_size, 2),
    NULL,
    'online'
  );

  IF v_profile.id IS NOT NULL THEN
    v_score := v_score
      + (COALESCE(v_profile.no_show_count, 0) * 45)
      + (COALESCE(v_profile.cancellation_count, 0) * 15)
      - LEAST(COALESCE(v_profile.total_arrivals, 0) * 5, 25);
  END IF;

  IF COALESCE(p_party_size, 0) >= 6 THEN
    v_score := v_score + 15;
  END IF;

  IF v_score >= 60 THEN
    v_level := 'high';
  ELSIF v_score >= 25 THEN
    v_level := 'medium';
  END IF;

  v_requires_guarantee := COALESCE(v_policy.requires_guarantee, false) OR v_level = 'high';
  v_requires_deposit := COALESCE(v_policy.requires_deposit, false) OR (v_level = 'high' AND COALESCE(p_party_size, 0) >= 4);
  v_deposit_amount := GREATEST(COALESCE(v_policy.deposit_amount, 0), CASE WHEN v_requires_deposit THEN 10 ELSE 0 END);
  v_no_show_fee := GREATEST(COALESCE(v_policy.no_show_fee, 0), CASE WHEN v_requires_guarantee THEN 15 ELSE 0 END);

  RETURN jsonb_build_object(
    'risk_score', v_score,
    'risk_level', v_level,
    'requires_guarantee', v_requires_guarantee,
    'requires_deposit', v_requires_deposit,
    'deposit_amount', v_deposit_amount,
    'no_show_fee', v_no_show_fee
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.find_shift_for_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift_id uuid;
  v_dow integer := EXTRACT(DOW FROM p_date);
BEGIN
  SELECT id
  INTO v_shift_id
  FROM public.service_shifts
  WHERE restaurant_id = p_restaurant_id
    AND day_of_week = v_dow
    AND is_active = true
    AND online_booking_enabled = true
    AND p_time BETWEEN start_time AND end_time
  ORDER BY start_time ASC
  LIMIT 1;

  RETURN v_shift_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.quote_reservation_availability(
  p_restaurant_id uuid,
  p_date date,
  p_party_size integer,
  p_channel text DEFAULT 'online'
)
RETURNS TABLE (
  slot_time time,
  shift_id uuid,
  service_key text,
  available boolean,
  reason text,
  capacity_remaining integer,
  requires_guarantee boolean,
  requires_deposit boolean,
  deposit_amount numeric,
  no_show_fee numeric,
  risk_level text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_restaurant record;
  v_shift record;
  v_slot_ts timestamp;
  v_capacity integer;
  v_reserved integer;
  v_held integer;
  v_policy public.booking_policies;
  v_risk jsonb;
  v_shift_count integer := 0;
  v_start_time time;
  v_end_time time;
  v_last_booking_time time;
  v_slot_interval integer;
  v_turn_time integer;
  v_service_key text;
  v_day_of_week integer := EXTRACT(DOW FROM p_date);
BEGIN
  IF p_restaurant_id IS NULL OR p_date IS NULL OR COALESCE(p_party_size, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT opening_hours, owner_id
  INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_branch_id := public.get_restaurant_primary_branch_id(p_restaurant_id);
  v_risk := public.score_guest_risk(p_restaurant_id, auth.uid(), p_party_size);

  FOR v_shift IN
    SELECT *
    FROM public.service_shifts
    WHERE restaurant_id = p_restaurant_id
      AND day_of_week = v_day_of_week
      AND is_active = true
      AND online_booking_enabled = true
    ORDER BY start_time ASC
  LOOP
    v_shift_count := v_shift_count + 1;
    v_policy := public.resolve_booking_policy(p_restaurant_id, p_party_size, v_shift.service_key, p_channel);

    v_capacity := COALESCE(v_shift.max_covers_override, 0);
    IF v_capacity <= 0 THEN
      SELECT COALESCE(SUM(rt.capacity), 0)::integer
      INTO v_capacity
      FROM public.reservation_tables rt
      WHERE rt.is_active = true
        AND (
          (v_branch_id IS NOT NULL AND rt.branch_id = v_branch_id)
          OR (v_branch_id IS NULL AND rt.branch_id IS NULL)
        );
    END IF;
    IF v_capacity <= 0 THEN
      v_capacity := CASE
        WHEN lower(COALESCE(v_shift.service_key, '')) = 'lunch'
          THEN COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'lunch' ->> 'max_covers')::integer, 50)
        ELSE COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'dinner' ->> 'max_covers')::integer, 50)
      END;
    END IF;

    v_turn_time := COALESCE(v_policy.turn_time_minutes, v_shift.turn_time_minutes, 120);
    v_slot_ts := p_date + v_shift.start_time;
    WHILE v_slot_ts <= (p_date + v_shift.last_booking_time) LOOP
      SELECT COALESCE(SUM(r.party_size), 0)::integer
      INTO v_reserved
      FROM public.reservations r
      WHERE r.restaurant_id = p_restaurant_id
        AND r.date = p_date
        AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show')
        AND (p_date + r.time) < (v_slot_ts + make_interval(mins => v_turn_time))
        AND ((p_date + r.time) + make_interval(mins => COALESCE(r.turn_time_minutes, v_turn_time, 120))) > v_slot_ts;

      SELECT COALESCE(SUM(h.party_size), 0)::integer
      INTO v_held
      FROM public.reservation_holds h
      WHERE h.restaurant_id = p_restaurant_id
        AND h.reservation_date = p_date
        AND h.status = 'active'
        AND h.expires_at > now()
        AND (p_date + h.reservation_time) < (v_slot_ts + make_interval(mins => v_turn_time))
        AND ((p_date + h.reservation_time) + make_interval(mins => COALESCE(h.turn_time_minutes, v_turn_time, 120))) > v_slot_ts;

      slot_time := v_slot_ts::time;
      shift_id := v_shift.id;
      service_key := v_shift.service_key;
      capacity_remaining := GREATEST(v_capacity - v_reserved - v_held, 0);
      requires_guarantee := COALESCE((v_risk ->> 'requires_guarantee')::boolean, false) OR COALESCE(v_policy.requires_guarantee, false);
      requires_deposit := COALESCE((v_risk ->> 'requires_deposit')::boolean, false) OR COALESCE(v_policy.requires_deposit, false);
      deposit_amount := GREATEST(COALESCE((v_risk ->> 'deposit_amount')::numeric, 0), COALESCE(v_policy.deposit_amount, 0));
      no_show_fee := GREATEST(COALESCE((v_risk ->> 'no_show_fee')::numeric, 0), COALESCE(v_policy.no_show_fee, 0));
      risk_level := COALESCE(v_risk ->> 'risk_level', 'low');
      available := capacity_remaining >= p_party_size;
      reason := CASE
        WHEN slot_time < CURRENT_TIME AND p_date = CURRENT_DATE THEN 'passed'
        WHEN capacity_remaining < p_party_size THEN 'capacity_reached'
        ELSE NULL
      END;
      RETURN NEXT;

      v_slot_ts := v_slot_ts + make_interval(mins => COALESCE(v_shift.slot_interval_minutes, 15));
    END LOOP;
  END LOOP;

  IF v_shift_count = 0 THEN
    FOR v_service_key, v_start_time, v_end_time, v_last_booking_time, v_slot_interval, v_turn_time IN
      SELECT
        x.service_key,
        x.start_time,
        x.end_time,
        x.last_booking_time,
        x.slot_interval_minutes,
        x.turn_time_minutes
      FROM (
        VALUES
          (
            'lunch'::text,
            COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'lunch' ->> 'start_time')::time, '12:00'::time),
            COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'lunch' ->> 'end_time')::time, '14:30'::time),
            COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'lunch' ->> 'last_reservation_time')::time, '14:00'::time),
            15,
            120
          ),
          (
            'dinner'::text,
            COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'dinner' ->> 'start_time')::time, '19:00'::time),
            COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'dinner' ->> 'end_time')::time, '22:30'::time),
            COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'dinner' ->> 'last_reservation_time')::time, '22:00'::time),
            15,
            120
          )
      ) AS x(service_key, start_time, end_time, last_booking_time, slot_interval_minutes, turn_time_minutes)
      WHERE COALESCE((v_restaurant.opening_hours -> 'service_settings' -> x.service_key ->> 'online_booking_enabled')::boolean, true) = true
        AND COALESCE((v_restaurant.opening_hours -> 'service_settings' -> x.service_key ->> 'service_closed')::boolean, false) = false
    LOOP
      v_policy := public.resolve_booking_policy(p_restaurant_id, p_party_size, v_service_key, p_channel);
      v_capacity := CASE
        WHEN v_service_key = 'lunch'
          THEN COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'lunch' ->> 'max_covers')::integer, 50)
        ELSE COALESCE((v_restaurant.opening_hours -> 'service_settings' -> 'dinner' ->> 'max_covers')::integer, 50)
      END;

      v_slot_ts := p_date + v_start_time;
      WHILE v_slot_ts <= (p_date + v_last_booking_time) LOOP
        SELECT COALESCE(SUM(r.party_size), 0)::integer
        INTO v_reserved
        FROM public.reservations r
        WHERE r.restaurant_id = p_restaurant_id
          AND r.date = p_date
          AND lower(COALESCE(r.status, '')) NOT IN ('cancelled', 'no_show')
          AND (p_date + r.time) < (v_slot_ts + make_interval(mins => v_turn_time))
          AND ((p_date + r.time) + make_interval(mins => COALESCE(r.turn_time_minutes, v_turn_time, 120))) > v_slot_ts;

        SELECT COALESCE(SUM(h.party_size), 0)::integer
        INTO v_held
        FROM public.reservation_holds h
        WHERE h.restaurant_id = p_restaurant_id
          AND h.reservation_date = p_date
          AND h.status = 'active'
          AND h.expires_at > now()
          AND (p_date + h.reservation_time) < (v_slot_ts + make_interval(mins => v_turn_time))
          AND ((p_date + h.reservation_time) + make_interval(mins => COALESCE(h.turn_time_minutes, v_turn_time, 120))) > v_slot_ts;

        slot_time := v_slot_ts::time;
        shift_id := NULL;
        service_key := v_service_key;
        capacity_remaining := GREATEST(v_capacity - v_reserved - v_held, 0);
        requires_guarantee := COALESCE((v_risk ->> 'requires_guarantee')::boolean, false) OR COALESCE(v_policy.requires_guarantee, false);
        requires_deposit := COALESCE((v_risk ->> 'requires_deposit')::boolean, false) OR COALESCE(v_policy.requires_deposit, false);
        deposit_amount := GREATEST(COALESCE((v_risk ->> 'deposit_amount')::numeric, 0), COALESCE(v_policy.deposit_amount, 0));
        no_show_fee := GREATEST(COALESCE((v_risk ->> 'no_show_fee')::numeric, 0), COALESCE(v_policy.no_show_fee, 0));
        risk_level := COALESCE(v_risk ->> 'risk_level', 'low');
        available := capacity_remaining >= p_party_size;
        reason := CASE
          WHEN slot_time < CURRENT_TIME AND p_date = CURRENT_DATE THEN 'passed'
          WHEN capacity_remaining < p_party_size THEN 'capacity_reached'
          ELSE NULL
        END;
        RETURN NEXT;

        v_slot_ts := v_slot_ts + make_interval(mins => v_slot_interval);
      END LOOP;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_reservation_hold(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source_channel text DEFAULT 'web'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_slot record;
  v_hold_id uuid;
  v_guest_profile_id uuid;
  v_branch_id uuid := public.get_restaurant_primary_branch_id(p_restaurant_id);
  v_shift_turn_minutes integer := 120;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.reservation_holds
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at <= now();

  SELECT *
  INTO v_slot
  FROM public.quote_reservation_availability(p_restaurant_id, p_date, p_party_size, COALESCE(p_source_channel, 'web'))
  WHERE slot_time = p_time
  LIMIT 1;

  IF v_slot.slot_time IS NULL OR NOT v_slot.available THEN
    RAISE EXCEPTION 'Ce creneau n''est plus disponible.';
  END IF;

  IF v_slot.shift_id IS NOT NULL THEN
    SELECT turn_time_minutes
    INTO v_shift_turn_minutes
    FROM public.service_shifts
    WHERE id = v_slot.shift_id;
  END IF;

  v_guest_profile_id := public.ensure_guest_profile(p_restaurant_id, v_user_id, p_source_channel);

  INSERT INTO public.reservation_holds (
    restaurant_id,
    branch_id,
    shift_id,
    user_id,
    guest_profile_id,
    reservation_date,
    reservation_time,
    party_size,
    turn_time_minutes,
    source_channel,
    guarantee_policy,
    inventory_assignment,
    risk_snapshot,
    metadata,
    expires_at
  )
  VALUES (
    p_restaurant_id,
    v_branch_id,
    v_slot.shift_id,
    v_user_id,
    v_guest_profile_id,
    p_date,
    p_time,
    p_party_size,
    COALESCE(v_shift_turn_minutes, 120),
    COALESCE(p_source_channel, 'web'),
    jsonb_build_object(
      'requires_guarantee', v_slot.requires_guarantee,
      'requires_deposit', v_slot.requires_deposit,
      'deposit_amount', v_slot.deposit_amount,
      'no_show_fee', v_slot.no_show_fee
    ),
    jsonb_build_object(
      'mode', 'capacity_pool',
      'capacity_remaining', v_slot.capacity_remaining
    ),
    jsonb_build_object(
      'risk_level', v_slot.risk_level
    ),
    COALESCE(p_metadata, '{}'::jsonb),
    now() + interval '10 minutes'
  )
  RETURNING id INTO v_hold_id;

  RETURN v_hold_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_reservation(
  p_restaurant_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_feature text DEFAULT 'classique',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL,
  p_hold_id uuid DEFAULT NULL,
  p_source_channel text DEFAULT 'web'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_hold record;
  v_reservation_id uuid;
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_guest_profile_id uuid;
  v_shift_id uuid;
  v_turn_time_minutes integer := 120;
  v_risk jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_hold_id IS NOT NULL THEN
    SELECT *
    INTO v_hold
    FROM public.reservation_holds
    WHERE id = p_hold_id
      AND user_id = v_user_id
      AND restaurant_id = p_restaurant_id
      AND status = 'active'
      AND expires_at > now()
    LIMIT 1;

    IF v_hold.id IS NULL THEN
      RAISE EXCEPTION 'Votre reservation temporaire a expire.';
    END IF;
  ELSE
    p_hold_id := public.create_reservation_hold(
      p_restaurant_id,
      p_date,
      p_time,
      p_party_size,
      v_metadata,
      p_source_channel
    );

    SELECT *
    INTO v_hold
    FROM public.reservation_holds
    WHERE id = p_hold_id;
  END IF;

  v_metadata := v_metadata
    || jsonb_build_object(
      'source_channel', COALESCE(p_source_channel, v_hold.source_channel, 'web'),
      'risk_snapshot', COALESCE(v_hold.risk_snapshot, '{}'::jsonb),
      'guarantee_policy', COALESCE(v_hold.guarantee_policy, '{}'::jsonb)
    );

  SELECT public.validate_and_create_reservation(
    p_restaurant_id,
    p_date,
    p_time,
    p_party_size,
    p_feature,
    v_metadata,
    p_notes
  )
  INTO v_reservation_id;

  v_guest_profile_id := COALESCE(v_hold.guest_profile_id, public.ensure_guest_profile(p_restaurant_id, v_user_id, p_source_channel));
  v_shift_id := COALESCE(v_hold.shift_id, public.find_shift_for_reservation(p_restaurant_id, p_date, p_time));
  v_turn_time_minutes := COALESCE(v_hold.turn_time_minutes, 120);
  v_risk := COALESCE(v_hold.risk_snapshot, public.score_guest_risk(p_restaurant_id, v_user_id, p_party_size));

  UPDATE public.reservations
  SET
    shift_id = COALESCE(shift_id, v_shift_id),
    inventory_assignment = CASE
      WHEN inventory_assignment = '{}'::jsonb THEN COALESCE(v_hold.inventory_assignment, jsonb_build_object('mode', 'capacity_pool'))
      ELSE inventory_assignment
    END,
    turn_time_minutes = COALESCE(turn_time_minutes, v_turn_time_minutes),
    source_channel = COALESCE(NULLIF(source_channel, ''), COALESCE(p_source_channel, 'web')),
    guarantee_policy = CASE
      WHEN guarantee_policy = '{}'::jsonb THEN COALESCE(v_hold.guarantee_policy, '{}'::jsonb)
      ELSE guarantee_policy
    END,
    deposit_status = CASE
      WHEN COALESCE((COALESCE(v_hold.guarantee_policy, '{}'::jsonb) ->> 'requires_deposit')::boolean, false) THEN 'required'
      ELSE COALESCE(deposit_status, 'not_required')
    END,
    risk_snapshot = CASE
      WHEN risk_snapshot = '{}'::jsonb THEN COALESCE(v_risk, '{}'::jsonb)
      ELSE risk_snapshot
    END,
    guest_profile_id = COALESCE(guest_profile_id, v_guest_profile_id),
    updated_at = now()
  WHERE id = v_reservation_id;

  UPDATE public.reservation_holds
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = p_hold_id;

  PERFORM public.sync_guest_profile_metrics(p_restaurant_id, v_user_id);

  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_reservation(
  p_reservation_id uuid,
  p_date date,
  p_time time,
  p_party_size integer,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reservation public.reservations;
  v_slot record;
BEGIN
  SELECT *
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND user_id = v_user_id
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show');

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Reservation introuvable.';
  END IF;

  SELECT *
  INTO v_slot
  FROM public.quote_reservation_availability(v_reservation.restaurant_id, p_date, p_party_size, COALESCE(v_reservation.source_channel, 'web'))
  WHERE slot_time = p_time
  LIMIT 1;

  IF v_slot.slot_time IS NULL OR NOT v_slot.available THEN
    RAISE EXCEPTION 'Le nouveau creneau n''est pas disponible.';
  END IF;

  UPDATE public.reservations
  SET
    date = p_date,
    time = p_time,
    party_size = p_party_size,
    notes = COALESCE(p_notes, notes),
    shift_id = v_slot.shift_id,
    turn_time_minutes = COALESCE(turn_time_minutes, 120),
    inventory_assignment = jsonb_build_object('mode', 'capacity_pool', 'capacity_remaining', v_slot.capacity_remaining),
    guarantee_policy = jsonb_build_object(
      'requires_guarantee', v_slot.requires_guarantee,
      'requires_deposit', v_slot.requires_deposit,
      'deposit_amount', v_slot.deposit_amount,
      'no_show_fee', v_slot.no_show_fee
    ),
    risk_snapshot = jsonb_build_object('risk_level', v_slot.risk_level),
    updated_at = now()
  WHERE id = p_reservation_id;

  RETURN p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reservation public.reservations;
BEGIN
  SELECT *
  INTO v_reservation
  FROM public.reservations reservations
  WHERE reservations.id = p_reservation_id
    AND (
      reservations.user_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.restaurants r
        WHERE r.id = reservations.restaurant_id
          AND r.owner_id = v_user_id
      )
      OR public.has_role(v_user_id, 'admin')
    );

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Reservation introuvable.';
  END IF;

  UPDATE public.reservations
  SET status = 'cancelled',
      notes = CASE
        WHEN p_reason IS NULL OR trim(p_reason) = '' THEN notes
        WHEN notes IS NULL OR notes = '' THEN p_reason
        ELSE notes || E'\n' || '[Annulation] ' || p_reason
      END,
      updated_at = now()
  WHERE id = p_reservation_id;

  PERFORM public.sync_guest_profile_metrics(v_reservation.restaurant_id, v_reservation.user_id);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_restaurant_id uuid,
  p_date date,
  p_service_key text,
  p_party_size integer,
  p_preferred_time time DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_guest_profile_id uuid;
  v_entry_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_guest_profile_id := public.ensure_guest_profile(p_restaurant_id, v_user_id, 'waitlist');

  SELECT id
  INTO v_entry_id
  FROM public.waitlist_entries
  WHERE restaurant_id = p_restaurant_id
    AND user_id = v_user_id
    AND reservation_date = p_date
    AND lower(service_key) = lower(p_service_key)
    AND status IN ('waiting', 'offered')
  LIMIT 1;

  IF v_entry_id IS NOT NULL THEN
    RETURN v_entry_id;
  END IF;

  INSERT INTO public.waitlist_entries (
    restaurant_id,
    branch_id,
    user_id,
    guest_profile_id,
    reservation_date,
    service_key,
    preferred_time,
    party_size,
    notes
  )
  VALUES (
    p_restaurant_id,
    public.get_restaurant_primary_branch_id(p_restaurant_id),
    v_user_id,
    v_guest_profile_id,
    p_date,
    lower(p_service_key),
    p_preferred_time,
    p_party_size,
    p_notes
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_waitlist_entry(
  p_waitlist_entry_id uuid,
  p_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_entry public.waitlist_entries;
  v_hold_id uuid;
  v_slot record;
BEGIN
  SELECT *
  INTO v_entry
  FROM public.waitlist_entries
  WHERE id = p_waitlist_entry_id
    AND status = 'waiting';

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Entree de liste d''attente introuvable.';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = v_entry.restaurant_id
        AND r.owner_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT *
  INTO v_slot
  FROM public.quote_reservation_availability(v_entry.restaurant_id, v_entry.reservation_date, v_entry.party_size, 'waitlist')
  WHERE slot_time = p_time
  LIMIT 1;

  IF v_slot.slot_time IS NULL OR NOT v_slot.available THEN
    RAISE EXCEPTION 'Le creneau propose n''est pas disponible.';
  END IF;

  INSERT INTO public.reservation_holds (
    restaurant_id,
    branch_id,
    shift_id,
    user_id,
    guest_profile_id,
    reservation_date,
    reservation_time,
    party_size,
    turn_time_minutes,
    source_channel,
    guarantee_policy,
    inventory_assignment,
    risk_snapshot,
    metadata,
    expires_at
  )
  VALUES (
    v_entry.restaurant_id,
    v_entry.branch_id,
    v_slot.shift_id,
    v_entry.user_id,
    v_entry.guest_profile_id,
    v_entry.reservation_date,
    p_time,
    v_entry.party_size,
    120,
    'waitlist',
    jsonb_build_object(
      'requires_guarantee', v_slot.requires_guarantee,
      'requires_deposit', v_slot.requires_deposit,
      'deposit_amount', v_slot.deposit_amount,
      'no_show_fee', v_slot.no_show_fee
    ),
    jsonb_build_object(
      'mode', 'capacity_pool',
      'capacity_remaining', v_slot.capacity_remaining
    ),
    jsonb_build_object(
      'risk_level', v_slot.risk_level
    ),
    jsonb_build_object(
      'waitlist_entry_id', v_entry.id
    ),
    now() + interval '20 minutes'
  )
  RETURNING id INTO v_hold_id;

  UPDATE public.waitlist_entries
  SET status = 'offered',
      offer_expires_at = now() + interval '20 minutes',
      offered_slot_time = p_time,
      hold_id = v_hold_id,
      updated_at = now()
  WHERE id = v_entry.id;

  RETURN v_hold_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_verified_review(
  p_restaurant_id uuid,
  p_rating integer,
  p_service_rating integer,
  p_quality_rating integer,
  p_speed_rating integer,
  p_comment text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reservation public.reservations;
  v_review_id uuid;
  v_guest_profile_id uuid;
  v_confidence numeric := 0.9;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT *
    INTO v_reservation
    FROM public.reservations
    WHERE id = p_reservation_id
      AND restaurant_id = p_restaurant_id
      AND user_id = v_user_id
      AND lower(COALESCE(status, '')) = 'arrived';
  ELSE
    SELECT *
    INTO v_reservation
    FROM public.reservations reservations
    WHERE reservations.restaurant_id = p_restaurant_id
      AND reservations.user_id = v_user_id
      AND lower(COALESCE(reservations.status, '')) = 'arrived'
      AND NOT EXISTS (
        SELECT 1
        FROM public.reviews rv
        WHERE rv.reservation_id = reservations.id
      )
    ORDER BY reservations.date DESC, reservations.time DESC
    LIMIT 1;
  END IF;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Aucune visite verifiee disponible pour publier un avis.';
  END IF;

  SELECT id
  INTO v_review_id
  FROM public.reviews
  WHERE reservation_id = v_reservation.id
  LIMIT 1;

  IF v_review_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un avis existe deja pour cette visite.';
  END IF;

  v_guest_profile_id := public.ensure_guest_profile(p_restaurant_id, v_user_id, 'review');

  INSERT INTO public.reviews (
    restaurant_id,
    user_id,
    rating,
    quality_rating,
    service_rating,
    speed_rating,
    comment,
    tags,
    reservation_id,
    guest_profile_id,
    verification_status,
    verified_visit_at,
    confidence_score,
    fraud_flags,
    status
  )
  VALUES (
    p_restaurant_id,
    v_user_id,
    p_rating,
    p_quality_rating,
    p_service_rating,
    p_speed_rating,
    NULLIF(trim(COALESCE(p_comment, '')), ''),
    COALESCE(p_tags, ARRAY[]::text[]),
    v_reservation.id,
    v_guest_profile_id,
    'verified',
    now(),
    v_confidence,
    '[]'::jsonb,
    'published'
  )
  RETURNING id INTO v_review_id;

  PERFORM public.recompute_restaurant_review_stats(p_restaurant_id);

  RETURN v_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_review_reply(
  p_review_id uuid,
  p_reply_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reply_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.reviews rv
      JOIN public.restaurants r ON r.id = rv.restaurant_id
      WHERE rv.id = p_review_id
        AND r.owner_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.review_replies (
    review_id,
    author_id,
    author_type,
    reply_text
  )
  VALUES (
    p_review_id,
    v_user_id,
    CASE
      WHEN public.has_role(v_user_id, 'admin') THEN 'admin'
      ELSE 'restaurant_staff'
    END,
    trim(p_reply_text)
  )
  ON CONFLICT (review_id)
  DO UPDATE SET
    reply_text = EXCLUDED.reply_text,
    author_id = EXCLUDED.author_id,
    author_type = EXCLUDED.author_type
  RETURNING id INTO v_reply_id;

  RETURN v_reply_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_guest_profile_from_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.restaurant_id IS NOT NULL THEN
    NEW.guest_profile_id := COALESCE(
      NEW.guest_profile_id,
      public.ensure_guest_profile(NEW.restaurant_id, NEW.user_id, COALESCE(NEW.source_channel, 'web'))
    );
  END IF;

  IF NEW.shift_id IS NULL AND NEW.restaurant_id IS NOT NULL AND NEW.date IS NOT NULL AND NEW.time IS NOT NULL THEN
    NEW.shift_id := public.find_shift_for_reservation(NEW.restaurant_id, NEW.date, NEW.time);
  END IF;

  IF NEW.turn_time_minutes IS NULL OR NEW.turn_time_minutes <= 0 THEN
    NEW.turn_time_minutes := COALESCE(
      (public.resolve_booking_policy(NEW.restaurant_id, NEW.party_size, NULL, COALESCE(NEW.source_channel, 'online'))).turn_time_minutes,
      120
    );
  END IF;

  IF NEW.inventory_assignment IS NULL THEN
    NEW.inventory_assignment := '{}'::jsonb;
  END IF;

  IF NEW.guarantee_policy IS NULL THEN
    NEW.guarantee_policy := '{}'::jsonb;
  END IF;

  IF NEW.risk_snapshot IS NULL THEN
    NEW.risk_snapshot := '{}'::jsonb;
  END IF;

  IF NEW.deposit_status IS NULL OR NEW.deposit_status = '' THEN
    NEW.deposit_status := 'not_required';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_record_reservation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.reservation_events (
      reservation_id,
      restaurant_id,
      guest_profile_id,
      event_type,
      actor_user_id,
      payload
    )
    VALUES (
      NEW.id,
      NEW.restaurant_id,
      NEW.guest_profile_id,
      'created',
      NEW.user_id,
      jsonb_build_object(
        'status', NEW.status,
        'date', NEW.date,
        'time', NEW.time,
        'party_size', NEW.party_size
      )
    );
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.date IS DISTINCT FROM NEW.date
    OR OLD.time IS DISTINCT FROM NEW.time
    OR OLD.party_size IS DISTINCT FROM NEW.party_size
  ) THEN
    INSERT INTO public.reservation_events (
      reservation_id,
      restaurant_id,
      guest_profile_id,
      event_type,
      actor_user_id,
      payload
    )
    VALUES (
      NEW.id,
      NEW.restaurant_id,
      NEW.guest_profile_id,
      CASE
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_changed'
        ELSE 'updated'
      END,
      NEW.user_id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_date', OLD.date,
        'new_date', NEW.date,
        'old_time', OLD.time,
        'new_time', NEW.time,
        'old_party_size', OLD.party_size,
        'new_party_size', NEW.party_size
      )
    );
  END IF;

  PERFORM public.sync_guest_profile_metrics(NEW.restaurant_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_reservation_defaults ON public.reservations;
CREATE TRIGGER before_reservation_defaults
BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_guest_profile_from_reservation();

DROP TRIGGER IF EXISTS after_reservation_guest_sync ON public.reservations;
CREATE TRIGGER after_reservation_guest_sync
AFTER INSERT OR UPDATE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.trg_record_reservation_event();

DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_user_all" ON public.reviews;
DROP POLICY IF EXISTS "Users manage own stripe_webhook_events" ON public.stripe_webhook_events;

GRANT EXECUTE ON FUNCTION public.resolve_booking_policy(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_restaurant_primary_branch_id(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_guest_profile(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_guest_profile_metrics(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.score_guest_risk(uuid, uuid, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.find_shift_for_reservation(uuid, date, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quote_reservation_availability(uuid, date, integer, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_reservation_hold(uuid, date, time, integer, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_reservation(uuid, date, time, integer, text, jsonb, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_reservation(uuid, date, time, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_waitlist(uuid, date, text, integer, time, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry(uuid, time) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_verified_review(uuid, integer, integer, integer, integer, text, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_review_reply(uuid, text) TO authenticated, service_role;
