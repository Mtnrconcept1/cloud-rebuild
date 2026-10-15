-- The October 13 Zero Attente CHF 0 attempts were rejected before
-- Stripe produced a Checkout Session. Never infer that a payment succeeded,
-- redeem MIAMZ or confirm a reservation from these failed attempts.
-- Only release the two known expired error states so the customer can retry.
BEGIN;
WITH abandoned AS (
  UPDATE public.payment_attempts
  SET state = 'cancelled',
      cancelled_at = now(),
      updated_at = now(),
      retryable = false,
      last_error_code = 'obsolete_no_cost_stripe_checkout_params',
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE kind = 'zero-attente'
    AND mode = 'live'
    AND state = 'pending'
    AND amount_cents = 0
    AND created_at >= '2026-10-13'::timestamptz
    AND created_at < '2026-10-14'::timestamptz
    AND stripe_checkout_session_id IS NULL
    AND stripe_payment_intent_id IS NULL
    AND stripe_subscription_id IS NULL
    AND request_snapshot -> 'session_params' ->> 'payment_method_collection' = 'if_required'
    AND last_error_message ILIKE '%only set payment_method_collection if there are recurring prices%'
    AND (lease_expires_at IS NULL OR lease_expires_at < now())
  RETURNING id
)
INSERT INTO public.payment_attempt_runtime_events (
  event_name, payment_attempt_id, reason, source_function, metadata
)
SELECT
  'no_cost_stripe_checkout_legacy_cancelled', id,
  'obsolete_no_cost_stripe_checkout_params',
  '20261015073500_expire_failed_free_zero_attente_attempts',
  jsonb_build_object('requires_new_checkout', true)
FROM abandoned;
COMMIT;
