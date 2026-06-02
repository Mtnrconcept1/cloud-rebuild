-- Runtime hardening for TOK AI and accounting functions.
-- This migration is intentionally idempotent because production may already
-- have part of the AI schema from previous migration batches.

DO $$
BEGIN
  IF to_regclass('public.ai_usage_logs') IS NOT NULL THEN
    ALTER TABLE public.ai_usage_logs
      ADD COLUMN IF NOT EXISTS feature_name text,
      ADD COLUMN IF NOT EXISTS task_id uuid,
      ADD COLUMN IF NOT EXISTS source text;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created
      ON public.ai_usage_logs(feature_name, created_at DESC)
      WHERE feature_name IS NOT NULL';
  END IF;

  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    ALTER TABLE public.payment_transactions
      ADD COLUMN IF NOT EXISTS provider text;

    UPDATE public.payment_transactions
    SET provider = COALESCE(NULLIF(btrim(provider), ''), 'stripe')
    WHERE provider IS NULL OR btrim(provider) = '';

    ALTER TABLE public.payment_transactions
      ALTER COLUMN provider SET DEFAULT 'stripe';

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_created
      ON public.payment_transactions(provider, created_at DESC)
      WHERE provider IS NOT NULL';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
