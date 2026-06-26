-- Track Stripe webhook processing state so failed claimed events are retried
-- instead of being permanently skipped as duplicates.

BEGIN;

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stripe_webhook_events_processing_status_check'
      AND conrelid = 'public.stripe_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.stripe_webhook_events
      ADD CONSTRAINT stripe_webhook_events_processing_status_check
      CHECK (processing_status IN ('processing', 'succeeded', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processing_status
  ON public.stripe_webhook_events (processing_status, last_attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_failed_retry
  ON public.stripe_webhook_events (last_error_at DESC)
  WHERE processing_status = 'failed';

GRANT SELECT, INSERT, UPDATE ON public.stripe_webhook_events TO service_role;

COMMENT ON COLUMN public.stripe_webhook_events.processing_status IS
  'Current processing state for Stripe webhook idempotency: processing, succeeded, or failed.';
COMMENT ON COLUMN public.stripe_webhook_events.attempt_count IS
  'Number of processing attempts for this Stripe event id.';
COMMENT ON COLUMN public.stripe_webhook_events.last_error IS
  'Last processing failure message, populated only for failed webhook attempts.';

COMMIT;
