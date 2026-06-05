ALTER TABLE public.tok_one_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_mode text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tok_one_subscriptions_stripe_mode_check'
      AND conrelid = 'public.tok_one_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.tok_one_subscriptions
      ADD CONSTRAINT tok_one_subscriptions_stripe_mode_check
      CHECK (stripe_mode IN ('live', 'test'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tok_one_subscriptions_stripe_checkout_session_id
  ON public.tok_one_subscriptions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tok_one_subscriptions_user_status_period
  ON public.tok_one_subscriptions (user_id, status, current_period_end DESC);

NOTIFY pgrst, 'reload schema';
