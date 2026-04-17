-- Ensures stripe_webhook_events table exists for webhook idempotency.
-- The table records every processed Stripe event.id so replayed events
-- are silently skipped instead of re-executing side-effects.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    text PRIMARY KEY,
  event_type  text NOT NULL,
  livemode    boolean NOT NULL DEFAULT false,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events (processed_at);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Deny all client access — only service_role (which bypasses RLS) writes here.
DROP POLICY IF EXISTS stripe_webhook_events_deny_all ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_deny_all
  ON public.stripe_webhook_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.stripe_webhook_events TO service_role;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency table: records every Stripe webhook event.id to prevent duplicate processing.';

COMMIT;
