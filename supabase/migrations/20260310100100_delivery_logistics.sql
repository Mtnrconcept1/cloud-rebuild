-- Migration: Advanced Delivery & Finance
-- Adds delivery batching, routing optimization history, and deep financial tracking (invoices, payouts).

-- 1. Advanced Logistics (Batching & Routing)
CREATE TABLE IF NOT EXISTS public.delivery_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT DEFAULT 'formed', -- 'formed', 'assigned', 'in_progress', 'completed'
    courier_id UUID REFERENCES public.couriers(id) ON DELETE SET NULL,
    estimated_total_distance_meters INTEGER,
    estimated_total_duration_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.delivery_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.delivery_batches(id) ON DELETE CASCADE,
    dispatch_job_id UUID NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
    stop_sequence INTEGER NOT NULL,
    stop_type TEXT NOT NULL, -- 'pickup', 'dropoff'
    location_lat DOUBLE PRECISION NOT NULL,
    location_lng DOUBLE PRECISION NOT NULL,
    estimated_arrival_at TIMESTAMP WITH TIME ZONE,
    actual_arrival_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.proof_of_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_job_id UUID NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
    courier_id UUID NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
    photo_urls TEXT[],
    signature_url TEXT,
    notes TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Advanced Finance & Payouts
CREATE TABLE IF NOT EXISTS public.payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    provider_intent_id TEXT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    status TEXT DEFAULT 'requires_payment_method',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    payout_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'paid', 'failed'
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES public.payout_batches(id) ON DELETE SET NULL,
    recipient_type TEXT NOT NULL, -- 'restaurant', 'courier'
    recipient_id UUID NOT NULL, -- UUID of the restaurant or courier
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    provider_transfer_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    recipient_type TEXT NOT NULL, -- 'user', 'restaurant', 'courier'
    recipient_id UUID NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    tax_total NUMERIC(10, 2) NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR' NOT NULL,
    file_url TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_number TEXT NOT NULL UNIQUE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_routes_batch_id ON public.delivery_routes(batch_id);
CREATE INDEX IF NOT EXISTS idx_payouts_recipient_id ON public.payouts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
