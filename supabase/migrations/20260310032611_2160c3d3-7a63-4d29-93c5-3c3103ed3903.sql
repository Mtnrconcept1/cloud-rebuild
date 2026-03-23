
-- Step 1: Extend app_role enum with 'courier'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'courier';

-- Step 2: Create couriers table
CREATE TABLE public.couriers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  first_name text,
  last_name text,
  phone text,
  status text NOT NULL DEFAULT 'pending_approval',
  vehicle_type text NOT NULL DEFAULT 'bicycle',
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
CREATE TABLE public.courier_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 4: Create courier_shifts table
CREATE TABLE public.courier_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  zone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Step 5: Create courier_locations table
CREATE TABLE public.courier_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  heading double precision,
  speed double precision,
  accuracy double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courier_locations_recent ON public.courier_locations (courier_id, recorded_at DESC);

-- Step 6: Create dispatch_jobs table
CREATE TABLE public.dispatch_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  courier_id uuid REFERENCES public.couriers(id),
  status text NOT NULL DEFAULT 'pending',
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

CREATE INDEX idx_dispatch_jobs_order ON public.dispatch_jobs (order_id);
CREATE INDEX idx_dispatch_jobs_courier ON public.dispatch_jobs (courier_id, status);

-- Step 7: Create dispatch_attempts table
CREATE TABLE public.dispatch_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id),
  status text NOT NULL DEFAULT 'pending',
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  timeout_seconds integer DEFAULT 45,
  distance_to_pickup_meters integer,
  estimated_earnings numeric
);

CREATE INDEX idx_dispatch_attempts_job ON public.dispatch_attempts (dispatch_job_id);
CREATE INDEX idx_dispatch_attempts_courier ON public.dispatch_attempts (courier_id, status);

-- Step 8: Create courier_earnings table
CREATE TABLE public.courier_earnings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL,
  description text,
  dispatch_job_id uuid REFERENCES public.dispatch_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_courier_earnings_courier ON public.courier_earnings (courier_id, created_at DESC);
