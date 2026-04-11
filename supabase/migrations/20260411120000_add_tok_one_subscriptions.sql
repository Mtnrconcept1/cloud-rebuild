-- Migration: Add Tok One Subscriptions
-- Created to resolve the naming discrepancy between database and code.

CREATE TABLE IF NOT EXISTS public.tok_one_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.user_subscription_plans(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active' NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT false,
    stripe_subscription_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.tok_one_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tok_one_subscriptions' AND policyname = 'Users can view their own tok_one_subscriptions'
    ) THEN
        CREATE POLICY "Users can view their own tok_one_subscriptions" 
        ON public.tok_one_subscriptions 
        FOR SELECT 
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tok_one_subscriptions' AND policyname = 'Users can update their own tok_one_subscriptions'
    ) THEN
        CREATE POLICY "Users can update their own tok_one_subscriptions" 
        ON public.tok_one_subscriptions 
        FOR UPDATE 
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tok_one_subscriptions' AND policyname = 'Admins have full access to tok_one_subscriptions'
    ) THEN
        CREATE POLICY "Admins have full access to tok_one_subscriptions" 
        ON public.tok_one_subscriptions 
        FOR ALL 
        TO authenticated 
        USING (public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tok_one_subscriptions_user_role ON public.tok_one_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_tok_one_subscriptions_plan_id ON public.tok_one_subscriptions(plan_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tok_one_subscriptions;

-- Grant permissions
GRANT ALL ON public.tok_one_subscriptions TO service_role;
GRANT ALL ON public.tok_one_subscriptions TO postgres;
GRANT SELECT, UPDATE ON public.tok_one_subscriptions TO authenticated;
