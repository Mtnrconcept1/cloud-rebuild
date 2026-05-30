WITH ranked_user_subscriptions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, day_of_week
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_rank
  FROM public.user_subscriptions
)
DELETE FROM public.user_subscriptions us
USING ranked_user_subscriptions ranked
WHERE us.id = ranked.id
  AND ranked.row_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_subscriptions_user_day_unique'
      AND conrelid = 'public.user_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_user_day_unique UNIQUE (user_id, day_of_week);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_meal_subscription_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  resume_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_meal_subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_meal_subscription_settings_own_all" ON public.user_meal_subscription_settings;
CREATE POLICY "user_meal_subscription_settings_own_all"
  ON public.user_meal_subscription_settings
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS set_updated_at_user_meal_subscription_settings ON public.user_meal_subscription_settings;
CREATE TRIGGER set_updated_at_user_meal_subscription_settings
  BEFORE UPDATE ON public.user_meal_subscription_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_meal_subscription_settings TO authenticated;
