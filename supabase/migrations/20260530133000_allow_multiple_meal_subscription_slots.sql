ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_day_unique;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_day
  ON public.user_subscriptions (user_id, day_of_week, created_at);
