CREATE TABLE IF NOT EXISTS public.tok_one_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.user_subscription_plans(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT now(),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tok_one_subscriptions_stripe_subscription_id
  ON public.tok_one_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tok_one_subscriptions_user_id
  ON public.tok_one_subscriptions (user_id, created_at DESC);

ALTER TABLE public.tok_one_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tok_one_subscriptions_own_select" ON public.tok_one_subscriptions;
CREATE POLICY "tok_one_subscriptions_own_select"
  ON public.tok_one_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tok_one_subscriptions_own_update" ON public.tok_one_subscriptions;
CREATE POLICY "tok_one_subscriptions_own_update"
  ON public.tok_one_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.tok_one_subscriptions TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_subscriptions'
      AND column_name = 'plan_id'
  ) THEN
    INSERT INTO public.tok_one_subscriptions (
      id,
      user_id,
      plan_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      stripe_subscription_id,
      created_at,
      updated_at
    )
    SELECT
      us.id,
      us.user_id,
      us.plan_id,
      COALESCE(us.status, 'inactive'),
      us.current_period_start,
      us.current_period_end,
      COALESCE(us.cancel_at_period_end, false),
      us.stripe_subscription_id,
      us.created_at,
      us.updated_at
    FROM public.user_subscriptions us
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;
