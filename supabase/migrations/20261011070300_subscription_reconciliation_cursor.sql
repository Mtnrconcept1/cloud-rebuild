BEGIN;
ALTER TABLE public.restaurant_ai_subscriptions ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;
ALTER TABLE public.tok_one_subscriptions ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;
CREATE INDEX IF NOT EXISTS restaurant_subscription_reconcile_cursor_idx
ON public.restaurant_ai_subscriptions(last_reconciled_at NULLS FIRST,id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tok_one_reconcile_cursor_idx
ON public.tok_one_subscriptions(last_reconciled_at NULLS FIRST,id) WHERE stripe_subscription_id IS NOT NULL AND billing_provider='stripe';
-- Reuses the existing authenticated hourly reconciler: no new cron or secret.
COMMIT;
