-- Production reliability guard for AI schema contracts and PostgREST metadata.
-- The objects are created by earlier migrations; this migration keeps the
-- runtime contract explicit and forces PostgREST to reload its schema cache.

DO $$
BEGIN
  IF to_regclass('public.ai_generated_assets') IS NULL THEN
    RAISE EXCEPTION 'public.ai_generated_assets is required before deploying AI image tools';
  END IF;

  IF to_regprocedure('public.check_restaurant_ai_quota(uuid,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'public.check_restaurant_ai_quota(uuid,text,integer) is required before deploying AI tools';
  END IF;

  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    ALTER TABLE public.payment_transactions
      ADD COLUMN IF NOT EXISTS provider text;

    UPDATE public.payment_transactions
    SET provider = COALESCE(NULLIF(btrim(provider), ''), 'stripe')
    WHERE provider IS NULL OR btrim(provider) = '';

    ALTER TABLE public.payment_transactions
      ALTER COLUMN provider SET DEFAULT 'stripe';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
